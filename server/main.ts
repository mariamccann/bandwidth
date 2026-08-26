// WebSocket game server. One process, many rooms. Deployable to any Node host
// (Render/Fly): binds process.env.PORT, answers HTTP health checks, and speaks
// the protocol in protocol.ts over WebSockets.
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room, RoomError, RoomRegistry } from './room.js';
import type { ClientMessage, ServerMessage } from './protocol.js';
import { isClientMessage } from './validation.js';

const PORT = Number(process.env.PORT ?? 8787);
const registry = new RoomRegistry();

interface Conn {
  ws: WebSocket;
  room: Room | null;
  token: string | null; // identifies the seat
  isAlive: boolean;
  windowStartedAt: number;
  messagesInWindow: number;
}

const conns = new Set<Conn>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function seatOf(conn: Conn) {
  return conn.room && conn.token ? conn.room.seatByToken(conn.token) ?? null : null;
}

function broadcastLobby(room: Room): void {
  for (const c of conns) {
    if (c.room === room && c.token) {
      send(c.ws, {
        type: 'lobby',
        code: room.code,
        players: room.lobbyPlayers(),
        youAreHost: room.isHost(c.token),
      });
    }
  }
}

function broadcastState(room: Room): void {
  for (const c of conns) {
    const seat = seatOf(c);
    if (c.room === room && seat && room.state) {
      send(c.ws, { type: 'state', view: room.viewFor(seat.seatId) });
    }
  }
}

/** Fan out the reveal (to its one viewer) and elimination moment (to all) of an applied move. */
function dispatchEvent(room: Room, event: import('./room.js').RoomEvent): void {
  if (event.reveal) {
    for (const c of conns) {
      const s = seatOf(c);
      if (c.room === room && s?.seatId === event.reveal.toSeatId) {
        send(c.ws, { type: 'reveal', targetName: event.reveal.targetName, cards: event.reveal.cards });
      }
    }
  }
  if (event.moment) {
    for (const c of conns) {
      if (c.room === room && seatOf(c)) {
        send(c.ws, { type: 'moment', eliminatedName: event.moment.eliminatedName });
      }
    }
  }
}

const BOT_DELAY_MS = 900;
const botTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Server-side computer players. Whenever the pending decision belongs to a bot
 * seat, apply its move after a short readable delay and chain to the next.
 * One timer per room; re-validated on fire so a reset/restart can't act stale.
 */
function scheduleBots(room: Room): void {
  if (botTimers.has(room.code)) return;
  if (!room.pendingBotSeat()) return;
  const stateAtSchedule = room.state;
  const timer = setTimeout(() => {
    botTimers.delete(room.code);
    if (room.state !== stateAtSchedule || !room.pendingBotSeat()) {
      scheduleBots(room);
      return;
    }
    try {
      const event = room.applyBotTurn();
      room.touch();
      dispatchEvent(room, event);
    } catch (e) {
      console.error('bot turn failed', e);
    }
    broadcastState(room);
    scheduleBots(room);
  }, BOT_DELAY_MS);
  botTimers.set(room.code, timer);
}

