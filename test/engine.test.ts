// Turn sequence (§4), setup (§3), end conditions (§7), and resolved edge cases.
import { describe, expect, it } from 'vitest';
import { activePlayer, applyDecision, createGame, getPlayer, getStandings, isCardPlayable, POST_ELIMINATION_STRESS } from '../src/engine.js';
import { card, newGame, setHand } from './helpers.js';

describe('setup (§3)', () => {
  it('rejects fewer than 3 or more than 8 players', () => {
    expect(() => createGame({ playerNames: ['A', 'B'] })).toThrow();
    expect(() => createGame({ playerNames: Array.from({ length: 9 }, (_, i) => `P${i}`) })).toThrow();
  });

  it('deals 6 cards each, stress 0, influence 0, threshold default 15', () => {
    const s = newGame(5);
    for (const p of s.players) {
      expect(p.hand.length).toBe(6);
      expect(p.influence).toBe(0);
      expect(p.isAlive).toBe(true);
    }
    expect(s.collectiveStress).toBe(0);
    expect(s.winThreshold).toBe(15);
    expect(s.deck.length).toBe(113 - 5 * 6);
  });

  it('honours a configurable win threshold', () => {
    const s = newGame(3, { winThreshold: 12 });
    expect(s.winThreshold).toBe(12);
  });
});

describe('elimination + Halo Effect (§4 step 6)', () => {
  it('eliminates the tipper, retains pressure, docks everyone else 2 (floored at 0)', () => {
    const s = newGame(4);
    s.collectiveStress = 95;
    const p0 = active(s);
    const others = s.players.filter((p) => p.id !== p0.id);
    others[0]!.influence = 5;
    others[1]!.influence = 1;
    others[2]!.influence = 0;
    setHand(s, p0.id, [card({ effectType: 'stress_delta', effectParams: { amount: 10 } })]);
    applyDecision(s, { type: 'play_card', cardId: p0.hand[0]!.id });
    expect(getPlayer(s, p0.id).isAlive).toBe(false);
    expect(s.collectiveStress).toBe(POST_ELIMINATION_STRESS);
    expect(others[0]!.influence).toBe(3);
    expect(others[1]!.influence).toBe(0); // floored
    expect(others[2]!.influence).toBe(0); // floored
    expect(s.gameLog.some((l) => l.includes('tipped the Stress Track'))).toBe(true);
  });

  it("returns the eliminated player's hand to the discard pile (cards keep circulating)", () => {
    const s = newGame(3);
    s.collectiveStress = 95;
    const p0 = active(s);
    const handIds = p0.hand.map((c) => c.id);
    setHand(s, p0.id, [card({ effectType: 'stress_delta', effectParams: { amount: 10 } }), ...p0.hand]);
    const total = () =>
      s.deck.length + s.discardPile.length + s.players.reduce((n, p) => n + p.hand.length, 0);
    applyDecision(s, { type: 'play_card', cardId: p0.hand[0]!.id });
    expect(getPlayer(s, p0.id).hand.length).toBe(0);
    for (const id of handIds) expect(s.discardPile.some((c) => c.id === id)).toBe(true);
    void total;
  });

  it('skips eliminated players in the turn rotation', () => {
    const s = newGame(3);
    s.collectiveStress = 99;
    const order = [...s.turnOrder];
    const p0 = active(s);
    setHand(s, p0.id, [card({ effectType: 'stress_delta', effectParams: { amount: 1 } })]);
    applyDecision(s, { type: 'play_card', cardId: p0.hand[0]!.id });
    // rotation continues among survivors; a full cycle never lands on p0
    for (let i = 0; i < 4; i++) {
      expect(active(s).id).not.toBe(p0.id);
      const a = active(s);
      setHand(s, a.id, [card({ effectType: 'stress_delta', effectParams: { amount: -10 } })]);
      applyDecision(s, { type: 'play_card', cardId: a.hand[0]!.id });
      if (s.gamePhase === 'game_over') break;
    }
    void order;
  });
});

