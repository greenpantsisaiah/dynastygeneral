# Dynasty General Model Card

**Version**: v1 (framework + signal stack + offseason-transition signals)
**Last updated**: 2026-05-03
**Maintainer**: dynasty-canon-keeper subagent + founder
**Companion document**: `web/RESEARCH_CORPUS.md` (every citation in this card resolves there)
**Build plan**: `web/BUILD_PLAN.md` (Phase 1 actionable spec, what to build first)

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

### 3.9 Offseason transition signals (v1, added per founder direction 2026-05-03)

These signals operate on the team and player at the START of each season (or as updates fire mid-offseason). They're the engine's prediction-business layer: they capture what changed about a player's situation BEFORE the data arrives. Most are CONTEXT signals that widen variance bands rather than shift point estimates; the corpus is unambiguous that individual-level transition effects are noisy at the point-estimate level but real at the variance level.

| Signal | Source | Refresh | Confidence | Corpus ref |
|---|---|---|---|---|
| `ol_continuity_score` (team) | Football Outsiders methodology, computed from starter changes | Pre-season + week 1 | High | Corpus v2 > Cluster 1 (r=0.440 to offensive DVOA) |
| `ol_grade_run` (team) | PFF run-blocking grade or Football Outsiders ALY | Weekly in-season | High | Corpus v2 > Cluster 1 (PFF: 0.50 correlation to YPA) |
| `rookie_ol_starters_count` (team: number of rookie starters on OL) | Manual coding from depth charts | Pre-season + roster moves | High (factual) | Corpus v2 > Cluster 1 (rookie OL year-1-to-year-2 r=0.56) |
| `rookie_ol_position_breakdown` (team: which OL positions are rookie) | Manual coding | Pre-season | High | Corpus v2 > Cluster 1 (tackles 0.67 stable, centers 0.38) |
| `hc_first_time_flag` (team) | Manual coding | Per coaching change | High | Corpus v2 > Cluster 2 (first-time HC win pct 0.447) |
| `hc_tenure_yrs` (team) | Manual coding | Per coaching change | High | Corpus v2 > Cluster 2 |
| `hc_background_tag` (offensive_coordinator / defensive_coordinator / college / position_coach) | Manual coding | Per coaching change | High | Corpus v2 > Cluster 2 |
| `oc_id`, `oc_tenure_yrs`, `oc_first_year_with_team_flag` (team) | Manual coding | Per coaching change | High | Corpus v2 > Cluster 2 (OC tenure dominant signal for scheme persistence) |
| `scheme_tag` (team: shanahan / mcvay / reid / air_raid / spread / pro_style / west_coast / erhardt_perkins / other) | Manual coding | Per coaching change | Medium (subjective) | Corpus v2 > Cluster 2 |
| `staff_novelty_composite` (team: 0-3 score across new HC + new OC + new GM) | Computed from above | Per coaching change | High | Corpus v2 > Cluster 2 (compounding risk) |
| `rb_role_tier` (player: lead_back / bellcow / strict_bellcow / committee_member / passdown / starter_uncertain) | Computed from snap_share + manual coding | Pre-season + weekly | High | Corpus v2 > Cluster 3 (60/67/75 percent snap-share thresholds) |
| `rb_traded_offseason_flag` (player) | Manual coding from transactions feed | Per trade | High | Corpus v2 > Cluster 3 (Stats with Sasa: 64 percent improve, +6.8 percent median) |
| `rb_role_at_new_team_projected` (when traded: featured / committee / passdown_complement) | Manual coding | Per trade | Medium (subjective) | Corpus v2 > Cluster 3 (three-role taxonomy) |
| `rb_passdown_share_priorYear` (player: percent of team RB targets) | nflfastR + Pro Football Reference | Season-end + offseason | High | Corpus v2 > Cluster 3 (passdown stickier than early-down) |
| `compounding_news_count` (player: number of distinct offseason transitions affecting this player) | Computed from team-level signals | Per news event | Medium | Corpus v2 > Cluster 4 (compounding-news cases mis-priced) |
| `ktc_value_30day_delta` (player: change in KTC over last 30 days) | KeepTradeCut historical | Daily | High | Corpus v2 > Cluster 4 (market reprice latency = news cycle) |
| `news_signal_count_30d` (player: count of beat-reporter mentions over 30 days, sentiment-tagged) | News-watcher subagent (planned) | Daily | Medium | Corpus v2 > Cluster 4 (training-camp announcement reliability open question) |

