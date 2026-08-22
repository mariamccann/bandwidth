# Bandwidth

**You have none. They want more.**

*(spec: "Untitled Corporate Survival Card Game", v1.1)*

A digital multiplayer card game where players race to **15 Influence** while
managing a single shared danger meter, **Collective Stress**. Every "quick five minutes" someone takes from you loads the shared track. Almost every card
that advances you loads the shared track; the cards that relieve the track
advance nobody. Tip the track past 100 and you're out — and everyone else pays
for it too.

## Status

- ✅ **Phase 1 — Engine + simulation.** Pure TypeScript engine, 50 unit tests,
  headless simulation harness. **Acceptance gate passed** — see
  [docs/simulation-report.md](docs/simulation-report.md).
- ⬜ **Phase 2 — Hotseat UI.** React + Vite, mobile-first pass-and-play.
- ✅ **Phase 3a — online multiplayer.** Server-authoritative WebSocket rooms;
  everyone plays from their own device via a 4-letter room code.
- ✅ **Phase 3b — solo / vs computer.** Play short-handed: computer players
  (Easy = random, Normal = greedy) fill empty seats so 1 or 2 humans can play
  the 3+ player game. No backend — bots run client-side on the shared engine.

## Layout

| Path | What |
| :- | :- |
| `src/` | Pure, framework-free game engine (state machine, 13 effect types, full 113-card deck) |
| `sim/` | Simulation agents + acceptance harness (`npm run sim`) |
| `server/` | WebSocket game server: rooms, join codes, per-seat redacted state (`npm start`) |
| `test/` | Vitest unit tests (`npm test`) |
| `docs/DECISIONS.md` | Every spec ambiguity found during the build and how it was resolved |
| `docs/simulation-report.md` | Phase 1 acceptance report (24,000 simulated games) |

## Commands

```
npm test          # run the unit test suite
npm run sim       # regenerate the simulation report (2,000 games/config)
npm run typecheck # strict TypeScript check
npm run dev       # UI dev server (Vite)
npm start         # multiplayer game server (WebSocket, port 8787 / $PORT)
```

## Online play

The UI offers two modes: **pass-and-play** (one shared phone, no backend) and
**online** (everyone on their own device). Online mode talks to the WebSocket
server in `server/`: the host creates a room and shares its 4-letter code;
the server runs the real engine and sends each player a redacted view (your
own hand in full, everyone else's as counts — deck order never leaves the
server). Refreshing rejoins your seat automatically.

Deploy: the static site to Netlify (as before), the server to Render via
`render.yaml` (Blueprint deploy). The client's production server URL is set
in `ui/online/config.ts` (override with `VITE_WS_URL` at build time).

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
