// Per-effect behavior (§5), driven through the real engine decision API.
import { describe, expect, it } from 'vitest';
import { activePlayer, applyDecision, getPlayer } from '../src/engine.js';
import { card, newGame, setHand } from './helpers.js';
import type { Card } from '../src/types.js';

function active(state: ReturnType<typeof newGame>) {
  return activePlayer(state);
}

function play(state: ReturnType<typeof newGame>, c: Card, targetId?: string) {
  setHand(state, active(state).id, [c, ...active(state).hand.slice(0, 5)]);
  applyDecision(state, { type: 'play_card', cardId: c.id, ...(targetId ? { targetId } : {}) });
}

describe('stress_delta', () => {
  it('adds positive stress', () => {
    const s = newGame();
    play(s, card({ effectType: 'stress_delta', effectParams: { amount: 10 } }));
    expect(s.collectiveStress).toBe(10);
  });

  it('clamps at 0 on relief below zero', () => {
    const s = newGame();
    play(s, card({ effectType: 'stress_delta', effectParams: { amount: -15 } }));
    expect(s.collectiveStress).toBe(0);
  });
});

describe('influence_gain', () => {
  it('adds influence to the active player', () => {
    const s = newGame();
    const p = active(s);
    play(s, card({ effectType: 'influence_gain', effectParams: { amount: 1 } }));
    expect(getPlayer(s, p.id).influence).toBe(1);
  });
});

describe('influence_gain_with_stress_cost', () => {
  it('banks influence then applies stress', () => {
    const s = newGame();
    const p = active(s);
    play(s, card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 12 } }));
    expect(getPlayer(s, p.id).influence).toBe(2);
    expect(s.collectiveStress).toBe(12);
  });

  it('banks influence even when the card eliminates its player', () => {
    const s = newGame();
    s.collectiveStress = 95;
    const p = active(s);
    play(s, card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 3, stressAmount: 18 } }));
    const player = getPlayer(s, p.id);
    expect(player.isAlive).toBe(false);
    expect(player.influence).toBe(3); // kept for display (§5)
  });
});

describe('give_random_card', () => {
  it('passes a random card from the active hand to the target', () => {
    const s = newGame();
    const giver = active(s);
    const target = s.players.find((p) => p.id !== active(s).id)!;
    const transferableIds = new Set(giver.hand.map((c) => c.id));
    expect(target.hand.length).toBe(6);
    play(s, card({ effectType: 'give_random_card', requiresTarget: true }), target.id);
    expect(target.hand.length).toBe(7);
    expect(target.hand.some((c) => transferableIds.has(c.id))).toBe(true);
  });

  it('over-6 target does not redraw at their own turn until below 6', () => {
    const s = newGame();
    const p0 = active(s);
    const p1 = s.players.find((p) => p.id !== p0.id)!;
    play(s, card({ effectType: 'give_random_card', requiresTarget: true }), p1.id);
    // p1 now has 7; when p1 plays a card they go to 6 and must NOT redraw to 7
    if (active(s).id === p1.id) {
      setHand(s, p1.id, [card({ effectType: 'stress_delta', effectParams: { amount: -10 } }), ...p1.hand.slice(0, 6)]);
      const cid = p1.hand[0]!.id;
      applyDecision(s, { type: 'play_card', cardId: cid });
      expect(getPlayer(s, p1.id).hand.length).toBe(6);
    }
  });
});

describe('skip_next_turn', () => {
  it('target skips exactly one turn and redraws to hand size', () => {
    const s = newGame(3);
    const order = [...s.turnOrder];
    const p0 = active(s);
    const p1 = getPlayer(s, order[(order.indexOf(p0.id) + 1) % 3]!);
    play(s, card({ effectType: 'skip_next_turn', requiresTarget: true }), p1.id);
    // p1's turn was skipped: it is now p2's turn
    const p2 = getPlayer(s, order[(order.indexOf(p0.id) + 2) % 3]!);
    expect(active(s).id).toBe(p2.id);
    expect(getPlayer(s, p1.id).skipNextTurn).toBe(false); // consumed
    expect(s.gameLog.some((l) => l.includes('skips this turn'))).toBe(true);
  });
});

