// Room lifecycle + per-seat state redaction. Pure logic, no sockets — main.ts
// wires this to WebSockets so it stays unit-testable.
import { randomBytes, randomUUID } from 'node:crypto';
import {
  activePlayer,
  applyDecision,
  createGame,
  getPlayer,
  getStandings,
} from '../src/engine.js';
import { greedyAgent, randomAgent, type Agent } from '../sim/agents.js';
import type { Card, Decision, GameState } from '../src/types.js';
import type { BotDifficulty, GameView, LobbyPlayer, ViewPending } from './protocol.js';

// Computer players get corporate-drone names in keeping with the theme.
const BOT_NAMES = [
  'Chad (Regional VP)',
  'The Algorithm',
  'Deepa from Finance',
  'Greg (Consultant)',
  'Karen (People Ops)',
  'Synergy Bot',
  'Nigel (Interim Lead)',
];

function agentFor(difficulty: BotDifficulty): Agent {
  return difficulty === 'easy' ? randomAgent : greedyAgent;
}

export interface Seat {
  seatId: string; // becomes the engine player id ("p0"...) once the game starts
  name: string;
  token: string; // private rejoin credential (unused for bots)
  connected: boolean;
  isBot: boolean;
  difficulty?: BotDifficulty;
}

export interface RoomEvent {
  moment?: { eliminatedName: string };
  reveal?: { toSeatId: string; targetName: string; cards: Card[] };
}

export class Room {
  code: string;
  seats: Seat[] = [];
  hostToken: string | null = null;
  state: GameState | null = null;
  lastActivity = Date.now();
  /** Seedable rng for server-side bot decisions (variety, not determinism). */
  botRng = { rngState: 0x9e3779b9 };

