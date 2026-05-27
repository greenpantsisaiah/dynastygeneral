# Dynasty General · Model Live Plan (locked)

Locked 2026-05-26 by founder direction: "the core insight we have of
better data isn't actually fully researched, wired, and deployed. So
the product is mostly using available data, not our refined, improved
model that we claim beats the MIT standard. I need this shipped... but
we also have to do it RIGHT. Rock solid. No fallbacks. No half the
product uses it the other half doesn't."

This file is the multi-session ORCHESTRATION plan. It coordinates the
existing locked plans rather than replacing them:

- `ARCHITECTURE_UNIFICATION_PLAN.md` (the spine: one EnrichedPlayer,
  one snapshot per request, one expertise grade, one Coach mirror).
- `FORWARD_EV_PLAN.md` (the metrics-side companion: Value vs ADP today;
  Forward Production as the build target; Forward Value parked).
- `MODEL_CARD.md` (the rubric specification, weights, signals).
- `DATA_ACQUISITION_PHASE3.md` (the data plan for `player_signals` /
  `team_signals`).
- `VALIDATION_PLAN.md` (the three tests, the public scoreboard, the
  drop-dead schedule).
- `BUILD_PLAN.md` (the historical sequence; phases here supersede its
  ordering where they conflict).

Protocol when this file disagrees with intent: re-read it, ask the
founder, do not ship the drift. Same protocol the other plans use.

---

## Premise (the honest diagnosis)

What the brand promises today: an analyst-grade dynasty model with
MIT-grade statistical floor (Principle 0), one root pool of data and
expertise, every user-visible number backed by evidence on tap.

What the product actually does today, end-to-end:

1. The board's value is a FantasyCalc passthrough. `resolvePlayerValues`
   normalizes 0-100 with only a TEP multiplier, `rerankByConsensus`
   sorts tier-1 by that value. Live FantasyCalc matches our shown
   values to the integer (verified 2026-05-24, Adonai Mitchell case).
2. The expertise (`src/lib/engine/evaluation/`, four position rubrics,
   Bayesian prior blend, variance bands, evidence stacks) is built and
   shipped to one narrow surface only: the rookie-debut inflection card
   footer (PR #44). Every other value-consuming surface bypasses it.
3. `player_signals` and `team_signals` are populated for the FIRST TIME
   as of 2026-05-26 (PR #41, `scripts/ingest-unlock-signals.ts`,
   1,752 skill-position rows with draft capital + an athletic
   composite). Most rubric signals remain unpopulated (team coaching /
   scheme, route participation, role tiers, target/snap-derived
   priors).
4. The one position we have backtested with current free signals (RB)
   lost to the market: Spearman 0.717 (market KTC) vs 0.689 (rubric);
   lift -0.028. Calibration (729 weight combos) confirmed the limit is
   the SIGNALS, not the weights; even optimal weights only matched the
   market.
5. WR, TE, QB have NOT been backtested with the rubric. We do not yet
   know if they would clear the bar either.
6. The decision engine (`synthesize.ts`) scores against market value +
   ADP gap + hardcoded score bands, with no flex-fill rule. This is
   the construction trap (FINDINGS 2026-05-25): EV-rich, WR/RB-poor,
   QB/TE-deep rosters by construction. The fix per `FORWARD_EV_PLAN.md`
   is Stage 4, AFTER Forward Production exists, because the right shape
   is "scored against projected production gap," not "another hardcoded
   band."
7. Coach has acknowledged leaks (posture fixed PR #16; parallel engine
   in /pick /trade /strategy not fixed; Coach snapshot built without
   `lastSeasonStats + projections` not fixed; mirror lint at field-name
   string level, not object-parity level).

The user's recurring symptomatic break-fix (EV paradox, Adonai Mitchell
ranking, Coach not pulling from the right data) traces to the same
root: the model we claim to ship is not the model that's actually live.

This plan ships it.

---

## The shape (one ship, parallel streams converging)

The user runs many Warp sessions concurrently and explicitly wants the
work parallelized. The shape:

- One short SEQUENTIAL truth-audit phase (Phase A) sizes the rest.
- Two PARALLEL streams (Phase B data, Phase C architecture) run for
  ~3 weeks; they touch different files so worktrees don't collide.
