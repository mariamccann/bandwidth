// Game engine state machine — spec §3 (setup), §4 (turn sequence), §7 (end
// conditions). Pure, framework-free, decision-driven: the engine surfaces a
// PendingDecision and callers (UI, sim agents, future AI opponents) answer it
// via applyDecision. It never assumes a human at the screen (§12 Phase 3).

import { buildDeck, selectHighestStressIndex } from './cards.js';
import * as fx from './effects.js';
import { shuffle } from './rng.js';
import { drawCard, drawUpToHandSize, removeFromHand } from './zones.js';
import type {
  Card,
  Decision,
  GameState,
  PendingDecision,
  PlayerState,
  StandingsEntry,
} from './types.js';

export const DEFAULT_WIN_THRESHOLD = 15; // configurable constant (§1)
export const HAND_SIZE = 6;
export const STRESS_LIMIT = 100;
export const POST_ELIMINATION_STRESS = 75;
export const HALO_PENALTY = 2;
export const DEFAULT_TURN_CAP = 300; // §7.3 safety valve

export interface GameConfig {
  playerNames: string[];
  winThreshold?: number;
  seed?: number;
  turnCap?: number;
  /** If set, use this seating order (indices into playerNames); otherwise random (§3.7). */
  fixedTurnOrder?: boolean;
}

// ---------------------------------------------------------------- setup (§3)

export function createGame(config: GameConfig): GameState {
  const n = config.playerNames.length;
  if (n < 3 || n > 8) {
    throw new Error(`Player count must be 3–8, got ${n}`); // hard limit (§1, §3.1)
  }
  const state: GameState = {
    players: config.playerNames.map((name, i) => ({
      id: `p${i}`,
      name,
      influence: 0,
      hand: [],
      isAlive: true,
      skipNextTurn: false,
      forcedPlayHighestStress: false,
      isProtected: false,
    })),
    collectiveStress: 0,
    deck: buildDeck(),
    discardPile: [],
    turnOrder: [],
    currentPlayerIndex: 0,
    turnCount: 0,
    gamePhase: 'setup',
    winnerId: null,
    winReason: null,
    winThreshold: config.winThreshold ?? DEFAULT_WIN_THRESHOLD,
    gameLog: [],
    inPlay: null,
    pending: null,
    rngState: (config.seed ?? 1) >>> 0,
    turnCap: config.turnCap ?? DEFAULT_TURN_CAP,
  };
  shuffle(state, state.deck);
  for (const p of state.players) drawUpToHandSize(state, p);
  state.turnOrder = state.players.map((p) => p.id);
  if (!config.fixedTurnOrder) shuffle(state, state.turnOrder);
  state.currentPlayerIndex = 0;
  state.gamePhase = 'playing';
  state.gameLog.push(`Game started: ${state.players.map((p) => p.name).join(', ')}. First to ${state.winThreshold} Influence wins.`);
  beginTurn(state);
  return state;
}

// ------------------------------------------------------------------ helpers

export function getPlayer(state: GameState, id: string): PlayerState {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

export function activePlayer(state: GameState): PlayerState {
  return getPlayer(state, state.turnOrder[state.currentPlayerIndex]!);
}

/** Derived — replaces the stored isCurrentTurn flag (DECISIONS.md). */
export function isCurrentTurn(state: GameState, playerId: string): boolean {
  return state.gamePhase !== 'game_over' && activePlayer(state).id === playerId;
}

function alivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.isAlive);
}

/** Self-targeting is disallowed for ALL targeted effects (DECISIONS.md #2). */
export function eligibleTargets(state: GameState, forPlayerId: string): PlayerState[] {
  return alivePlayers(state).filter((p) => p.id !== forPlayerId);
}

/** not_sole_leader (§5.1): unplayable while strictly ahead of every other alive player. Ties = playable. */
export function isCardPlayable(state: GameState, player: PlayerState, card: Card): boolean {
  if (card.condition === 'not_sole_leader') {
    const others = alivePlayers(state).filter((p) => p.id !== player.id);
    const maxOther = Math.max(...others.map((p) => p.influence));
    if (player.influence > maxOther) return false;
  }
  return true;
}

function isGameOver(state: GameState): boolean {
  return state.gamePhase === 'game_over';
}

function declareWinner(state: GameState, playerId: string, reason: GameState['winReason']): void {
  state.gamePhase = 'game_over';
  state.winnerId = playerId;
  state.winReason = reason;
  state.pending = null;
  const p = getPlayer(state, playerId);
  const how =
    reason === 'influence' ? `reached ${p.influence} Influence`
    : reason === 'sole_survivor' ? 'is the sole survivor'
    : 'had the most Influence when the game hit the turn cap';
  state.gameLog.push(`${p.name} wins: ${how}.`);
}

