# Dynasty General Model Card

**Version**: v0 (framework + initial signal stack)
**Last updated**: 2026-04-28
**Maintainer**: dynasty-canon-keeper subagent + founder
**Companion document**: `web/RESEARCH_CORPUS.md` (every citation in this card resolves there)

This model card follows the Mitchell et al. 2019 "Model Cards for Model Reporting" structure (Mitchell, Wu, Zaldivar, Barnes, Vasserman, Hutchinson, Spitzer, Raji, Gebru. ACM FAccT 2019). It is the operational translation of `RESEARCH_CORPUS.md` into a per-signal, per-weight specification the engine implements. Every constant in production code traces back to a row in this card; every row in this card traces back to either a corpus citation or an explicit internal-heuristic tag with a planned backtest.

## 1. Model details

### 1.1 Purpose

Dynasty General is a decision-support system for serious dynasty fantasy football managers. The model evaluates players, picks, and trade proposals against the user's roster, league format, and stated doctrine. Its job is to convert the user's situation into one clear move, with the evidence chain exposed.

### 1.2 Model architecture (high-level)

Five layers, applied in order:

1. **Signals layer** (per player). Sourced from external feeds (Sleeper, FantasyCalc, PFF, Football Outsiders, Pro Football Reference, Spotrac) and from internal heuristic coding. Each signal has a confidence band, a source attribution, and a refresh cadence.
2. **Position rubrics**. Position-specific weighted aggregation of signals into an intrinsic-value score. Four rubrics: QB, RB, WR, TE. Rubrics share a small core (identity + KTC prior) but differ in signal stack and weights, because the published research treats positional aging and value drivers as fundamentally different problems.
3. **Combination layer**. Bayesian update of the KTC market prior with the position rubric's evidence. The output is a posterior dynasty value plus an explicit market-divergence signal ("our model values this 18 percent above market because of [signals]").
4. **Arbitrage overlay**. Five rule-buster condition clusters (RB cliff-breakers, rookie WR year-1 breakouts, TE early breakouts, aging WRs sustaining, late-round QB hits). When a player matches a cluster's condition set, the model flags the divergence-from-norm explicitly to the user.
5. **User-doctrine modifier**. Soundboard dial values shift weights within bounded ranges. The doctrine layer is an explicit user-bias amplifier, not a corrective on the optimization. It is honestly disclosed as such in user-facing surfaces and in this card.

### 1.3 Intended use

Primary use case: dynasty fantasy football decision support during startup drafts, rookie drafts, in-season pick decisions, and trade evaluation. The model produces a recommendation plus an evidence chain plus an explicit confidence band.

### 1.4 Intended users

Sophisticated dynasty managers who want analyst-grade reasoning without paying a year-round subscription to multiple analytics services. Power users who want to interrogate the model's reasoning, override its defaults, and push the dials toward their own doctrine.

### 1.5 Out-of-scope use cases

The model is NOT designed for:

- Single-week redraft / DFS lineup optimization (different loss function: short-horizon variance vs long-horizon expected value).
- NFL betting markets (different loss function: spread / total / props vs player career value).
- College recruiting evaluation (different population, different signals).
- Predicting NFL outcomes at the team level (we evaluate players inside teams, not teams).

Surfaces that consume model output should not be repurposed for these adjacent use cases without re-validation. The conference talk should acknowledge this boundary.

### 1.6 Loss function (proposed for v0)

Dynasty is fundamentally a value-trading game over multi-year horizons, not a single-season optimization. The proposed loss function is a weighted composite:

- **L1: 6-month KTC value error** (Mean Absolute Error on player value at t+180 days).
- **L2: 3-year cumulative PPR-fantasy-points error** (calibrated against actual outcomes for backtested players).

Composite: `L = 0.6 * L1 + 0.4 * L2`. The 0.6/0.4 weighting reflects that dynasty managers trade more often than they hold three years; market-value prediction is the dominant operational concern. These weights are themselves a v0 proposal pending backtest.

Brier score on probabilistic outputs (breakout odds, hit-rate ranges, decision confidence) is computed alongside as a calibration check (Brier 1950).

### 1.7 Performance metrics

To be populated after the v1 backtest. Until then, the model's performance is asserted against expert intuition and the published research, not validated. Section 9 specifies the validation framework.

## 2. Factors

### 2.1 Relevant factor categories

Per Mitchell et al. 2019, model cards must enumerate the factors that may produce differential performance. For Dynasty General:

- **Position** (QB, RB, WR, TE). Performance differs across positions because rubrics differ. Validation reports must be position-stratified.
- **Career stage** (rookie, year 2-3, prime, post-prime, declining). Performance is expected to degrade for rookies (less signal data) and rebound for established players.
- **Tier** (elite, mid-tier, replacement). Aging curves are tier-conditional for QB (corpus: Apex, Stathole, Harstad).
- **League format** (1QB, superflex, TE-premium, PPR vs half-PPR). Recommendations are conditional on format; validation must be format-stratified.
- **Time of year** (pre-NFL-draft, post-NFL-draft, in-season, off-season). Pre-NFL-draft rookie evaluation has wider uncertainty; landing-spot resolution materially improves it.