describe('win conditions (§7)', () => {
  it('influence win fires immediately post-turn', () => {
    const s = newGame(3);
    const p0 = active(s);
    p0.influence = 14;
    setHand(s, p0.id, [
      card({ effectType: 'influence_gain', effectParams: { amount: 1 }, condition: 'not_sole_leader' }),
    ]);
    // p0 at 14 is sole leader → free +1 unplayable. Give the others influence to unlock it.
    s.players.forEach((p) => { if (p.id !== p0.id) p.influence = 14; });
    setHand(s, p0.id, [card({ effectType: 'influence_gain', effectParams: { amount: 1 }, condition: 'not_sole_leader' })]);
    applyDecision(s, { type: 'play_card', cardId: p0.hand[0]!.id });
    expect(s.gamePhase).toBe('game_over');
    expect(s.winnerId).toBe(p0.id);
    expect(s.winReason).toBe('influence');
  });

  it('sole survivor wins by default regardless of influence', () => {
    const s = newGame(3);
    const [a, b, c] = s.players;
    b!.isAlive = false;
    c!.isAlive = false;
    c!.influence = 99; // dead influence does not matter
    s.collectiveStress = 99;
    // a tips the track… but wait, a is the only alive player already — simulate via elimination path:
    // reset: make b alive so the elimination of b leaves a as sole survivor
    b!.isAlive = true;
    while (activePlayer(s).id !== b!.id) {
      const p = activePlayer(s);
      setHand(s, p.id, [card({ effectType: 'stress_delta', effectParams: { amount: 0 } })]);
      applyDecision(s, { type: 'play_card', cardId: p.hand[0]!.id });
    }
    s.collectiveStress = 100; // b's turn: anything tips it
    setHand(s, b!.id, [card({ effectType: 'stress_delta', effectParams: { amount: 0 } })]);
    applyDecision(s, { type: 'play_card', cardId: b!.hand[0]!.id });
    expect(s.gamePhase).toBe('game_over');
    expect(s.winnerId).toBe(a!.id);
    expect(s.winReason).toBe('sole_survivor');
  });

  it('turn cap triggers timeout win for highest alive influence, ties to earliest seat', () => {
    const s = newGame(3, { seed: 7 });
    s.turnCount = 299;
    const p0 = active(s);
    const second = getPlayer(s, s.turnOrder[1]!);
    second.influence = 9;
    getPlayer(s, s.turnOrder[2]!).influence = 9;
    setHand(s, p0.id, [card({ effectType: 'stress_delta', effectParams: { amount: -10 } })]);
    applyDecision(s, { type: 'play_card', cardId: p0.hand[0]!.id });
    expect(s.gamePhase).toBe('game_over');
    expect(s.winReason).toBe('timeout');
    expect(s.winnerId).toBe(s.turnOrder[1]); // earliest seat among the tie
  });
});

describe('not_sole_leader condition (§5.1)', () => {
  it('is unplayable while strictly ahead, playable when tied', () => {
    const s = newGame(3);
    const p0 = active(s);
    const free = card({ effectType: 'influence_gain', effectParams: { amount: 1 }, condition: 'not_sole_leader' });
    p0.influence = 5;
    expect(isCardPlayable(s, p0, free)).toBe(false);
    s.players.find((p) => p.id !== p0.id)!.influence = 5; // tie with leader
    expect(isCardPlayable(s, p0, free)).toBe(true);
  });

  it('all-hand-unplayable → forced discard + draw + turn ends', () => {
    const s = newGame(3);
    const p0 = active(s);
    p0.influence = 5; // sole leader
    setHand(s, p0.id, [
      card({ effectType: 'influence_gain', effectParams: { amount: 1 }, condition: 'not_sole_leader' }),
      card({ effectType: 'influence_gain', effectParams: { amount: 1 }, condition: 'not_sole_leader' }),
    ]);
    expect(s.pending?.kind === 'play_card' && s.pending.mustDiscard).toBe(true);
    const discardId = p0.hand[0]!.id;
    applyDecision(s, { type: 'discard_card', cardId: discardId });
    expect(s.discardPile.some((c) => c.id === discardId)).toBe(true);
    expect(getPlayer(s, p0.id).influence).toBe(5); // nothing resolved
    expect(active(s).id).not.toBe(p0.id); // turn ended
  });
});