- Phase D (Forward Production) is a CONVERGING phase: needs the
  data (B) and the EnrichedPlayer + Coach mirror (C) to exist. Inside
  D, the four position rubrics run as parallel work-streams, but they
  ship together (founder rule: no half-the-product).
- Phase E (engine re-cast) is sequential after D. It changes the
  numbers the user sees.
- Phase F (validation + scoreboard) runs alongside the back half of E
  and tails after the public ship.
- Phase G (cleanup + lockdown) is post-ship.

Branch convention from AGENTS.md: each session works on
`work/<name>` in its own worktree spawned via `dg-new <name>`. Branch
names below are suggested; the launcher picks the actual slug. Never
commit to `main`; ship via squash-merge PR.

```
Week 1:                A
Weeks 2-4:             B-streams (data) || C-streams (architecture)
Weeks 4-8:             D (Forward Production, 4 position streams converging)
Weeks 8-9:             E (decision engine re-cast)
Weeks 9-12:            F (validation + public scoreboard) and G (cleanup) tail
```

Total wall time: 10-13 weeks for the rock-solid version. Founder
controls the calendar. The plan does NOT compress quality for speed.

---

## Phase A: Truth audit (one session, 2-3 days)

The blocker that hides everything else: we do not have honest, current
numbers on what is wired, what is populated, and what the rubric can
actually do across positions. Phase A produces that ground truth and
unblocks the parallel streams.

ONE worktree, ONE session, sequential. Read-only against prod (script
runs against the populated tables, no writes). Produces ONE doc.

- **A1. Coverage matrix.** For every column on `player_signals`,
  `team_signals`, `player_health`: row count, populated count, percent
  populated, distribution summary, last_updated. Same for the
  derived inflection inputs (`build-inputs.ts:27-34`). One CSV one
  table. The "4 disagreeing definitions of player_signals" (SQL schema
  vs TS type `PlayerSignalsRow` vs `ingest-unlock-signals.ts` vs the
  rubric's actual reads) ALL get rendered in the same matrix so they
  can be reconciled.
- **A2. Rubric read map.** Static analysis: what does each position
  rubric in `src/lib/engine/evaluation/rubrics/` read? What signals
  does it ignore? Cross-reference against A1 to compute per-position
  signal coverage: "RB rubric reads N signals; M are populated;
  K are null; the K rely on Bayesian prior." Honest number per
  position.
- **A3. Signal-coverage telemetry.** Add a coverage breakdown to
  `evaluate()`'s return shape (counts of populated/null signals,
  evidence-stack basis tags from `isRubricPriorDriven`). Wire it into
  an admin debug surface (extending `/admin/evaluate`) so per-player
  coverage is visible. Behavior-preserving for live surfaces.
- **A4. Per-position backtests.** Re-run RB rubric against the current
  populated `player_signals` (the 2026-05-26 ingest fills new
  columns, so the result may differ from the 2026-05-24 -0.028 lift).
  Run WR rubric, TE rubric, QB rubric for the first time. Same loss
  function as the existing scripts (Spearman vs forward PPR, n>=100
  per position-season). One table per position: market baseline,
  rubric current, lift, p-value, confidence interval. THIS table
  sizes Phase B.
- **A5. Value-source inventory.** Every surface in the product that
  asks "what is this player worth / what's its score / what's the
  rank": list the call site, the function it calls, and the value
  source it ultimately resolves to (FantasyCalc passthrough vs
  evaluate() vs a coarse heuristic). The "no half-the-product" rule
  needs this inventory to be enforceable.

DELIVERABLE: `TRUTH_AUDIT_2026_05_26.md` (or current date) in the repo
root. Contains A1 matrix, A2 read map, A4 backtest table, A5 inventory.
Becomes the single source of truth for "where are we today" for the
rest of this push.

GATE: founder reads it. Phase B and Phase C only kick off once A4
gives a per-position verdict.

---

## Phase B: Data acquisition + validation (parallel, weeks 2-4)

Goal: fill the signals the per-position backtest says will lift the
rubric over the market, by an operationally meaningful margin, gated by
validate-first. Per founder direction in `ARCHITECTURE_UNIFICATION_PLAN`
issue #34: targeted + validate-first, not another free-source sweep.

