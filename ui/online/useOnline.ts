// Client networking: one WebSocket, auto-reconnect with seat token (kept in
// sessionStorage so a refresh rejoins the same seat).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Decision } from '../../src/types.js';
import type { BotDifficulty, ClientMessage, GameView, LobbyPlayer, ServerMessage } from '../../server/protocol.js';
import { WS_URL } from './config.js';

const SESSION_KEY = 'bandwidth-session';

interface StoredSession {
  code: string;
  token: string;
}

export interface OnlineState {
  status: 'idle' | 'connecting' | 'lobby' | 'playing' | 'error';
  code: string | null;
  youAreHost: boolean;
  lobby: LobbyPlayer[];
  view: GameView | null;
  reveal: { targetName: string; cards: GameView['hand'] } | null;
  moment: { eliminatedName: string } | null;
  error: string | null;
}

const initial: OnlineState = {
  status: 'idle',
  code: null,
  youAreHost: false,
  lobby: [],
  view: null,
  reveal: null,
  moment: null,
  error: null,
};

export function useOnline() {
  const [state, setState] = useState<OnlineState>(initial);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const intentRef = useRef<ClientMessage | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback((firstMessage: ClientMessage) => {
    intentRef.current = firstMessage;
    setState((s) => ({ ...s, status: 'connecting', error: null }));
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const previous = wsRef.current;
    if (previous && previous.readyState < WebSocket.CLOSING) previous.close();
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      if (intentRef.current) ws.send(JSON.stringify(intentRef.current));
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        const value = JSON.parse(ev.data as string) as { type?: unknown };
        if (!value || typeof value !== 'object' || typeof value.type !== 'string') throw new Error();
        msg = value as ServerMessage;
      } catch {
        setState((s) => ({ ...s, error: 'The server sent an unreadable response' }));
        return;
      }
      switch (msg.type) {
        case 'joined':
          sessionRef.current = { code: msg.code, token: msg.token };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionRef.current));
          break;
        case 'lobby':
          setState((s) => ({
            ...s,
            status: 'lobby',
            code: msg.code,
            lobby: msg.players,
            youAreHost: msg.youAreHost,
            view: null,
          }));
          break;
        case 'state':
          setState((s) => ({ ...s, status: 'playing', view: msg.view }));
          break;
        case 'reveal':
          setState((s) => ({ ...s, reveal: { targetName: msg.targetName, cards: msg.cards } }));
          break;
        case 'moment':
          setState((s) => ({ ...s, moment: { eliminatedName: msg.eliminatedName } }));
          break;
        case 'error':
          setState((s) => ({
            ...s,
            error: msg.message,
            status: s.status === 'connecting' ? 'idle' : s.status,
          }));
          break;
      }
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return; // superseded
      const session = sessionRef.current;
      if (session) {
        // Transparent rejoin after a dropped connection, backing off so a
        // server restart does not make every open tab reconnect in lockstep.
        const attempt = reconnectAttemptRef.current++;
        const delay = Math.min(15_000, 1_000 * 2 ** attempt) + Math.random() * 400;
        setState((s) => ({ ...s, status: 'connecting', error: 'Reconnecting…' }));
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (wsRef.current === ws) connect({ type: 'rejoin', ...session });
        }, delay);
      } else {
        setState((s) => (s.status === 'idle' ? s : { ...s, status: 'idle', error: 'Connection lost' }));
      }
    };
  }, []);

  // Auto-rejoin on page load if a session survives in this tab.
  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<StoredSession>;
        if (typeof parsed.code !== 'string' || typeof parsed.token !== 'string') throw new Error();
        const session: StoredSession = { code: parsed.code, token: parsed.token };
        sessionRef.current = session;
        connect({ type: 'rejoin', ...session });
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect]);

  const sendMsg = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  return {
    state,
    create: (name: string) => connect({ type: 'create', name }),
    join: (code: string, name: string) => connect({ type: 'join', code: code.toUpperCase().trim(), name }),
    start: (winThreshold: number) => sendMsg({ type: 'start', winThreshold }),
    addBot: (difficulty: BotDifficulty) => sendMsg({ type: 'add_bot', difficulty }),
    removeBot: (seatId: string) => sendMsg({ type: 'remove_bot', seatId }),
    decide: (decision: Decision) => sendMsg({ type: 'decision', decision }),
    restart: () => sendMsg({ type: 'restart' }),
    clearMoment: () => setState((s) => ({ ...s, moment: null })),
    clearReveal: () => setState((s) => ({ ...s, reveal: null })),
    clearError: () => setState((s) => ({ ...s, error: null })),
    leave: () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      sessionRef.current = null;
      sessionStorage.removeItem(SESSION_KEY);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
      setState(initial);
    },
  };
}
