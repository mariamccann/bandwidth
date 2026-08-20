import { describe, expect, it } from 'vitest';
import {
  buildDeck,
  CARD_SPECS,
  EXPECTED_DECK_COUNTS,
  EXPECTED_TOTAL,
  influenceYield,
  selectHighestInfluenceIndex,
  selectHighestStressIndex,
  stressLoad,
} from '../src/cards.js';
import { card } from './helpers.js';

describe('deck build (§6)', () => {
  it('builds exactly 110 cards with correct per-deck counts', () => {
    const deck = buildDeck();
    expect(deck.length).toBe(EXPECTED_TOTAL);
    const counts: Record<string, number> = {};
    for (const c of deck) counts[c.deckType] = (counts[c.deckType] ?? 0) + 1;
    expect(counts).toEqual(EXPECTED_DECK_COUNTS);
  });

  it('gives every physical card a unique instance id', () => {
    const deck = buildDeck();
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
  });

  it('matches spec copy counts for spot-checked cards', () => {
    const byName = (n: string) => buildDeck().filter((c) => c.name === n).length;
    expect(byName('Reply-All Storm')).toBe(6);
    expect(byName('Micromanagement')).toBe(5);
    expect(byName('Total Reorganisation')).toBe(1);
    expect(byName('Effective Immediately')).toBe(1);
    expect(byName("Actually Asked If You're OK")).toBe(3);
    expect(byName('Performance Improvement Plan')).toBe(2);
  });

  it('marks only the two free +1 Influence cards with not_sole_leader', () => {
    const conditioned = CARD_SPECS.filter((s) => s.condition === 'not_sole_leader');
    expect(conditioned.map((s) => s.name).sort()).toEqual(
      ['Quiet Word With the VP', 'Took the Meeting Notes'].sort(),
    );
  });
});

describe('stress-load / influence-yield helpers', () => {
  it('computes stress load per card class', () => {
    expect(stressLoad(card({ effectType: 'stress_delta', effectParams: { amount: 10 } }))).toBe(10);
    expect(stressLoad(card({ effectType: 'stress_delta', effectParams: { amount: -10 } }))).toBe(0);
    expect(stressLoad(card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 12 } }))).toBe(12);
    expect(stressLoad(card({ effectType: 'steal_influence' }))).toBe(0);
  });

  it('computes influence yield per card class', () => {
    expect(influenceYield(card({ effectType: 'influence_gain', effectParams: { amount: 1 } }))).toBe(1);
    expect(influenceYield(card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 3, stressAmount: 4 } }))).toBe(3);
    expect(influenceYield(card({ effectType: 'stress_delta', effectParams: { amount: -10 } }))).toBe(0);
  });
});

describe('forced-play selection rule (§5, deterministic tiebreaks)', () => {
  it('picks the highest stress load', () => {
    const hand = [
      card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 8 } }),
      card({ effectType: 'stress_delta', effectParams: { amount: 10 } }), // PIP
      card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 15 } }),
    ];
    expect(selectHighestStressIndex(hand)).toBe(2);
  });

  it('breaks stress ties by LOWER influence yield (PIP beats Mandatory Wellness Webinar)', () => {
    const hand = [
      card({ effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 10 } }),
      card({ effectType: 'stress_delta', effectParams: { amount: 10 } }), // yield 0 — loses the tie for its holder
    ];
    expect(selectHighestStressIndex(hand)).toBe(1);
  });

  it('breaks full ties by lowest hand index (identical twin cards)', () => {
    const hand = [
      card({ name: 'Reply-All Storm', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 8 } }),
      card({ name: 'Thrown Under the Bus', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 8 } }),
    ];
    expect(selectHighestStressIndex(hand)).toBe(0);
  });

  it('returns -1 when no positive-stress card is held', () => {
    const hand = [
      card({ effectType: 'stress_delta', effectParams: { amount: -10 } }),
      card({ effectType: 'influence_gain', effectParams: { amount: 1 } }),
    ];
    expect(selectHighestStressIndex(hand)).toBe(-1);
  });

  it('selects highest influence yield as the no-stress fallback', () => {
    const hand = [
      card({ effectType: 'influence_gain', effectParams: { amount: 1 } }),
      card({ effectType: 'stress_delta', effectParams: { amount: -15 } }),
    ];
    expect(selectHighestInfluenceIndex(hand)).toBe(0);
  });
});
