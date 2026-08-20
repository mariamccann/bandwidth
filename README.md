# Collective Stress

*(working title — spec: "Untitled Corporate Survival Card Game", v1.1)*

A digital multiplayer card game where players race to **15 Influence** while
managing a single shared danger meter, **Collective Stress**. Almost every card
that advances you loads the shared track; the cards that relieve the track
advance nobody. Tip the track past 100 and you're out — and everyone else pays
for it too.

## Status

- ✅ **Phase 1 — Engine + simulation.** Pure TypeScript engine, 50 unit tests,
  headless simulation harness. **Acceptance gate passed** — see
  [docs/simulation-report.md](docs/simulation-report.md).
- ⬜ **Phase 2 — Hotseat UI.** React + Vite, mobile-first pass-and-play.
- ⬜ **Phase 3 — deferred.** Solo vs scripted AI; online multiplayer.

## Layout

| Path | What |
| :- | :- |
| `src/` | Pure, framework-free game engine (state machine, 13 effect types, full 110-card deck) |
| `sim/` | Simulation agents + acceptance harness (`npm run sim`) |
| `test/` | Vitest unit tests (`npm test`) |
| `docs/DECISIONS.md` | Every spec ambiguity found during the build and how it was resolved |
| `docs/simulation-report.md` | Phase 1 acceptance report (24,000 simulated games) |

## Commands

```
npm test          # run the unit test suite
npm run sim       # regenerate the simulation report (2,000 games/config)
npm run typecheck # strict TypeScript check
```

## Engine design

The engine is decision-driven: it surfaces a `PendingDecision` (whose turn,
which cards are playable, which follow-up choice is owed) and callers answer
via `applyDecision`. It never assumes a human at the screen, so the hotseat UI,
scripted AI opponents, and online sync can all drive the same module unchanged.

```ts
import { createGame, getPending, applyDecision } from './src/index.js';

const state = createGame({ playerNames: ['Priya', 'Sam', 'Alex'], seed: 42 });
const pending = getPending(state); // { kind: 'play_card', playableCardIds, ... }
applyDecision(state, { type: 'play_card', cardId: pending.playableCardIds[0] });
```
