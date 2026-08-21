// Wire protocol shared by server and client. The server is authoritative: it
// runs the real engine and sends each player a REDACTED view — your own hand
// in full, everyone else's as counts, deck order never leaves the server.
import type { Card, Decision, GamePhase, StandingsEntry, WinReason } from '../src/types.js';

export interface LobbyPlayer {
  seatId: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export interface ViewPlayer {
  id: string;
  name: string;
  influence: number;
  isAlive: boolean;
  handCount: number;
  isProtected: boolean;
  skipNextTurn: boolean;
  forcedPlayHighestStress: boolean;
  connected: boolean;
}

/** What the pending decision looks like from one seat's perspective. */
export type ViewPending =
  | { kind: 'play_card'; playableCardIds: string[]; mustDiscard: boolean }
  | { kind: 'peek_swap'; targetId: string; targetName: string; revealedCards: Card[] }
  | { kind: 'force_discard'; targetId: string; targetName: string; revealedCards: Card[] }
  | { kind: 'aid_discard'; sourceName: string }
  | { kind: 'waiting'; playerName: string };

export interface GameView {
  you: string; // your seatId (== engine player id)
  players: ViewPlayer[]; // in turn order
  collectiveStress: number;
  winThreshold: number;
  turnCount: number;
  gamePhase: GamePhase;
  winnerId: string | null;
  winReason: WinReason | null;
  activeId: string | null;
  hand: Card[]; // your own, full
  pending: ViewPending | null;
  log: string[];
  standings: StandingsEntry[] | null;
}

export type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'start'; winThreshold: number }
  | { type: 'decision'; decision: Decision }
  | { type: 'restart' };

export type ServerMessage =
  | { type: 'joined'; code: string; token: string; seatId: string }
  | { type: 'lobby'; code: string; players: LobbyPlayer[]; youAreHost: boolean }
  | { type: 'state'; view: GameView }
  | { type: 'reveal'; targetName: string; cards: Card[] }
  | { type: 'moment'; eliminatedName: string }
  | { type: 'error'; message: string };