### 2.2 Evaluation factors not currently controlled for

Honest acknowledgment of gaps that the v1 backtest cannot resolve:

- **Era confounds**. NFL passing rules changed materially in 2004 and 2010; kickoff rules in 2018 and 2024; two-high coverage proliferated post-2020. Cohorts spanning these boundaries carry era effects.
- **Survivorship bias in aging-curve cohorts**. Players who decline early leave the sample; the conclusion "WRs sustain past 30" is conditional on having reached 30 in the league.
- **Sample size for dynasty-specific validation**. KTC published historical values cover roughly 6-8 years; statistical power on rare events (rookie WR top-12 hits with all four cluster conditions) is limited.

## 3. Signal schema

Master signal list. Every signal has a citation reference (resolves to `RESEARCH_CORPUS.md`), a confidence band (high/medium/low), a refresh cadence, and a source attribution. Signals tagged INTERNAL_HEURISTIC are flagged for backtest in Section 10.

### 3.1 Player-base signals (cross-position)

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `name`, `position`, `team`, `age`, `years_exp`, `is_rookie` | Sleeper API | Daily | High | (identity, no eval citation) |
| `ktc_value` (FantasyCalc-sourced, normalized 0-100) | FantasyCalc API via cron | Daily | High (market consensus) | Used as Bayesian prior. Corpus methodology section. |
| `adp` (format-aware variant) | Sleeper API | Daily | Medium | Sleeper variant keys. Used for survival math. |

### 3.2 Volume signals

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `snap_share` (offensive snap percent) | Pro Football Reference + nflfastR | Weekly in-season, season-end | High | RESEARCH_CORPUS > Per-position > WR > Target share & route participation; > TE > 12-personnel rate |
| `route_participation` (routes per dropback) | PFF (paid tier) or 4for4 estimates | Weekly in-season | High (PFF) / Medium (estimates) | Corpus > TE: all 40 highly-productive TEs ran routes on >= 60 percent of 2-TE-set passing dropbacks |
| `target_share` (percent of team targets) | nflfastR + Pro Football Reference | Weekly | High | Corpus > WR: target share year-over-year correlation roughly 0.70 (Sharp Football, SumerSports) |
| `rush_share` (percent of team carries) | nflfastR | Weekly | High | Corpus > RB > Committee classification |
| `target_share_air_yards` | RotoViz / Hermsmeyer methodology | Weekly | Medium | Corpus > WR > Target competition (Hermsmeyer air yards series) |
| `high_value_touches` (RB only: 10-yard-line carries + targets) | nflfastR | Weekly | Medium | Corpus > RB: PFF target-value, CBS HVT methodology |
| `weighted_opportunity` (RB only: carries x 0.58 + targets x 1.59) | computed from above | Weekly | High | Corpus > RB: PFF weighted opportunity correlates 0.95 with PPR points |

### 3.3 Efficiency signals

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `yprr` (yards per route run) | PFF or computed | Weekly | High (PFF) / Medium (computed) | Corpus > WR: YPRR correlates 0.43 with next-season PPR (Fantasy Points 2024) |
| `personnel_adjusted_yprr` (11/12/21 split) | PFF | Weekly | High | Corpus > WR: PFF personnel-adjusted YPRR |
| `adot` (average depth of target) | nflfastR | Weekly | High | Corpus > WR > Target competition |
| `epa_per_play` (player-attributed) | nflfastR | Weekly | High | Corpus > Methodology citations: Yurko et al. 2019 nflWAR |
| `cpoe` (QB only: completion percent over expected) | nflfastR | Weekly | High | Corpus > Methodology citations: nflfastR |
| `success_rate` | nflfastR | Weekly | High | Corpus > Methodology citations: Yurko et al. 2019 |

### 3.4 Situation signals

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `qb_id`, `qb_grade` (PFF passing grade or computed CPOE+EPA composite) | PFF or nflfastR | Weekly | High (PFF) / Medium (computed) | Corpus > WR > QB downstream effect (Berri & Schmidt 2009) |
| `ol_run_grade` (Football Outsiders ALY per team) | Football Outsiders / FTN | Weekly | High | Corpus > RB > OL impact (FO ALY methodology) |
| `ol_pass_grade` (Football Outsiders ASR per team) | Football Outsiders / FTN | Weekly | High | Corpus > QB > Supporting cast effect |
| `oc_id`, `oc_tenure_yrs` | Manual coding (founder + future analysts) | Per coaching change | Medium (subjective coding criteria documented) | INTERNAL_HEURISTIC: corpus flags absence of rigorous OC-tenure-impact study; backtest required |
| `scheme_pace` (plays per 60 min) | nflfastR | Weekly | High | Corpus > Methodology citations |
| `pass_rate_neutral` (neutral-script pass rate) | nflfastR / RBSDM | Weekly | High | Corpus > Methodology citations |
| `personnel_12_rate` (team 12-personnel snap percent) | Sharp Football Analysis or computed | Weekly | High | Corpus > TE: 12-personnel hit 22.1 percent in 2023 |
| `target_competition_score` (depth chart hierarchy + competing target share) | Computed from depth chart + target share | Weekly | Medium | Corpus > WR > Target competition |