EACH SIGNAL IS A SEPARATE WORKTREE. Up to 4-6 concurrent Warp sessions.
A signal is its own four-step PR:

- B.N.1: source the data (manual table, LLM extraction, free CSV,
  paid feed). Write the ingestion script following the established
  pattern (`scripts/ingest-historical-outcomes.ts`,
  `scripts/ingest-unlock-signals.ts`): dry-run default, explicit
  `--write` flag, chunked upserts, per-row `source_attribution`, log
  unmatched rows.
- B.N.2: land it in `player_signals` / `team_signals`. Founder-
  authorized production write (the only Supabase instance available).
- B.N.3: re-run the position's backtest WITH the new signal added.
  Record lift vs the A4 baseline. Same script, same loss function,
  same temporal-blinding protocol from `VALIDATION_PLAN.md` section 4.
- B.N.4: decision recorded in the PR description. Lift clears the
  bar -> signal ships, gets a row in the coverage matrix. Lift does
  not clear -> signal is logged in `negative-results.md`, the table
  rows can stay (no harm) but the rubric weight stays at the prior.

Candidate signals (ordered by founder-suggested priority per the
existing `DATA_MODEL_INTEGRITY.md` and issue #34; final order depends
on Phase A4 verdict):

- **B1. 32-row team coaching / scheme table (manual + LLM).** Founder
  hand-codes (or LLM-extracts and founder validates) the 32 team rows
  for `oc_id`, `oc_tenure_yrs`, `oc_first_year_with_team_flag`,
  `scheme_tag`, `pass_rate_neutral`, `personnel_12_rate`, `hc_*`,
  `staff_novelty_composite`. The TE / WR / QB rubrics read these.
  Unblocks all three positions if A4 said they need it.
- **B2. rb_role_tier (LLM-extracted vs snap-derived).** A backtest
  bake-off: the existing snap-derived tier (from
  `src/lib/signals/nflverse.ts`) vs a `historical-signal-extractor`
  LLM coding. Winner takes the column. The RB rubric uses
  `rb_role_tier` as a HARD GATE per MODEL_CARD 4.2 v1.
- **B3. Route participation per WR / TE.** Derivable from nflverse
  `pbp_participation` (free, free, CC-BY). Engineering cost: medium
  (pbp aggregation pipeline). TE rubric needs it as a hard threshold
  floor (60 percent route rate per MODEL_CARD 4.4).
- **B4. Compounding-news count (already in `historical_signal_codes`
  for backtest).** Wire into runtime by joining `historical_signal_codes`
  to current players. Cheap, populated for backtest already. Per the
  audit, this is a "siloed data already collected" connect, not new
  acquisition.
- **B5. KTC snapshot ingest expansion.** Per Forward Value unlock
  conditions in FORWARD_EV_PLAN Stage 5 + the rookie-vs-soph memory
  note. Acquire more KTC daily snapshots (current corpus 2022-2024).
  Does not block Phase D (Forward Production is production not value);
  does unlock the eventual Forward Value surface.
- **B6. Paid OL grades (PFF) decision.** Founder choice. Current free
  proxy is OL continuity from `snap_counts`; the rubric weights
  `ol_grade_run` / `ol_grade_pass` as separate from continuity. If
  Phase A4 says RB / WR need this to clear the bar, founder decides
  to spend (or scope-down the rubric to drop those weights).
- **B7. Route participation in passing sets (TE-specific) and
  `vacated_te_role_flag`.** Per MODEL_CARD 4.4. Manual coding plus
  pbp aggregation.

Out of scope for Phase B (deferred per
`DATA_ACQUISITION_PHASE3.md`):

- Breakout age / college dominator (CollegeFootballData pipeline; its
  own track later).
- Route participation via paid PFF (substitute with free pbp).
- nextgen_stats (parquet-only; defer).

PHASE B EXIT CRITERION: for each position rubric, signal coverage is
high enough (per Phase A4 backtest sensitivity analysis) that the
rubric is expected to clear the lift bar in Phase D. If a position's
signals cannot meet that bar with founder-authorized data spend, that
position is FLAGGED and Phase D will need a per-position decision on
whether to drop the rubric for that position (release blocker).

---

## Phase C: Architecture unification (parallel, weeks 2-4)

