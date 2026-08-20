// UI-side wrapper around the pure engine: owns the mutable GameState, bumps a
// version to re-render, and detects "moments" (eliminations, reveals) that the
// engine only expresses as log lines / state diffs.
import { useCallback, useRef, useState } from 'react';
import { applyDecision, createGame, type GameConfig } from '../src/engine.js';
import type { Card, Decision, GameState } from '../src/types.js';

export interface Moment {
  kind: 'elimination';
  eliminatedName: string;
}

export interface RevealInfo {
  targetName: string;
  cards: Card[];
}

export function useGame() {
  const stateRef = useRef<GameState | null>(null);
  const [, setVersion] = useState(0);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [reveal, setReveal] = useState<RevealInfo | null>(null);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const start = useCallback((config: GameConfig) => {
    stateRef.current = createGame({ ...config, seed: (Math.random() * 2 ** 31) | 0 });
    setMoment(null);
    setReveal(null);
    bump();
  }, [bump]);

  const decide = useCallback((decision: Decision) => {
    const state = stateRef.current!;
    const aliveBefore = new Set(state.players.filter((p) => p.isAlive).map((p) => p.id));

    // reveal_hand is UI-only (§5): snapshot the target hand before the engine
    // resolves and advances the turn.
    if (decision.type === 'play_card') {
      const active = state.players.find((p) => p.hand.some((c) => c.id === decision.cardId));
      const card = active?.hand.find((c) => c.id === decision.cardId);
      if (card?.effectType === 'reveal_hand' && decision.targetId) {
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
  }, [bump]);

  const reset = useCallback(() => {
    stateRef.current = null;
    setMoment(null);
    setReveal(null);
    bump();
  }, [bump]);

  return {
    state: stateRef.current,
    decide,
    start,
    reset,
    moment,
    clearMoment: () => setMoment(null),
    reveal,
    clearReveal: () => setReveal(null),
  };
}