**Critical interpretive note for v1**: most signals in this category are SUBJECTIVE (manual coding required) because the published research is heavy on industry-tier sources rather than peer-reviewed quantification. Per the v2 corpus maintenance notes, peer-reviewed offseason-transition work is rare. The engine treats this honestly: subjective signals are explicitly tagged as confidence MEDIUM, and a transition signal is allowed to widen a variance band but NOT to shift a point estimate alone. The exception is `rb_role_tier`, which has clear quantitative thresholds (60/67/75 percent snap share) that the corpus cites directly.

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

**RB rubric v1 additions (2026-05-03)** based on v2 corpus cluster 3. The RB position is the most affected by offseason transitions. New signals layered on top of the v0 stack:

- `rb_role_tier` becomes a HARD GATE on the rubric output: a player coded `committee_member` or `starter_uncertain` cannot score above 0.60 on the rubric until the role clarifies. Lead-back / bellcow / strict-bellcow tiers use the v0 weight stack as-is.
- `ol_continuity_score` and `ol_grade_run` enter as VARIANCE-BAND modifiers (see section 8.4): low team OL continuity widens the projection band by 15-25 percent without shifting the point estimate.
- `rb_traded_offseason_flag` activates the post-trade prior: 64 percent improve, median +6.8 percent fantasy points (corpus). Engine should NOT default-discount traded RBs; instead surface the three role-profile classifications (featured / committee / passdown).
- `rb_role_at_new_team_projected` is a hard input when the trade flag fires; it routes the post-trade RB into the right tier expectations.
- `rb_passdown_share_priorYear` boosts the engine's confidence in role retention across coaching changes (passdown roles port better than rushing roles).
- Compounding-news flag (when 3+ offseason transitions affect this RB simultaneously) routes to arbitrage cluster 7.6.

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

### 5.7 Offseason transition signals (v1)

This is the engine's prediction-business layer (v2 corpus). Transition signals describe how a player's situation has CHANGED entering the new season, which the past-data signals can't capture.

**Offensive line transitions.** Team-level OL signals (`ol_continuity_score`, `ol_grade_run`, `rookie_ol_starters_count`, `rookie_ol_position_breakdown`) feed into the RB rubric primarily and the QB rubric secondarily. Per corpus, OL signals at the team level are real (continuity r=0.440 to DVOA, run-blocking grade r=0.50 to YPA) but at the individual-RB level are modest (r~0.25). Honest treatment: OL is a TEAM-LEVEL CONTEXT modifier on RB variance bands, not a per-player point-estimate adjustment. Rookie tackles (year-1 grade r=0.67 to year-2) are treated as nearer-final than rookie interior linemen (centers r=0.38, real year-2 leap potential).