describe('peek_and_swap', () => {
  it('swaps one card each way via the follow-up decision', () => {
    const s = newGame();
    const p0 = active(s);
    const p1 = s.players.find((p) => p.id !== p0.id)!;
    const mine = card({ name: 'MyCard', effectType: 'stress_delta', effectParams: { amount: -10 } });
    const theirs = p1.hand[0]!;
    const peek = card({ effectType: 'peek_and_swap', requiresTarget: true });
    setHand(s, p0.id, [peek, mine]);
    applyDecision(s, { type: 'play_card', cardId: peek.id, targetId: p1.id });
    expect(s.gamePhase).toBe('resolving_effect');
    expect(s.pending?.kind).toBe('peek_swap');
    applyDecision(s, { type: 'peek_swap', takeCardId: theirs.id, giveCardId: mine.id });
    expect(getPlayer(s, p1.id).hand.some((c) => c.id === mine.id)).toBe(true);
    expect(getPlayer(s, p0.id).hand.some((c) => c.id === theirs.id)).toBe(true);
  });
});

describe('protect_self', () => {
  it('blocks the next targeted effect, then clears', () => {
    const s = newGame();
    const p0 = active(s);
    play(s, card({ effectType: 'protect_self' }));
    expect(getPlayer(s, p0.id).isProtected).toBe(true);
    // next player steals from p0 — blocked
    const thief = active(s);
    getPlayer(s, p0.id).influence = 5;
    play(s, card({ name: 'Stealing Credit', effectType: 'steal_influence', requiresTarget: true }), p0.id);
    expect(getPlayer(s, p0.id).influence).toBe(5); // unchanged
    expect(getPlayer(s, p0.id).isProtected).toBe(false); // consumed
    expect(getPlayer(s, thief.id).influence).toBe(0);
    expect(s.gameLog.some((l) => l.includes('was protected from'))).toBe(true);
  });

  it('blocks aid_target too, with the special log line', () => {
    const s = newGame();
    const p0 = active(s);
    play(s, card({ effectType: 'protect_self' }));
    play(s, card({ name: "Actually Asked If You're OK", effectType: 'aid_target', requiresTarget: true }), p0.id);
    expect(s.collectiveStress).toBe(0);
    expect(getPlayer(s, p0.id).isProtected).toBe(false);
    expect(s.gameLog.some((l) => l.includes("Calendar's blocked"))).toBe(true);
  });
});

describe('force_discard_chosen_by_attacker', () => {
  it('attacker picks the card; target is not replenished until their own draw step', () => {
    const s = newGame();
    const p1 = s.players.find((p) => p.id !== active(s).id)!;
    const victim = p1.hand[2]!;
    play(s, card({ effectType: 'force_discard_chosen_by_attacker', requiresTarget: true }), p1.id);
    expect(s.pending?.kind).toBe('force_discard');
    applyDecision(s, { type: 'force_discard', cardId: victim.id });
    expect(getPlayer(s, p1.id).hand.length).toBe(5);
    expect(s.discardPile.some((c) => c.id === victim.id)).toBe(true);
  });
});

describe('reveal_hand', () => {
  it('changes no state beyond the log', () => {
    const s = newGame();
    const p1 = s.players.find((p) => p.id !== active(s).id)!;
    const before = JSON.stringify({ hand: p1.hand, inf: p1.influence });
    play(s, card({ effectType: 'reveal_hand', requiresTarget: true }), p1.id);
    expect(JSON.stringify({ hand: getPlayer(s, p1.id).hand, inf: p1.influence })).toBe(before);
    expect(s.gameLog.some((l) => l.includes('looked at'))).toBe(true);
  });
});

describe('force_play_highest_stress_next_turn', () => {
  it('auto-plays the highest-stress card, influence still granted', () => {
    const s = newGame(3);
    const p0 = active(s);
    const order = [...s.turnOrder];
    const p1 = getPlayer(s, order[(order.indexOf(p0.id) + 1) % 3]!);
    const big = card({ name: 'System Outage', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 3, stressAmount: 18 } });
    p1.hand = [card({ effectType: 'stress_delta', effectParams: { amount: -10 } }), big];
    play(s, card({ effectType: 'force_play_highest_stress_next_turn', requiresTarget: true }), p1.id);
    // p1's turn resolved automatically
    expect(getPlayer(s, p1.id).forcedPlayHighestStress).toBe(false);
    expect(getPlayer(s, p1.id).influence).toBe(3); // punishment is timing, not confiscation
    expect(s.collectiveStress).toBe(18);
    expect(s.discardPile.some((c) => c.id === big.id)).toBe(true);
  });

  it('expires with no effect when target holds no positive-stress card', () => {
    const s = newGame(3);
    const p0 = active(s);
    const order = [...s.turnOrder];
    const p1 = getPlayer(s, order[(order.indexOf(p0.id) + 1) % 3]!);
    p1.hand = [
      card({ effectType: 'stress_delta', effectParams: { amount: -10 } }),
      card({ effectType: 'influence_gain', effectParams: { amount: 1 } }),
    ];
    play(s, card({ effectType: 'force_play_highest_stress_next_turn', requiresTarget: true }), p1.id);
    // p1 gets a normal action instead
    expect(active(s).id).toBe(p1.id);
    expect(s.pending?.kind).toBe('play_card');
    expect(s.collectiveStress).toBe(0);
  });
});

