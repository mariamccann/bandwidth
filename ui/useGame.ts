// UI-side wrapper around the pure engine: owns the mutable GameState, bumps a
// version to re-render, and detects "moments" (eliminations, reveals) that the
// engine only expresses as log lines / state diffs.
//
// It also drives COMPUTER players. The engine is decision-driven and never
// assumes a human (spec §12 Phase 3), so a bot is just an agent answering the
// same pending decisions a human would. Bots act on a short delay so their
// moves are readable, and they are skipped by the pass-the-phone privacy flow.
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyDecision, createGame, type GameConfig } from '../src/engine.js';
import { greedyAgent, randomAgent, type Agent } from '../sim/agents.js';
import type { Card, Decision, GameState } from '../src/types.js';

export interface Moment {
  kind: 'elimination';
  eliminatedName: string;
}

export interface RevealInfo {
  targetName: string;
  cards: Card[];
}

export type BotDifficulty = 'easy' | 'normal';

export interface StartOptions extends GameConfig {
  /** player ids (p0, p1, …) controlled by the computer, mapped to difficulty. */
  bots?: Record<string, BotDifficulty>;
}

const BOT_DELAY_MS = 850;

function agentFor(difficulty: BotDifficulty): Agent {
  return difficulty === 'easy' ? randomAgent : greedyAgent;
}

/** Last-resort guaranteed-legal move for the pending decision (never throws for a valid pending). */
function fallbackDecision(state: GameState, pending: NonNullable<GameState['pending']>): Decision {
  switch (pending.kind) {
    case 'play_card': {
      const cardId = pending.playableCardIds[0]!;
      if (pending.mustDiscard) return { type: 'discard_card', cardId };
      const player = state.players.find((p) => p.id === pending.playerId)!;
      const card = player.hand.find((c) => c.id === cardId)!;
      if (card.requiresTarget) {
        const target = state.players.find((p) => p.isAlive && p.id !== pending.playerId)!;
        return { type: 'play_card', cardId, targetId: target.id };
      }
      return { type: 'play_card', cardId };
    }
    case 'peek_swap': {
      const me = state.players.find((p) => p.id === pending.playerId)!;
      return { type: 'peek_swap', takeCardId: pending.revealedCardIds[0]!, giveCardId: me.hand[0]!.id };
    }
    case 'force_discard':
      return { type: 'force_discard', cardId: pending.revealedCardIds[0]! };
    case 'aid_discard': {
      const me = state.players.find((p) => p.id === pending.playerId)!;
      return { type: 'aid_discard', cardId: me.hand[0]!.id };
    }
  }
}

export function useGame() {
  const stateRef = useRef<GameState | null>(null);
  const botAgents = useRef<Map<string, Agent>>(new Map());
  const rngRef = useRef({ rngState: 1 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [version, setVersion] = useState(0);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [reveal, setReveal] = useState<RevealInfo | null>(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const isBot = useCallback((playerId: string) => botAgents.current.has(playerId), []);

  /** Apply a decision, detecting reveal (human-initiated only) and elimination moments. */
  const apply = useCallback((decision: Decision) => {
    const state = stateRef.current!;
    const aliveBefore = new Set(state.players.filter((p) => p.isAlive).map((p) => p.id));

    // reveal_hand is UI-only (§5): snapshot the target's hand before the engine
    // resolves. Only surface it when a HUMAN played it — a bot "seeing" a hand
    // must not flash it onto the shared screen.
    if (decision.type === 'play_card') {
      const active = state.players.find((p) => p.hand.some((c) => c.id === decision.cardId));
      const card = active?.hand.find((c) => c.id === decision.cardId);
      if (card?.effectType === 'reveal_hand' && decision.targetId && active && !isBot(active.id)) {
        const target = state.players.find((p) => p.id === decision.targetId)!;
        if (!target.isProtected) {
          setReveal({ targetName: target.name, cards: [...target.hand] });
        }
      }
    }

    applyDecision(state, decision);

    const eliminated = state.players.find((p) => aliveBefore.has(p.id) && !p.isAlive);
    if (eliminated) setMoment({ kind: 'elimination', eliminatedName: eliminated.name });
    bump();
  }, [bump, isBot]);

  const start = useCallback((options: StartOptions) => {
    const { bots, ...config } = options;
    const state = createGame({ ...config, seed: (Math.random() * 2 ** 31) | 0 });
    stateRef.current = state;
    botAgents.current = new Map(
      Object.entries(bots ?? {}).map(([id, diff]) => [id, agentFor(diff)]),
    );
    rngRef.current = { rngState: (state.rngState ^ 0x9e3779b9) >>> 0 };
    setMoment(null);
    setReveal(null);
    bump();
  }, [bump]);

  const decide = useCallback((decision: Decision) => {
    apply(decision);
  }, [apply]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    stateRef.current = null;
    botAgents.current = new Map();
    setMoment(null);
    setReveal(null);
    bump();
  }, [bump]);

  // Bot driver: whenever the pending decision belongs to a computer player and
  // no moment modal is blocking, schedule the bot's move. Runs one step per
  // effect pass; each applied move bumps the version and re-runs this effect,
  // so chained bot turns resolve one visible step at a time.
  const state = stateRef.current;
  const pending = state?.pending ?? null;
  const botToAct = pending && isBot(pending.playerId) && state?.gamePhase !== 'game_over';
  useEffect(() => {
    if (!botToAct || moment) return; // let the human dismiss elimination modals first
    const s = stateRef.current!;
    const p = s.pending!;
    const agent = botAgents.current.get(p.playerId)!;
    timerRef.current = setTimeout(() => {
      // Re-validate: state may have changed if the human reset mid-timeout.
      if (stateRef.current !== s || s.pending !== p) return;
      // A thrown decision must never freeze the game — fall back to a random
      // legal move, then to any legal move, so the bot always advances play.
      try {
        apply(agent.decide(s, p, rngRef.current));
      } catch {
        try {
          apply(randomAgent.decide(s, p, rngRef.current));
        } catch {
          apply(fallbackDecision(s, p));
        }
      }
    }, BOT_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // `version` bumps on every applied move, so this re-runs after each bot
    // step even when botToAct stays true across consecutive computer players.
  }, [botToAct, moment, version, apply]);

  return {
    state: stateRef.current,
    decide,
    start,
    reset,
    isBot,
    /** id of the computer player whose move is currently pending, if any. */
    botActingId: botToAct ? pending!.playerId : null,
    moment,
    clearMoment: () => setMoment(null),
    reveal,
    clearReveal: () => setReveal(null),
  };
}