### 3.5 Health and risk signals

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `games_missed_3yr` (count of games missed past 3 seasons) | Pro Football Reference | Weekly | High | Corpus > Cross-position > Injury history |
| `injury_type_history` (categorized: Achilles, ACL, MCL, soft-tissue, concussion, other) | Pro Football Reference + manual coding | Weekly | High (PFR) / Medium (categorization) | Corpus > Injury: Mai et al. 2018 (Achilles), Mody et al. 2022 (ACL), Provencher (WR ACL) |
| `chronic_flag` (boolean: chronic condition, manual flag) | Manual coding | Per news event | Medium | INTERNAL_HEURISTIC: criteria documented; not yet backtested |
| `current_status` (active / questionable / out / IR) | Sleeper API | Daily in-season | High | Operational signal, not eval |
| `off_field_flag` (active suspension / arrest / pending discipline) | NFL transaction data + manual coding | Per news event | Medium | INTERNAL_HEURISTIC: corpus flags absence of rigorous quantitative study |
| `holdout_flag` | Beat-reporter feed + manual coding | Per news event | High (factual) | Operational, not eval |

### 3.6 Career-stage signals

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `draft_pick_no` (NFL draft pick) | Sleeper API | Static post-draft | High | Corpus > Cross-position > Draft capital (Massey & Thaler 2013) |
| `draft_round` | Sleeper API | Static | High | Corpus > Cross-position > Draft capital (PFF historical hit rates) |
| `ras` (Relative Athletic Score, Kent Lee Platte) | RAS public database | Static post-combine | High | Corpus > Combine: RAS preferred to single drills |
| `college_dominator` (PlayerProfiler) | PlayerProfiler scrape or manual entry | Static | Medium | Corpus > Arbitrage > Rookie WR cluster |
| `breakout_age` (PlayerProfiler) | PlayerProfiler or computed | Static | Medium | Corpus > Arbitrage > Rookie WR cluster |
| `weight_lb`, `height_in` | Sleeper API | Static | High | Corpus > Arbitrage > RB cliff-breaker condition |

### 3.7 Contract signals

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `contract_years_remaining` | Spotrac (free tier) | Per contract change | High | Corpus > Cross-position > Contract status |
| `recent_extension_flag` (extension within last 12 months) | Spotrac | Per contract change | High | Corpus > Contract status (NFL-specific peer-reviewed work missing) |
| `contract_year_flag` (final year of deal) | Computed from above | Per contract change | High | Corpus > Contract status (cross-sport NBA evidence; NFL effect weaker / unverified) |

### 3.8 Schedule signals

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `sos_position_adj_projected` (projected-win-total based, position-specific) | Sharp Football Analysis methodology | Pre-season + weekly | Medium | Corpus > Schedule: traditional SOS explains 0.028 percent of variance; projected-win-total SOS materially better |
| `sos_playoff_w14_17` (fantasy playoff weeks specifically) | Computed | Pre-season | Medium | Corpus > Schedule (corroborating use only) |

Signals not in v0 (deferred to maintenance passes): weather/temperature per-game projection (corpus > debunks: 1.8-3.1 percent effect, too small to weight in v0); divisional strength (overlaps with SOS, no marginal value in v0); concussion-recovery curves (corpus open question 8).

## 4. Position rubrics

Each rubric is a weighted aggregation `score = sum(w_i * signal_i)` with weights in [0, 1] summing to 1.0 per rubric. Weights are v0 proposals; final values come from the backtest in Section 9. Each weight has a source tag: CORPUS (derivable from research effect sizes), MARKET_PRIOR (mirrors KTC market structure for positions where research is thin), or INTERNAL.

### 4.1 QB rubric

Designed for tier-conditional aging. Mobile and pocket QBs use the same stack with different weight presets (mobile QBs heavier weight on `rushing_share`, lower weight on `tier_aging_pocket`).

| Signal | Initial weight | Source | Notes |
|---|---|---|---|
| `cpoe` (rolling 16-game) | 0.18 | CORPUS (nflfastR + Yurko 2019) | Single best per-play QB signal in published work. |
| `epa_per_play` (rolling 16-game) | 0.15 | CORPUS (nflfastR) | Composite quality signal. |
| `rushing_share` | 0.15 (mobile preset) / 0.05 (pocket preset) | CORPUS (Fantasy Points 2023) | Dual-threat decline driver per corpus. |
| `tier_classifier` (elite/mid/replacement, rolling 32-game) | 0.15 | CORPUS (Apex peak-age, Harstad mortality table) | Drives tier-conditional aging curve selection. |
| `age_curve_factor` (tier-conditional) | 0.10 | CORPUS (Apex; Stathole "Mirage of QB Age Cliff") | Applied AFTER tier classification, not before. |
| `ol_pass_grade` (team) | 0.08 | CORPUS (FO ASR; PFF Pass Block) | Supporting cast. |
| `target_room_quality` (team WR1+WR2 composite) | 0.07 | CORPUS (Berri & Schmidt 2009 weak draft-pedigree finding implies measure recent quality not pedigree) | |
| `draft_capital` | 0.05 | CORPUS (Massey & Thaler 2013, BUT Berri & Schmidt 2009 deflates QB pedigree specifically) | Lower weight than other positions for this reason. |
| `ktc_prior` (Bayesian prior weight) | 0.07 | MARKET_PRIOR | Where research is thin, the market is the prior. |

