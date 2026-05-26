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

## Stage 2c: ADP-vs-trade-value divergence surface (NEXT shippable)

Per the `project_rookie_vs_sophomore_valuation` memory note: a neutral
surface that shows where Sleeper ADP and FantasyCalc trade value
disagree, surfacing the Mitchell-class divergence (early ADP, lower
trade value, or vice versa). Does NOT touch the value scale. Does NOT
need any forward projection. Greenlit. Shippable.

Why it goes here: it gives the user their first taste of "here is
where two market signals disagree, and here is who sits in the gap,"
which is the conceptual on-ramp to a forthcoming "here is where the
model would diverge from the market when the model lands." Low-risk
warmup for the bigger metric-side ship.

Gate: build + test green. Manual exercise on a fixture league showing
the Mitchell case (early Sleeper ADP, low FantasyCalc value) and the
inverse.

## Stage 3a: Pick the Forward Production target (founder decision)

Before any code, founder records:

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

## Stage 3b: Build the Forward Production projection

The work. Per the unification plan's Phase 3 sequencing:

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

## Stage 3c: Surface Forward Production on the hub

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
