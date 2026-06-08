# Negative / inconclusive backtest results

The validate-first log (MODEL_LIVE_PLAN.md Phase B four-step protocol).
A signal that does not clear an operationally meaningful, CI-excludes-zero
lift is recorded here so a future session does not re-acquire it hoping
for a different answer. The data may stay wired (no harm); the rubric
weight stays at the prior until the signal earns more.

## B2: LLM-coded `rb_role_tier` lost the bake-off to the snap-derived tier (2026-05-30)

`rb_role_tier` is the RB-rubric HARD GATE (MODEL_CARD 4.2 v1): a
`committee_member` / `starter_uncertain` coding caps the rubric at 60 and
defeats the market blend. Phase B2 ran a validate-first bake-off of two tier
sources as that gate:

- **Snap-derived** (the incumbent): `deriveRbRoleTier` over prior-season
  nflverse snap / rush / target share (`src/lib/signals/nflverse.ts`). The
  source the production RB rubric reads today (the A4 baseline).
- **LLM-coded**: the `historical-signal-extractor` agent's vintage-blinded
  coding in `historical_signal_codes` (182 rows: 2022 / 2023 / 2024,
  ~60 RBs/year, all values on-schema), each restricted to sources dated
  before that year's pre-draft cutoff.

Both are vintage-safe: snap-derived reads season Y-1, the LLM is blinded to
pre-draft Y. Neither sees season-Y outcomes.

### Backtest (temporal-blinded, decision years 2023 + 2024)

Harness: `scripts/backtest-rb-tier-bakeoff.ts`. Loss function: Spearman of
the RB-rubric point estimate vs realized season-Y PPR points-per-game
(`games_played >= 6`). Market baseline: KTC at the historical snapshot
`<= Sep 15` of year Y. Same cohort across all variants (cohort held fixed,
only the injected `rb_role_tier` source changes). CI: 1000-iter mulberry32
bootstrap (seed 42), the same protocol as the A4 backtests. Full output:
`data/audits/backtest-rb-tier-bakeoff-2026-05-30.txt`.

LLM tier coverage of the cohort: 74 / 129 (57.4%); the LLM batch coded
top-N RBs as of the pre-draft cutoff, so it does not reach every cohort RB.

| Variant | Spearman | Lift vs market | 95% CI of lift |
|---|---:|---:|---|
| market (KTC) | 0.717 | (baseline) | |
| rubric + SNAP tier (A4) | 0.691 | -0.027 | [-0.065, +0.011] |
| rubric + LLM tier (+snap fallback) | 0.675 | -0.042 | [-0.086, +0.002] |
| rubric + LLM tier (no fallback) | 0.675 | -0.042 | [-0.086, +0.001] |

Apples-to-apples (only the 74 RBs both sources code), head-to-head paired
bootstrap of (LLM tier - snap tier) vs the same outcome:

- Spearman diff: **-0.007**, 95% CI **[-0.051, +0.040]** (straddles zero).

### Decision

**Winner: the snap-derived tier (incumbent). The LLM tier is the negative
result.** Three reasons:

1. **No source clears the market.** Every variant's lift vs KTC is negative;
   no CI excludes zero on the up side. This reproduces the A4 finding
   (the RB rubric is statistically indistinguishable from the market on the
   current signal set) and confirms the bottleneck is the missing
   load-bearing RB signals (weighted-opportunity, OL run grade), not the
   tier source.
2. **The LLM tier does not beat the snap tier.** Its point estimate is
   slightly worse and the paired head-to-head CI straddles zero: the two
   sources are not statistically separable on this cohort.
3. **The snap tier covers the full pool**; the LLM batch only reaches
   top-N RBs as of the cutoff. With no quality edge to offset the coverage
   gap, there is no case to switch.

The snap-derived tier therefore STAYS the live `player_signals.rb_role_tier`
source. `scripts/ingest-rb-role-tier.ts` (dry-run-validated) refreshes that
winning source per completed season; the production write is
founder-authorized. The LLM `rb_role_tier` rows remain in
`historical_signal_codes` for the historical backtest harness; they are NOT
promoted to the live column and no rubric weight changes.