Bias on weights: pocket-passer preset shifts 10 weight units from `rushing_share` into `cpoe`. Both presets use the same elite/mid/replacement classifier output to select an aging curve from `RESEARCH_CORPUS.md` Per-position > QB > Aging by tier.

### 4.2 RB rubric

Designed around weighted-opportunity dominance, OL impact, and the named cliff-breaker conditions in the corpus.

| Signal | Initial weight | Source | Notes |
|---|---|---|---|
| `weighted_opportunity` (rolling 8-game) | 0.22 | CORPUS (PFF: 0.95 correlation with PPR) | Single strongest predictor for RB. |
| `ol_run_grade` (team ALY) | 0.15 | CORPUS (FO ALY) | OL is 100 percent responsible for losses, 20 percent more than average for first 4 yards. |
| `target_share` (RB-specific) | 0.12 | CORPUS (PFF target-value: targets ~2.74x carries in PPR) | Pass-catching role separability. |
| `age_curve_factor` (RB-specific, with cliff-breaker check) | 0.12 | CORPUS (Northwestern; Apex) | Cliff at 28-29 (25.2 percent PPG drop). Arbitrage layer overrides for cluster-matchers. |
| `epa_per_play` (rolling 16-game) | 0.10 | CORPUS (nflfastR) | |
| `high_value_touches` (10-yard-line carries) | 0.08 | CORPUS (CBS HVT) | TD-share contributor. |
| `draft_capital` | 0.07 | CORPUS (Massey & Thaler 2013; PFF hit rates) | |
| `frame_score` (weight + height composite vs RB cohort) | 0.05 | INTERNAL_HEURISTIC | Cliff-breaker condition input; no peer-reviewed framework. Backtest required. |
| `ras` | 0.04 | CORPUS (Platte RAS) | Composite athletic profile. |
| `ktc_prior` | 0.05 | MARKET_PRIOR | |

### 4.3 WR rubric

Designed around target share + YPRR dominance, with target-vacuum / target-competition as a separate situational modifier.

| Signal | Initial weight | Source | Notes |
|---|---|---|---|
| `target_share` (rolling 8-game) | 0.20 | CORPUS (Sharp Football: 0.70 YoY correlation; SumerSports stickiness) | Single strongest predictor for WR. |
| `yprr` (personnel-adjusted) | 0.15 | CORPUS (Fantasy Points 2024: 0.43 correlation; PFF personnel-adjusted) | Best efficiency signal. |
| `qb_grade` (downstream QB effect) | 0.12 | CORPUS (Berri & Schmidt 2009) | Use recent quality, not pedigree. |
| `target_competition_score` (depth chart + competing share) | 0.10 | CORPUS (Hermsmeyer air yards; Reception Perception target-rate work) | Tier-2 vs alpha distinction. |
| `age_curve_factor` (WR-specific, slowest of skill positions) | 0.08 | CORPUS (Apex peak 26.95; PFF Age of Decline; FootballGuys 2025 elite-tier exception) | |
| `route_participation` | 0.07 | CORPUS (PFF tight-end methodology; analogous WR thresholds) | Volume floor signal. |
| `adot` (role classifier: slot/X/Z) | 0.06 | CORPUS (Hermsmeyer; PlayerProfiler) | Aging cliff differs by route role. |
| `draft_capital` | 0.07 | CORPUS (Massey & Thaler 2013; PFF hit rates: round-1 WRs 34.6 percent top-12 rate) | |
| `ras` | 0.05 | CORPUS (Platte RAS; explicitly NOT 40-time alone per debunk section) | |
| `breakout_age`, `college_dominator` (rookie-only signals) | 0.05 (rookie weight) | CORPUS (PlayerProfiler / Frank DuPont) | Activated only for rookies. |
| `ktc_prior` | 0.05 | MARKET_PRIOR | |

### 4.4 TE rubric

Designed around scheme-fit (12-personnel rate) and target share within the offense, with the named slow-development curve and its conditional exceptions tracked in arbitrage.

