# Forward Value and Forward Production: the locked plan

Locked 2026-05-26 after the founder's "EV is fluff" epiphany on reading
`FINDINGS_2026_05_25_ev_paradox_and_construction_trap.md`. This file is
the rock-solid plan to build what the brand has been promising in
spirit but not in shipped math, with explicit per-stage gates so each
metric ships only when it survives evidence.

It survives compaction. Companion docs: `ARCHITECTURE_UNIFICATION_PLAN.md`
(the architecture spine this plan lives on), `MODEL_CARD.md` (the
rubric specification), `RESEARCH_CORPUS.md` (the citations), the
2026-05-26 findings doc (the diagnosis), and the `feedback-kill-ev-label`
memory note (the naming decision).

Protocol when this file disagrees with intent: re-read it, ask the
founder, do not ship the drift.

---

## State update at merge time (2026-05-26 evening)

Between this plan being drafted and the rename branch being shipped,
a parallel session merged four PRs to main that advanced parts of
this plan ahead of schedule:

- PR #41: `chore(data-right)` ingested draft capital + an athletic
  composite into `player_signals` (Stage 3a data acquisition,
  founder-authorized prod write).
- PR #42: `feat(data-right)` Phase 3b wired draft capital into the
  rookie-debut inflection card (was "data missing"; now reads the
  real NFL overall pick).
- PR #43: `feat(data-right)` Stage 2c shipped the ADP-vs-trade-value
  market-gap read on every candidate on The Call.
- PR #44: `feat(data-right)` Phase 3c wired `evaluate()` to a
  rookie-card projection footer (point estimate, variance range,
  confidence, top evidence-stack contributions). Projection-only,
  never feeds value scoring, per the plan's NOT-DO rules.

So at merge time of this rename ship: Stage 2c is DONE, Stage 3a/3b
data + wiring landed for the rookie-debut surface specifically,
Stage 3c shipped a narrow rookie-card slice. The broader work
(in-season Forward Production hub surface, Stage 4 scoring re-cast,
Stage 5 Forward Value) remains as written below.

The plan's gates and naming dictionary held: the rookie ship is
projection-only, position-conditioned, never a value-scale override.
The "What we will NOT do" list survived.

---

## Why this doc exists

Today's `perPickEv = (value / 100) * (pickNo - adp)` carries only market
inputs (FantasyCalc value, Sleeper ADP). It measures one thing:
draft-timing arbitrage against the market. It cannot survive the season
because the only thing it ever measured is over the moment the draft
ends. The corpus and signal investments were built for something
bigger: a forward, model-derived view of player value and production
that can survive the season and update with new data. That view has
not shipped. The plan below builds it.

The unification plan already documents the gap. Its 2026-05-25
addendum is explicit: *"the board's value is a pure FantasyCalc/KTC
market passthrough because Layer 2 (the rubric) is unwired and Layer 1
(signals) is empty. The product cannot hold an opinion that differs
from the market."* This doc is the metrics-side companion to that
plan: not just connect the engine, but give the user-facing surface
the right labels and the right numbers.

## The naming decision (effective immediately, 2026-05-26)

The bare word "EV" is retired from chrome and from this product's
vocabulary going forward. The three meanings it was conflating get
specific names:

- **Value vs ADP** (tag form: `vsADP`). The metric we actually ship
  today. `(value / 100) * (pickNo - adp)`. Measures draft-timing
  arbitrage against the market. Honest about what it does.
