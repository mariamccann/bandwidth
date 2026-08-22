// Solo / vs-computer safety net: the UI bot driver feeds agent decisions
// straight into the engine. This proves the agents never produce a move the
// engine rejects and never deadlock, across every table size 3–8 — including
// the all-bot worst case that a 1-human game degenerates to on the human's
// idle turns.
import { describe, expect, it } from 'vitest';
import { applyDecision, createGame } from '../src/engine.js';
import { greedyAgent, randomAgent, type Agent } from '../sim/agents.js';

function playFullGame(playerCount: number, agents: Agent[], seed: number) {
  const state = createGame({
    playerNames: Array.from({ length: playerCount }, (_, i) => `P${i}`),
    seed,
  });
  const rng = { rngState: (seed ^ 0x1234) >>> 0 };
  let guard = 0;
  while (state.gamePhase !== 'game_over') {
    if (++guard > 10000) throw new Error('deadlock: game did not converge');
    const pending = state.pending!;
    const seat = Number(pending.playerId.slice(1));
    const agent = agents[seat % agents.length]!;
    // No try/catch here on purpose: a thrown/rejected decision fails the test.
    applyDecision(state, agent.decide(state, pending, rng));
  }
  return state;
}

describe('agent-driven games always complete legally (solo/bot driver)', () => {
  it('all-greedy tables 3–8 reach a winner without an illegal move', () => {
    for (let n = 3; n <= 8; n++) {
      for (let g = 0; g < 40; g++) {
        const state = playFullGame(n, [greedyAgent], n * 1000 + g);
        expect(state.gamePhase).toBe('game_over');
        expect(state.winnerId).toBeTruthy();
      }
    }
  });

  it('mixed greedy + random tables (1 human-substitute + bots) complete cleanly', () => {
    for (let n = 3; n <= 8; n++) {
      for (let g = 0; g < 40; g++) {
        // seat 0 = "human" played by random, rest greedy — mirrors solo play
        const agents = [randomAgent, ...Array.from({ length: n - 1 }, () => greedyAgent)];
        const state = playFullGame(n, agents, n * 7777 + g);
        expect(state.winnerId).toBeTruthy();
      }
    }
  });
});
