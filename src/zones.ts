// Card-zone helpers: drawing and the single canonical reshuffle (DECISIONS.md #12).
import { shuffle } from './rng.js';
import type { Card, GameState, PlayerState } from './types.js';

/**
 * Draw one card, reshuffling the discard pile into a new deck if the deck is
 * empty. The in-play card lives in `state.inPlay` (not in the discard pile), so
 * it is naturally excluded from any mid-effect reshuffle and becomes the new
 * discard seed when step 8 discards it. Returns null only if deck AND discard
 * are both empty (§4 step 10 — play short-handed, never crash).
 */
export function drawCard(state: GameState): Card | null {
  if (state.deck.length === 0) {
    if (state.discardPile.length === 0) return null;
    // Keep the most recently discarded card out as the new discard seed
    // (§4 step 8). If only one card is available, take it — no seed.
    const seed = state.discardPile.length > 1 ? state.discardPile.pop()! : null;
    state.deck = state.discardPile;
    state.discardPile = seed ? [seed] : [];
    shuffle(state, state.deck);
    state.gameLog.push('The discard pile was shuffled into a new deck.');
  }
  return state.deck.pop() ?? null;
}

/** Draw the player back up to 6 cards (never above; no-op at 6+). */
export function drawUpToHandSize(state: GameState, player: PlayerState, handSize = 6): void {
  while (player.hand.length < handSize) {
    const card = drawCard(state);
    if (!card) break; // §4 step 10: both piles empty — play short-handed
    player.hand.push(card);
  }
}

export function removeFromHand(player: PlayerState, cardId: string): Card {
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new Error(`Card ${cardId} not in ${player.name}'s hand`);
  return player.hand.splice(idx, 1)[0]!;
}
