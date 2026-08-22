// Server-side computer players: add/remove in the lobby, seat-id alignment at
// start, and full games driven by the room's own bot logic.
import { describe, expect, it } from 'vitest';
import { Room, RoomError, RoomRegistry } from '../server/room.js';
import { greedyAgent } from '../sim/agents.js';

describe('lobby bot management', () => {
  it('adds uniquely-named bots and refuses past 8 seats', () => {
    const room = new RoomRegistry().create();
    room.addPlayer('Maria');
    for (let i = 0; i < 7; i++) room.addBot('normal');
    expect(room.seats.length).toBe(8);
    expect(new Set(room.seats.map((s) => s.name)).size).toBe(8); // no dup names
    expect(() => room.addBot('normal')).toThrow(RoomError);
  });

  it('removes a bot and keeps seat ids contiguous', () => {
    const room = new RoomRegistry().create();
    room.addPlayer('Maria');
    const b1 = room.addBot('easy');
    room.addBot('normal');
    room.removeBot(b1.seatId);
    expect(room.seats.map((s) => s.seatId)).toEqual(['p0', 'p1']);
    expect(room.seats[0]!.name).toBe('Maria');
  });

  it('pins seat ids to engine player ids at start (order preserved after churn)', () => {
    const room = new RoomRegistry().create();
    room.addPlayer('Maria');
    const throwaway = room.addBot('easy');
    room.addPlayer('Sam');
    room.removeBot(throwaway.seatId);
    room.addBot('normal');
    room.start(15);
    room.seats.forEach((s, i) => expect(s.seatId).toBe(`p${i}`));
    // The human seat's token still resolves to its (possibly renumbered) seat.
    expect(room.seatByToken(room.hostToken!)!.name).toBe('Maria');
  });
});

describe('full game with server-driven bots', () => {
  it('plays 1 human + 2 bots to a winner (human via greedy agent)', () => {
    for (let g = 0; g < 30; g++) {
      const room = new RoomRegistry().create();
      const human = room.addPlayer('Maria');
      room.addBot('normal');
      room.addBot('easy');
      room.start(15);
      const rng = { rngState: (g + 1) >>> 0 };
      let guard = 0;
      while (room.state!.gamePhase !== 'game_over') {
        if (++guard > 8000) throw new Error('deadlock');
        const botSeat = room.pendingBotSeat();
        if (botSeat) {
          room.applyBotTurn();
        } else {
          // the human seat, played here by an agent against its own view
          const view = room.viewFor(human.seatId);
          const p = view.pending!;
          if (p.kind === 'play_card') {
            const decision = greedyAgent.decide(room.state!, room.state!.pending!, rng);
            room.applyDecision(human.seatId, decision);
          } else if (p.kind === 'peek_swap') {
            room.applyDecision(human.seatId, { type: 'peek_swap', takeCardId: p.revealedCards[0]!.id, giveCardId: view.hand[0]!.id });
          } else if (p.kind === 'force_discard') {
            room.applyDecision(human.seatId, { type: 'force_discard', cardId: p.revealedCards[0]!.id });
          } else if (p.kind === 'aid_discard') {
            room.applyDecision(human.seatId, { type: 'aid_discard', cardId: view.hand[0]!.id });
          } else {
            throw new Error(`human got ${p.kind}`);
          }
        }
      }
      expect(room.viewFor(human.seatId).winnerId).toBeTruthy();
    }
  });
});