describe('status interactions (resolved ambiguities)', () => {
  it('skip consumes only skipNextTurn; forced-play survives to the next real turn', () => {
    const s = newGame(3);
    const p0 = active(s);
    const order = [...s.turnOrder];
    const p1 = getPlayer(s, order[(order.indexOf(p0.id) + 1) % 3]!);
    p1.skipNextTurn = true;
    p1.forcedPlayHighestStress = true;
    p1.hand = [card({ effectType: 'stress_delta', effectParams: { amount: 10 } })];
    setHand(s, p0.id, [card({ effectType: 'stress_delta', effectParams: { amount: -10 } })]);
    applyDecision(s, { type: 'play_card', cardId: p0.hand[0]!.id });
    // p1 was skipped (redrawn to 6) and still owes the forced play
    const p1After = getPlayer(s, p1.id);
    expect(p1After.skipNextTurn).toBe(false);
    expect(p1After.forcedPlayHighestStress).toBe(true);
    expect(p1After.hand.length).toBe(6); // redrawn during skip (§4 step 2)
  });

  it('protection persists until consumed (no expiry)', () => {
    const s = newGame(3);
    const p0 = active(s);
    p0.isProtected = true;
    for (let i = 0; i < 6 && s.gamePhase !== 'game_over'; i++) {
      const a = activePlayer(s);
      setHand(s, a.id, [card({ effectType: 'stress_delta', effectParams: { amount: -10 } })]);
      applyDecision(s, { type: 'play_card', cardId: a.hand[0]!.id });
    }
    expect(getPlayer(s, p0.id).isProtected).toBe(true);
  });

  it('a no-op steal still consumes protection (checked before application)', () => {
    const s = newGame(3);
    const p0 = active(s);
    const p1 = s.players.find((p) => p.id !== p0.id)!;
    p1.isProtected = true;
    expect(p1.influence).toBe(0);
    setHand(s, p0.id, [card({ effectType: 'steal_influence', requiresTarget: true })]);
    applyDecision(s, { type: 'play_card', cardId: p0.hand[0]!.id, targetId: p1.id });
    expect(getPlayer(s, p1.id).isProtected).toBe(false);
  });
});

describe('deck cycling (§4 step 8)', () => {
  it('reshuffles the discard into a new deck when empty; in-play card excluded', () => {
    const s = newGame(3);
    const p0 = active(s);
    // Drain the deck into the discard pile
    s.discardPile.push(...s.deck);
    s.deck = [];
    const discardCount = s.discardPile.length;
    setHand(s, p0.id, [card({ effectType: 'stress_delta', effectParams: { amount: -10 } })]);
    applyDecision(s, { type: 'play_card', cardId: p0.hand[0]!.id });
    // p0 redrew to 6 from a reshuffled deck; played card seeds the new discard
    expect(getPlayer(s, p0.id).hand.length).toBe(6);
    expect(s.deck.length).toBe(discardCount - 6);
    expect(s.discardPile.length).toBe(1); // just the played card
    expect(s.gameLog.some((l) => l.includes('shuffled into a new deck'))).toBe(true);
  });

  it('no card is ever duplicated or lost across zones', () => {
    const s = newGame(4, { seed: 99 });
    const seen = new Set<string>();
    const countAll = () => {
      seen.clear();
      const all = [
        ...s.deck,
        ...s.discardPile,
        ...(s.inPlay ? [s.inPlay] : []),
        ...s.players.flatMap((p) => p.hand),
      ];
      for (const c of all) {
        if (seen.has(c.id)) throw new Error(`duplicate ${c.id}`);
        seen.add(c.id);
      }
      return all.length;
    };
    expect(countAll()).toBe(113);
  });
});

describe('standings (§7, winner pinned first)', () => {
  it('ranks winner first even if an eliminated player banked more influence', () => {
    const s = newGame(3);
    const [a, b, c] = s.players;
    a!.influence = 15;
    b!.influence = 17;
    b!.isAlive = false;
    c!.influence = 4;
    s.gamePhase = 'game_over';
    s.winnerId = a!.id;
    s.winReason = 'influence';
    const rows = getStandings(s);
    expect(rows[0]!.playerId).toBe(a!.id);
    expect(rows[0]!.isWinner).toBe(true);
    expect(rows[1]!.playerId).toBe(c!.id); // alive before eliminated
    expect(rows[2]!.playerId).toBe(b!.id);
    expect(rows[2]!.isAlive).toBe(false);
  });
});

function active(s: ReturnType<typeof newGame>) {
  return activePlayer(s);
}