Goal: the four "ones" of `ARCHITECTURE_UNIFICATION_PLAN.md`. Without
them, Phase D ships rubric numbers that diverge across surfaces, and
Coach reads a third version. Phase D is not survivable on top of the
current architecture; Phase C is the prerequisite.

PARALLEL WITH B. Different files mostly. Each numbered item is its own
worktree.

- **C1. One snapshot per request (Phase 1 of unification plan).**
  Introduce a `LeagueContext` builder that runs snapshot + values +
  available pool + startable depth ONCE per request with the same
  inputs (including `lastSeasonStats + projections`) for hub AND
  Coach AND `/pick` AND `/trade` AND `/strategy`. Hub children
  (`draft-paths/project.ts`, `class-strength/compute.ts`) consume the
  handed-down context instead of re-resolving. Delete
  `inferStrategyFromRoster`; rewire `assembleContext` to consume the
  canonical `rankArchetypes + computeWindows` with real draft state.
  Closes Leak 2 + Leak 3 from the audit. Add lint banning direct
  `buildLeagueSnapshot` outside the builder boundary. Register in
  `CANONICAL_SOURCES.md`.
- **C2. EnrichedPlayer resolver (Phase 3b of unification plan). SHIPPED 2026-05-27.**
  Merge meta + value + `player_signals` + `team_signals` +
  `player_health` + inflection inputs into a single per-player
  resolver. Missing fields are FLAGGED (not silently nulled): the
  rubric and downstream consumers see "this signal is null because
  the data does not exist" not "this signal is null because the
  caller forgot to pass it." Both inflection builder paths
  (`from-snapshot.ts`, `context.ts`) consume it; the seven optional
  args in `build-inputs.ts` are supplied from one place. This is
  the FOUNDATION Phase D wires `evaluate()` over.
  Delivered: `src/lib/players/enriched-player.ts`
  (`resolveEnrichedPlayer` + `resolveEnrichedPlayers` +
  `MissingFieldFlag`); `src/lib/players/player-health.ts`
  (`getPlayerHealthMap` + `isPlayerHealthTableEmpty`); inflection
  `from-snapshot.ts` + `engine/context.ts` migrated to consume the
  resolver (Leak 4 closed); the hub rookie-debut rubric path
  migrated as a first behavior-preserving consumer;
  `evals/enriched-player.test.ts` locks the four required cases plus
  the 9-arg inflection gap; canonical registered in
  CANONICAL_SOURCES.md and pillared in INVARIANTS.md.
  Deferred to Phase D + Phase G: the other seven `resolvePlayerValues`
  consumers from the A5 inventory (hub board, AAR, admin debug,
  `llm-contract.ts` Coach pricing, `engine/context.ts` decision
  endpoints, `draft-paths/project.ts`, `class-strength/compute.ts`,
  `priced-pool.ts`) migrate when their consumer surface is touched in
  Phase D wiring; the lockdown CI lint banning direct
  `resolvePlayerValues` reads ships in Phase G.
- **C3. One ageEffect canonical (Phase 2.3 of unification plan).**
  Three to four divergent age curves exist (`players/age-curve.ts`,
  `evaluation/util.ts`, `windows/compute.ts`, `synthesize.ts`). Pick
  the canonical shape (the rubric's Bayesian curve is the most
  defensible candidate per the unification plan); collapse the rest.
  NUMBER-CHANGING work: requires dynasty-canon-keeper CRITIQUE pass
  + dynasty-assumption-auditor pass + snapshot-diff check on fixture
  leagues before merging. Adds `evals/age-curve.test.ts` per position.
- **C4. Coach mirror parity (Phase 4 of unification plan).** Widen
  the mirror so every board-visible signal flows to Coach from the
  same computed object: posture (done), EV bank readout, inflections
  with data, engine-suggested plays. Strengthen `REQUIRED_IN_COACH`
  in `evals/anti-patterns.test.ts` from "field-name string present"
  to "same computed object referenced." Coach reads
  `LeagueContext` + `EnrichedPlayer`, never a forked build of either.
  This is the durable enforcement of [[feedback-coach-uses-exact-architecture]].

PHASE C EXIT CRITERION: every consumer of value, snapshot, or strategy
reads from one of the four "ones." A CI lint fails if a new surface
reaches around them. The architecture can support Phase D's wiring
without divergence.

---