/** Any alive player at/over threshold? (§4 steps 1 & 7) */
function checkInfluenceWin(state: GameState): boolean {
  for (const id of state.turnOrder) {
    const p = getPlayer(state, id);
    if (p.isAlive && p.influence >= state.winThreshold) {
      declareWinner(state, p.id, 'influence');
      return true;
    }
  }
  return false;
}

/** §4 step 11: one alive player left → wins by default. */
function checkSoleSurvivor(state: GameState): boolean {
  const alive = alivePlayers(state);
  if (alive.length === 1) {
    declareWinner(state, alive[0]!.id, 'sole_survivor');
    return true;
  }
  return false;
}

// --------------------------------------------------------- turn engine (§4)

/**
 * Run pre-turn steps (win check, skip, forced play) — looping across players
 * as skips and forced plays auto-resolve — until the game ends or a decision
 * is required from a player.
 */
function beginTurn(state: GameState): void {
  // Guard against infinite loops (cannot happen in legal states; belt & braces).
  for (let guard = 0; guard < state.players.length * (state.turnCap + 2); guard++) {
    if (state.gamePhase === 'game_over') return;

    // Step 1 — pre-turn safety win check.
    if (checkInfluenceWin(state)) return;

    const active = activePlayer(state);

    // Step 2 — skip check. Consumes ONLY skipNextTurn; a pending
    // forcedPlayHighestStress survives to their next real turn (DECISIONS.md #5).
    if (active.skipNextTurn) {
      active.skipNextTurn = false;
      drawUpToHandSize(state, active);
      state.gameLog.push(`${active.name} skips this turn.`);
      if (!advanceTurn(state)) return; // skip proceeds straight to step 9 (DECISIONS.md #3)
      continue;
    }

    // Step 3 — forced-play check.
    if (active.forcedPlayHighestStress) {
      active.forcedPlayHighestStress = false;
      const idx = selectHighestStressIndex(active.hand);
      if (idx >= 0) {
        const card = active.hand.splice(idx, 1)[0]!;
        state.inPlay = card;
        state.gameLog.push(`${active.name} is micromanaged into playing ${card.name}.`);
        resolveCard(state, active, card, undefined);
        // Forced cards are all untargeted stress loads — never a follow-up decision.
        finishTurn(state);
        if (isGameOver(state)) return;
        if (!advanceTurn(state)) return;
        continue;
      }
      state.gameLog.push(`${active.name} shrugs off the micromanagement — no stress cards in hand.`);
      // Status expires with no effect; proceed to the normal action (§4.3).
    }

    // Step 4 — player action.
    const playable = active.hand.filter((c) => isCardPlayable(state, active, c));
    if (playable.length === 0) {
      // Vanishingly rare: every card unplayable → discard one, draw, end turn (§4.4).
      state.pending = {
        kind: 'play_card',
        playerId: active.id,
        playableCardIds: active.hand.map((c) => c.id),
        mustDiscard: true,
      };
    } else {
      state.pending = {
        kind: 'play_card',
        playerId: active.id,
        playableCardIds: playable.map((c) => c.id),
        mustDiscard: false,
      };
    }
    return; // wait for the decision
  }
  throw new Error('beginTurn failed to converge — engine bug');
}

/**
 * Resolve a played card (§4 step 5), applying the protection rule for targeted
 * effects (spec §5). May set state.pending for follow-up choices.
 */