| Signal | Initial weight | Source | Notes |
|---|---|---|---|
| `team_personnel_12_rate` | 0.18 | CORPUS (Underdog Network 2023; NFL hit 22.1 percent) | Load-bearing scheme signal for TE. U-receiver in 12 earns 20.3 percent target rate vs 16.0 percent for Y. |
| `route_participation_in_passing_sets` | 0.15 | CORPUS (PFF: top-3 fantasy TEs averaged 84 percent route rate in 2-TE sets; threshold floor 60 percent) | Hard threshold below which TE production is structurally capped. |
| `target_share_in_offense` (TE share of team targets) | 0.13 | CORPUS (DynastyNerds: 100+ rookie targets is the elite threshold) | |
| `qb_grade` (downstream effect) | 0.10 | CORPUS (Berri & Schmidt 2009 generalizes; pocket QB preference per arbitrage cluster) | |
| `age_curve_factor` (TE peak 25-29) | 0.08 | CORPUS (Apex: peak 26.78; 41 percent of qualifying seasons in 25-27 window) | |
| `oc_tenure_yrs` (OC stability) | 0.06 | INTERNAL_HEURISTIC | Anecdotal pattern, no rigorous study. Backtest required. |
| `ras` | 0.05 | CORPUS (Platte RAS) | |
| `draft_capital` | 0.06 | CORPUS (Massey & Thaler 2013; PFF hit rates) | TE-specific hit rates lower than WR; weight reflects this. |
| `vacated_te_role_flag` (boolean: TE ahead of player departed within 12 months) | 0.05 | CORPUS (Arbitrage > TE early breakout) | Activated by named historical precedent (Bowers, LaPorta). |
| `ktc_prior` | 0.04 | MARKET_PRIOR | |
| `pocket_qb_flag` (boolean: starting QB is pocket-style) | 0.05 | CORPUS (Arbitrage > TE early breakout: 12 of 14 elite rookie TEs played with pocket QB) | |
| `experience_curve_factor` (year 1, 2, 3+ multiplier) | 0.05 | CORPUS (DynastyNerds; Apex slow-development; conditional exceptions in arbitrage) | Activated for non-elite-rookie cases. |

## 5. Cross-position signal treatment

### 5.1 Draft capital

Massey & Thaler 2013 establishes that early picks are systematically overvalued and later first-round picks deliver more surplus value. Operational implication: draft capital is a STRONG SIGNAL but not deterministic. The engine treats round of pick + draft slot as evidence updating the player's prior, not as a fixed multiplier. PFF historical hit rates (round 1 WRs: 34.6 percent top-12, round 2: 22.7 percent, round 3: 11.7 percent) are used as priors for rookie evaluation.

Berri & Schmidt 2009 specifically deflates QB draft pedigree (weak correlation with per-play production). The QB rubric reflects this: `draft_capital` weight is 0.05 for QB vs 0.07 for WR/TE/RB.

### 5.2 Injury history

Three return-curve frameworks adopted directly from peer-reviewed work:

- **Achilles**: 9-month mean return; 22 percent power-rating decrease and 23 percent AV decrease over 3 years post-injury; 57 percent return-to-play rate (Mai et al. 2018).
- **ACL**: roughly one-third of NFL players never return; among returnees, only 28.5 percent active 3 years post-injury. RB/DL/LB worst, QB best (Mody et al. 2022). WR-specific outcomes per Provencher et al.
- **Position-specific ACL beyond WR**: corpus open question 9. Currently use overall NFL curve; flag as confidence band MEDIUM until refined.

`injury_type_history` is converted to a multiplicative discount on the position rubric output. Achilles within 12 months: discount 0.78 (corresponds to 22 percent power-rating decrease). ACL within 24 months for non-QB: discount 0.85. Soft-tissue injuries (hamstring, calf): no formal discount; they affect weekly availability via `current_status`, not multi-year value.

### 5.3 Contract status

`contract_year_flag` and `recent_extension_flag` are SOFT signals weighted low. Cross-sport NBA evidence (PER rises in contract year, dips year after) is suggestive; corpus open question 2 flags absence of rigorous NFL-specific peer-reviewed study. v0 weight: contract-year provides at most a 0.03 score nudge upward; recent extension provides at most 0.02 nudge for stability.

Tagged as INTERNAL_HEURISTIC pending the NFL-specific study or our own backtest.

### 5.4 Off-field risk

Suspension severity is treated as a games-missed signal via `current_status`. Post-return performance impact is INTERNAL_HEURISTIC (corpus open question 3 and 4: no peer-reviewed work surfaced).

The engine flags off-field risk explicitly to the user as a categorical risk band, NOT as a weight adjustment in the rubric. A user who wants to discount a player for off-field reasons does so via the Soundboard `risk_tolerance` dial. This is honest: we don't have research-grounded weights for off-field impact on subsequent fantasy production.

### 5.5 Schedule of strength

Traditional SOS (prior-season records) is discarded entirely (Sharp Football: 0.028 percent of variance explained). Projected-win-total SOS is used at low weight, primarily for fantasy-playoff-week (W14-17) considerations, NOT for season-long evaluation.

`sos_playoff_w14_17` is surfaced as a tiebreaker between otherwise comparable candidates, never as a primary signal. Coach is permitted to mention schedule but only with the cited effect-size context.

### 5.6 Combine athleticism

Single drills are NOT signals. The corpus is unambiguous: 40-time alone correlates r = 0.004 with WR career production (Stuart, Football Perspective, n = 702). Kuzmits & Adams 2008 generalizes the weak predictive validity to combine drills overall.