Caveat (do not over-read): the bake-off says the LLM tier is not BETTER at
ranking realized production, on a 129-RB / 74-paired cohort. The disagreements
are real and substantive (the LLM was consistently more conservative, e.g.
snap `strict_bellcow` vs LLM `bellcow` for CMC / Saquon; snap `lead_back` vs
LLM `bellcow` for Derrick Henry 2024). The bake-off measures rank-correlation
to PPR, not per-player coding accuracy, and both feed the same coarse 4-band
rubric gate. If a future Phase D rubric makes finer use of the tier, re-run
the bake-off before assuming this verdict still holds.

## Route participation (WR / TE), 2026-05-30, Phase B #3

**Signal.** Prior-season route participation, the share of his team's
dropbacks a WR / TE was on the field for, from nflverse
`pbp_participation` (CC-BY-4.0). Free proxy: the file lists on-field
players per play but does not chart per-player routes, so route
participation = (dropback plays on field) / (team dropbacks in those
games). WR / TE only. Computed by the canonical `buildRouteParticipation`
in `src/lib/signals/nflverse.ts`; the same function feeds the live ingest
and the backtest, so the two cannot drift.

**Method.** Three-way, per position, pooled across decision years
2023 + 2024, temporally blinded (a year-Y prediction reads year-(Y-1)
route rates). Spearman vs realized season-Y PPR points-per-game.
`scripts/backtest-route-participation.ts`. Route coverage of the cohort:
WR 85%, TE 86%.

**Result.**

| Position | n | market (KTC) | rubric A4 (no route) | rubric + route | lift vs A4 (95% CI) | lift vs market (95% CI) |
|---|---|---|---|---|---|---|
| WR | 220 | 0.744 | 0.734 | 0.743 | +0.009 ([-0.001, 0.020]) | -0.001 ([-0.012, 0.010]) |
| TE | 94 | 0.728 | 0.728 | 0.732 | +0.004 ([-0.040, 0.046]) | +0.004 ([-0.037, 0.043]) |

**Decision: INCONCLUSIVE (directionally correct, not significant).**
Route participation moves the rubric in the right direction for both
positions (WR +0.009 over the A4 baseline, TE +0.004), but neither
lift's 95% CI excludes zero, and the rubric still does not clear the
market prior by a meaningful margin. This does NOT meet the Phase D3
gate ("positive lift with CI excluding zero").

**Why this is the expected shape, not a bug.** Route participation is a
volume FLOOR, not an independent edge. A receiver's route share is
strongly collinear with his target share and his market value (a
full-time alpha runs ~95% of routes AND is priced as an alpha). KTC
already prices that in, so a route signal layered on top of an already
strong market prior earns only a small marginal lift. The TE cohort
(n=94, two years) is also small; the CI is correspondingly wide.

**What ships anyway (no harm, real benefit):**
- The signal is WIRED and PER-SEASON BACKTESTABLE (the central B#1
  lesson: a current-only snapshot cannot validate). Phase D3 can re-run
  the bake-off against richer signals (route participation in 2-TE sets,
  paid charting) on this foundation.
- The rubric weights are modest by design (WR situation weight 0.07; TE
  the MODEL_CARD 4.4 hard-floor read at 0.15), and the WR/TE rubric is
  NOT in the value scale or `synthesize` today, so this changes no
  user-facing number until Phase D wires `evaluate()`.
- The live ingest populates `route_participation_prior_year`, lighting
  up the inflection / EnrichedPlayer no-silent-null contract for WR/TE.