- **Forward Value**. Reserved label for our model's projected market
  value of a player vs market today. Not shipped. Data-gated. The
  Stage 2b backtest (PR #39, 2026-05-25) returned NO marginal
  forward-VALUE edge over market in the deep tier (rank 100-280);
  `evaluate()` stays parked until the unlock conditions below.
- **Forward Production**. Reserved label for our model's projected
  fantasy production over a horizon (PPR points, opportunity-anchored,
  position-conditioned). Not shipped. The defensible signal Stage 2
  grounding identified; what the corpus actually unlocks.

Rules going forward:
- Chrome NEVER uses bare "EV." Use the specific label per the meaning.
- Forward Value never appears in chrome until the data unlock is met.
- Forward Production gets built and surfaced per the stages below.
- Historical changelog entries are NOT rewritten; they describe what
  shipped using the term used at the time. New ship entries use the
  new vocabulary.

## What lives where (today and target state)

| Metric | Source | Today | Target |
|---|---|---|---|
| Player value (FantasyCalc 0-100) | FantasyCalc API | Market price, daily refresh | Stays as the market prior. |
| Pick value (KTC-anchored) | KTC snapshot | Market price | Stays as the market pick valuation. |
| Value vs ADP per pick | `perPickEv` | Market value × market ADP gap | Stays as a draft-time surface, renamed in chrome. |
| Forward Value per player | `evaluate(ctx).point_estimate` + `market_delta` | Built, unwired (admin debug + unrendered TierMap only) | Parked until unlock conditions met. |
| Forward Production per player | (does not exist) | (does not exist) | Built per Stages 3a-3c. The defensible build. |
| In-season EV bank | (would be `analyzeLeagueEvBank`) | Null in-season (draft-only) | Recast around Forward Production: projected production banked vs market-projected, updating weekly. |
| Standing-call scoring | `synthesize.ts`, market-value + ADP-gap rules | Hard-slot fill + ADP boost; no flex-fill | Re-cast around Forward Production gaps. The construction trap (findings doc, thread 2) resolves naturally here. |

---

## Stage 0: Cleanup ship (this session, 2026-05-26)

The smallest, most honest move available today. Ships in one PR. No
math change. Brand voice unchanged.

- Re-label every chrome surface that says "EV bank" / "EV banked" /
  "EV per pick" / "EV" (where "EV" refers to today's metric).
- New language: "Value vs ADP" / "value banked vs ADP" /
  "value vs ADP per pick". Tag form `vsADP` where space is tight.
- Companion milestone beat headline changes from
  `"EV bank +10.8, 1st of 12."` to `"Value vs ADP +10.8, 1st of 12."`.
- DraftProgressPanel section header, trajectory-chart titles, share
  button text, share page chrome, OpenGraph image, sort column
  on the Decision Board: all rename.
- One Library article retitled and copy-rewritten through the body
  (`league-avg-ev-bank-is-negative`). Slug preserved so URLs hold.
- REDESIGN_INTENTIONS Principle 8 doctrine updated (3-box structure
  preserved; labels updated).
- One changelog entry naming the kill explicitly.

Gate: `npm run build` clean. `npm test` green. A manual exercise of
the hub + share route confirming no stray "EV bank" appears in chrome.

Out of scope for Stage 0: renaming internal types (`EvBank`,
`LeagueEvBankReadout`), variable names (`ev_bank_delta`), file paths
(`/lib/strategy/ev-bank/`), the `/share/ev-bank` route. Those are
symbol-level renames that add diff noise without changing user
experience. Schedule for a separate housekeeping pass.

## Stage 1: Already shipped (the data foundation)

Recording for completeness, no work here. From the
`ARCHITECTURE_UNIFICATION_PLAN.md` 2026-05-25 addendum:

- The free Sleeper `/stats` harvest landed (commit 2eed1eb): snap
  share, targets/g, aDOT, drops, RZ targets, receptions, rec yards.
- `buildOpportunityProfile` (canonical opportunity read, PR #35).
- Inflection cards (aging RB/WR/TE) now read live role trend via
  `buildOpportunitySignal` (PR #37).
- The Call standing-call + candidate cards show the per-player
  earned role (PR #38).

These are the inputs Forward Production will consume. They are
data-side, not metric-side, so they were correct to ship ahead of
this plan.

## Stage 2c: ADP-vs-trade-value divergence surface · SHIPPED (PR #43)

Done as `readMarketDivergence` (`src/lib/players/market-divergence.ts`)
plus the per-candidate market-gap line on The Call. Surfaces
divergence neutrally when the two markets disagree by 15+ picks,
shows both numbers and which market is earlier, no verdict. The
Mitchell case (ADP 196, value rank 242) reads as the canonical
example. Stage 2c is closed; new work in this space goes through the
canonical reader.

## Stage 3a: Pick the Forward Production target (still required for the broader hub surface)

PR #44 shipped a NARROW first slice (rookie-debut card, projection
footer, never feeds value) without a founder decision recorded here.
That ship is consistent with this plan's NOT-DO rules and is
preserved. The decision below is still required before the BROADER
Stage 3c surface (in-season hub-wide Forward Production EV bank,
multi-position projection across the roster) starts.

Before any code on the broader surface, founder records:

- **Horizon.** Rest-of-season (current week through week 17)?
  Full-season (Sep through W17)? Multi-year cumulative (Y1, Y1+Y2,
  Y1-Y3)? Each implies a different defensible signal stack.
- **Output shape.** Point estimate only? Point estimate plus variance
  band (P25, P50, P75)? Per Principle 0 (MIT-grade statistical floor)
  the variance band is the default; what we are deciding is the band
  width and whether to ship a probability distribution.
- **Position conditioning.** Per MODEL_CARD section 4 the rubrics
  are position-specific. Confirm one stack per position, with the
  weights MODEL_CARD documents as the starting point and the backtest
  as the truth.
- **Update cadence.** Daily? Weekly post-Sunday-games? Both?

Gate: founder decision recorded in this doc or in a follow-up
locked decision file. Stage 3b does not start without it.

### Stage 3a DECISION (locked 2026-06-12 by founder)

The broader-surface gate is now recorded. Stage 3b / Phase D2 may
start.

- **Horizon: multi-year cumulative is the headline.** Forward
  Production projects cumulative PPR points over Y1, Y1+Y2, Y1-Y3.
  Rest-of-season is NOT a separate metric; it is the current-season
  (Y1) component that rolls up into the cumulative number. Rationale:
  dynasty is a multi-year game; a rest-of-season-only metric reads
  redraft-flavored to a dynasty user. The cost (multi-year is the
  noisier, harder projection, and FantasyCalc already prices
  multi-year value well) is accepted because the cumulative view is
  the one the brand promises and the one the in-season + scoreboard
  surfaces ultimately need.
- **Cadence: component-matched, not a single clock.** The Y1
  component recomputes WEEKLY post-Sunday-games as games resolve. The
  Y2/Y3 outer years recompute EVENT-DRIVEN (injury, depth-chart move,
  offseason transition), since a single week is ~2% of a 3-year
  window and a strict weekly clock would render a near-static
  headline number (a "weekly fresh" promise that does not visibly
  hold). The cumulative number updates whenever ANY component moves.
  D2 builds a weekly Y1 batch + an event-triggered outer-year
  recompute, NOT a single fixed-clock job over the whole horizon.
- **Output shape: point + band.** P50 median is the headline number;
  P25/P75 is the inline confidence band, visible by default per
  Principle 0 (non-negotiable on the flagship metric). No full
  probability distribution in v1; the three quantiles carry the
  uncertainty the UI needs.
- **Position conditioning: one rubric per position.** QB/RB/WR/TE
  each keep their own rubric with the MODEL_CARD section 4 weights as
  the starting prior and the backtest as the truth. No unified model
  (it would blur the position-specific signals that matter).
- **Ship gate: all four positions or none.** D3's three gates
  (temporal-blinded backtest with CI excluding zero + dynasty-canon-
  keeper CRITIQUE Defensible + dynasty-assumption-auditor no
  Indefensible) must pass for ALL of QB/RB/WR/TE before any public
  ship. The "no half-the-product" founder rule holds; a position that
  cannot clear after Phase B's signal investment becomes a
  release-blocker decision, not a ship-around-it.

### Stage 3a note: the VALUE_MODE flip (#76) did NOT satisfy this gate

`src/lib/players/value-mode.ts` and `CANONICAL_SOURCES.md` cite
"FORWARD_EV_PLAN Stage 3a" as the flip's authorization. That citation
is imprecise and is corrected here. Stage 3a decided the FORWARD
PRODUCTION shape (horizon, cadence, output, position conditioning, ship
gate). It did NOT authorize flipping the live board value to the rubric
absent the D3 "beats market" backtest. The #71-77 value-pipe track
flipped `VALUE_MODE` to `"rubric"` on SAFETY gates (audits +
snapshot-diff: the numbers barely move) with the blend weight raised to
0.55 (market-dominant) precisely because no Phase B signal beat the
market. That is a defensible ARCHITECTURE ship (one reversible value
door) but NOT a validity ship: the "ship gate: all four positions or
none" above remains UNMET and remains the bar for any "beats the market"
claim. Full reconciliation is logged in MODEL_LIVE_PLAN.md's progress
log under the value-pipe deviation entry. Do not read the flip as
Stage 3b/D2 being done; it is not.

## Stage 3b: Build the Forward Production projection · PARTIAL (rookie slice shipped)

PR #41 + #42 + #44 wired the rubric pipeline live for one specific
surface (the rookie-debut inflection card). Draft capital is in
`player_signals` (signal table populated for the first time);
`evaluate()` runs on each rookie and produces a point estimate,
variance band, confidence, and top contributions, surfaced in a
projection footer with a warning-tone caveat when the signal is
thin. The broader Stage 3b ambition (every player gets a Forward
Production projection consumable on every surface) remains ahead.

The work for the broader surface. Per the unification plan's Phase 3
sequencing:

1. Enrich the player resolver to merge: meta + market value + the
   Stage 1 opportunity signals + age + scheme + injury history.
   Missing fields are FLAGGED, not silently nulled (the unification
   plan's hard rule).
2. Implement the position rubrics as MODEL_CARD section 4 specifies.
   Bayesian-prior blend with market value per section 8.1.
3. Output a Forward Production number per player with a variance band.
4. Position-conditioned per the Stage 2 grounding: opportunity is a
   **projection prior**, never a value-scale multiplier. Same lesson
   as the data-disproven TE down-multiplier.

Gates (each must pass before Stage 3c surfaces this to users):
- Dynasty-canon-keeper CRITIQUE pass on each position rubric.
- Dynasty-assumption-auditor pass on the wired weights.
- Backtest against held-out seasons per MODEL_CARD section 9. Must
  beat the FantasyCalc-alone baseline on a forward-production loss
  function (per-position PPR-MAE) by a margin large enough to
  matter, with CIs.
- Snapshot-diff check: turning Forward Production on in shadow mode
  doesn't silently move standing calls in fixture leagues without
  the founder seeing what moved and why.

If a position rubric fails any gate, the position runs market-only
until it passes. We don't ship a position's Forward Production until
it survives.

## Stage 3c: Surface Forward Production on the hub · NARROW SLICE SHIPPED

PR #44 ships the rookie-debut card's projection footer (point
estimate, variance band, confidence, top evidence-stack
contributions). That is the first surface in the product that
carries a model-derived forward read with a CI band. The remainder
of Stage 3c (the in-season hub-wide surface below) is still ahead.

The in-season equivalent of the draft-time bank, recast around the
shipped projection:

- Per-player Forward Production with variance band on candidate
  cards, the inflection scorecard, and Coach context.
- "Forward Production banked" = sum of (your projected production
  for player X over horizon) - (market-projected production for
  player X over horizon), rolled up across the roster, updating
  weekly post-Sunday. This is the metric that survives the season.
- League leaderboard mirror (per-team Forward Production banked),
  the in-season twin of today's vs-ADP league bank. Box 2 of
  Principle 8 finally has its in-season half.
- Box 3 of Principle 8 (upcoming events that recalculate) ships
  here. Training camp landing, post-game weekly recalc, injury news,
  bye-week effects: all real signals that move Forward Production.

Gates: founder eyeball on a fixture league before public ship. The
"reads correctly" check is qualitative; the math has already passed
Stage 3b backtest.

## Stage 4: Re-cast the decision engine around Forward Production

The findings-doc thread-2 fix lands here, NOT before. Today's
construction trap (no flex-fill rule above earned_value baseline)
is a symptom of scoring against a market-relative target. Once
Forward Production exists, the standing call scores candidates by
"what is the projected production gap at this slot vs the
alternative," and the flex-fill question becomes natural: a flex WR
slot with realistic capacity 4 and current startable 3 has a
specific production gap, and a candidate's contribution to closing
that gap is what the rule rewards.

This stage replaces (or wraps) the hard-coded score bands in
`synthesize.ts` with a Forward Production gap calculation. The
shape:

1. Per roster, compute the projected production deployed per
   starting slot (current best startable per position, including
   flex assignment).
2. Per candidate, compute the marginal projected production gain
   if added to the roster, accounting for which slot they would
   start in (with position eligibility and flex rules).
3. Score = marginal projected production gain, possibly modulated
   by survival (current canonical) and saturation penalties.
4. The hard-coded "60-100 fill" / "55 flex-fill" / "45 earned-value"
   bands collapse into one principled signal.

Gates: dynasty-canon-keeper grounding on the new scoring rule.
Dynasty-assumption-auditor on the new weights. Snapshot-diff check
on a battery of fixture leagues (early-round, mid-draft, late-draft,
non-TEP, TEP, 1QB, SF) confirming the scoring doesn't silently
move the standing call AWAY from what a defensible build would do.
Per-fixture review against the founder's intuition before public
ship.

The non-TEP TE overweighting issue (findings doc, thread 2 nuance;
INVARIANTS.md:192) closes naturally here: with TE production
projected per the position-conditioned rubric, a falling non-TEP TE
no longer wins on ADP gap because his projected production is
modest. No special-case multiplier needed.

## Stage 5: Forward Value (parked; unlock conditions defined)

Forward Value remains parked, with the conditions for unparking
recorded so a future session does not relitigate them.

Unlock conditions (per Stage 2b resolution in
`project_rookie_vs_sophomore_valuation`):

- More KTC snapshots ingested (current corpus 2022-2024, sample
  size is the limiter).
- A clean shallow-tier slice (current backtest is the deep tier
  100-280, where the market is most efficient).
- A methodology audit (rank-controlled residualization across
  positions and ages).
- A cleaner value metric than forward PPR (production is not value;
  value is what the market will pay, the thing we already buy at
  current market on FantasyCalc).
- All four met, plus a dynasty-canon-keeper CRITIQUE pass on the
  Forward Value definition AND a dynasty-assumption-auditor pass
  on the wired weights, before any chrome surface promises Forward
  Value to a user.

When unlocked, Forward Value attaches to the rubric output's
`market_delta` and gets a surface (per-player "model says +N vs
market"). Until then, the product holds no opinion on Forward
Value, and the chrome reflects that by not naming it.

---

## What we explicitly will NOT do

- Use the bare word "EV" in chrome going forward.
- Promise Forward Value or Forward Production before each one passes
  its named gate.
- Bolt a "proven" or "rookie" or "TE non-TEP" multiplier onto the
  market value scale. Stage 2 grounding (2026-05-25) ruled this out
  per Brill-Wyner 2024 and the data-disproven TE down-multiplier.
- Ship Stage 3b without canon-keeper + assumption-auditor passes.
- Ship Stage 4 (decision engine re-cast) before Stage 3c (Forward
  Production surfaces). The user has to be able to see the metric
  before the engine scores against it.
- Retrospectively rewrite shipped changelog entries to remove "EV."
  Historical entries describe what shipped using the term used then;
  the present ship entry names the rename.

## Sequencing summary

```
[Stage 0: kill EV label in chrome]        SESSION 2026-05-26 (this one)
[Stage 2c: ADP-vs-trade-value surface]    NEXT
[Stage 3a: pick Forward Production target] founder decision
[Stage 3b: build Forward Production]      gated work, ~weeks
[Stage 3c: surface Forward Production]    after 3b gates pass
[Stage 4: re-cast scoring]                after 3c
[Stage 5: Forward Value]                  parked until unlock
```

Phases 0, 1, 2, 4 of the unification plan (correctness +
consolidation: posture fix, one-snapshot-per-request, age-curve
canonical, Coach mirror) ship in parallel and are independent of
the data-acquisition gates above.

## How a future session reads this doc

A session asked to "fix the construction trap," "make EV
forward-looking," "add EV to the standings table," or "promise our
model beats the market" reads this file first. If the work matches a
parked stage, the answer is "not yet, here are the gates."
If the work is in scope, the answer is "yes, here is which stage."
If the work matches an item under "What we explicitly will NOT do,"
the answer is "no, here is why."

The protocol is the same as the unification plan: read, align, ship.
Not: ship, react, repeat.