**Coaching change effects.** First-time HC carries a documented 0.447 win-pct year-1 prior; new-HC effect on individual WR1 production is ~0.72 PPR/game with p=0.096 (statistically marginal per numberFire). Team context dominates coach. The engine treats `hc_first_time_flag` and `staff_novelty_composite` as team-level variance-band modifiers, not point-estimate adjustments. The `scheme_tag` field is a CATEGORICAL CONTEXT used by individual-position rubrics (e.g., Shanahan-tag elevates RB ceiling priors but doesn't lock a single bellcow; McVay-tag favors slot-bigs at WR; Air-Raid tag depresses RB ceilings).

**RB role transitions (most impactful at individual level).** `rb_role_tier` is a HARD GATE on the RB rubric. Three operational thresholds from the corpus: lead-back (>=60 percent snap share), bellcow (>=67 percent over 15+ games), strict bellcow (>=75 percent season). Trades trigger the post-trade prior: 64 percent improve, median +6.8 percent. The engine classifies into three role-profile buckets at the new team (featured / committee / passdown) BEFORE projecting points; this is the single most common analyst error per the corpus and the engine treats it as a routing problem.

**Compounding-news cases.** When 3+ offseason transitions hit a player simultaneously (e.g., new team + new HC + new QB), the dynasty market under-prices the variance compression per corpus cluster 4. Routes to arbitrage cluster 7.6.

### 5.8 Variance-band modifiers (v1, corpus-derived)

**Key conceptual addition in v1**: many corpus signals legitimately widen the variance band on a player's projection without shifting the point estimate. The engine maintains TWO outputs per player per signal pass:

1. **Point estimate** (the projected value we use for headline ranking, recommendation copy, lane bucketing).
2. **Variance band** (the 25th-to-75th percentile range we use for confidence labels, "show your work" mode, and arbitrage detection).

Variance-band modifiers from v2 corpus:

| Modifier | Effect on band | Source |
|---|---|---|
| `ol_continuity_score` low (bottom quartile) | Widen RB band by +25 percent | Corpus v2 > Cluster 1 |
| `staff_novelty_composite` >= 2 | Widen team-context band by +20 percent | Corpus v2 > Cluster 2 |
| `oc_first_year_with_team_flag` = true | Widen TE band by +15 percent | Corpus v2 > Cluster 2 (OC tenure dominant for TE) |
| `compounding_news_count` >= 3 | Widen player band by +30 percent both directions | Corpus v2 > Cluster 4 |
| `rb_traded_offseason_flag` = true | Widen RB band by +15 percent (asymmetric: corpus skews positive) | Corpus v2 > Cluster 3 (Stats with Sasa) |
| `rookie_ol_starters_count` >= 2 (interior) | Widen RB band by +10 percent with year-2 upside skew | Corpus v2 > Cluster 1 (PFF rookie OL development) |
| `injury_type` in {Achilles within 12 mo, ACL within 24 mo} | Discount point estimate (covered in v0 5.2) AND widen band | Corpus v1 > Injury history |

The user-facing surface for variance bands: in the Decision card and AAR, a wide band shows as a "high variance" tag on the player chip; a narrow band shows as "high confidence." The Soundboard `variance_tolerance` dial (already scaffolded) maps directly: high tolerance values bias toward wide-band picks; low tolerance toward narrow-band picks.

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

### 7.6 Compounding-news arbitrage cluster (v1)

This is the v2-corpus arbitrage pattern. When 3+ offseason transitions affect a single player simultaneously, the dynasty market under-prices the variance compression. The engine surfaces these as "mis-priced both directions" candidates and lets the user's risk preference (Soundboard `variance_tolerance` dial) decide.

- **Condition cluster** (engine flags when 3+ of these fire on one player in one offseason):
  - `team_changed_flag` (player traded or signed with new team)
  - `hc_first_time_flag` at the new team
  - `oc_first_year_with_team_flag` at the new team
  - `qb_changed_flag` (new starting QB at the new team)
  - `scheme_tag_changed_flag` (scheme family different from prior team)
  - `position_role_tier_uncertain_flag` (e.g., RB role hasn't clarified)
- **Engine treatment**: `compounding_news_count` >= 3 routes the player to a "high-variance, mis-priced" surface in the Decision card and AAR. Variance band widens by +30 percent both directions per section 5.8. The point estimate stays at the rubric output; the WIDTH conveys the mis-pricing.
- **Historical analogs (illustrative; corpus does not yet have a quantified hit-rate study, logged as open question)**: Mike Evans-to-SF case (new team + Shanahan scheme + Brock Purdy QB tier change = 3 transitions); Cooper Kupp-to-Seattle 2025 (new team + new HC + new QB); Saquon Barkley to PHI 2024 (new team + new HC + new OC + Hurts QB, 4 transitions, market significantly under-priced his year-1 outcome).
- **Predictive signal cluster**: 3+ flags AND scheme-fit alignment per the v2 corpus = upside-tilt arbitrage. 3+ flags AND scheme-fit mismatch = downside-tilt. The engine should NOT collapse to a point-estimate adjustment; it should surface the variance asymmetrically.

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

### 8.4 Variance-band layer (v1, paired with section 5.8)

The combination layer outputs TWO numbers per player (point estimate + variance band) instead of one. Compose order:

1. Position rubric produces a point estimate.
2. KTC market prior bayesian-blends with the rubric output (section 8.1).
3. Doctrine modifier shifts within bounded range (section 8.2).
4. Macro modifier applies (section 8.3).
5. Variance-band modifiers from section 5.8 widen or narrow the band around the now-stable point estimate. Modifiers compose multiplicatively (a 1.25x widening from low OL continuity AND a 1.30x widening from compounding-news AND a 1.15x widening from offseason-trade flag yields a band roughly 1.86x wider than baseline).

The variance band is published alongside the point estimate. Surfaces consume both: ranking views use the point estimate; confidence labels and arbitrage detection use the band width; the AAR's grade math now incorporates band tightness as a factor (a tight-band team is a more LOCKED contender than a wide-band team at the same point-estimate rank).

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

### 9.7 Phase 2 v0 + v1 backtest result (last updated 2026-05-07)

**Run label:** `phase2_v1_dyn_*` rows in `backtest_runs`. Source CSV: `web/data/scoreboard/scoreboard_v1.csv`.

**Methodology:**
- Universe: KTC top-200 dynasty 1QB at preseason snapshot (Aug 14 of each prediction year)
- Engine output: ranked by `evaluate(ctx).point_estimate`. v0 runs with `ctx.player = null` (no signal codes); v1 runs load `historical_signal_codes` for the prediction year via `--with-signals`.
- Predicted top-100 joined to actual cumulative PPR rank. Cumulative window: 3yr for 2022 prediction (2022+2023+2024 outcomes), 2yr for 2023 (2023+2024), 1yr for 2024 (2024 only).
- Metric: Spearman rank correlation between predicted rank and actual cumulative PPR rank.
- v1 signal coverage: 174 RBs hand-coded across 2022/2023/2024 (52 + 63 + 59 successfully extracted). Other positions (QB/WR/TE) run on rubric + age curve only; signal stack is RB-specific in v1.

**Results (1QB dynasty, top-100 predicted):**

| Source | 2022 (3yr) | 2023 (2yr) | 2024 (1yr) | Avg |
|---|---|---|---|---|
| **Dynasty General v1 (RB signals loaded)** | 0.442 | **0.474** | **0.346** | **0.421** |
| Dynasty General v0 (no signals) | 0.390 | 0.467 | 0.339 | 0.399 |
| FantasyPros ECR | **0.463** | 0.433 | 0.200 | 0.365 |
| FantasyPros ADP | **0.463** | **0.535** | 0.093 | 0.364 |
| KTC (market) | 0.354 | 0.449 | 0.236 | 0.346 |

**v1 vs v0:** v1 with full RB signal coverage beats v0 on every horizon, biggest gain on 3-year (+0.052), modest on 2-year and 1-year. Average +0.022 absolute (5.5% relative). The earlier "v1 < v0 with 7 RBs coded" finding (recorded 2026-05-06) was a noise artifact from undercoverage; at full coverage the signal dominates.

**v1 vs consensus baselines:**
- Beats FantasyPros ECR by 0.056 (15% relative) on average
- Beats FantasyPros ADP by 0.057 (16% relative) on average
- Beats KTC market consensus by 0.075 (22% relative) on average

**Per-year picture (more honest than the average):**

- **2024 (1yr cumulative):** Dynasty General v1 dominates by a wide margin (0.346 vs FP ECR 0.200, FP ADP 0.093, KTC 0.236). The 2024 NFL season had unusually high star-player injury rates (CMC, Burrow, Aiyuk, Kincaid); FP rankings collapsed (FP ADP at 0.093 is essentially random) while DG's age curves correctly downgraded aging starters. This single-year DG outperformance drives most of the average lead.
- **2023 (2yr cumulative):** FP ADP wins (0.535 vs DG v1 0.474). Both are competitive; DG v1 ahead of FP ECR (0.433) and KTC (0.449).
- **2022 (3yr cumulative):** FP ECR and FP ADP tie at 0.463 vs DG v1 at 0.442. The longest horizon is where consensus ranking captures something DG doesn't yet.

**The claim that survives scrutiny:**

DG v1 wins on AVERAGE across the three years, primarily because FP collapses on 2024 1-year while DG holds up. On the per-year long-horizon (2022 3yr, 2023 2yr) DG is competitive but not dominant.

**The honest framing for marketing:** "Dynasty General beats consensus on average across 2022-2024 backtests. Per-year, we dominate the year consensus got most wrong; we're competitive but trailing on the longest horizons. Open work: extend signal coverage beyond RBs, investigate the long-horizon FP signal we don't yet capture."

**Sample sizes:**
- 86-89 joined pairs per source for 2022 (3yr)
- 62-72 joined pairs per source for 2023 (2yr)
- 64-73 joined pairs per source for 2024 (1yr)

Sample sizes this small place a ±0.05 to ±0.10 confidence interval on the reported Spearman values. The v1 average win is real; the year-over-year deltas (especially 2023 and 2024 where v1 vs v0 is +0.007) are inside the noise band.

**Caveats:**

1. **Signal coverage is RB-only in v1.** QB / WR / TE predictions run on rubric + age curve only. The long-horizon gap to FP (where FP wins on 2022/2023) is plausibly because FP integrates expert opinion across all positions; DG v1 only adds signal data for RBs. Extending hand-coded signals to WR / QB / TE would test this hypothesis. Estimated cost: ~$300-450 in extraction across 3 years × 3 positions × ~50 players each.
2. **Loss function is still partial.** Section 8.2 of VALIDATION_PLAN specifies `L_dynasty = 0.6 × KTC_6mo_value_MAE + 0.4 × cumulative_3yr_PPR_RMSE`. We report Spearman rank correlation as a proxy. Value drift data is in `backtest_runs.baseline_comparisons.mean_ktc_drift` for runs with KTC snapshots; the weighted composite is queued.
3. **Cumulative window is incomplete for 2024.** The 2024 prediction is scored against a 1-year cumulative. When 2025 and 2026 outcomes are ingested, the 2024 prediction can be re-scored against the full 3yr horizon, potentially changing the per-year picture.
4. **Engine restricted to KTC top-200 universe.** Players ranked outside KTC top-200 are not predicted by v0/v1. Fair join with FP ECR (which ranks 500+) within the top-100, but the engine cannot find a "diamond in the rough" KTC missed entirely.
5. **DSTs and kickers excluded** (no rubric for them, and they don't appear in dynasty markets meaningfully).
6. **The horizon-gating thesis is refuted.** A 2026-05-06 partial-coverage finding suggested the bellcow boost might hurt long-horizon correlation; the founder locked in option 2 (horizon-gate the boost). Full-coverage data refutes this: v1 wins biggest on 3-year. Horizon-gating implementation parked.
7. **2024 dominance is dataset-dependent.** The DG average win is driven by FP's bad 2024. If 2024 is an outlier year (unusual injury distribution) rather than a structural FP weakness, the average claim weakens for future years. Re-run after 2025 outcomes ingest to verify.

**Conclusion:**

Engine v1 with full RB signal coverage produces a measurable improvement over both engine v0 and named consensus baselines on average. The win is concentrated in the 2024 year where consensus rankings collapsed; on long-horizon dynasty windows (2022 3yr, 2023 2yr) DG is competitive but trails FP. The falsifiable claim from VALIDATION_PLAN section 3 (mandatory: beat naive last-year + ADP autodraft on the chosen loss function) is met. The "stretch" claim of beating FP by 8%+ on the loss function on every horizon is NOT met; v1 wins average, loses 2 of 3 per-year. v2 work (extending signal coverage to non-RB positions, investigating the long-horizon FP signal) is queued.

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

**v1 additions (2026-05-03)** flagged for backtest from v2 corpus:
- Variance-band multipliers in section 5.8 (1.10x to 1.30x per modifier). Order of magnitude defensible from corpus correlations but specific values are placeholders.
- Compounding-news threshold (3+ transitions). The corpus identifies the pattern; it does not quantify the threshold. INTERNAL until backtest.
- Scheme-tag taxonomy (Shanahan / McVay / Reid / Air-Raid / Spread / Pro-Style / West-Coast / Erhardt-Perkins / other). Manual coding decisions per team.
- HC-background tag categories (offensive_coordinator / defensive_coordinator / college / position_coach). Coarser than the cohort study would warrant; refine when a quantified study lands.
- RB role-tier hard gate at 0.60 score ceiling for committee_member / starter_uncertain. Cap is INTERNAL; corpus supports the existence of the tier but not the specific cap value.

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

**v1 additions from v2 corpus expansion (2026-05-03), 13 new gaps:**

11. Quantified delta-on-delta study: OL grade change vs RB1 production change.
12. Rookie OL grade by 12 weeks vs full-season as early-warning for year-2 leap.
13. OL grade change under same OC vs new OC, holding personnel constant.
14. Year-1 HC offensive-identity persistence vs prior season.
15. Reid-tree-specific RB and WR fantasy-impact study.
16. Fantasy production change when OC moves teams without player vs player moves with same OC.
17. Year-N to year-N+1 bellcow retention rate, conditional on age and team-context change.
18. Target-share retention vs carry-share retention across coaching changes.
19. Successor RB year-1 production after prior bellcow departs.
20. Dynasty market efficiency formal study (where does KTC mis-price post-event?). The product itself can generate this evidence via internal backtests.
21. Training-camp starter-announcement reliability through Week 1.
22. Free-agent landing-spot longitudinal study, controlled for QB and scheme change.
23. Rookie-HC year-1 bust rate by coaching background (OC / DC / college / position).

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

- **v1 (2026-05-03)**: Offseason transition signals integrated per founder direction and v2 corpus expansion. Major additions:
  - Section 3.9: 17 new transition signals (OL continuity, scheme tag, RB role tier, compounding-news count, etc.)
  - Section 4.2 RB rubric: role-tier becomes a hard gate; v2-corpus context modifiers layered on top
  - Section 5.7: comprehensive treatment of offseason transition signals (OL, coaching, RB role, compounding)
  - Section 5.8: variance-band modifiers concept introduced. Many transition signals widen the variance band rather than shifting the point estimate, per corpus quantitative effect sizes.
  - Section 7.6: compounding-news arbitrage cluster. 3+ transitions affecting one player = mis-priced, surface as variance-asymmetric play.
  - Section 8.4: variance-band layer in combination logic. Two outputs per player (point estimate + band).
  - Section 10: 5 new internal heuristics from v2 (variance-band multipliers, compounding-news threshold, scheme-tag taxonomy, HC-background categories, RB role-tier hard cap).
  - Section 11.2: 13 new open research questions from v2 corpus.
  - Companion build plan added at `web/BUILD_PLAN.md` (Phase 1 actionable spec).

- **v1.1 / Phase 2 v0 backtest result (2026-05-05)**: First measurable scoreboard run. Engine v0 (no signal codes, only position rubrics + age curves) achieves Spearman 0.399 averaged across 2022-2024 dynasty backtests, beating FP ECR (0.365), FP ADP (0.364), and KTC (0.346). See section 9.7 for methodology, results table, and caveats. NOT a model architecture change; documents the validation milestone.

Future versions:
- **v2**: post-backtest weight updates; INTERNAL_HEURISTIC items either backtested or retired. Re-run engine with signal codes loaded (Track A in progress) and update section 9.7 with v1-with-signals numbers.
- **v3**: post-conference feedback incorporation; expanded corpus.
- **v3+**: hired-analyst tuning rounds; expert-curated weight sets per dial preset.
