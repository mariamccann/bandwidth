// The 13 effect types (spec §5), each a discrete unit-testable function.
//
// Contract: each effect receives the game state, the active player, the played
// card, and (when required) the validated target player. Effects that need a
// follow-up choice set `state.pending` and flip gamePhase to
// 'resolving_effect'; the engine finishes the turn once the choice arrives.
//
// Protection (isProtected) is checked by the ENGINE before any targeted effect
// reaches these functions — see engine.resolveCard.

import {
  selectHighestInfluenceIndex,
  selectHighestStressIndex,
  stressLoad,
} from './cards.js';
import { drawCard } from './zones.js';
import type { Card, GameState, PlayerState } from './types.js';

/** Add to collectiveStress; clamp at 0 only. Upper bound is handled by the elimination check (§4 step 6). */
export function applyStressDelta(state: GameState, amount: number): void {
  state.collectiveStress = Math.max(0, state.collectiveStress + amount);
}

export function stress_delta(state: GameState, active: PlayerState, card: Card): void {
  const amount = card.effectParams.amount ?? 0;
  applyStressDelta(state, amount);
  const dir = amount >= 0 ? `+${amount}` : `${amount}`;
  state.gameLog.push(`${active.name} played ${card.name}: Collective Stress ${dir} (now ${state.collectiveStress}).`);
}

export function influence_gain(state: GameState, active: PlayerState, card: Card): void {
  const amount = card.effectParams.amount ?? 0;
  active.influence += amount;
  state.gameLog.push(`${active.name} played ${card.name}: +${amount} Influence (now ${active.influence}).`);
}

export function influence_gain_with_stress_cost(state: GameState, active: PlayerState, card: Card): void {
  // Order matters (spec §5): Influence banked FIRST, then stress — the player
  // keeps the Influence even if the stress tips the track and eliminates them.
  const inf = card.effectParams.influenceAmount ?? 0;
  const stress = card.effectParams.stressAmount ?? 0;
  active.influence += inf;
  applyStressDelta(state, stress);
  state.gameLog.push(
    `${active.name} played ${card.name}: +${inf} Influence, Collective Stress +${stress} (now ${state.collectiveStress}).`,
  );
}

export function give_random_card(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  const drawn = drawCard(state);
  if (!drawn) {
    state.gameLog.push(`${active.name} played ${card.name} on ${target.name}, but there were no cards to give.`);
    return;
  }
  // Target's hand may exceed 6 (spec §5); they simply don't redraw until below 6.
  target.hand.push(drawn);
  state.gameLog.push(`${active.name} played ${card.name}: ${target.name} received a face-down card.`);
}

export function skip_next_turn(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  target.skipNextTurn = true;
  state.gameLog.push(`${active.name} played ${card.name}: ${target.name} will skip their next turn.`);
}

export function peek_and_swap(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  if (target.hand.length === 0 || active.hand.length === 0) {
    state.gameLog.push(`${active.name} played ${card.name} on ${target.name}, but there was nothing to swap.`);
    return;
  }
  state.gamePhase = 'resolving_effect';
  state.pending = {
    kind: 'peek_swap',
    playerId: active.id,
    targetId: target.id,
    revealedCardIds: target.hand.map((c) => c.id),
  };
  state.gameLog.push(`${active.name} played ${card.name}: peeking at ${target.name}'s hand…`);
}

export function protect_self(state: GameState, active: PlayerState, card: Card): void {
  active.isProtected = true;
  state.gameLog.push(`${active.name} played ${card.name}: protected until it blocks a targeted effect.`);
}

export function force_discard_chosen_by_attacker(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  if (target.hand.length === 0) {
    state.gameLog.push(`${active.name} played ${card.name} on ${target.name}, but their hand was empty.`);
    return;
  }
  state.gamePhase = 'resolving_effect';
  state.pending = {
    kind: 'force_discard',
    playerId: active.id,
    targetId: target.id,
    revealedCardIds: target.hand.map((c) => c.id),
  };
  state.gameLog.push(`${active.name} played ${card.name}: choosing a card for ${target.name} to discard…`);
}

export function reveal_hand(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  // UI-only: no state change beyond the log. The UI shows the hand to the active player only.
  state.gameLog.push(`${active.name} played ${card.name}: looked at ${target.name}'s hand.`);
}

export function force_play_highest_stress_next_turn(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  target.forcedPlayHighestStress = true;
  state.gameLog.push(`${active.name} played ${card.name}: ${target.name} must play their highest-stress card next turn.`);
}

export function steal_influence(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  if (target.influence > 0) {
    target.influence -= 1;
    active.influence += 1;
    state.gameLog.push(
      `${active.name} played ${card.name}: stole 1 Influence from ${target.name} (${active.name} now ${active.influence}, ${target.name} now ${target.influence}).`,
    );
  } else {
    state.gameLog.push(`${active.name} played ${card.name} on ${target.name}, who had no Influence to steal.`);
  }
}

export function force_discard_and_apply_stress(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  if (target.hand.length === 0) {
    state.gameLog.push(`${active.name} played ${card.name} on ${target.name}, but their hand was empty.`);
    return;
  }
  let idx = selectHighestStressIndex(target.hand);
  if (idx >= 0) {
    const discarded = target.hand.splice(idx, 1)[0]!;
    state.discardPile.push(discarded);
    const load = stressLoad(discarded);
    applyStressDelta(state, load);
    state.gameLog.push(
      `${active.name} played ${card.name}: ${target.name} discarded ${discarded.name}, Collective Stress +${load} (now ${state.collectiveStress}).`,
    );
  } else {
    // No positive-stress card: discard highest-Influence-yield card instead, no stress effect (spec §5).
    idx = selectHighestInfluenceIndex(target.hand);
    const discarded = target.hand.splice(idx, 1)[0]!;
    state.discardPile.push(discarded);
    state.gameLog.push(
      `${active.name} played ${card.name}: ${target.name} had no stress cards and discarded ${discarded.name} instead.`,
    );
  }
}

export function aid_target(state: GameState, active: PlayerState, card: Card, target: PlayerState): void {
  if (target.hand.length === 0) {
    // Nothing to discard — the relief still lands (DECISIONS.md #15).
    applyStressDelta(state, -6);
    state.gameLog.push(
      `${active.name} played ${card.name} for ${target.name}: Collective Stress −6 (now ${state.collectiveStress}).`,
    );
    return;
  }
  state.gamePhase = 'resolving_effect';
  state.pending = { kind: 'aid_discard', playerId: target.id, sourcePlayerId: active.id };
  state.gameLog.push(`${active.name} played ${card.name} for ${target.name}: ${target.name} is choosing a card to let go of…`);
}