function handle(conn: Conn, msg: ClientMessage): void {
  switch (msg.type) {
    case 'create': {
      const room = registry.create();
      const seat = room.addPlayer(msg.name);
      conn.room = room;
      conn.token = seat.token;
      room.touch();
      send(conn.ws, { type: 'joined', code: room.code, token: seat.token, seatId: seat.seatId });
      broadcastLobby(room);
      return;
    }
    case 'join': {
      const room = registry.get(msg.code);
      if (!room) throw new RoomError('No room with that code');
      const seat = room.addPlayer(msg.name);
      conn.room = room;
      conn.token = seat.token;
      room.touch();
      send(conn.ws, { type: 'joined', code: room.code, token: seat.token, seatId: seat.seatId });
      broadcastLobby(room);
      return;
    }
    case 'rejoin': {
      const room = registry.get(msg.code);
      const seat = room?.seatByToken(msg.token);
      if (!room || !seat) throw new RoomError('Could not rejoin — room or seat gone');
      conn.room = room;
      conn.token = seat.token;
      // A refreshed tab owns the seat now. Retiring the stale connection keeps
      // private events and decisions from being delivered twice.
      for (const other of conns) {
        if (other !== conn && other.room === room && other.token === seat.token) {
          other.room = null;
          other.token = null;
          other.ws.close(4001, 'Seat reconnected elsewhere');
        }
      }
      seat.connected = true;
      room.touch();
      send(conn.ws, { type: 'joined', code: room.code, token: seat.token, seatId: seat.seatId });
      if (room.state) {
        broadcastState(room); // includes connected-flag change for everyone
      } else {
        broadcastLobby(room);
      }
      return;
    }
    case 'add_bot': {
      const room = conn.room;
      if (!room || !conn.token) throw new RoomError('Not in a room');
      if (!room.isHost(conn.token)) throw new RoomError('Only the host can add computer players');
      room.addBot(msg.difficulty === 'easy' ? 'easy' : 'normal');
      room.touch();
      broadcastLobby(room);
      return;
    }
    case 'remove_bot': {
      const room = conn.room;
      if (!room || !conn.token) throw new RoomError('Not in a room');
      if (!room.isHost(conn.token)) throw new RoomError('Only the host can remove computer players');
      room.removeBot(msg.seatId);
      room.touch();
      broadcastLobby(room);
      return;
    }
    case 'start': {
      const room = conn.room;
      if (!room || !conn.token) throw new RoomError('Not in a room');
      if (!room.isHost(conn.token)) throw new RoomError('Only the host can start');
      const t = Math.max(5, Math.min(30, Math.floor(msg.winThreshold) || 15));
      room.start(t);
      room.touch();
      broadcastState(room);
      scheduleBots(room); // in case the first player to act is a bot
      return;
    }
    case 'decision': {
      const room = conn.room;
      const seat = seatOf(conn);
      if (!room || !seat) throw new RoomError('Not in a room');
      const event = room.applyDecision(seat.seatId, msg.decision);
      room.touch();
      dispatchEvent(room, event);
      broadcastState(room);
      scheduleBots(room); // next player to act may be a bot
      return;
    }
    case 'restart': {
      const room = conn.room;
      if (!room || !conn.token) throw new RoomError('Not in a room');
      if (!room.isHost(conn.token)) throw new RoomError('Only the host can restart');
      if (room.state && room.state.gamePhase !== 'game_over') {
        throw new RoomError('Game still in progress');
      }
      const pendingTimer = botTimers.get(room.code);
      if (pendingTimer) { clearTimeout(pendingTimer); botTimers.delete(room.code); }
      room.restart();
      room.touch();
      broadcastLobby(room);
      return;
    }
  }
}

const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('bandwidth game server: ok\n');
});

const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  const conn: Conn = {
    ws,
    room: null,
    token: null,
    isAlive: true,
    windowStartedAt: Date.now(),
    messagesInWindow: 0,
  };
  conns.add(conn);
  ws.on('pong', () => { conn.isAlive = true; });
  ws.on('message', (data) => {
    const now = Date.now();
    if (now - conn.windowStartedAt > 5_000) {
      conn.windowStartedAt = now;
      conn.messagesInWindow = 0;
    }
    conn.messagesInWindow += 1;
    if (conn.messagesInWindow > 30) {
      send(ws, { type: 'error', message: 'Too many messages — slow down' });
      ws.close(1008, 'Rate limit');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      send(ws, { type: 'error', message: 'Malformed message' });
      return;
    }
    if (!isClientMessage(parsed)) {
      send(ws, { type: 'error', message: 'Invalid message' });
      return;
    }
    try {
      handle(conn, parsed);
    } catch (e) {
      send(ws, { type: 'error', message: e instanceof RoomError ? e.message : 'Server error' });
      if (!(e instanceof RoomError)) console.error(e);
    }
  });
  ws.on('close', () => {
    conns.delete(conn);
    const seat = seatOf(conn);
    if (seat && conn.room) {
      seat.connected = false;
      if (conn.room.state) broadcastState(conn.room);
      else broadcastLobby(conn.room);
    }
  });
});

const heartbeat = setInterval(() => {
  for (const conn of conns) {
    if (!conn.isAlive) {
      conn.ws.terminate();
      continue;
    }
    conn.isAlive = false;
    conn.ws.ping();
  }
}, 30_000);
heartbeat.unref();

setInterval(() => registry.sweep(), 30 * 60 * 1000).unref();

http.listen(PORT, () => {
  console.log(`bandwidth server listening on :${PORT}`);
});