## Phase D: Forward Production (weeks 4-8, gated, single ship)

Goal: every value-consuming surface in the product reads from
`evaluate()` via `EnrichedPlayer`, with Forward Production as the
new metric the UI surfaces. The thing the brand has been promising.

Cannot start until A is done, B has delivered the signals each
position needs (per A4 backtest), and C has shipped the
LeagueContext + EnrichedPlayer + Coach mirror. Phase D is itself a
multi-position parallel build with ONE CONVERGING SHIP.

- **D1. Founder decision: Stage 3a of `FORWARD_EV_PLAN.md`.** Record:
  - Horizon. Rest-of-season vs full-season vs multi-year cumulative.
  - Output shape. Point estimate + variance band (P25, P50, P75)
    expected per Principle 0; founder confirms band width and whether
    a probability distribution ships too.
  - Position conditioning. Confirm one rubric per position with the
    MODEL_CARD section 4 weights as the starting prior.
  - Update cadence. Daily / weekly post-Sunday-games / both.
  Recorded in this file or in a follow-up locked decision file. D2
  does not start until logged.
- **D2. Build position rubrics over the EnrichedPlayer resolver
  (Stage 3b).** Four parallel streams, one per position:
  - D2-QB
  - D2-RB
  - D2-WR
  - D2-TE
  Each stream wires its rubric to consume EnrichedPlayer fields,
  blends with the FantasyCalc market prior per MODEL_CARD section 8.1,
  outputs `{ point_estimate, variance_band, evidence_stack,
  market_delta, confidence, arbitrage_flags, signal_coverage }`. The
  `signal_coverage` field (from Phase A3 telemetry) makes "this read
  is prior-driven" visible in chrome.
- **D3. Per-position gate.** Each position must pass THREE gates
  before it can ship:
  - Backtest gate. Per VALIDATION_PLAN section 5: temporal-blinded
    backtest of the rubric vs the five named baselines on the
    position-specific loss function. Mandatory: beat naive-last-year
    and ADP autodraft. Target: beat KTC-only by an operationally
    meaningful margin (the VALIDATION_PLAN target is 8 percent RMSE
    reduction; the per-position floor is a positive lift with
    CI excluding zero).
  - Dynasty-canon-keeper CRITIQUE pass. Position rubric's weights
    and thresholds graded against `RESEARCH_CORPUS.md`; verdict
    Defensible.
  - Dynasty-assumption-auditor pass. Final wired weights audited;
    no Indefensible flags.
- **D4. Surface Forward Production on the hub (Stage 3c).** Per-
  player Forward Production with variance band on candidate cards,
  inflection scorecard, Coach context. The in-season equivalent of
  the draft-time Value vs ADP bank: Forward Production banked vs
  market-projected, rolled up across the roster, updating per the D1
  cadence. League leaderboard mirror (Principle 8 Box 2 in-season
  half). Box 3 upcoming events that recalculate (training camp
  landing, post-game weekly recalc, injury news, bye-week effects).
- **D5. Coach reads Forward Production.** Per
  [[feedback-coach-uses-exact-architecture]]: Coach consumes the same
  Forward Production fields the board renders, mirrored via the
  Phase C4 object-parity contract. System prompt rule references
  the fields by name. `REQUIRED_IN_COACH` extended.
- **D6. Snapshot-diff check on fixture leagues.** Run the full
  rubric pipeline in shadow mode against a battery of fixtures
  (early-round, mid-draft, late-draft, non-TEP, TEP, 1QB, SF,
  in-season week 6, week 12). Founder eyeballs the diffs: what moved,
  why. No public ship until the diffs read defensibly.

ROCK-SOLID GATE for Phase D ship: ALL FOUR POSITIONS clear all three
of D3's gates. If one position cannot clear after Phase B's signal
investment, founder decides one of:
- Spend more on data for that position (extends timeline).
- Ship the rubric for the three that cleared and explicitly disclose
  in chrome that position X reads the market prior (violates the
  no-half-the-product rule; surface as an honest caveat OR do not
  ship).
- Drop the rubric entirely for that position and re-scope what
  Forward Production means.
My recommendation: hold the ship until all four clear. The "no
half-the-product" rule the founder set means an all-or-nothing ship
is the consistent call. If one position is structurally
data-blocked, that becomes a release-blocker decision, NOT a
shipping-around-it decision.