describe('steal_influence', () => {
  it('moves 1 influence when the target has some', () => {
    const s = newGame();
    const p0 = active(s);
    const p1 = s.players.find((p) => p.id !== p0.id)!;
    p1.influence = 3;
    play(s, card({ effectType: 'steal_influence', requiresTarget: true }), p1.id);
    expect(getPlayer(s, p0.id).influence).toBe(1);
    expect(getPlayer(s, p1.id).influence).toBe(2);
  });

  it('no effect when the target has 0', () => {
    const s = newGame();
    const p0 = active(s);
    const p1 = s.players.find((p) => p.id !== p0.id)!;
    play(s, card({ effectType: 'steal_influence', requiresTarget: true }), p1.id);
    expect(getPlayer(s, p0.id).influence).toBe(0);
    expect(getPlayer(s, p1.id).influence).toBe(0);
  });
});

describe('force_discard_and_apply_stress (Effective Immediately)', () => {
  it('discards target highest-stress card and applies its stress', () => {
    const s = newGame();
    const p1 = s.players.find((p) => p.id !== active(s).id)!;
    const big = card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 15 } });
    p1.hand = [card({ effectType: 'stress_delta', effectParams: { amount: -10 } }), big];
    play(s, card({ effectType: 'force_discard_and_apply_stress', requiresTarget: true }), p1.id);
    expect(s.collectiveStress).toBe(15);
    expect(getPlayer(s, p1.id).hand.length).toBe(1);
    expect(s.discardPile.some((c) => c.id === big.id)).toBe(true);
  });

  it('falls back to highest-influence-yield discard with no stress effect', () => {
    const s = newGame();
    const p1 = s.players.find((p) => p.id !== active(s).id)!;
    const inf = card({ effectType: 'influence_gain', effectParams: { amount: 1 } });
    p1.hand = [card({ effectType: 'stress_delta', effectParams: { amount: -15 } }), inf];
    play(s, card({ effectType: 'force_discard_and_apply_stress', requiresTarget: true }), p1.id);
    expect(s.collectiveStress).toBe(0);
    expect(s.discardPile.some((c) => c.id === inf.id)).toBe(true);
  });

  it('eliminates the PLAYER OF THE CARD if the forced stress tips the track', () => {
    const s = newGame();
    s.collectiveStress = 90;
    const p0 = active(s);
    const p1 = s.players.find((p) => p.id !== p0.id)!;
    p1.hand = [card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 15 } })];
    play(s, card({ name: 'Effective Immediately', effectType: 'force_discard_and_apply_stress', requiresTarget: true }), p1.id);
    expect(getPlayer(s, p0.id).isAlive).toBe(false); // the axe swings both ways
    expect(getPlayer(s, p1.id).isAlive).toBe(true);
  });
});

describe('aid_target', () => {
  it('target discards by choice, draws a replacement, stress −6, giver gains nothing', () => {
    const s = newGame();
    s.collectiveStress = 20;
    const p0 = active(s);
    const p1 = s.players.find((p) => p.id !== p0.id)!;
    const junk = p1.hand[0]!;
    play(s, card({ effectType: 'aid_target', requiresTarget: true }), p1.id);
    expect(s.pending?.kind).toBe('aid_discard');
    expect(s.pending && 'playerId' in s.pending && s.pending.playerId).toBe(p1.id); // the TARGET chooses
    applyDecision(s, { type: 'aid_discard', cardId: junk.id });
    expect(s.collectiveStress).toBe(14);
    expect(getPlayer(s, p1.id).hand.length).toBe(6); // replacement drawn
    expect(getPlayer(s, p0.id).influence).toBe(0);
  });

  it('cannot target self', () => {
    const s = newGame();
    const p0 = active(s);
    const aid = card({ effectType: 'aid_target', requiresTarget: true });
    setHand(s, p0.id, [aid]);
    expect(() => applyDecision(s, { type: 'play_card', cardId: aid.id, targetId: p0.id })).toThrow();
  });
});
