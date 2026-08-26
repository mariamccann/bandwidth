// Complete card list — Spec §6 plus playtest rebalancing. Deck build asserts
// totals: 113 overall.
import type { Card, CardCondition, DeckType, EffectParams, EffectType } from './types.js';

interface CardSpec {
  name: string;
  copies: number;
  deckType: DeckType;
  effectType: EffectType;
  effectParams: EffectParams;
  requiresTarget: boolean;
  condition?: CardCondition;
  flavour: string;
}

export const CARD_SPECS: CardSpec[] = [
  // ---- Stress Deck (38) — no target required ----
  { name: 'Reply-All Storm', copies: 5, deckType: 'Stress', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 1 }, requiresTarget: false, flavour: 'Just circling back on this — see below.' },
  { name: 'Mandatory Wellness Webinar', copies: 5, deckType: 'Stress', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 2 }, requiresTarget: false, flavour: 'Attendance is optional. Attendance is tracked.' },
  { name: 'Calendar Tetris', copies: 4, deckType: 'Stress', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 3 }, requiresTarget: false, flavour: 'You have 4 minutes between meetings. Use them wisely.' },
  { name: 'Quarterly All-Hands', copies: 3, deckType: 'Stress', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 10 }, requiresTarget: false, flavour: 'Big news, everyone. Very big. Very exciting.' },
  { name: 'System Outage — Unplanned', copies: 2, deckType: 'Stress', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 3, stressAmount: 15 }, requiresTarget: false, flavour: "It's not down. It's 'experiencing intermittent availability.'" },
  { name: 'Total Reorganisation', copies: 1, deckType: 'Stress', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 4, stressAmount: 25 }, requiresTarget: false, flavour: 'New reporting lines effective immediately. Org chart to follow. Eventually.' },
  { name: 'Activate Coasting Mode', copies: 4, deckType: 'Stress', effectType: 'stress_delta', effectParams: { amount: -2 }, requiresTarget: false, flavour: 'Delivering precisely what was requested. No more, no less.' },
  { name: 'Meeting Cancelled', copies: 4, deckType: 'Stress', effectType: 'stress_delta', effectParams: { amount: -3 }, requiresTarget: false, flavour: 'The organiser found the answer in the email. Unprecedented.' },
  { name: 'Something Useful Got Delivered', copies: 3, deckType: 'Stress', effectType: 'stress_delta', effectParams: { amount: -3 }, requiresTarget: false, flavour: 'It passed QA and everything. Nobody knows how.' },
  { name: 'Manager on Hol', copies: 3, deckType: 'Stress', effectType: 'stress_delta', effectParams: { amount: -4 }, requiresTarget: false, flavour: 'Decisions have paused. Productivity has not.' },
  { name: 'Deadline Extended', copies: 3, deckType: 'Stress', effectType: 'stress_delta', effectParams: { amount: -4 }, requiresTarget: false, flavour: 'The date moved. The work did not.' },
  { name: 'Actually Hired Enough People', copies: 1, deckType: 'Stress', effectType: 'stress_delta', effectParams: { amount: -7 }, requiresTarget: false, flavour: 'Headcount matched the workload. Finance is investigating.' },

  // ---- Politics Deck (34) ----
  { name: 'Regift the Hot Potato', copies: 3, deckType: 'Politics', effectType: 'give_random_card', effectParams: {}, requiresTarget: true, flavour: 'A gift! From me, to you, entirely unprompted.' },
  { name: 'Take This Offline', copies: 3, deckType: 'Politics', effectType: 'skip_next_turn', effectParams: {}, requiresTarget: true, flavour: "Let's not solve this in the group chat." },
  { name: 'Water Cooler Intelligence', copies: 3, deckType: 'Politics', effectType: 'steal_influence', effectParams: {}, requiresTarget: true, flavour: 'I heard from someone who heard from someone.' },
  { name: 'Calendar Blocking', copies: 3, deckType: 'Politics', effectType: 'protect_self', effectParams: {}, requiresTarget: false, flavour: 'Declined. Recurring event.' },
  { name: 'Forced Overtime', copies: 3, deckType: 'Politics', effectType: 'force_discard_chosen_by_attacker', effectParams: {}, requiresTarget: true, flavour: "It's not overtime if you're 'passionate about the mission.'" },
  { name: 'Reorg Rumour', copies: 3, deckType: 'Politics', effectType: 'reveal_hand', effectParams: {}, requiresTarget: true, flavour: "Nothing's confirmed. Everything's confirmed." },
  { name: 'Micromanagement', copies: 3, deckType: 'Politics', effectType: 'force_play_highest_stress_next_turn', effectParams: {}, requiresTarget: true, flavour: 'Can you loop me in on every decision, however small?' },
  { name: 'Stealing Credit', copies: 4, deckType: 'Politics', effectType: 'steal_influence', effectParams: {}, requiresTarget: true, flavour: 'Great initiative. Glad I could lead it.' },
  { name: 'Thrown Under the Bus', copies: 3, deckType: 'Politics', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 8 }, requiresTarget: false, flavour: 'It was a team effort. The team was you.' },
  { name: "CC'd for Visibility", copies: 3, deckType: 'Politics', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 3 }, requiresTarget: false, flavour: 'Just keeping everyone in the loop. Especially you.' },
  { name: 'Circling Back on My Last Email', copies: 3, deckType: 'Politics', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 1, stressAmount: 3 }, requiresTarget: false, flavour: 'Per my previous email. And the one before. And the one before that.' },

  // ---- Employee Policy Deck (10) ----
  { name: 'Team Chemistry Review', copies: 3, deckType: 'Employee', effectType: 'force_discard_chosen_by_attacker', effectParams: {}, requiresTarget: true, flavour: "We're not saying it's you. We're saying it's probably you." },
  { name: 'Role Audit', copies: 2, deckType: 'Employee', effectType: 'force_discard_chosen_by_attacker', effectParams: {}, requiresTarget: true, flavour: 'Your job title has been updated. Your job has not.' },
  { name: 'Career Transition Opportunity', copies: 2, deckType: 'Employee', effectType: 'force_play_highest_stress_next_turn', effectParams: {}, requiresTarget: true, flavour: 'This is a great chance for you to explore what’s next.' },
  { name: 'Effective Immediately', copies: 1, deckType: 'Employee', effectType: 'force_discard_and_apply_stress', effectParams: {}, requiresTarget: true, flavour: 'Effective immediately. No further notice will be given.' },
  // Design note (spec §6): deliberately the only positive-stress card with no
  // Influence yield — all cost, no upside. Do not "fix".
  { name: 'Performance Improvement Plan', copies: 2, deckType: 'Employee', effectType: 'stress_delta', effectParams: { amount: 10 }, requiresTarget: false, flavour: 'This is a supportive document. It is also a warning.' },

  // ---- Influence Deck (28) — no target required ----
  { name: 'Quiet Word With the VP', copies: 7, deckType: 'Influence', effectType: 'influence_gain', effectParams: { amount: 1 }, requiresTarget: false, condition: 'not_sole_leader', flavour: 'Just a quick chat. Nothing formal.' },
  { name: 'Took the Meeting Notes', copies: 6, deckType: 'Influence', effectType: 'influence_gain', effectParams: { amount: 1 }, requiresTarget: false, condition: 'not_sole_leader', flavour: 'Whoever controls the minutes controls the narrative.' },
  { name: 'Volunteered for the Committee', copies: 5, deckType: 'Influence', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 2 }, requiresTarget: false, flavour: 'Someone has to chair the offsite planning group.' },
  { name: 'Presented the Deck', copies: 4, deckType: 'Influence', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 2, stressAmount: 3 }, requiresTarget: false, flavour: '47 slides. Nobody read past slide 4. Everyone remembers slide 4.' },
  { name: 'Owns the Roadmap', copies: 3, deckType: 'Influence', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 3, stressAmount: 4 }, requiresTarget: false, flavour: 'The roadmap is a living document. It lives in fear.' },
  { name: 'Executive Sponsor', copies: 2, deckType: 'Influence', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 4, stressAmount: 5 }, requiresTarget: false, flavour: 'They mentioned you by name. Once. It was enough.' },
  { name: 'Board Visibility', copies: 1, deckType: 'Influence', effectType: 'influence_gain_with_stress_cost', effectParams: { influenceAmount: 5, stressAmount: 6 }, requiresTarget: false, flavour: "You're in the deck now. The real deck. The board deck." },

  // ---- Support Deck (3) ----
  // Design note (spec §6): three support cards in a 113-card game about
  // workplace stress. That ratio is intentional.
  { name: "Actually Asked If You're OK", copies: 3, deckType: 'Support', effectType: 'aid_target', effectParams: {}, requiresTarget: true, flavour: 'Not the survey. Not the check-in bot. Actually asked.' },
];