NO FALLBACK paths once D ships. The "FantasyCalc passthrough" reads
that exist today across the product (the board sort, the value
displays, the Coach pricing block, the standings panel) all migrate
to read `evaluate(player)`. The FantasyCalc value remains the market
PRIOR consumed inside `evaluate()`; it stops being the leaf value
any surface ever reads directly. This is enforced by a CI lint in
Phase G.

---

## Phase E: Decision engine re-cast (weeks 8-9, gated)

Goal: `synthesize.ts`'s hardcoded score bands collapse into one
principled signal: marginal Forward Production gain per slot. The
construction trap (`FINDINGS_2026_05_25`) resolves naturally; the
TE-non-TEP scoring issue resolves naturally; no special-case
multipliers.

Cannot start until Phase D ships. Per `FORWARD_EV_PLAN.md`: "The
user has to be able to see the metric before the engine scores
against it."

- **E1. Per-roster projected production by slot.** Compute current
  best startable per position including flex assignment.
- **E2. Marginal Forward Production gain per candidate.** What does
  this candidate add to the user's projected production at the slot
  they would start in, accounting for position eligibility and flex
  rules.
- **E3. New decision score.** `score = marginal_production_gain`,
  modulated by `survivalPctFor` (canonical) and saturation penalties.
  The hardcoded bands (60-100 fill_starter, 55 flex-fill, 45
  earned_value) collapse into one signal. The `DecisionRule` enum
  retains its labels for evidence-stack rendering but the SCORE comes
  from the production math.
- **E4. Standing-call regression battery.** Replay every fixture
  league from Phase D6 through the new decision logic. Founder
  eyeballs every fixture's standing-call before public ship.
- **E5. Coach reads the new decision math.** Per the object-parity
  contract. No re-derivation in Coach. Phase D5 already wired
  Forward Production; E5 extends to the decision rule itself.
- **E6. Companion still respects the canonical.** The companion
  classifier (`classifyBeats`) consumes the new decision math via
  the same canonicals. No companion change needed at the math layer;
  Voice A phrasing may need a sweep so "Value vs ADP" framing in
  beats updates to Forward Production where applicable.

GATES: dynasty-canon-keeper grounding on the new scoring rule.
dynasty-assumption-auditor on the modulator weights. Snapshot-diff
check on fixtures. Per-fixture founder eyeball.

---

## Phase F: Validation + public scoreboard (weeks 9-12)

Goal: run the full `VALIDATION_PLAN.md` test suite against the wired
pipeline; publish the public scoreboard at
`dynastygeneral.app/scoreboard`; update `MODEL_CARD.md` section 12
with shipped weights and validation results.

- **F1. Test A (backtest).** Re-run the temporal-blinded backtest
  per VALIDATION_PLAN section 5 against the wired pipeline. Five
  baselines (naive-last-year, ADP autodraft, FantasyPros consensus,
  KTC-only, random-within-tier). Per-position RMSE. Variance band
  calibration plot. Mandatory: beat naive-last-year + ADP. Target:
  beat FantasyPros + KTC by an operationally meaningful margin.
- **F2. Test B (simulation).** 30 simulated leagues (10 redraft / 10
  dynasty startup / 10 keeper). Median percentile rank, top-3 finish
  rate. Per VALIDATION_PLAN section 6.
- **F3. Public scoreboard ship.** `dynastygeneral.app/scoreboard`
  is currently drafted with `robots: noindex`. Flip it live (founder
  approves). Methodology page (`data/scoreboard/methodology.md`)
  refreshed. Per VALIDATION_PLAN section 7.
- **F4. MODEL_CARD update.** Section 12 (validation results) filled.
  Section 4 weights updated from "v0 proposal" to shipped values per
  the backtest. Confidence claims throughout the doc align with what
  the tests actually showed (drop any aspirational phrasing).
- **F5. Stunt prep.** Decision log dashboard live
  (`dynastygeneral.app/log` or similar). Override budget rules
  pre-registered per VALIDATION_PLAN 9.3. AI-vs-AI reddit league
  recruitment scheduled. The August 16 stunt-start date is the
  outside deadline this push is implicitly racing.

---

## Phase G: Cleanup + lockdown (post-ship, ongoing)