function resolveCard(state: GameState, active: PlayerState, card: Card, targetId: string | undefined): void {
  if (card.requiresTarget) {
    if (!targetId) throw new Error(`${card.name} requires a target`);
    const target = getPlayer(state, targetId);
    if (!target.isAlive) throw new Error(`Cannot target eliminated player ${target.name}`);
    if (target.id === active.id) throw new Error('Self-targeting is not allowed');
    // Protection blocks ALL targeted effects — including aid_target (§9: "protection blocks help too").
    if (target.isProtected) {
      target.isProtected = false;
      if (card.effectType === 'aid_target') {
        state.gameLog.push(`${target.name} declined ${active.name}'s ${card.name}. Calendar's blocked.`);
      } else {
        state.gameLog.push(`${target.name} was protected from ${active.name}'s ${card.name}.`);
      }
      return;
    }
    switch (card.effectType) {
      case 'give_random_card': return fx.give_random_card(state, active, card, target);
      case 'skip_next_turn': return fx.skip_next_turn(state, active, card, target);
      case 'peek_and_swap': return fx.peek_and_swap(state, active, card, target);
      case 'force_discard_chosen_by_attacker': return fx.force_discard_chosen_by_attacker(state, active, card, target);
      case 'reveal_hand': return fx.reveal_hand(state, active, card, target);
      case 'force_play_highest_stress_next_turn': return fx.force_play_highest_stress_next_turn(state, active, card, target);
      case 'steal_influence': return fx.steal_influence(state, active, card, target);
      case 'force_discard_and_apply_stress': return fx.force_discard_and_apply_stress(state, active, card, target);
      case 'aid_target': return fx.aid_target(state, active, card, target);
      default: throw new Error(`Effect ${card.effectType} does not take a target`);
    }
  }
  switch (card.effectType) {
    case 'stress_delta': return fx.stress_delta(state, active, card);
    case 'influence_gain': return fx.influence_gain(state, active, card);
    case 'influence_gain_with_stress_cost': return fx.influence_gain_with_stress_cost(state, active, card);
    case 'protect_self': return fx.protect_self(state, active, card);
    default: throw new Error(`Effect ${card.effectType} requires a target`);
  }
}

/** §4 steps 6–8: elimination check, win check, discard & redraw. */
function finishTurn(state: GameState): void {
  state.gamePhase = 'playing';
  state.pending = null;
  const active = activePlayer(state);

  // Step 6 — elimination check. NOTE: always the ACTIVE player, even when the
  // tipping stress came from a card forced out of someone else's hand
  // (Effective Immediately) — the axe swings both ways (DECISIONS.md #7).
  if (state.collectiveStress >= STRESS_LIMIT) {
    active.isAlive = false;
    active.skipNextTurn = false;
    active.forcedPlayHighestStress = false;
    active.isProtected = false;
    // Eliminated player's hand returns to circulation (DECISIONS.md #1).
    state.discardPile.push(...active.hand);
    active.hand = [];
    // The team absorbs the departure, but the underlying workload remains.
    // 75 preserves pressure without making the next small card an automatic exit.
    state.collectiveStress = POST_ELIMINATION_STRESS;
    // Halo Effect: every other alive player loses 2 Influence, floored at 0.
    for (const p of alivePlayers(state)) {
      p.influence = Math.max(0, p.influence - HALO_PENALTY);
    }
    state.gameLog.push(
      `${active.name} tipped the Stress Track past ${STRESS_LIMIT} and is out. Stress settles at ${POST_ELIMINATION_STRESS}; everyone else loses ${HALO_PENALTY} Influence.`,
    );
    if (checkSoleSurvivor(state)) {
      if (state.inPlay) { state.discardPile.push(state.inPlay); state.inPlay = null; }
      return;
    }
  }

  // Step 7 — post-turn win check (after any Halo Effect).
  if (checkInfluenceWin(state)) {
    if (state.inPlay) { state.discardPile.push(state.inPlay); state.inPlay = null; }
    return;
  }

  // Step 8 — discard the played card, redraw to hand size.
  if (state.inPlay) {
    state.discardPile.push(state.inPlay);
    state.inPlay = null;
  }
  if (active.isAlive) drawUpToHandSize(state, active);
}

/** §4 step 9 + §7.3 turn cap. Returns false if the game ended (timeout). */
function advanceTurn(state: GameState): boolean {
  state.turnCount++;
  if (state.turnCount >= state.turnCap) {
    // Timeout: alive player with highest Influence wins; ties broken by
    // earliest position in turnOrder (DECISIONS.md #10).
    let best: PlayerState | null = null;
    for (const id of state.turnOrder) {
      const p = getPlayer(state, id);
      if (!p.isAlive) continue;
      if (!best || p.influence > best.influence) best = p;
    }
    state.gameLog.push(`Turn cap of ${state.turnCap} reached.`);
    declareWinner(state, best!.id, 'timeout');
    return false;
  }
  for (let i = 1; i <= state.turnOrder.length; i++) {
    const idx = (state.currentPlayerIndex + i) % state.turnOrder.length;
    if (getPlayer(state, state.turnOrder[idx]!).isAlive) {
      state.currentPlayerIndex = idx;
      return true;
    }
  }
  throw new Error('No alive players — engine bug');
}

// ----------------------------------------------------------- decisions API

export function getPending(state: GameState): PendingDecision | null {
  return state.pending;
}

