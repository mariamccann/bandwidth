// Core data model — Spec §2.
// Deviation from spec (documented in docs/DECISIONS.md): the per-player
// `isCurrentTurn` flag is derived from `currentPlayerIndex` instead of being
// stored, to avoid two sources of truth. Use `isCurrentTurn(state, id)`.

export type DeckType = 'Stress' | 'Politics' | 'Employee' | 'Influence' | 'Support';

export type EffectType =
  | 'stress_delta'
  | 'influence_gain'
  | 'influence_gain_with_stress_cost'
  | 'give_random_card'
  | 'skip_next_turn'
  | 'peek_and_swap'
  | 'protect_self'
  | 'force_discard_chosen_by_attacker'
  | 'reveal_hand'
  | 'force_play_highest_stress_next_turn'
  | 'steal_influence'
  | 'force_discard_and_apply_stress'
  | 'aid_target';

export type CardCondition = 'not_sole_leader';

export interface EffectParams {
  amount?: number;
  influenceAmount?: number;
  stressAmount?: number;
}

export interface Card {
  /** Unique per physical card instance (spec §2) — never key on name. */
  id: string;
  name: string;
  deckType: DeckType;
  effectType: EffectType;
  effectParams: EffectParams;
  condition?: CardCondition;
  requiresTarget: boolean;
  flavour: string;
}

export interface PlayerState {
  id: string;
  name: string;
  influence: number;
  hand: Card[];
  isAlive: boolean;
  skipNextTurn: boolean;
  forcedPlayHighestStress: boolean;
  isProtected: boolean;
}

export type GamePhase = 'setup' | 'playing' | 'resolving_effect' | 'game_over';
export type WinReason = 'influence' | 'sole_survivor' | 'timeout';

/** A decision the engine is waiting on. The engine never assumes a human. */
export type PendingDecision =
  | {
      kind: 'play_card';
      playerId: string;
      /** Cards currently playable (unsatisfied conditions excluded). */
      playableCardIds: string[];
      /** True when every card in hand is unplayable (spec §4 step 4 edge case): the decision becomes "discard one card". */
      mustDiscard: boolean;
    }
  | {
      kind: 'peek_swap';
      playerId: string; // active player chooses
      targetId: string;
      /** Target's hand, revealed to the chooser. */
      revealedCardIds: string[];
    }
  | {
      kind: 'force_discard';
      playerId: string; // active player (attacker) chooses
      targetId: string;
      revealedCardIds: string[];
    }
  | {
      kind: 'aid_discard';
      playerId: string; // the TARGET chooses from their own hand
      sourcePlayerId: string;
    };

export type Decision =
  | { type: 'play_card'; cardId: string; targetId?: string }
  | { type: 'discard_card'; cardId: string } // all-unplayable fallback
  | { type: 'peek_swap'; takeCardId: string; giveCardId: string }
  | { type: 'force_discard'; cardId: string }
  | { type: 'aid_discard'; cardId: string };

export interface GameState {
  players: PlayerState[];
  /** Clamped at 0. May transiently exceed 100 during resolution; the
   *  elimination check (§4 step 6) settles it at the post-elimination level. */
  collectiveStress: number;
  deck: Card[];
  discardPile: Card[];
  turnOrder: string[];
  currentPlayerIndex: number;
  turnCount: number;
  gamePhase: GamePhase;
  winnerId: string | null;
  winReason: WinReason | null;
  winThreshold: number;
  gameLog: string[];
  /** Card played this turn, held out of all zones until step 8 discards it. */
  inPlay: Card | null;
  pending: PendingDecision | null;
  /** Seedable PRNG state for reproducible games. */
  rngState: number;
  turnCap: number;
}

export interface StandingsEntry {
  playerId: string;
  name: string;
  influence: number;
  isAlive: boolean;
  isWinner: boolean;
}
