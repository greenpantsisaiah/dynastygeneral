# Dynasty General · Data-Model Integrity (findings + recommendations)

Written 2026-05-24 after the Phase 3 ingestion + the RB rubric backtest.
The founder asked for next steps on data-model integrity and whether to
do another scrape. This is the grounded answer. It survives compaction.

## The headline

More scraping of the FREE sources will not help the rubric. We already
have the free usage/draft/combine data, and the backtest shows it does
not beat the market prior (KTC) for RBs. The integrity problem is not
volume; it is that four different definitions of "player_signals"
disagree, and that the rubric's real inputs are signals free data cannot
supply. Fix the disagreement first; scrape only the specific signals a
validate-first test says will move the number.

## What the backtest proved

RB rubric vs KTC market prior, predicting realized PPR points-per-game,
decision years 2023 + 2024 (n=129):

- market (KTC) Spearman 0.717 ; rubric 0.689 ; **lift -0.028**.
- The rubric, fed the free-data signals (derived `rb_role_tier`, OL
  continuity, compounding-news, age), is slightly WORSE than KTC alone.
- The one positive: where the rubric disagrees UPWARD with the market
  (grade > KTC prior by >3), those RBs land at the 0.59-0.68 outcome
  percentile. There is real edge AT THE MARGIN, in the disagreements,
  not in the aggregate re-grade.

Caveats: n is small (2 years, one position); 2023's nearest KTC snapshot
was offseason (March), not preseason; PPG is one outcome of several
(future KTC value untested); the rubric's weights are un-backtested
guesses; `rb_role_tier` here is a snap-derived heuristic, not the
LLM-extracted tier the rubric was designed around.

Conclusion: do not wire `evaluate()` to REPLACE the market grade on
current data. The market is already a 0.72-Spearman predictor and the
rubric does not beat it on free signals.

### Calibration confirms: the limit is the signals, not the weights

`scripts/calibrate-rb-rubric.ts` grid-searched 729 weight combinations of
the (now parameterized) RB rubric against the same cohort, objective =
mean per-year Spearman:

- market (KTC): 0.7181
- rubric @ default weights: 0.6918 (lift -0.0263)
- rubric @ BEST of 729 combos: 0.7170 (lift -0.0011)

Even optimally weighted, the rubric only MATCHES the market (within
noise), never beats it. And the optimizer drove `priorBlend` DOWN
(0.3 -> 0.15) and the role/OL boosts UP, which is the model telling us to
lean harder on the market and that the free signals add no independent
predictive power. So weight calibration is not the lever. Better
SIGNALS (paid/manual) are, or use the rubric only to explain + flag
arbitrage at the margin. This is the validate-first evidence behind the
recommendation to NOT do another free scrape.

## The integrity problem: four disagreeing definitions of player_signals

This is the root issue, and it is the same "unlinked data" class the
original audit was about, one level down:

1. The SQL schema (`0009_signals.sql`) has ~30 columns including
   `snap_share_prior_year`, `ras`, `draft_pick_no`, `yprr_prior_year`,
   `epa_per_play_prior_year`, etc.
2. The TS type (`src/lib/signals/schema.ts` `PlayerSignalsRow`) declares
   a DIFFERENT subset: `rb_role_tier`, `compounding_news_count`,
   `weight_lb`, `height_in`, contract flags. It omits the usage/athletic
   columns the SQL has.
3. The ingestion (`ingest-player-signals.ts`) writes a THIRD set: usage
   shares, draft, ras, ht/wt, and now `rb_role_tier`.
4. The consumer (the rubrics) reads a FOURTH set: `rb_role_tier`, team
   coaching/scheme (`oc_tenure_yrs`, `scheme_tag`, `pass_rate_neutral`,
   `personnel_12_rate`, `ol_grade_pass`, `staff_novelty_composite`),
   `compounding_news_count`, `ol_continuity_score`, age.

The overlap between what we INGEST and what the rubric READS is
essentially `ol_continuity` + (now) `rb_role_tier`. Everything else we
ingested is read by nothing; most of what the rubric reads is populated
by nothing. That is the integrity gap.

## Recommendations (in priority order)

### 1. Reconcile the four definitions to one (do this regardless)