Once D / E / F have shipped, lock the architecture so the next round
of break-fixes cannot re-introduce drift.

- **G1. Retire dead code paths.** Per the post-release usage-gated
  review in `ARCHITECTURE_UNIFICATION_PLAN.md`: are `/pick`, `/trade`,
  `/strategy` still live deep-links? If not, retire the routes (their
  parallel engine is already deleted by Phase C1). The admin
  `/admin/evaluate` debug page can become the live evidence-stack
  surface or retire; founder picks.
- **G2. The lockdown lint.** A CI rule: any new file that consumes a
  player value must import from `EnrichedPlayer` or call
  `evaluate(player)`. Direct reads of `resolvePlayerValues` outside
  the canonical resolver boundary fail CI. Direct reads of
  FantasyCalc raw values outside the prior consumption inside
  `evaluate()` fail CI. The MARKET stays as the prior; the SURFACE
  reads only the rubric.
- **G3. Documentation pass.**
  - `INVARIANTS.md`: add "the rubric is the canonical player-quality
    grade; the FantasyCalc prior is internal to it." Retire the
    "rubric is parked" doctrine. Add the no-fallback lint.
  - `CANONICAL_SOURCES.md`: register `EnrichedPlayer` + the wired
    `evaluate()` as the canonical player-quality grade.
  - `REDESIGN_INTENTIONS.md`: update Principle 8 to acknowledge
    Forward Production as the in-season metric. Mark FORWARD_EV_PLAN
    stages 3a-3c-4 as SHIPPED.
  - `MEMORY.md`: add a project note pointing to this file.
- **G4. Brand voice sweep.** Companion register, Coach prose, share
  cards, Library articles: any lingering "EV" references that
  Stage 0 missed get the rename per `feedback_kill_ev_label`.

---

## Decisions required from founder

These are the gates where the plan needs an explicit founder call
before the corresponding phase starts. None of these block Phase A.

1. **Phase B signal priority + data spend.** After A4 lands, founder
   decides which signals are in the validate-first queue and the
   budget for paid data (PFF OL grades is the leading candidate).
2. **Phase D1 (Stage 3a of FORWARD_EV_PLAN).** Horizon, output shape,
   position conditioning, update cadence. The recommended defaults
   per the locked plan are rest-of-season + point + P25/P50/P75
   band + position-conditioned + weekly post-Sunday-games. Founder
   confirms.
3. **Phase D3 release model.** Recommended call: all-four-positions
   or none. Founder confirms or chooses per-position with the
   no-half-the-product carve-out documented.
4. **Phase E4 ship gate.** Recommended call: hold the construction-
   trap fix until D ships. Founder confirms (this means user-visible
   symptom continues until E ships; the alternative is a stop-gap
   that violates FORWARD_EV_PLAN).
5. **Phase F3 scoreboard go-live timing.** When does
   `/scoreboard` flip from noindex to public? Tied to the public
   stunt timing.
6. **Phase F5 stunt commitments.** Confirm the five-league portfolio
   and the AI-vs-AI reddit league recruitment is on schedule, per
   the August 16 implicit outside deadline.
7. **Authorize production Supabase writes** for each signal-ingestion
   script Phase B produces, per the existing protocol (dry-run
   first, founder green-light before `--write`).

---

## What we explicitly will NOT do

- Ship the rubric on one position while other positions read
  FantasyCalc directly. No half-the-product.
- Ship Forward Production without all three D3 gates passed per
  position.
- Ship the engine re-cast (Phase E) before Forward Production
  exists. The user has to see the metric before the engine scores
  against it.
- Re-add fallback paths "just in case" once `evaluate()` is wired.
  The signal-coverage telemetry from Phase A3 is the in-product
  transparency; that is not a fallback.
- Patch the EV-paradox / construction-trap / Adonai Mitchell /
  Coach-not-pulling-data symptoms in flight. They all resolve in
  Phase D / E / C. Spending the symptom-fix budget here doubles the
  work.
- Touch user-facing chrome with bare "EV" (FORWARD_EV_PLAN Stage 0
  already shipped the rename; the rule is locked).
- Bolt a "proven" or "rookie" or "TE non-TEP" multiplier onto the
  FantasyCalc value scale. Stage 2 grounding (Brill-Wyner 2024
  reframing Massey-Thaler 2013) ruled this out; the
  data-disproven TE down-multiplier ruled it out twice.