/** Apply a player decision and run the game forward to the next decision or game over. */
export function applyDecision(state: GameState, decision: Decision): void {
  if (state.gamePhase === 'game_over') throw new Error('Game is over');
  const pending = state.pending;
  if (!pending) throw new Error('No decision is pending');

  switch (decision.type) {
    case 'play_card': {
      if (pending.kind !== 'play_card' || pending.mustDiscard) throw new Error('play_card not expected');
      if (!pending.playableCardIds.includes(decision.cardId)) throw new Error('Card is not playable');
      const active = activePlayer(state);
      const card = removeFromHand(active, decision.cardId);
      state.inPlay = card;
      state.pending = null;
      resolveCard(state, active, card, decision.targetId);
      if (state.pending) return; // follow-up choice required (gamePhase = resolving_effect)
      finishTurn(state);
      break;
    }
    case 'discard_card': {
      // §4.4 edge case: whole hand unplayable — discard one, draw replacement, turn ends (skip to step 9).
      if (pending.kind !== 'play_card' || !pending.mustDiscard) throw new Error('discard_card not expected');
      const active = activePlayer(state);
      const card = removeFromHand(active, decision.cardId);
      state.discardPile.push(card);
      drawUpToHandSize(state, active);
      state.gameLog.push(`${active.name} had no playable cards and discarded ${card.name}.`);
      state.pending = null;
      break;
    }
    case 'peek_swap': {
      if (pending.kind !== 'peek_swap') throw new Error('peek_swap not expected');
      const active = getPlayer(state, pending.playerId);
      const target = getPlayer(state, pending.targetId);
      if (!pending.revealedCardIds.includes(decision.takeCardId)) throw new Error('takeCardId not in revealed hand');
      const taken = removeFromHand(target, decision.takeCardId);
      const given = removeFromHand(active, decision.giveCardId);
      active.hand.push(taken);
      target.hand.push(given);
      state.gameLog.push(`${active.name} swapped a card with ${target.name}.`);
      state.pending = null;
      finishTurn(state);
      break;
    }
    case 'force_discard': {
      if (pending.kind !== 'force_discard') throw new Error('force_discard not expected');
      const target = getPlayer(state, pending.targetId);
      if (!pending.revealedCardIds.includes(decision.cardId)) throw new Error('cardId not in revealed hand');
      const discarded = removeFromHand(target, decision.cardId);
      // Not replaced until the target's next normal draw step (spec §5).
      state.discardPile.push(discarded);
      state.gameLog.push(`${target.name} was forced to discard ${discarded.name}.`);
      state.pending = null;
      finishTurn(state);
      break;
    }
    case 'aid_discard': {
      if (pending.kind !== 'aid_discard') throw new Error('aid_discard not expected');
      const target = getPlayer(state, pending.playerId);
      const discarded = removeFromHand(target, decision.cardId);
      state.discardPile.push(discarded);
      // "Immediately draws a replacement" (spec §5) — exactly one card.
      const replacement = drawCard(state);
      if (replacement) target.hand.push(replacement);
      fx.applyStressDelta(state, -6);
      state.gameLog.push(
        `${target.name} let go of ${discarded.name} and drew a fresh card. Collective Stress −6 (now ${state.collectiveStress}).`,
      );
      state.pending = null;
      finishTurn(state);
      break;
    }
    default: {
      const _exhaustive: never = decision;
      throw new Error(`Unknown decision ${( _exhaustive as Decision).type}`);
    }
  }

  if (isGameOver(state)) return;
  if (!advanceTurn(state)) return;
  beginTurn(state);
}

// --------------------------------------------------------------- standings

/**
 * Final standings (§7 + DECISIONS.md #11): winner pinned first; then alive
 * players by Influence; then eliminated players by Influence. Ties by seating order.
 */
export function getStandings(state: GameState): StandingsEntry[] {
  const seat = new Map(state.turnOrder.map((id, i) => [id, i]));
  const rank = (p: PlayerState) => ({
    playerId: p.id,
    name: p.name,
    influence: p.influence,
    isAlive: p.isAlive,
    isWinner: p.id === state.winnerId,
  });
  const sortGroup = (arr: PlayerState[]) =>
    arr.sort((a, b) => b.influence - a.influence || seat.get(a.id)! - seat.get(b.id)!);
  const winner = state.players.filter((p) => p.id === state.winnerId);
  const alive = sortGroup(state.players.filter((p) => p.isAlive && p.id !== state.winnerId));
  const out = sortGroup(state.players.filter((p) => !p.isAlive && p.id !== state.winnerId));
  return [...winner, ...alive, ...out].map(rank);
}