The model uses RAS (Relative Athletic Score, Kent Lee Platte) as the composite athletic profile signal. RAS aggregates 6+ drills with position-percentile weighting and is preferred precisely because the framework's design accounts for the weak predictive validity of any single drill. RAS weight in rubrics: 0.04-0.05 across positions.

This is a notable place where the model deliberately deviates from common-knowledge fantasy discourse (where 40-time is repeatedly cited as a key signal). The deviation is research-grounded; the conference talk should highlight it.

## 6. Lane classification (post-enrichment)

Current state (`build-trajectory.ts`): pure age threshold (age <= 23 future, age >= 27 win-now, 24-26 balanced). This is an age-only proxy for "timeline of contribution."

v1 target: signal-enriched lane classification. Two axes, not one:

- **Contribution-now axis**: snap_share + production_proven (last-season weighted_opportunity for RB; target_share for WR/TE; CPOE+EPA for QB) + healthy.
- **Contribution-later axis**: age_curve_factor + draft_capital + ras + breakout_age + contract_years_remaining.

Lane assignment becomes a 2D classification:

- **WIN-NOW lane**: high contribution-now, low contribution-later.
- **FUTURE lane**: low contribution-now, high contribution-later.
- **BALANCED lane**: high on both (the actual prime-years cohort).
- **NEITHER lane**: low on both (omitted from recommendations).

This replaces the age-only line with a research-grounded role classifier. Implementation deferred to Phase 2 of the build plan; v0 documents the target shape so the engine refactor preserves intent.

## 7. Arbitrage layer (rule-busters)

Five condition clusters, each with its identifiable signal cluster, named historical precedents, and engine treatment. From `RESEARCH_CORPUS.md > Arbitrage and outlier patterns`.

### 7.1 RB cliff-breaker condition cluster

- **Condition cluster** (engine flags when 3 of 4 present):
  - `weight_lb >= 220`
  - `career_touches_at_age_27 < cohort_median`
  - `target_share >= 0.12`
  - `ras >= 8.5`
- **Engine treatment**: when matched, `age_curve_factor` for that player is recomputed using a cliff-resistant variant (decline begins at 30 instead of 28; 50 percent shallower slope). Surfaced in the user-facing evidence chain as "matches RB cliff-breaker pattern: [conditions met] like [historical analog]."
- **Historical analogs cited**: Henry, Frank Gore, Ricky Williams, peak Adrian Peterson.

### 7.2 Rookie WR year-1 breakout cluster

- **Condition cluster** (engine flags when 4 of 6 present, rookie only):
  - `draft_round == 1`
  - `target_vacuum_score >= threshold` (computed from depth chart turnover within 12 months)
  - `qb_grade >= cohort_median`
  - `college_dominator >= 0.35`
  - `breakout_age <= 19`
  - `ras >= 7.5`
- **Engine treatment**: posterior breakout probability is updated above the round-1 baseline 34.6 percent. Surfaced as "matches the Jefferson/Chase/AJ Brown/OBJ pattern: [conditions met]." Specific magnitude of the posterior shift is an OPEN BACKTEST QUESTION (corpus); v0 ships with a placeholder shift of +15 percentage points and flags it as INTERNAL_HEURISTIC pending validation.
- **Historical analogs cited**: Justin Jefferson 2020, Ja'Marr Chase 2021, AJ Brown 2019, Odell Beckham Jr 2014.

### 7.3 TE early breakout cluster

- **Condition cluster** (engine flags when 4 of 6 present, rookies and year-2 TEs):
  - `projected_or_actual_targets >= 100`
  - `snap_share >= 0.70`
  - `pocket_qb_flag == true`
  - `ras_or_athletic_comp >= cohort_median`
  - `vacated_te_role_flag == true`
  - `oc_tenure_yrs >= 1` (stability rather than transition)
- **Engine treatment**: experience-curve factor overridden from "year-3 standard" to "elite breakout candidate"; surfaced as "matches the Bowers/LaPorta pattern: [conditions met]."
- **Historical analogs cited**: Brock Bowers 2024, Sam LaPorta 2023, Mark Andrews 2018, George Kittle 2017.

### 7.4 Aging WR sustaining cluster

- **Condition cluster** (engine flags for WRs age 29+):
  - `slot_route_share >= 0.50`
  - `qb_stability` (same QB three-plus years, computed from `qb_id` history)
  - `target_share >= 0.18` at age 29
  - `injury_history_lower_body_count <= 1` past 3 seasons
- **Engine treatment**: shallower decline curve; flagged as "matches the Fitzgerald/Steve-Smith pattern: [conditions met]."
- **Historical analogs cited**: Larry Fitzgerald, Steve Smith Sr, late-career Jerry Rice, peak-late DeAndre Hopkins.

### 7.5 Late-round QB hit cluster

- **Condition cluster** (engine flags for QBs drafted round 4+):
  - `oc_scheme_family in {Shanahan, McVay, Reid}`
  - `mobility_score` above class median (rushing yards or designed run share at college level)
  - `college_passing_efficiency_adjusted` above class median
  - `supporting_cast_quality` above league median in year 1