export const EXPECTED_DECK_COUNTS: Record<DeckType, number> = {
  Stress: 38,
  Politics: 34,
  Employee: 10,
  Influence: 28,
  Support: 3,
};
export const EXPECTED_TOTAL = 113;

/** Build the full 113-card deck (unshuffled). Asserts §6 counts. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let serial = 0;
  for (const spec of CARD_SPECS) {
    for (let i = 0; i < spec.copies; i++) {
      deck.push({
        id: `c${String(serial++).padStart(3, '0')}`,
        name: spec.name,
        deckType: spec.deckType,
        effectType: spec.effectType,
        effectParams: { ...spec.effectParams },
        ...(spec.condition ? { condition: spec.condition } : {}),
        requiresTarget: spec.requiresTarget,
        flavour: spec.flavour,
      });
    }
  }
  const counts: Record<string, number> = {};
  for (const c of deck) counts[c.deckType] = (counts[c.deckType] ?? 0) + 1;
  for (const [dt, expected] of Object.entries(EXPECTED_DECK_COUNTS)) {
    if (counts[dt] !== expected) {
      throw new Error(`Deck build error: ${dt} has ${counts[dt]} cards, expected ${expected}`);
    }
  }
  if (deck.length !== EXPECTED_TOTAL) {
    throw new Error(`Deck build error: total ${deck.length}, expected ${EXPECTED_TOTAL}`);
  }
  return deck;
}

/** Positive stress this card would load onto the shared track (0 if none). */
export function stressLoad(card: Card): number {
  if (card.effectType === 'stress_delta') return Math.max(0, card.effectParams.amount ?? 0);
  if (card.effectType === 'influence_gain_with_stress_cost') return card.effectParams.stressAmount ?? 0;
  return 0;
}

