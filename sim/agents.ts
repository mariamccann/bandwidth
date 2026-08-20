// Simulation agents (spec §10): random-legal-move agent plus a simple greedy
// agent that prefers Influence yield and avoids tipping the track at high stress.
import { influenceYield, stressLoad } from '../src/cards.js';
import { eligibleTargets, getPlayer, STRESS_LIMIT } from '../src/engine.js';
import { randInt } from '../src/rng.js';
import type { Card, Decision, GameState, PendingDecision } from '../src/types.js';

export interface Agent {
  name: string;
  decide(state: GameState, pending: PendingDecision, rng: { rngState: number }): Decision;
}

function cardById(state: GameState, playerId: string, cardId: string): Card {
  return getPlayer(state, playerId).hand.find((c) => c.id === cardId)!;
}

function pick<T>(rng: { rngState: number }, arr: T[]): T {
  return arr[randInt(rng, arr.length)]!;
}

export const randomAgent: Agent = {
  name: 'random',
  decide(state, pending, rng): Decision {
    switch (pending.kind) {
      case 'play_card': {
        const cardId = pick(rng, pending.playableCardIds);
        if (pending.mustDiscard) return { type: 'discard_card', cardId };
        const card = cardById(state, pending.playerId, cardId);
        if (card.requiresTarget) {
          const targets = eligibleTargets(state, pending.playerId);
          return { type: 'play_card', cardId, targetId: pick(rng, targets).id };
        }
        return { type: 'play_card', cardId };
      }
      case 'peek_swap': {
        const mine = getPlayer(state, pending.playerId).hand;
        return {
          type: 'peek_swap',
          takeCardId: pick(rng, pending.revealedCardIds),
          giveCardId: pick(rng, mine).id,
        };
      }
      case 'force_discard':
        return { type: 'force_discard', cardId: pick(rng, pending.revealedCardIds) };
      case 'aid_discard':
        return { type: 'aid_discard', cardId: pick(rng, getPlayer(state, pending.playerId).hand).id };
    }
  },
};

/**
 * Greedy: maximise own Influence yield; refuse to play a card that would tip
 * the track (unless nothing else is legal); at stress ≥ 80 prefer relief.
 */
export const greedyAgent: Agent = {
  name: 'greedy',
  decide(state, pending, rng): Decision {
    switch (pending.kind) {
      case 'play_card': {
        const me = getPlayer(state, pending.playerId);
        const targets = eligibleTargets(state, pending.playerId);
        const leader = [...targets].sort((a, b) => b.influence - a.influence)[0]!;
        if (pending.mustDiscard) {
          return { type: 'discard_card', cardId: pending.playableCardIds[0]! };
        }
        let best: { d: Decision; score: number } | null = null;
        for (const cardId of pending.playableCardIds) {
          const card = cardById(state, pending.playerId, cardId);
          const load = stressLoad(card);
          const wouldTip = state.collectiveStress + load >= STRESS_LIMIT;
          let score = influenceYield(card) * 10;
          if (wouldTip) score -= 1000; // being the tipper is close to losing
          if (state.collectiveStress >= 80) {
            // prefer relief hard when the track is hot
            if (card.effectType === 'stress_delta' && (card.effectParams.amount ?? 0) < 0) score += 60;
            if (card.effectType === 'aid_target') score += 50;
            score -= load * 2;
          } else {
            score -= load; // mild aversion to loading the track
          }
          if (card.effectType === 'steal_influence' && leader.influence > 0) score += 12;
          if (card.effectType === 'force_play_highest_stress_next_turn') score += state.collectiveStress >= 60 ? 15 : 5;
          if (card.effectType === 'skip_next_turn') score += 4;
          if (card.effectType === 'protect_self' && !me.isProtected) score += 3;
          score += randInt(rng, 3); // small jitter to avoid degenerate loops
          const d: Decision = card.requiresTarget
            ? { type: 'play_card', cardId, targetId: leader.id }
            : { type: 'play_card', cardId };
          if (!best || score > best.score) best = { d, score };
        }
        return best!.d;
      }
      case 'peek_swap': {
        const target = getPlayer(state, pending.targetId);
        const mine = getPlayer(state, pending.playerId).hand;
        const take = [...target.hand].sort((a, b) => influenceYield(b) - influenceYield(a))[0]!;
        const give = [...mine].sort(
          (a, b) => stressLoad(b) - influenceYield(b) * 3 - (stressLoad(a) - influenceYield(a) * 3),
        )[0]!;
        return { type: 'peek_swap', takeCardId: take.id, giveCardId: give.id };
      }
      case 'force_discard': {
        // hurt the target: bin their highest influence-yield card
        const target = getPlayer(state, pending.targetId);
        const victim = [...target.hand].sort((a, b) => influenceYield(b) - influenceYield(a))[0]!;
        return { type: 'force_discard', cardId: victim.id };
      }
      case 'aid_discard': {
        // shed the biggest liability
        const mine = getPlayer(state, pending.playerId).hand;
        const worst = [...mine].sort((a, b) => stressLoad(b) - stressLoad(a))[0]!;
        return { type: 'aid_discard', cardId: worst.id };
      }
    }
  },
};
