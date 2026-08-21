// Room/redaction integration: full games driven through the Room layer the
// same way the WebSocket handler drives it.
import { describe, expect, it } from 'vitest';
import { Room, RoomError, RoomRegistry } from '../server/room.js';
import type { GameView } from '../server/protocol.js';

function makeStartedRoom(n = 3): Room {
  const room = new RoomRegistry().create();
  for (let i = 0; i < n; i++) room.addPlayer(`P${i}`);
  room.start(15);
  return room;
}

function decider(room: Room): string {
  return room.state!.pending!.playerId;
}

describe('room lifecycle', () => {
  it('generates unambiguous 4-char codes and unique tokens', () => {
    const reg = new RoomRegistry();
    const a = reg.create();
    const b = reg.create();
    expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(a.code).not.toBe(b.code);
    const s1 = a.addPlayer('Maria');
    const s2 = a.addPlayer('Sam');
    expect(s1.token).not.toBe(s2.token);
    expect(a.isHost(s1.token)).toBe(true);
    expect(a.isHost(s2.token)).toBe(false);
  });

  it('rejects starts below 3 players, duplicate names, and 9th seat', () => {
    const room = new RoomRegistry().create();
    room.addPlayer('A');
    room.addPlayer('B');
    expect(() => room.start(15)).toThrow(RoomError);
    expect(() => room.addPlayer('a ')).toThrow(RoomError); // case-insensitive dup
    for (let i = 0; i < 6; i++) room.addPlayer(`X${i}`);
    expect(() => room.addPlayer('One More')).toThrow(RoomError);
  });
});

describe('redaction', () => {
  it('shows own hand in full, others as counts only', () => {
    const room = makeStartedRoom();
    const v: GameView = room.viewFor('p0');
    expect(v.hand.length).toBe(6);
    for (const p of v.players) {
      expect(p.handCount).toBe(6);
    }
    expect(JSON.stringify(v)).not.toContain('"deck"');
  });

  it('non-deciders see only a waiting stub', () => {
    const room = makeStartedRoom();
    const active = decider(room);
    const other = room.seats.find((s) => s.seatId !== active)!;
    const v = room.viewFor(other.seatId);
    expect(v.pending?.kind).toBe('waiting');
  });

  it('rejects decisions from the wrong seat', () => {
    const room = makeStartedRoom();
    const active = decider(room);
    const other = room.seats.find((s) => s.seatId !== active)!;
    const view = room.viewFor(active);
    const cardId = (view.pending as { playableCardIds: string[] }).playableCardIds[0]!;
    expect(() => room.applyDecision(other.seatId, { type: 'play_card', cardId })).toThrow(RoomError);
  });
});

describe('full random game through the room layer', () => {
  it('plays to completion with per-seat views consistent throughout', () => {
    for (let run = 0; run < 20; run++) {
      const room = makeStartedRoom(4);
      let guard = 0;
      while (room.state!.gamePhase !== 'game_over') {
        if (++guard > 5000) throw new Error('stalled');
        const seatId = decider(room);
        const view = room.viewFor(seatId);
        const p = view.pending!;
        if (p.kind === 'play_card') {
          const cardId = p.playableCardIds[(guard * 7) % p.playableCardIds.length]!;
          if (p.mustDiscard) {
            room.applyDecision(seatId, { type: 'discard_card', cardId });
          } else {
            const card = view.hand.find((c) => c.id === cardId)!;
            if (card.requiresTarget) {
              const targets = view.players.filter((pl) => pl.isAlive && pl.id !== seatId);
              const target = targets[guard % targets.length]!;
              room.applyDecision(seatId, { type: 'play_card', cardId, targetId: target.id });
            } else {
              room.applyDecision(seatId, { type: 'play_card', cardId });
            }
          }
        } else if (p.kind === 'peek_swap') {
          room.applyDecision(seatId, {
            type: 'peek_swap',
            takeCardId: p.revealedCards[0]!.id,
            giveCardId: view.hand[0]!.id,
          });
        } else if (p.kind === 'force_discard') {
          room.applyDecision(seatId, { type: 'force_discard', cardId: p.revealedCards[0]!.id });
        } else if (p.kind === 'aid_discard') {
          room.applyDecision(seatId, { type: 'aid_discard', cardId: view.hand[0]!.id });
        } else {
          throw new Error(`decider got ${p.kind}`);
        }
      }
      const finalView = room.viewFor('p0');
      expect(finalView.standings).not.toBeNull();
      expect(finalView.winnerId).toBeTruthy();
    }
  });
});
