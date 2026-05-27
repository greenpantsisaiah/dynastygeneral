# Truth Audit, 2026-05-26 (Phase A of `MODEL_LIVE_PLAN.md`)

Read-only audit run from this worktree, against production Supabase
(2026-05-26). The data behind every claim below is:

- `scripts/audit-signal-coverage.ts` (this audit's script).
- Full output in `data/audits/signal-coverage-2026-05-26.txt`.
- Static analysis of `src/lib/engine/evaluation/rubrics/*` against the
  populated columns.

The point of Phase A is to size Phase B and Phase C honestly, not to
ship code. The headline below sets Phase B priorities.

## Headline

The rubric (`src/lib/engine/evaluation/`) is wired the way the docs
describe, and the `player_signals` / `team_signals` tables exist and
carry rows. They do not carry the SIGNALS THE RUBRIC ACTUALLY READS.

Concretely:
- The 2026-05-26 ingest (PR #41, `scripts/ingest-unlock-signals.ts`)
  filled 1,752 rows of `player_signals` with `draft_pick_no` /
  `draft_round` / `ras` / `weight_lb` / `height_in` / `position` /
  `team`. NONE of those columns are read by any position rubric.
- The columns the rubric DOES read are mostly NULL. Three of four
  position rubrics (WR, QB, TE), in production today, are functionally
  market prior + age. Every other branch reads an empty column.
- The one exception: RB rubric reads `rb_role_tier` (71% of RBs are
  populated, from the earlier `ingest-player-signals.ts` snap-derived
  pass). That gives RB the only second signal in production.

This explains the existing RB calibration result (`lift -0.028`
against KTC). The rubric had almost nothing to add to the market. It
also predicts WR / TE / QB backtests will show similar or worse
lift on the current data, because their reads are entirely empty.

The fix is data acquisition. The rubric code is fine. Phase B's job
is to fill the columns the rubric reads, not to add new signals to
the rubric.

## A1: Coverage matrix

Source data: `data/audits/signal-coverage-2026-05-26.txt`.

### Table size

| Table | Rows | Status |
|---|---|---|
| `player_signals` | 1,925 | Populated by two ingestions: `ingest-player-signals` (173 rows) + `ingest-unlock-signals@2026-05-26` (1,752 rows). |
| `team_signals` | 32 | All 32 NFL teams present; only `ol_continuity_score` is populated. |
| `player_health` | 0 | Empty. |
| `historical_signal_codes` | 728 | Backtest-only (memory note 2026-05-23). |
| `historical_outcomes` | 3,877 | Backtest-only. |

### player_signals column population (all positions, 1,925 rows)

| Column | % populated | Notes |
|---|---:|---|
| position | 100% | QB:276, RB:516, WR:746, TE:387 |
| team | 31.1% | Most rows have null team |
| age | **0%** | Empty in `player_signals`. Rubrics fall back to `ctx.age` from Sleeper. |
| snap_share_prior_year | 31.7% | From earlier `ingest-player-signals` |
| route_participation_prior_year | **0%** | |
| target_share_prior_year | 31.1% | From earlier `ingest-player-signals` |
| rush_share_prior_year | 31.1% | From earlier `ingest-player-signals` |
| weighted_opportunity_prior_year | **0%** | Load-bearing per MODEL_CARD RB rubric |
| high_value_touches_prior_year | **0%** | |
| yprr_prior_year | **0%** | Load-bearing per MODEL_CARD WR rubric |
| adot_prior_year | **0%** | |
| epa_per_play_prior_year | **0%** | Load-bearing per MODEL_CARD QB / WR |
| cpoe_prior_year | **0%** | Load-bearing per MODEL_CARD QB |
| draft_round | 76.5% | From 2026-05-26 ingest |
| draft_pick_no | 76.5% | From 2026-05-26 ingest |
| ras | 69.9% | Athletic composite, not Platte score |
| college_dominator | **0%** | |
| breakout_age | **0%** | |
| weight_lb | 59.2% | From combine ingest |
| height_in | 59.2% | From combine ingest |
| contract_years_remaining | **0%** | |
| recent_extension_flag | **0%** | |
| contract_year_flag | **0%** | |
| rb_role_tier | 19.1% (71.1% of RBs) | Snap-derived |
| rb_traded_offseason_flag | **0%** | |
| rb_role_at_new_team_projected | **0%** | |
| rb_passdown_share_prior_year | **0%** | |
| compounding_news_count | 100% present, all `0` | Default value, no real data |

### team_signals column population (32 teams)

| Column | % populated | Notes |
|---|---:|---|
| ol_continuity_score | 100% | Range 0.72 - 1.00. From snap-counts derivation. |
| ol_grade_run | **0%** | PFF-blocked, no proxy ingested |
| ol_grade_pass | **0%** | PFF-blocked, no proxy ingested |
| rookie_ol_starters_count | 100% present, all `0` | Default |
| rookie_ol_position_breakdown | **0%** | |
| hc_id | **0%** | |
| hc_first_time_flag | **0%** | |
| hc_tenure_yrs | **0%** | |
| hc_background_tag | **0%** | |
| oc_id | **0%** | |
| oc_tenure_yrs | **0%** | Load-bearing per MODEL_CARD QB / TE |
| oc_first_year_with_team_flag | **0%** | |
| scheme_tag | **0%** | Load-bearing per MODEL_CARD WR |
| staff_novelty_composite | 100% present, all `0` | Default |
| scheme_pace | **0%** | |
| pass_rate_neutral | **0%** | Load-bearing per MODEL_CARD WR |
| personnel_12_rate | **0%** | Load-bearing per MODEL_CARD TE |

### The four-disagreeing-definitions reconciliation

Investigated. The picture is sharper than "4 disagreeing
definitions": the SQL schema and the rubric reads are different
spec documents.

- SQL `0009_signals.sql` defines 29 columns on `player_signals`.
- TS `PlayerSignalsRow` in `src/lib/signals/schema.ts:77-94` exposes
  15 of them (the manual / transition subset). The wide-read shape
  `PlayerSignalsRowWide` in `src/lib/players/player-signals.ts:31-46`
  selectively adds 13 more columns the rubric actually reads.
- `scripts/ingest-unlock-signals.ts` writes 6 columns: position,
  draft_pick_no, draft_round, ras, source_attribution,
  confidence_per_field.
- `scripts/ingest-player-signals.ts` (the older, run for the snap-
  derived rb_role_tier pass) writes a different overlapping set.
- The rubric code reads what's documented in A2 below; that set
  intersects the populated set in only 2 places (`rb_role_tier`,
  `ol_continuity_score`).

The reconciliation work itself is Phase C2 (EnrichedPlayer resolver).
The right time to collapse the 4 spec documents into one is when we
build the canonical resolver.

## A2: Rubric read map

What each position rubric actually reads from `EvaluationContext`,
cross-checked against the A1 coverage. Source:
`src/lib/engine/evaluation/rubrics/{qb,rb,wr,te}.ts`.

### Universal (all rubrics)

- `ctx.ktc_value` -> prior, blended into `point_estimate` at the end.
- `ctx.adp`, `ctx.search_rank` -> prior fallback cascade.
- `ctx.age` (Sleeper) -> position-specific age multiplier.

### RB rubric (`rb.ts`)

| Signal read | Column | Live coverage | Live status |
|---|---|---|---|
| rb_role_tier (HARD GATE) | player_signals.rb_role_tier | 71% of RBs | LIVE for most RBs |
| ol_continuity_score | team_signals.ol_continuity_score | 100% | LIVE |
| rookie_ol_starters_count >= 2 | team_signals.rookie_ol_starters_count | 100% but always 0 | DEAD (default value) |
| compounding_news_count >= 3 | player_signals.compounding_news_count | 100% but always 0 | DEAD |
| rb_traded_offseason_flag | player_signals.rb_traded_offseason_flag | 0% | DEAD |
| rb_role_at_new_team_projected | player_signals.rb_role_at_new_team_projected | 0% | DEAD |
| staff_novelty_composite >= 2 | team_signals.staff_novelty_composite | 100% but always 0 | DEAD |
| contract_year_flag | player_signals.contract_year_flag | 0% | DEAD |

**Live RB rubric in production = market prior + age + rb_role_tier (71% of RBs) + ol_continuity. Everything else reads NULL.**

### WR rubric (`wr.ts`)

| Signal read | Column | Live coverage | Live status |
|---|---|---|---|
| scheme_tag (pass-heavy bonus) | team_signals.scheme_tag | 0% | DEAD |
| pass_rate_neutral | team_signals.pass_rate_neutral | 0% | DEAD |
| is_rookie + pass-heavy scheme | (composite) | DEAD (scheme empty) | DEAD |
| compounding_news_count >= 3 | player_signals.compounding_news_count | 100% but always 0 | DEAD |
| staff_novelty_composite >= 2 | team_signals.staff_novelty_composite | 100% but always 0 | DEAD |
| contract_year_flag | player_signals.contract_year_flag | 0% | DEAD |

**Live WR rubric = market prior + age + rookie band-modifier. Nothing else fires.**

The corpus says target_share + YPRR are the load-bearing WR signals
(MODEL_CARD 4.3). The rubric code does NOT READ those columns at all.
Even when they get populated, the WR rubric needs a code change to
consume them.

### QB rubric (`qb.ts`)

| Signal read | Column | Live coverage | Live status |
|---|---|---|---|
| tier classification | from ktc_value | LIVE | LIVE |
| scheme_tag (late-round-QB-hit gate) | team_signals.scheme_tag | 0% | DEAD |
| oc_tenure_yrs (continuity bonus) | team_signals.oc_tenure_yrs | 0% | DEAD |
| oc_first_year_with_team_flag | team_signals.oc_first_year_with_team_flag | 0% | DEAD |
| ol_grade_pass | team_signals.ol_grade_pass | 0% | DEAD |
| compounding_news_count >= 3 | player_signals.compounding_news_count | 100% but always 0 | DEAD |
| hc_first_time_flag (tier-1 variance) | team_signals.hc_first_time_flag | 0% | DEAD |

**Live QB rubric = market prior + tier + age. Nothing else fires.**

MODEL_CARD 4.1 says cpoe + epa_per_play + rushing_share are the
load-bearing QB signals. None of them are read by the rubric code,
and the columns that exist (cpoe_prior_year, epa_per_play_prior_year)
are empty.

### TE rubric (`te.ts`)

| Signal read | Column | Live coverage | Live status |
|---|---|---|---|
| personnel_12_rate (load-bearing) | team_signals.personnel_12_rate | 0% | DEAD |
| oc_tenure_yrs | team_signals.oc_tenure_yrs | 0% | DEAD |
| oc_first_year_with_team_flag | team_signals.oc_first_year_with_team_flag | 0% | DEAD |
| years_exp >= 2 + 12-personnel | (composite) | DEAD (12-personnel empty) | DEAD |
| compounding_news_count >= 3 | player_signals.compounding_news_count | 100% but always 0 | DEAD |

**Live TE rubric = market prior + age + years_exp rookie penalty. The load-bearing 12-personnel signal never fires.**

### The non-overlap

The rubric reads do not overlap with what got ingested in
2026-05-26. The 1,752 newly-populated rows have draft_pick_no,
draft_round, ras, weight_lb, height_in, position, team. The rubric
code reads NONE of those. (The rookie-debut inflection card reads
draft_pick_no, which is why PR #44 lit up. The decision-engine path
does not.)

This is the gap between the architecture audit ("populate
player_signals, wire evaluate() everywhere") and the metrics audit
("the rubric needs THESE signals to lift over market"). The plan
that ships the model has to close both gaps: populate the columns
the rubric reads (Phase B), and either teach the rubric to read the
columns we have populated already (Phase D2 work) or both.

## A3: Signal-coverage telemetry (deferred decision recorded)

Originally scoped as a code change extending `evaluate()`'s return
shape with a `signal_coverage` field surfaced on `/admin/evaluate`.
Deferred to Phase C2 (EnrichedPlayer resolver) where flagging-not-
silent-nulls is the foundational contract.

Why: A3's purpose was "make the prior-driven cases honest." A1
already shows that today, three of four position rubrics are
prior-driven for ~every player (no signals fire). Telemetry inside
`evaluate()` would surface a flat "all prior-driven" status until
Phase B fills the columns. The honest framing already lives in
`isRubricPriorDriven()` (`evaluation/wiring.ts:69`), which the
rookie-debut card consumes and the inflection panel renders as a
"Mostly prior-driven" caveat. That covers the live consumer set.

The richer telemetry (per-signal-evidence presence + per-position
coverage rollup) belongs on the EnrichedPlayer resolver because
that resolver is where the "flag missing fields, do not silently
null" rule is locked, per ARCHITECTURE_UNIFICATION_PLAN.md Phase 3b.

## A4: Per-position backtests (closeout 2026-05-27)

Closed out by a parallel Warp tab on 2026-05-27. The RB scripts were
hydrated from branch `work/s-260523-135829-29809`; a position-
parameterized cohort builder (`src/lib/signals/position-cohort.ts`)
was added to size the WR / TE / QB harnesses against the SAME shape
the RB cohort uses. All four backtests are first-time runs against
the now-populated `player_signals` (post the 2026-05-26 ingest).

Loss function: Spearman rank correlation between the position
rubric's `point_estimate` and realized season-Y PPR points-per-game
(games_played >= 6). Decision years: 2023 + 2024 (pooled). Market
baseline: KTC value from the historical snapshot dated <= Sep 15 of
year Y (`historical_market_values`, 1qb format, the modal market in
the cohort). Cohort built from nflverse usage signals for Y-1 (per
VALIDATION_PLAN section 4 temporal blinding) plus xwalk birth_year
(age) and xwalk draft_year (years_exp / is_rookie). 95% CI of the
lift is bootstrap (1000 iters, mulberry32 PRNG, deterministic
seed=42, sampling rows with replacement across pooled years).

Outputs in `data/audits/backtest-{rb,wr,te,qb}-2026-05-27.txt`.

### Per-position results

| Position | n (2023+2024 pooled) | Market (KTC) Spearman | Rubric Spearman | Lift | 95% CI of lift | Primary signals that fired | Interpretation |
|---|---:|---:|---:|---:|---|---|---|
| RB | 129 | 0.717 | 0.689 | -0.028 | [-0.063, 0.006] | `rb_role_tier` (snap-derived, ~71% of RBs), `ol_continuity_score` (100%), age curve (100%); compounding_news / traded / staff_novelty / rookie_ol / contract_year all DEAD | Matches prior baseline (memory note 2026-05-23: market 0.7181 / rubric 0.6918 / lift -0.0263 on n=129) to 0.001. Phase A prediction confirmed: the 2026-05-26 ingest filled columns the rubric does not read (draft_pick_no, ras, weight, height), so lift did not move. CI straddles zero; the rubric is statistically indistinguishable from the market. |
| WR | 220 | 0.744 | 0.734 | -0.010 | [-0.021, -0.003] | Age curve (100%), `is_rookie` band-modifier (rookies only); scheme_tag / pass_rate_neutral / compounding_news / staff_novelty / contract_year all DEAD | First-time backtest. The age curve plus a wider band for rookies mildly DEGRADES the rank vs market. CI excludes zero on the negative side: a small but real negative lift on free signals. Consistent with Phase A's prediction (the load-bearing WR signals target_share + YPRR are not read by the rubric code yet, even when populated). |
| TE | 94 | 0.728 | 0.719 | -0.009 | [-0.050, 0.026] | Age curve (100%), TE rookie penalty (`years_exp === 0` branch fires via xwalk draft_year), TE early-breakout flag (DEAD: needs personnel_12_rate); oc_tenure / compounding_news all DEAD | First-time backtest. CI straddles zero on a small cohort (n=94, smallest of the four). Year-by-year noisy (2023: -0.036; 2024: +0.018) suggests the rookie penalty branch can help or hurt depending on which rookies hit. Without `personnel_12_rate` the early-breakout arbitrage flag never fires. |
| QB | 70 | 0.781 | 0.709 | -0.072 | [-0.222, 0.012] | Tier classification from KTC (100%), tier-conditional age multiplier (100%); scheme_tag / oc_tenure / ol_grade_pass / hc_first_time_flag / compounding_news all DEAD | First-time backtest. n=70 is below the n>=100 floor the plan called for (the per-position cohort is bounded by how many QBs hit the 6-game floor with KTC + outcomes both present). CI is wide and overlaps zero. Year-by-year wildly different (2023: -0.158; 2024: +0.011); the tier-conditional age multipliers appear to be overcorrecting in 2023 (Tier-3 young QBs getting docked too hard or Tier-1 aging QBs getting kept too high). The QB rubric is the most signal-starved AND the smallest cohort. |

### Bootstrap CI methodology note

The 95% CI is the 2.5 / 97.5 percentile of the lift (rubric Spearman
minus market Spearman) distribution across 1000 bootstrap resamples
of the pooled cohort. Sampling with replacement at the player-record
level, holding both rubric and market scores fixed per record so
the resample preserves their joint distribution against outcome.
For positions where the CI straddles zero (RB, TE, QB), the
rubric's deviation from the market is not statistically distinguishable
from noise on the current sample size. WR's CI excludes zero on the
negative side, meaning the small negative lift is real.

### What the numbers tell us

The headline of this audit (A1 + A2: three of four rubrics are
functionally market + age in production because their columns are
0% populated) is empirically confirmed. No position rubric clears
the bar. RB has its one second signal (`rb_role_tier`) and still
sits at zero lift inside CI; WR / TE / QB have no second signal
that fires, and their lifts are negative-to-zero with CIs that span
or barely-exclude zero.

This is the gating evidence for Phase B (data acquisition) and
Phase D (rubric wiring). Without the columns the rubrics READ being
populated, no calibration of weights changes the answer (re-confirms
the 2026-05-23 RB calibration result: 729 weight combos, lift
within noise of zero). Phase A truth audit's Phase B priority list
stands.

Phase D2 (wiring evaluate() into live scoring) is BLOCKED on Phase
B delivering populated columns. Shipping the rubric live today
would, per these four backtests, mildly degrade WR rank quality
(-0.010 Spearman, CI excludes zero) and leave RB / TE / QB
indistinguishable from the market while complicating the surface.
No-half-the-product rule applies: Phase D ships when Phase B has
filled enough signals for ALL FOUR positions to clear the bar.

## A5: Value-source inventory across surfaces

What every player-value-consuming surface in the product actually
reads. Grep ran 2026-05-26 against the current worktree.

### `resolvePlayerValues` consumers (the FantasyCalc market passthrough)

| File | Surface | Notes |
|---|---|---|
| `src/app/leagues/[leagueId]/page.tsx:664` | Hub | Standing call + decision board reads |
| `src/app/leagues/[leagueId]/aar/page.tsx:25,492` | After-Action Review | Post-draft retrospective |
| `src/app/admin/evaluate/page.tsx:26,125` | Admin debug | Pairs FantasyCalc value with evaluate() output for comparison |
| `src/lib/engine/llm-contract.ts:27,325` | Coach pricing block | The `pricing.player_values` Coach reads for trade math |
| `src/lib/engine/context.ts:30,246` | Decision endpoints (/pick /trade /strategy) | Leak 2 in the architecture audit |
| `src/lib/strategy/draft-paths/project.ts:28,700` | Draft paths | Win-now/balanced/future lane projection |
| `src/lib/strategy/class-strength/compute.ts:29,136` | Class strength panel | Per-class overall value summary |
| `src/lib/strategy/decision-synthesis/priced-pool.ts:32,87` | Priced pool (THE pool the standing call ranks) | Powers every standing call on the hub + Coach |

EIGHT distinct consumers of the FantasyCalc passthrough. Two
consumers of `evaluate()` / `EvaluationOutput`: the hub (only for
the rookie-debut card) and the admin debug page. Phase G's lockdown
lint ("no value-consuming surface bypasses `evaluate()`") has to
migrate all eight to read through `EnrichedPlayer.value` (Phase C2)
which internally consults the rubric.

### `EvaluationOutput` consumers (the live rubric output today)

| File | Surface | Status |
|---|---|---|
| `src/app/leagues/[leagueId]/page.tsx:199,401,1048` | Hub | Computed for ROOKIES ONLY (`years_exp === 0`), rendered only on inflection rookie-debut card footer (PR #44) |
| `src/components/league/inflection-panel.tsx:19,34,256` | Inflection panel | Renders the rookie-debut projection footer; consumes `rubricByPlayerId` map handed down from the hub |
| `src/app/admin/evaluate/page.tsx:32,205` | Admin debug | Direct `evaluate()` call for one player at a time |

TWO live surfaces consume the rubric. Eight surfaces bypass it.
This is the "no half-the-product" rule's enforceable inventory.

## Phase B priority list (founder decision required)

The data the rubric needs to do its job, ordered by leverage. Each
item is a candidate Warp tab. Each ships as a separate `work/sig-*`
PR with the validate-first protocol (source -> ingest -> backtest
lift -> ship or shelve).

1. **32-row team coaching + scheme manual table.** Unblocks WR + QB
   + TE rubrics simultaneously (`scheme_tag`, `oc_tenure_yrs`,
   `oc_first_year_with_team_flag`, `hc_first_time_flag`,
   `hc_tenure_yrs`, `hc_background_tag`, `staff_novelty_composite`,
   `personnel_12_rate`, `pass_rate_neutral`). Founder + LLM coding,
   founder validates. HIGHEST LEVERAGE: this single 32-row write
   takes three rubrics from "market + age" to "market + age +
   real scheme signals."
2. **`compounding_news_count` from `historical_signal_codes`.** The
   row exists for 728 player-seasons in the backtest tables; join
   to current Sleeper player_id and write live values. The rubrics
   all read `>= 3` as an arbitrage trigger; today it's always 0.
   Cheap; no new acquisition. Note: only RB rows are coded
   (`historical_signal_codes` is RB-only); WR / QB / TE compounding-
   news coding is a separate manual track.
3. **`rb_role_tier` for remaining 29% of RBs.** Already 71%
   populated. Filling the gap is incremental, cheap. Bake-off
   between LLM extraction (`extract-historical-signals.ts`) and
   snap-derived; pick winner.
4. **OL signals (paid PFF decision OR continuity-only).** Today
   only `ol_continuity_score` is populated (100%). PFF `ol_grade_run`
   and `ol_grade_pass` are the corpus citation. Founder decides:
   spend on PFF, or drop the corresponding rubric weights.
5. **Volume / efficiency signals the rubric does NOT currently read
   but MODEL_CARD says are load-bearing**: target_share, yprr,
   weighted_opportunity, route_participation, cpoe, epa_per_play.
   These need a Phase D2 RUBRIC CODE CHANGE to consume them. They
   should not get acquired until D2 promises to read them. Bundle
   with each position's rubric-rewrite stream in Phase D.
6. **KTC snapshot ingest expansion.** Independent of the rubric;
   unlocks Forward Value (FORWARD_EV_PLAN Stage 5) and shallow-tier
   slicing for the eventual value backtest.

### Items NOT in the priority list (with reason)

- `route_participation` standalone scrape: blocked behind item 5
  (rubric doesn't read it; build the consumer first).
- College dominator / breakout age: blocked behind item 5.
- Health (`player_health` table empty): no rubric currently reads
  health. Deferred to a later wave.
- Contract signals (years_remaining, recent_extension_flag,
  contract_year_flag): the rubric reads `contract_year_flag`. Item
  for a Phase B tab if founder authorizes Spotrac scrape work.

## Phase C priority list (founder decision required)

Independent of Phase B data work. Each is a separate Warp tab on
`work/ctx-builder`, `work/enriched-player`, `work/age-canon`,
`work/coach-mirror`. Detail in MODEL_LIVE_PLAN.md Phase C.

Recommended order: C2 (EnrichedPlayer) first, because Phase D needs
its API surface; C1 in parallel; C3 (age canonical) needs canon-
keeper review so it can run alongside; C4 last because it depends
on C2's contract.

## What this audit changed in the plan

Three line-edits to `MODEL_LIVE_PLAN.md` Phase B follow from this
audit:

1. Phase B item 1 ("32-row team coaching/scheme manual table") is
   the top priority because it unblocks three rubrics at once.
   The plan listed it second.
2. The plan's Phase B item B7 ("vacated_te_role_flag") moves below
   the volume/efficiency signal track because the TE rubric does
   not yet read those signals from a populated column either way.
3. The plan's Phase B item B5 ("KTC snapshot ingest expansion") is
   confirmed independent of the rubric-data acquisition. Run when
   founder wants Forward Value unlock work to start.

## A6: founder reads this and picks Phase B + C order

The audit is done (A1 + A2 + A3 + A4 + A5). A4 closed 2026-05-27.
Phase B + C can both kick off in parallel from new Warp tabs the
moment the founder gives the priority order.

Recommended next move:

- Pick Phase B priority #1 (recommended: the 32-row coaching /
  scheme table). Spawn a `dg-new sig-scheme32` tab.
- Spawn a `dg-new enriched-player` tab for Phase C2 (the resolver
  that makes the Phase D wiring possible). Independent of Phase B's
  data work because EnrichedPlayer flags-missing rather than
  requires-populated.
- Spawn a `dg-new ctx-builder` tab for Phase C1 (the LeagueContext
  + Coach snapshot parity work).

The planning window (this tab) coordinates: it owns
`MODEL_LIVE_PLAN.md` + this file, green-lights phase transitions,
and absorbs per-tab deliverables.