- Promise Forward Value in chrome. Parked per Stage 5 unlock
  conditions in FORWARD_EV_PLAN.
- Run a "free nflverse sweep" hoping to find new signals. Per the
  RB calibration result (729 weight combos, no lift), the limit is
  the SIGNALS we already know are missing (paid OL grades, manual
  scheme coding, route participation). Throwing more free data at a
  rubric whose blind spots are paid signals is wasted effort.
- Shortcut the validate-first protocol on any signal in Phase B.
  Issue #34 doctrine stands: backtest BEFORE invest, every time.
- Run gpu-cycles or expensive Anthropic spend on Phase F validation
  in flight; respect the cost-watcher discipline.

---

## How a future session reads this doc

A session that lands in this repo with an instruction like:

- "Fix the EV bank label" -> already done in FORWARD_EV_PLAN Stage 0;
  if anything leaks, point at the leak and patch it; do not start a
  new sweep.
- "Wire evaluate() into the standing call" -> Phase D3 work. Read
  this file's Phase D and the FORWARD_EV_PLAN stage 3b/3c gates.
  Do not start without the D3 gates ready.
- "Fix the construction trap" -> Phase E work. Cannot start until
  Phase D has shipped.
- "Acquire more data" -> Phase B work. A new worktree per signal,
  the four-step protocol above.
- "Coach said something the board didn't say" -> the structural fix
  is Phase C4 (Coach mirror parity at object level). A symptom
  patch in the system prompt is short-lived; do not do it.
- "Backtest the rubric" -> Phase A4 work if Phase A hasn't shipped.
  Phase D3 work if Phase A has shipped and Phase B has delivered
  per-position signals. Phase F1 work if D has shipped.

Protocol: read, align, ship. Not: ship, react, repeat.

---

## Worktree + session orchestration (how the founder runs this)

Per AGENTS.md, each session opens its own worktree on a
`work/<name>` branch via `dg-new <name>` in Warp. The launcher
hardcodes the main worktree path; the session never touches `main`
or another session's worktree.

Recommended naming (the launcher picks the actual slug):

- Phase A: `dg-new audit`
- Phase B per signal: `dg-new sig-scheme32`, `dg-new sig-rb-role`,
  `dg-new sig-routes`, `dg-new sig-news-join`, `dg-new ktc-snapshots`,
  `dg-new sig-ol-grade` (founder authorizes paid)
- Phase C per item: `dg-new ctx-builder`, `dg-new enriched-player`,
  `dg-new age-canon`, `dg-new coach-mirror`
- Phase D per position: `dg-new rub-qb`, `dg-new rub-rb`,
  `dg-new rub-wr`, `dg-new rub-te`, then a converging
  `dg-new fwd-prod-ship`
- Phase E: `dg-new engine-recast`
- Phase F: `dg-new validation`, `dg-new scoreboard-ship`
- Phase G: `dg-new lockdown-lints`

Each session ships per the AGENTS.md "ship it" flow: build clean +
tests green; squash-merge PR to main; retire the worktree.

When two parallel streams need to touch the same file (rare; mostly
`CANONICAL_SOURCES.md`, `INVARIANTS.md`, this file): the session
that gets there first ships, the second rebases. Per the
"never destructive" rule in AGENTS.md, the second session resolves
the merge by reading what the first session shipped, not by
reverting.

The planning window (this Warp tab) coordinates: it owns this file,
green-lights phase transitions, and absorbs the per-phase deliverable
docs (Phase A's TRUTH_AUDIT, per-position backtest tables, per-signal
PR descriptions). It does NOT execute the parallel streams; the
spawned sessions do.

---

## Compression survival contract

This file lives at the repo root and is auto-loaded into every agent
session via AGENTS.md (add the `@MODEL_LIVE_PLAN.md` import to
AGENTS.md as the first action after this file ships, mirroring how
the other plans are loaded).

A memory note (project type) at `project_model_live_plan.md`
points at this file. The note is indexed in MEMORY.md.

A future session that is about to start parallel work reads this file
FIRST. If a structural drift is about to happen, the founder is
flagged before the change ships.

Read, align, ship. Not: ship, react, repeat.