- Make the SQL schema, the TS type, the ingestion, and the rubric agree
  on exactly which columns exist and are used. Either (a) add the
  ingested usage columns to the TS type AND make the rubric read them,
  or (b) drop the columns nothing reads. Pick per column based on whether
  a consumer wants it. No column should exist in the table that no code
  reads, and no rubric read should bind on a column nothing writes.
- Add per-grade signal-coverage telemetry to `evaluate()`, mirroring the
  inflection model's `confidence_summary`: every grade should report what
  fraction of it is signal-backed vs market-prior fallback. Today a
  rubric silently runs on nulls; we cannot see it. This is the same
  "rule fires with no data" class as the Coach posture bug.
- Stamp the season the signals describe (the table is point-in-time but
  only `source_attribution` records it) and set an offseason re-ingest
  cadence so the live signals never silently go stale.

### 2. Reframe how the rubric is used: arbitrage layer, not re-grade

The backtest says the rubric should not replace the market grade. But its
upward disagreements have edge (0.67 percentile). So wire `evaluate()` as
an ARBITRAGE-FLAG layer: surface "the model likes this player more than
the market, and here is the signal why" where the rubric disagrees with
KTC AND has real signal coverage. This is the inflection/SWOT register
(explain + flag), not a wholesale re-ranking that the data does not
support. High value, honest, and it does not require beating KTC overall.

### 3. Calibrate before concluding (cheap, validate-first)

The rubric weights (`RB_BELLCOW_BOOST = 8`, hard-gate cap 60, OL effect
×8, etc.) are un-backtested guesses. The -0.028 lift may be
miscalibration, not a ceiling. Use the backtest harness to grid-search
the weights against the historical Spearman before any acquisition spend.
Spawn `dynasty-assumption-auditor` + `dynasty-canon-keeper` on the
calibrated weights. If calibration cannot get the lift positive, the
signals (not the weights) are the limit, which informs step 4.

### 4. The scrape decision: targeted, validate-first, NOT another free sweep

Do not re-scrape nflverse; we have it. The signals that could actually
help are the ones the rubric leans on and we lack, in ascending cost:

- **Team coaching/scheme table (manual, ~cheap).** 32 rows, hand-coded
  each offseason: OC tenure, scheme tag, staff novelty, neutral pass
  rate, 12-personnel rate. This unblocks the WR/TE/QB rubrics, which are
  currently market-prior-only because these are null. Cheapest high-value
  move. Validate with a WR/TE backtest before trusting it.
- **LLM signal extraction extended (moderate, ~$0.17/player).** The
  `historical_signal_codes` approach (Anthropic + web search) produced
  `rb_role_tier` + `compounding_news_count` for 182 RB-seasons. Extend it
  to the current season + all positions for the categorical signals the
  rubric reads. First test: does the LLM-extracted `rb_role_tier` beat my
  snap-derived heuristic in the backtest? If yes, it justifies the spend.
- **Route participation (engineering).** Derivable from nflverse
  `pbp_participation` play-by-play (not a ready column). For WR/TE.
- **PFF OL grades (paid, ToS-blocked for redistribution).** Internal-use
  only; cannot surface on shareable artifacts. Lowest priority given the
  constraint and that OL continuity (free) already covers part of it.

### 5. The strategic reframe (the uncomfortable one)

KTC is a 0.72-Spearman predictor and free signals do not beat it. The
highest-ROI data-integrity work may not be MORE player signals at all,
but keeping the MARKET data (KTC / FantasyCalc) fresh, complete, and
correctly format-matched everywhere, because that is what is actually
carrying the predictions. Pool completeness + value freshness +
format-correct value resolution is the load-bearing data integrity. The
rubric's role is to EXPLAIN and to FLAG ARBITRAGE at the margin, not to
out-predict the market in aggregate. Build the data model around that
truth.

## Suggested sequence

1. Reconcile the four definitions + add signal-coverage telemetry (step 1).
2. Calibrate the RB rubric weights against the backtest (step 3).
3. If calibration helps: extend the backtest to WR/TE and decide the
   manual team-signal table (step 4, first bullet).
4. Wire `evaluate()` as an arbitrage-flag layer, not a re-grade (step 2),
   gated on the calibrated backtest clearing a bar you set.
5. Keep the market-data freshness/completeness invariants as the
   first-class integrity guarantee (step 5).