  constructor(code: string) {
    this.code = code;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  addPlayer(name: string): Seat {
    if (this.state) throw new RoomError('Game already started');
    if (this.seats.length >= 8) throw new RoomError('Room is full (8 players max)');
    const clean = name.trim().slice(0, 16) || `Player ${this.seats.length + 1}`;
    if (this.seats.some((s) => s.name.toLowerCase() === clean.toLowerCase())) {
      throw new RoomError('That name is taken in this room');
    }
    const seat: Seat = {
      seatId: `p${this.seats.length}`,
      name: clean,
      token: randomUUID(),
      connected: true,
      isBot: false,
    };
    this.seats.push(seat);
    if (!this.hostToken) this.hostToken = seat.token;
    return seat;
  }

  /** Add a computer player (host action, lobby only). */
  addBot(difficulty: BotDifficulty): Seat {
    if (this.state) throw new RoomError('Game already started');
    if (this.seats.length >= 8) throw new RoomError('Room is full (8 players max)');
    const taken = new Set(this.seats.map((s) => s.name.toLowerCase()));
    const name = BOT_NAMES.find((n) => !taken.has(n.toLowerCase())) ?? `Computer ${this.seats.length + 1}`;
    const seat: Seat = {
      seatId: `p${this.seats.length}`,
      name,
      token: randomUUID(),
      connected: false,
      isBot: true,
      difficulty,
    };
    this.seats.push(seat);
    return seat;
  }

  removeBot(seatId: string): void {
    if (this.state) throw new RoomError('Game already started');
    const idx = this.seats.findIndex((s) => s.seatId === seatId && s.isBot);
    if (idx === -1) throw new RoomError('No such computer player');
    this.seats.splice(idx, 1);
    this.seats.forEach((s, i) => { s.seatId = `p${i}`; }); // keep ids contiguous
  }

  seatByToken(token: string): Seat | undefined {
    return this.seats.find((s) => s.token === token);
  }

  seatById(seatId: string): Seat | undefined {
    return this.seats.find((s) => s.seatId === seatId);
  }

  isHost(token: string): boolean {
    return this.hostToken === token;
  }

  lobbyPlayers(): LobbyPlayer[] {
    return this.seats.map((s) => ({
      seatId: s.seatId,
      name: s.name,
      connected: s.connected,
      isHost: s.token === this.hostToken,
      isBot: s.isBot,
    }));
  }

  start(winThreshold: number): void {
    if (this.state) throw new RoomError('Game already started');
    if (this.seats.length < 3) throw new RoomError('Need at least 3 players');
    this.state = createGame({
      playerNames: this.seats.map((s) => s.name),
      winThreshold,
      seed: randomBytes(4).readUInt32LE(0),
    });
    // Pin each seat's id to its engine player id (p0..pN in seat order), so
    // lobby churn before start can never desync seats from engine players.
    this.seats.forEach((s, i) => { s.seatId = this.state!.players[i]!.id; });
  }

  /** True if the seat whose decision is pending is a computer player. */
  pendingBotSeat(): Seat | null {
    const s = this.state;
    if (!s || s.gamePhase === 'game_over' || !s.pending) return null;
    const seat = this.seatById(s.pending.playerId);
    return seat?.isBot ? seat : null;
  }

  /** Compute and apply the pending computer player's move (with a legal fallback). */
  applyBotTurn(): RoomEvent {
    const seat = this.pendingBotSeat();
    if (!seat) throw new RoomError('No computer player is due to act');
    const state = this.state!;
    const pending = state.pending!;
    const agent = agentFor(seat.difficulty ?? 'normal');
    let decision: Decision;
    try {
      decision = agent.decide(state, pending, this.botRng);
    } catch {
      try {
        decision = randomAgent.decide(state, pending, this.botRng);
      } catch {
        decision = fallbackDecision(state, pending);
      }
    }
    return this.applyDecision(seat.seatId, decision);
  }

  restart(): void {
    this.state = null;
  }

  /** Apply a decision from a seat. Throws RoomError on any illegal input. */
  applyDecision(seatId: string, decision: Decision): RoomEvent {
    const state = this.state;
    if (!state) throw new RoomError('Game not started');
    if (!state.pending) throw new RoomError('No decision pending');
    if (state.pending.playerId !== seatId) throw new RoomError('Not your decision');

    const event: RoomEvent = {};
    // reveal_hand is UI-only in the engine — snapshot the target's hand BEFORE
    // applying (the turn advances and hands change) for a private message.
    if (decision.type === 'play_card') {
      const me = getPlayer(state, seatId);
      const card = me.hand.find((c) => c.id === decision.cardId);
      if (card?.effectType === 'reveal_hand' && decision.targetId) {
        const target = getPlayer(state, decision.targetId);
        if (!target.isProtected) {
          event.reveal = { toSeatId: seatId, targetName: target.name, cards: [...target.hand] };
        }
      }
    }
    const aliveBefore = new Set(state.players.filter((p) => p.isAlive).map((p) => p.id));

    try {
      applyDecision(state, decision);
    } catch (e) {
      throw new RoomError(e instanceof Error ? e.message : 'Illegal move');
    }
    const eliminated = state.players.find((p) => aliveBefore.has(p.id) && !p.isAlive);
    if (eliminated) event.moment = { eliminatedName: eliminated.name };
    return event;
  }

  /** Build the redacted view for one seat. */
  viewFor(seatId: string): GameView {
    const state = this.state;
    if (!state) throw new RoomError('Game not started');
    const me = getPlayer(state, seatId);
    const over = state.gamePhase === 'game_over';
    const active = over ? null : activePlayer(state);

    let pending: ViewPending | null = null;
    const p = state.pending;
    if (p) {
      if (p.playerId !== seatId) {
        pending = { kind: 'waiting', playerName: getPlayer(state, p.playerId).name };
      } else if (p.kind === 'play_card') {
        pending = { kind: 'play_card', playableCardIds: p.playableCardIds, mustDiscard: p.mustDiscard };
      } else if (p.kind === 'peek_swap' || p.kind === 'force_discard') {
        const target = getPlayer(state, p.targetId);
        pending = {
          kind: p.kind,
          targetId: target.id,
          targetName: target.name,
          revealedCards: target.hand.filter((c) => p.revealedCardIds.includes(c.id)),
        };
      } else {
        pending = { kind: 'aid_discard', sourceName: getPlayer(state, p.sourcePlayerId).name };
      }
    }

    return {
      you: seatId,
      players: state.turnOrder.map((id) => {
        const pl = getPlayer(state, id);
        const seat = this.seats.find((s) => s.seatId === id);
        return {
          id: pl.id,
          name: pl.name,
          influence: pl.influence,
          isAlive: pl.isAlive,
          handCount: pl.hand.length,
          isProtected: pl.isProtected,
          skipNextTurn: pl.skipNextTurn,
          forcedPlayHighestStress: pl.forcedPlayHighestStress,
          connected: seat?.isBot ? true : seat?.connected ?? true,
          isBot: seat?.isBot ?? false,
        };
      }),
      collectiveStress: state.collectiveStress,
      winThreshold: state.winThreshold,
      turnCount: state.turnCount,
      gamePhase: state.gamePhase,
      winnerId: state.winnerId,
      winReason: state.winReason,
      activeId: active?.id ?? null,
      hand: me.hand,
      pending,
      log: state.gameLog.slice(-40),
      standings: over ? getStandings(state) : null,
    };
  }
}

export class RoomError extends Error {}

/** Last-resort guaranteed-legal move for a pending decision. */
function fallbackDecision(state: GameState, pending: NonNullable<GameState['pending']>): Decision {
  switch (pending.kind) {
    case 'play_card': {
      const cardId = pending.playableCardIds[0]!;
      if (pending.mustDiscard) return { type: 'discard_card', cardId };
      const player = getPlayer(state, pending.playerId);
      const card = player.hand.find((c) => c.id === cardId)!;
      if (card.requiresTarget) {
        const target = state.players.find((p) => p.isAlive && p.id !== pending.playerId)!;
        return { type: 'play_card', cardId, targetId: target.id };
      }
      return { type: 'play_card', cardId };
    }
    case 'peek_swap':
      return {
        type: 'peek_swap',
        takeCardId: pending.revealedCardIds[0]!,
        giveCardId: getPlayer(state, pending.playerId).hand[0]!.id,
      };
    case 'force_discard':
      return { type: 'force_discard', cardId: pending.revealedCardIds[0]! };
    case 'aid_discard':
      return { type: 'aid_discard', cardId: getPlayer(state, pending.playerId).hand[0]!.id };
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

export class RoomRegistry {
  rooms = new Map<string, Room>();

  create(): Room {
    for (let i = 0; i < 50; i++) {
      let code = '';
      const bytes = randomBytes(4);
      for (let j = 0; j < 4; j++) code += CODE_ALPHABET[bytes[j]! % CODE_ALPHABET.length];
      if (!this.rooms.has(code)) {
        const room = new Room(code);
        this.rooms.set(code, room);
        return room;
      }
    }
    throw new RoomError('Could not allocate a room code');
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  /** Drop rooms idle for 6+ hours. */
  sweep(): void {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    for (const [code, room] of this.rooms) {
      if (room.lastActivity < cutoff) this.rooms.delete(code);
    }
  }
}