/** Influence this card would yield its player (0 if none). */
export function influenceYield(card: Card): number {
  if (card.effectType === 'influence_gain') return card.effectParams.amount ?? 0;
  if (card.effectType === 'influence_gain_with_stress_cost') return card.effectParams.influenceAmount ?? 0;
  return 0;
}

/** Concise player-facing rules copy. Flavour text never has to explain mechanics. */
export function cardRuleText(card: Card): string {
  const amount = card.effectParams.amount ?? 0;
  const influence = card.effectParams.influenceAmount ?? 0;
  const stress = card.effectParams.stressAmount ?? 0;
  let rule: string;
  switch (card.effectType) {
    case 'stress_delta':
      rule = amount < 0
        ? `Lower Collective Stress by ${Math.abs(amount)}.`
        : `Raise Collective Stress by ${amount}.`;
      break;
    case 'influence_gain':
      rule = `Gain ${amount} Influence.`;
      break;
    case 'influence_gain_with_stress_cost':
      rule = `Gain ${influence} Influence. Raise Collective Stress by ${stress}.`;
      break;
    case 'give_random_card':
      rule = 'Pass a random card from your hand to an opponent.';
      break;
    case 'skip_next_turn':
      rule = 'Choose an opponent. They skip their next turn.';
      break;
    case 'peek_and_swap':
      rule = 'Look at an opponent’s hand and exchange one card each.';
      break;
    case 'protect_self':
      rule = 'Block the next targeted card played against you.';
      break;
    case 'force_discard_chosen_by_attacker':
      rule = 'Look at an opponent’s hand and choose one card for them to discard.';
      break;
    case 'reveal_hand':
      rule = 'Privately look at an opponent’s hand.';
      break;
    case 'force_play_highest_stress_next_turn':
      rule = 'Choose an opponent. They must play their highest-Stress card next turn.';
      break;
    case 'steal_influence':
      rule = 'Steal 1 Influence from an opponent.';
      break;
    case 'force_discard_and_apply_stress':
      rule = 'An opponent discards their highest-Stress card and adds its Stress to the track.';
      break;
    case 'aid_target':
      rule = 'A player discards and redraws one card. Lower Collective Stress by 6.';
      break;
  }
  return card.condition === 'not_sole_leader'
    ? `${rule} Not playable while you are the sole leader.`
    : rule;
}

/**
 * Forced-play / forced-discard selection rule (spec §5, made fully
 * deterministic — DECISIONS.md #4): highest stress load, ties broken by lower
 * Influence yield, remaining ties by lowest hand index. Returns -1 if the hand
 * holds no positive-stress card.
 */
export function selectHighestStressIndex(hand: Card[]): number {
  let best = -1;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i]!;
    if (stressLoad(c) <= 0) continue;
    if (best === -1) { best = i; continue; }
    const b = hand[best]!;
    if (stressLoad(c) > stressLoad(b)) best = i;
    else if (stressLoad(c) === stressLoad(b) && influenceYield(c) < influenceYield(b)) best = i;
  }
  return best;
}

/** Highest-Influence-yield card index (fallback for force_discard_and_apply_stress); ties by lowest hand index. -1 if hand empty. */
export function selectHighestInfluenceIndex(hand: Card[]): number {
  let best = -1;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i]!;
    if (best === -1 || influenceYield(c) > influenceYield(hand[best]!)) best = i;
  }
  return best;
}
