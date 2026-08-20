# Spec Ambiguity Resolutions

The v1.1 spec left the following points underspecified or contradictory. Each
was resolved during the Phase 1 build as recorded here. Numbers match the
review that preceded the build.

1. **Eliminated player's hand** → discarded to the discard pile at elimination.
   Keeps all 110 cards circulating so deck-cycle economy (and therefore sim
   results) doesn't degrade as players are eliminated.
2. **Self-targeting** → disallowed for *all* targeted effects. The spec only
   excluded self for `aid_target`; allowing self-targeting elsewhere made
   Regift the Hot Potato a free extra card with no downside.
3. **Skipped turns** → proceed directly to step 9: the turn advances and
   `turnCount` increments, so skips count toward the 300-turn cap.
4. **Forced-play tiebreak** → made total: highest stress load → lower Influence
   yield → lowest hand index. (Needed because Reply-All Storm and Thrown Under
   the Bus have identical stats.) Same rule reused by Effective Immediately.
5. **Skip + forced-play on the same player** → the skip consumes only
   `skipNextTurn`; `forcedPlayHighestStress` survives to their next real turn.
   The punishment is deferred, not dodged.
6. **Stress clamping** → clamped at 0 only. The value may transiently exceed
   100; the elimination check is the sole upper-bound handler and resets to 0.
   (§2's "0–100, clamped" annotation is superseded by §5's explicit rule.)
7. **Effective Immediately tipping the track** → eliminates the *active
   player* (the one who played it), exactly as §4 step 6 reads. The axe swings
   both ways; play it at high stress at your own risk.
8. **Protection expiry** → none. `isProtected` persists until it blocks a
   targeted effect (spec-as-written).
9. **Protection vs no-op steal** → protection is checked *before* effect
   application, so a steal against a 0-Influence protected player still
   consumes the protection. Deliberate: protection answers targeting, not
   outcomes.
10. **Timeout tiebreak** → highest Influence among alive players; ties broken
    by earliest seat in turn order.
11. **Final standings** → winner pinned first, then alive players by
    Influence, then eliminated players by Influence (ties by seat). An
    eliminated player's banked Influence never outranks the winner.
12. **Reshuffle rule** → one canonical `drawCard()`: when the deck is empty,
    the most recently discarded card is held back as the new discard seed and
    the rest are shuffled into a new deck. The in-play card lives in
    `state.inPlay` (no zone), so mid-effect reshuffles can never absorb it.
13. **Playtime proxy** → 20 seconds per turn (including phone handovers), so
    the 15–35 minute band maps to ~45–105 turns.
14. **`aid_target` hotseat handover** (Phase 2 note) → the target's card
    choice needs the same pass-the-phone privacy interstitial as normal turn
    handover.
15. **`aid_target` on an empty hand** → the −6 stress relief still applies;
    only the discard/redraw is skipped. (Empty hands are near-impossible but
    the engine must not stall.)
16. **`isCurrentTurn`** → derived from `currentPlayerIndex` via
    `isCurrentTurn(state, id)` instead of stored per player, eliminating a
    second source of truth. All other §2 fields are as specified.

17. **Post-spec card addition (designer request, 2026-08-20):** *Circling Back
    on My Last Email* — Politics deck, 3 copies,
    `influence_gain_with_stress_cost {influence 1, stress 7}`. Deck totals
    become Politics 38 / **113 overall**; all build assertions updated. Balance
    re-validated by a full simulation re-run (see simulation-report.md).
18. **Game name:** *Bandwidth* — strapline "You have none. They want more."
    (Was working-titled Collective Stress; the shared meter keeps that name
    in-game.)