**Do not** re-acquire this as if it were missing, or raise the rubric
weight chasing the small lift. The next move for route is the
2-TE-set-specific charting variant (MODEL_CARD 4.4 footnote, Phase B #7),
not more of the same on-field proxy.

## 2026-05-30 · Free OL pass-protection proxy does not lift the QB rubric

**Phase B6 (sig-ol-grade), free-alternative check.** Before paying for PFF
offensive-line grades, we tested whether a FREE pass-protection proxy
(derived from nflverse play-by-play, CC-BY) lifts the QB rubric.

- **Signal:** `ol_grade_pass` = inverse sack rate allowed (sacks /
  dropbacks) per team-season, percentile-normalized 0..1. The QB rubric's
  only OL branch reads this field. Derived by
  `scripts/derive-free-ol-grades.ts`. Spread is full (0..1 each season),
  so the proxy is real and varying, not degenerate.
- **Method:** `scripts/backtest-qb-rubric.ts --with-ol --ol-file ...`,
  temporal-blinded (a season-S grade enriches decision year S+1).
  Baseline (no OL) vs +OL, Spearman of rubric vs realized next-year PPR
  PPG. Decision years 2023 + 2024, pooled n=70, OL joined for 62/70.
- **Result:**

  | | market (KTC) | rubric | lift | 95% CI |
  |---|---:|---:|---:|---|
  | baseline (no OL) | 0.781 | 0.709 | -0.072 | [-0.222, 0.012] |
  | +free OL pass | 0.781 | 0.705 | -0.076 | [-0.229, 0.012] |

  **Marginal OL lift: -0.004** (noise-level on n=70).

- **Reading:** a real, full-variance pass-protection signal does not
  improve how the rubric ranks QBs for next-year production. The marginal
  lift is essentially zero (slightly negative). This is not "free OL is
  bad data"; it is "OL pass-protection is not a QB-RANKING lever at this
  cohort size, on top of the rubric's existing tier + age + market
  signals."
- **Decision:** do NOT wire the free OL proxy into the QB rubric. It earns
  nothing. This also LOWERS the expected value of buying PFF for QB: PFF's
  charting grade is cleaner than a sack-rate proxy, but for it to be worth
  paying, it would have to turn a -0.004 proxy result into a positive
  lift, which is a large ask on n=70. Recommendation: hold the PFF spend
  for QB; revisit OL when (a) the QB cohort is larger, or (b) the RB
  rubric wires `ol_grade_run` as a variance-band modifier (a different
  test: band calibration, not a point-estimate Spearman).
- **Caveats:** n=70 is below the 100 floor; the CI is wide. The sack-rate
  proxy conflates OL with QB time-to-throw and scramble tendency (a mobile
  QB lowers his own sack rate), so it is a noisier OL measure than PFF
  charting. Both caveats argue for HOLDING, not for buying on hope.

## 2026-06-04 · Second free OL proxy (ESPN PBWR/RBWR) corroborates: still no QB lift

**Phase B6 (sig-ol-grade), free-alternative check #2.** The founder asked
to validate a free OL proxy before spending on PFF. A FIRST free proxy
(inverse sack rate, above) already landed at noise. This is a SECOND,
construct-independent free proxy: ESPN team Pass-Block / Run-Block Win Rate
(PBWR / RBWR), a charted win-rate share, closer to PFF's construct than
sack rate is.

- **Signal:** `ol_grade_pass` = team PBWR (share of pass-block reps won),
  `ol_grade_run` = team RBWR, scraped from ESPN's annual win-rate articles
  for 2021-2024 (`scripts/scrape-espn-block-winrate.ts`), normalized
  pct/100 to the rubric's 0..1 scale. The QB rubric's only OL branch reads
  `ol_grade_pass`. Full cross-team spread each season (e.g. 2024 PBWR
  ranges ~0.56-0.74), so the proxy is real and varying.
- **Method:** `scripts/backtest-qb-rubric.ts --with-ol --ol-file
  data/free-ol-grades.json`, temporal-blinded (season-S grade enriches
  decision year S+1, so 2022/2023 ESPN feed decision years 2023/2024).
  Baseline (no OL) vs +OL, Spearman of rubric vs realized next-year PPR
  PPG. Decision years 2023 + 2024, pooled n=70, OL joined for 62/70.
- **Result:**

  | | market (KTC) | rubric | lift | 95% CI |
  |---|---:|---:|---:|---|
  | baseline (no OL) | 0.781 | 0.709 | -0.072 | [-0.222, 0.012] |
  | +ESPN OL win-rate | 0.781 | 0.711 | -0.070 | [-0.223, 0.015] |

  **Marginal OL lift: +0.002** (noise-level on n=70).

- **Reading:** two construct-INDEPENDENT free OL proxies (sack-rate -0.004,
  win-rate +0.002) both land at zero marginal lift on the same n=70 QB
  cohort. Convergent evidence that OL is not a QB-RANKING lever at this
  cohort size on top of the rubric's tier + age + market signals, not an
  artifact of one noisy proxy. The rubric still loses to the market in both
  passes regardless of OL.
- **Decision:** do NOT buy PFF OL grades for QB on this evidence, and do
  NOT wire the ESPN proxy. For PFF to be worth paying it would have to turn
  a ~zero result from two free proxies into a positive lift on n=70, an
  implausible ask. The PFF pipeline (#65) stays built but unfired; revisit
  OL only when (a) the QB cohort is larger, or (b) the RB rubric wires
  `ol_grade_run` as a variance-band modifier (a band-calibration test, not
  this point-estimate Spearman). The scraper is kept as a free, repeatable
  OL source if a future, larger-cohort test wants it.
- **Process note:** the first backtest pass returned n=0 (a flaked nflverse
  fetch under concurrent-job network contention). A clean re-run gave the
  n=70 numbers above. A 0-joined OL pass is a fetch failure, never a real
  verdict; re-run before recording.

## 2026-06-08 · Historical scheme/coaching signal: no per-position lift (sig-history ingested)

**Phase B sig-history (#63), the gate-unblocker, now CLOSED.** The
`team_signals_history` table (migration 0018) was empty through #63, so the
WR/QB/TE backtests reproduced the A4 market+age baseline and REFUSED to read
a scheme marginal. This entry records the result now that the table is
populated.

- **Data migration:** 128 rows written to `team_signals_history` (32 teams ×
  4 seasons 2021-2024), keyed `(team, season)`. Coaching/scheme fields coded
  per season by Claude Sonnet 4.6 + web_search, anchored to preseason-known
  state per the VALIDATION_PLAN section 4 temporal-blinding protocol
  (`extract-team-coaching-scheme-history.ts`, founder-validated). Derived
  game-script rates (`pass_rate_neutral`, `personnel_12_rate`,
  `scheme_pace`) attach the PRIOR season's realized values as the
  preseason-known proxy (`derive-team-metrics.ts --season`, nflverse
  CC-BY-4.0), merged by `ingest-team-signals-history.ts --write`. The
  2022 (19 teams) and 2023 (4 teams) codings that were missing from the
  initial #63 corpus were backfilled before the write so all four seasons
  are 32/32, zero null fields, zero low-confidence fields.
- **Method:** `scripts/backtest-{wr,qb,te}-rubric.ts`, each running the
  cohort twice per decision year (A4 baseline with no team signals, then
  rubric + historical scheme) and reporting the scheme marginal. Spearman
  of the rubric vs realized next-year PPR PPG. Decision years 2023 + 2024,
  temporally blinded (a season-S coding enriches decision year S+1).
- **Result (pooled scheme marginal = scheme-rubric Spearman minus A4-rubric
  Spearman):**

  | position | n | market (KTC) | A4 rubric | rubric + scheme | A4 lift vs market | scheme marginal |
  |---|---:|---:|---:|---:|---:|---:|
  | WR | 220 | 0.744 | 0.743 | 0.744 | -0.001 (CI [-0.012, 0.010]) | +0.002 |
  | QB | 70 | 0.781 | 0.709 | 0.701 | -0.072 (CI [-0.222, 0.012]) | -0.008 |
  | TE | 94 | 0.728 | 0.732 | 0.728 | +0.004 (CI [-0.037, 0.043]) | -0.004 |

- **Reading:** the historical coaching/scheme signal does NOT clear the
  market for any of WR, QB, or TE. All three scheme marginals are within
  noise of zero (WR +0.002, QB -0.008, TE -0.004); none of the underlying
  rubric-vs-market CIs exclude zero. This is the same shape as the other
  Phase B signals (route participation, rb_role_tier, OL grades all
  inconclusive): a coaching/scheme tag is largely collinear with the market
  prior the rubric already consumes, so it adds no marginal ranking edge on
  top of KTC + age. The scheme_tag populated counts (WR 95/86, QB 31/31,
  TE 41/38 across the two years) confirm the cohort read the freshly
  written history rows, so the zero marginal is a real verdict, not an
  empty-table artifact.
- **Decision:** do NOT change any rubric weight; hold the prior (the canon
  rule when a CI straddles zero). The signal stays wired and the table
  stays populated (it now enriches LIVE reads via the snapshot `team_signals`
  twin and remains available for the Phase D rubric rewrite, where scheme may
  matter as a variance-band or projection modifier rather than a point-estimate
  ranking signal). The Phase D "beats market" gate now has a real,
  temporally-blinded historical team-signals store to validate against,
  which was the entire purpose of the migration.
- **Caveats:** QB n=70 is below the 100 floor; its CI is wide. The
  decision-year window is two seasons (2023, 2024) because the derived Y-1
  proxy needs a prior-season pbp file and the coding corpus runs 2021-2024.
  A wider window (more KTC snapshot dates, more coded seasons) would tighten
  the CIs but is unlikely to move a ~zero marginal to gate-relevant given
  the collinearity.