- **Engine treatment**: posterior starter probability updated upward from baseline; surfaced as "matches the Purdy/Hurts pattern: [conditions met]." Hits are still rare; the engine does not treat the cluster as deterministic.
- **Historical analogs cited**: Brock Purdy 2022, Jalen Hurts 2020, Tom Brady 2000 (with the caveat that Brady's pattern was only fully visible in retrospect; Belichick/Weis match was unusual and partially scheme-emergent).

## 8. Combination logic

### 8.1 Bayesian framing

The combination layer treats KTC market value as the prior and the position rubric output as the evidence. Posterior:

```
posterior_value = w_prior * ktc_value + (1 - w_prior) * rubric_score_normalized
```

`w_prior` defaults to 0.55, reflecting the user's expressed preference for using KTC as a strong anchor while allowing the model to differ. `w_prior` is itself a doctrine-tunable parameter exposed via the Soundboard `consensus_lean` dial within the band [0.35, 0.75]. Users who push the dial toward "trust the market" raise w_prior; users who push toward "contrarian" lower it.

The model also outputs `market_delta = posterior_value - ktc_value` explicitly, exposing the magnitude and direction of the model's disagreement with the market. This is the key signal the user-facing "Disagree with the market" evidence card surfaces.

### 8.2 Doctrine modifier

Soundboard dial values shift weights within bounded ranges. The doctrine layer is HONESTLY DECLARED as a user-bias amplifier, not a corrective on optimization. A user with `risk_tolerance` set to +60 receives recommendations that prefer high-volatility picks; this is by design and disclosed.

Dials currently wired to engine math: `horizon` (Phase E in repo). Dials with planned engine wiring per this card: `risk_tolerance`, `consensus_lean`, `underdog_premium`, `rookie_tilt`, `age_preference`, `variance_tolerance`. Each dial's tooltip on the Soundboard surface lists which weight it adjusts; "Pending wiring" tooltips are removed only when the dial is actually wired.

### 8.3 Macro modifier

League-format and time-of-year factors apply post-doctrine. Examples: superflex multiplier (KTC-anchored, format-multiplied per existing engine pattern), TE-premium adjustment, pre-NFL-draft rookie uncertainty widening.

## 9. Validation framework

### 9.1 Backtest design

The model is validated against held-out historical data, not against the data it was tuned on. Three baselines are compared:

- **B1: KTC-alone** (the market). The model must beat KTC-alone on the chosen loss function to claim incremental value.
- **B2: Random** (sanity floor).
- **B3: Expert consensus** (Hayden Winks dynasty rankings, ETR rankings, FantasyPros aggregator). The model must beat the expert consensus baseline meaningfully to claim "analyst-grade."

Cross-validation across seasons; no in-season leakage. nflfastR-style train-on-held-out-seasons methodology (Yurko 2019).

### 9.2 Loss function (operational)

Two-component composite per Section 1.6: `L = 0.6 * L1 + 0.4 * L2` where L1 is 6-month KTC value MAE and L2 is 3-year cumulative PPR-points MAE. Reported separately AND as composite. Per-position stratification.

### 9.3 Calibration metrics

Brier score on probability outputs (breakout odds, hit-rate ranges, decision confidence). Reliability diagrams. Reported separately for top-of-confidence (high-stakes) and middle-of-confidence (close calls) outputs.

### 9.4 Public benchmark range

FiveThirtyEight reported NFL prediction Brier scores in the 0.107 to 0.162 range across recent seasons (corpus methodology section). The model's NFL sub-models should land within or below this range; player-specific dynasty-value predictions are a different problem with different baselines.

### 9.5 Validation set construction

Sleeper historical league data (multi-year) provides actual pick orders and outcomes. KTC published historical values provide market priors. Cross-validation:

- **Train**: seasons 2019-2022.
- **Validate**: 2023.
- **Test**: 2024-2025 (held out entirely).

Roughly 6-8 years of KTC history is available; statistical power is limited on rare events. Validation reports must include sample size and confidence intervals on every reported metric; no point estimates without uncertainty.

### 9.6 Headline metric (reserved)

The "outperformed N percent of league players" claim is reserved for the moment we have:

1. A defensible loss function locked.
2. A backtest pipeline that produces calibrated, cross-validated, baseline-compared results.
3. Per-cohort splits (where the model is strong vs weak).
4. An honest caveats slide acknowledging survivorship bias and sample-size constraints.

Until then, no marketing claims of relative performance. The conference talk leads with methodology, not the headline number.

## 10. Internal heuristics pending validation

These are the constants and conditions in the model card that are NOT externally cited and require backtest before any conference talk. The corpus surfaced four primary heuristics:

| Heuristic | Used in | Backtest plan | Risk if wrong |
|---|---|---|---|
| QB rushing-share threshold (suggested 80+ rush attempts/season) for "rushing-dependent" classification | QB rubric mobile/pocket preset selection | Regress next-3-season fantasy decline on rushing-share quintile; identify natural breakpoint | Misclassifies QBs into wrong aging curve; affects QB-rubric output and lane bucketing |
| Gap vs zone scheme RB aging differential | RB age-curve modifier | Cohort RBs by scheme-fit; compare aging slopes. Limited sample. | Minor: modifier is small-magnitude. Backtest may discard the heuristic entirely. |
| OC tenure for TE production stability | TE rubric `oc_tenure_yrs` weight | Cohort TEs by OC-tenure year; compare YoY production variance | Affects TE rubric weight 0.06; limited downside |
| Off-field risk fantasy-impact mapping | Cross-position categorical risk band (NOT in rubric weights) | Case-by-case review until peer-reviewed work surfaces | Already isolated outside rubric; risk is to user-facing risk band copy, not core scoring |

Additional heuristic items:
- RB cliff-breaker cluster: 3-of-4 condition threshold AND specific signal cutoffs (220 lb, 0.12 target share, RAS 8.5). Require backtest.
- Rookie WR breakout cluster: +15 percentage point posterior shift placeholder. Requires backtest.
- Frame score formula for RB. Requires definition + backtest.
- Bayesian prior weight default (0.55) and band ([0.35, 0.75]). Sensitivity analysis required.

Each heuristic is tagged in code (`// INTERNAL_HEURISTIC: ref MODEL_CARD section 10.X`) so the lint rule and grounding subagent can find them.

## 11. Known limitations and open questions

### 11.1 Model limitations

- Per-position rubrics improve over a unified model but are still aggregations; individual-player edge cases (Kelce-tier TE-as-WR, Lamar-tier rushing QB) push the rubric boundaries. The arbitrage layer is the engine's primary tool for surfacing these edge cases as named patterns rather than silently mispricing.
- Pre-NFL-draft rookies have wider uncertainty than the model communicates uniformly. The macro modifier should widen confidence bands for `team == null` rookies; v0 specifies this requirement; implementation in Phase 2.
- The user-doctrine layer is by design a bias amplifier. The model card honestly declares this; the conference talk must include a slide on it.

### 11.2 Open research questions (from corpus)

1. Peer-reviewed pass-catching RB aging vs rushing RB aging.
2. NFL-specific contract-year phenomenon study.
3. Off-field-arrest impact on subsequent fantasy production.
4. Suspension post-return performance curves (PED vs personal conduct vs substance abuse).
5. Gap vs zone scheme fit and RB aging.
6. OC scheme tenure and TE production.
7. Dynasty market efficiency formal study (where does KTC mis-price?).
8. Concussion return-to-form curves.
9. ACL recovery position-specificity beyond WR.
10. Massey-Thaler 2013 successor work post-rookie-wage-scale era (2011 CBA).

The model card is honest about each of these; the engine flags the affected signals as MEDIUM confidence rather than HIGH.

### 11.3 Survivorship bias acknowledgment

Aging-curve research (especially WR-sustaining-past-30 cluster) is conditional on having reached the relevant age in the league. The engine treats the conclusion "WRs sustain past 30" as conditional, NOT as an unconditional probability. The conference talk should acknowledge this explicitly; the user-facing "show your work" mode should disclose it on aging-cluster recommendations.

## 12. Caveats and recommendations

### 12.1 For end users

Model output is decision support, not deterministic guidance. Recommendations are conditional on the user's stated doctrine, league format, and current roster. The model surfaces evidence and confidence bands; the user makes the call. The "show your work" mode is provided so the user can interrogate any recommendation and override based on context the model does not see.

### 12.2 For prospective hired analysts (future)

The model is designed to be tunable without code changes. Weights, thresholds, and rubric structure live in `model_config` (Supabase, Phase 4 of build plan) and are editable via an admin console. Every change is logged with the editor's stated rationale. Backtest performance is tracked across versions; weight changes that degrade headline metrics are flagged.

### 12.3 For conference audiences

This card and its companion `RESEARCH_CORPUS.md` are the methodology slides. The model is research-grounded, position-specific, market-Bayesian, and explicitly doctrine-conditional. Where research is thin (open questions section), the heuristics are tagged. Where the model deviates from common discourse (combine debunks, schedule SOS, QB cliff), the deviations are research-grounded and cited.

The honest caveat: validation is the v1 backtest, which is in progress. The "outperformed N percent" headline is not yet earned and not claimed. The talk leads with methodology and cites results conservatively.

## 13. Change log

- **v0 (2026-04-28)**: Initial framework + signal stack + rubric weights (proposed) + arbitrage layer + validation framework. Signals derived from `RESEARCH_CORPUS.md` v1. Internal-heuristic tags placed for backtest. Companion to corpus document. No production code yet implements this card; engine implementation is Phase 1+ of the build plan.

Future versions:
- **v1**: post-backtest weight updates; INTERNAL_HEURISTIC items either backtested or retired.
- **v2**: post-conference feedback incorporation; expanded corpus.
- **v3+**: hired-analyst tuning rounds; expert-curated weight sets per dial preset.
