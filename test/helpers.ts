// Test utilities: build controlled game states without fighting the shuffler.
import { createGame } from '../src/engine.js';
import type { Card, GameState } from '../src/types.js';

let testSerial = 9000;

/** Minimal card factory for hand-crafted scenarios. */
export function card(partial: Partial<Card> & Pick<Card, 'effectType'>): Card {
  return {
    id: `t${testSerial++}`,
    name: partial.name ?? partial.effectType,
    deckType: partial.deckType ?? 'Stress',
    effectType: partial.effectType,
    effectParams: partial.effectParams ?? {},
    ...(partial.condition ? { condition: partial.condition } : {}),
    requiresTarget: partial.requiresTarget ?? false,
    flavour: partial.flavour ?? '',
  };
}

/** A real game with a fixed seating order (p0, p1, p2, ...) and known seed. */
export function newGame(n = 3, opts: { winThreshold?: number; seed?: number } = {}): GameState {
  return createGame({
    playerNames: Array.from({ length: n }, (_, i) => `P${i}`),
    seed: opts.seed ?? 42,
    winThreshold: opts.winThreshold ?? 15,
    fixedTurnOrder: true,
  });
}

/** Recompute the pending play_card decision after mutating the active hand. */
export function refreshPending(state: GameState): void {
  if (state.pending?.kind !== 'play_card') return;
  const p = state.players.find((pl) => pl.id === (state.pending as { playerId: string }).playerId)!;
  const playable = p.hand.filter((c) => {
    if (c.condition === 'not_sole_leader') {
      const others = state.players.filter((o) => o.isAlive && o.id !== p.id);
      if (p.influence > Math.max(...others.map((o) => o.influence))) return false;
    }
    return true;
  });
  state.pending = {
    kind: 'play_card',
    playerId: p.id,
    playableCardIds: (playable.length ? playable : p.hand).map((c) => c.id),
    mustDiscard: playable.length === 0,
  };
}

/** Force a specific hand onto a player, then refresh pending if needed. */
export function setHand(state: GameState, playerId: string, hand: Card[]): void {
  const p = state.players.find((pl) => pl.id === playerId)!;
  p.hand = hand;
  refreshPending(state);
}
