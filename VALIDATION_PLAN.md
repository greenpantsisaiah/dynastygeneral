# Validation Plan v0

**Status:** draft, 2026-05-03
**Owner:** Isaiah McPeak
**Companion docs:** RESEARCH_CORPUS.md (signals), MODEL_CARD.md (model
contract), BUILD_PLAN.md (sequence), DATA_ACQUISITION_PLAN.md (gating
data sprint, not yet drafted)

## 0. Why this document exists

The Dynasty General model is research-grounded in its **signals** and
**architecture** (see RESEARCH_CORPUS.md and MODEL_CARD.md). Its
**weights** are still placeholder. Until we calibrate weights against
real outcomes and beat published baselines, every confidence claim the
product makes is partially aspirational.

This plan is the bridge from "research-grounded structure" to
"research-grounded predictions." It defines:

1. The three tests we run (one statistical, one simulated, one live)
2. The five public benchmarks we score against
3. The temporal-blinding protocol that prevents hindsight leakage
4. The drop-dead timeline driven by the 2026-season stunt commitment
5. The decision-log infrastructure that makes our claims auditable

The bar: at minimum, beat naive-last-year and ADP autodraft on RMSE.
Stretch: beat FantasyPros consensus and KTC-only by an operationally
meaningful margin (target 8% RMSE reduction on top-200 player-seasons).

## 1. The six holes this plan closes

These were named in the 2026-05-03 architecture rethink and the stunt
addition:

| Hole | One-line | Closed by |
|---|---|---|
| 1 | Hindsight leakage in historical replay | Section 4 (temporal blinding) |
| 2 | Data access reality for 3-year window | DATA_ACQUISITION_PLAN.md (separate sprint) |
| 3 | "10 leagues" is the wrong unit of statistical power | Section 5 (Test A reframed as N=2,700 player-seasons) |
| 4 | "Beat MIT/experts" needs operational definition | Section 7 (5 named public benchmarks) |
| 5 | Question banks need opponent-profile layer | Section 9.6 (Phase 1.6 manager_profile signal) |
| 6 | Keeper EV math doesn't exist | Section 8 (format-aware loss functions) |

Plus the new addition: **"we never guided a real user through a real
draft"** is closed by Section 6 (Test C, the 2026 stunts).

## 2. Three tests, three different questions

Each test answers a different question. We do not collapse them.

| Test | Question | Unit | When |
|---|---|---|---|
| **A: Backtest** | Are our predictions calibrated? | Player-season (N≈2,700 over 3 years) | Phase 2, June-July 2026 |
| **B: Simulation** | Does our decision framing actually win? | League placement vs peer agents (N=30 leagues) | Phase 2, July 2026 |
| **C: Live stunts** | Does it work on real humans in real leagues? | Per-decision quality (N≈600 decisions across 5 leagues) | 2026 season, Sept-Jan |

**Why all three:** Test A can pass while B fails (good predictions, bad
decision framing). B can pass while A fails (lucky in sims). C can
disagree with both (real opponents do things bots don't). Together they
form the credibility envelope.

## 3. Goals and success criteria

### Test A (statistical)

- RMSE on top-200 player-season predicted PPR points beats:
  - Naive last-year (mandatory; if we lose this we ship nothing)
  - ADP autodraft (mandatory)
  - FantasyPros expert consensus (target)
  - KTC-only baseline for dynasty (target)
- Variance bands well-calibrated: 80% prediction band contains 80% of
  observed outcomes within ±5 percentage points
- Per-position RMSE published separately (RB-specific score is the
  load-bearing claim because the corpus is RB-richest)

### Test B (simulation)

- Across 30 simulated leagues (10 redraft / 10 dynasty / 10 keeper),
  median percentile rank ≥ 60th
- Top-3 finish rate in dynasty ≥ 40% (vs 25% if random)
- Beats every peer agent in at least one format

### Test C (live)

- Decision-log shows ≥75% of recommended actions taken
- Per-decision quality (graded via Test A model + retrospective expert
  review) median ≥ 50th percentile against the league's other 11
  managers' decisions
- Win at least 1 of 5 stunt leagues outright; finish top-3 in at least 3
- AI-vs-AI reddit league: top-3 finish

## 4. Temporal blinding protocol (mandatory for Test A)

Every component of the model has a **vintage tag**: the latest year of
information allowed in. The harness enforces vintage at evaluation time.

### 4.1 Signal vintaging

- Each signal in `signals/schema.ts` gets a `since_year` field (when it
  could have been computed in production)
- Each manually-coded value (RB role tier, scheme tag, HC background)
  gets a `coded_with_knowledge_through` timestamp
- Bulk-scraped signals (target share, YPRR, OL grades) inherit the
  source's publication date

### 4.2 Corpus vintaging

- Every entry in `RESEARCH_CORPUS.md` already cites a publication year
- The 2022 prediction run uses ONLY corpus entries with year ≤ 2022
- The 2023 run uses ≤ 2023. The 2024 run uses ≤ 2024.

### 4.3 Hand-coding protocol

For signals coded by hand:

1. Coder reads only primary sources from the prediction year (depth
   charts, beat reporter columns, training camp reports from that
   summer). Search restricted to dates < draft_date of that year.
2. Codes are committed to git BEFORE the calibration script runs.
3. A second pass spot-checks 10% of codes against the protocol
   (e.g. you cannot code "Najee Harris committee_member" in 2022 if
   that was only obvious by mid-season).

### 4.4 Prior vintaging

- KTC historical snapshot at draft date (per year): used as Bayesian
  prior
- If KTC historical is unavailable, fallback to FantasyCalc snapshot
- If both unavailable, fallback to FantasyPros ECR at draft date
- Whichever prior is used, MODEL_CARD must record it per run

### 4.5 Audit trail

- All vintage decisions logged in `validation/2022_run.json` etc.
- Reviewers can replay any prediction with the exact signal/corpus state

This is the single most important section of this plan. Without
vintaging the entire backtest is theater.

## 5. Test A: backtest spec

**Universe:** Top 300 PPR-relevant players each year (rosterable in any
12-team league). Excludes players with <4 games played (injury filter).

**Data:** 2022, 2023, 2024 seasons. Total predictions ≈ 2,700
player-seasons.

**Predictions made at:** Draft date for each season (typically late
August).

**Outcome scored:** Actual PPR points, full season including playoffs
where applicable. Per-game weight applied for partial seasons.

**Loss functions (per format, see Section 8):**
- L_redraft = season_PPR_RMSE
- L_dynasty = 0.6 × 6mo_KTC_value_MAE + 0.4 × 3yr_cumulative_PPR_RMSE
- L_SF_dynasty = same as L_dynasty with QB position weighted 1.6x
- L_keeper_v0 = season_PPR_RMSE for kept slots only (full keeper EV in v1)

**Baselines (peer methodologies):**

| Baseline | Source | Cost |
|---|---|---|
| Naive last-year | trivial recompute | free |
| ADP autodraft | Underdog ADP historical | scrape |
| FantasyPros consensus | FantasyPros archives | scrape |
| KTC-only | KTC historical (if available) | license/scrape/fallback |
| Random within tier | trivial recompute | free |

**Output artifacts:**
- `validation/scoreboard_2026_07.csv` (one row per (year, position, model, metric))
- `validation/calibration_plot.png` (variance band coverage)
- `validation/per_position_rmse.csv`
- One-page summary in MODEL_CARD.md section 12 (validation results)

## 6. Test B: simulation spec

**Setup:** 30 leagues, all run via Sleeper API or simulation harness
- 10 redraft (PPR, 12-team, snake)
- 10 dynasty startup (SF scoring, 12-team)
- 10 keeper (1-keeper-from-prior, PPR, 12-team)

**Agents (each league filled with 12 of these):**
- Dynasty General agent (us)
- Naive last-year agent
- ADP autodraft agent
- FantasyPros consensus agent
- KTC-only agent (dynasty only)
- "High variance" dart-throw agent
- 5-6 additional baselines (TBD per format)

**Scoring:** Each season simulated using historical actuals (so 2022
sim plays out 2022 outcomes). League placement is the metric.

**Why not bots-against-bots in 2025/2026 actuals:** Because we don't
have the actuals yet. Sims must use historical seasons.

**Output:** `validation/sim_results.csv` with placement per agent per
league.

## 7. Public benchmarks and scoreboard

Five named, replicable comparisons. Anyone can rerun. Anyone can audit.

1. **FantasyPros expert consensus** (ECR rank → predicted points)
2. **Underdog ADP** (ADP rank → predicted points)
3. **KTC dynasty values** (6-month value-change MAE)
4. **Mike Clay tiers** (or alternate named ranker if Clay unscrapable)
5. **Naive last-year baseline** (player_points(t) = player_points(t-1))

We publish a public scoreboard at `dynastygeneral.app/scoreboard` (or
similar). It updates after each calibration run. Each entry shows our
score, the baseline score, the delta, and links to the methodology.

This is the credibility artifact. It is the marketing artifact. It is
the gate before we make claims like "research-grounded weights" or
"beats expert consensus."

## 8. Format-aware loss functions

The MODEL_CARD currently specifies one loss. That's wrong. Each format
has a different objective:

### 8.1 Redraft (v0)
```
L_redraft = season_PPR_RMSE
```
KTC irrelevant. Dynasty value irrelevant. Pure season-points prediction.

### 8.2 Standard dynasty (v0)
```
L_dynasty = 0.6 × KTC_6mo_value_MAE + 0.4 × cumulative_3yr_PPR_RMSE
```
Bayesian: KTC is the prior, signals shift the posterior, validation is
6-month value drift + 3-year fantasy realization.

### 8.3 SF dynasty (v0)
```
L_SF = L_dynasty with position_weight[QB] = 1.6
```
Per corpus QB demand finding (section 4.4 of MODEL_CARD).

### 8.4 Keeper v0 (kept-player only)
```
L_keeper_v0 = season_PPR_RMSE for the keeper(s)
```
This is a SHIPPING-COMPROMISE v0. Real keeper EV requires modeling cost
basis (round cost, salary cost, contract length).

### 8.5 Keeper v1 (full EV, post-Phase-2)
```
L_keeper_v1 = season_PPR_RMSE + cost_basis_penalty + contract_remaining_premium
```
Out of scope for Phase 2 calibration. Tracked in BUILD_PLAN as Phase
3.x deliverable.

### 8.6 Best Ball (v0, post-Phase-2)
```
L_bestball = season_PPR_top_8_starts_RMSE + variance_premium
```
Best Ball rewards high-variance pickups because only top games count
each week. Needs separate loss.

## 9. Test C: 2026 live stunt protocol

### 9.1 The five leagues

| # | Format | Why this format |
|---|---|---|
| 1 | PPR redraft | Validates redraft loss + season decisions |
| 2 | SF dynasty startup | Validates draft-day quality + QB-weighted dynasty math |
| 3 | Standard dynasty in-progress | Validates trade/waiver loop on existing roster |
| 4 | Keeper league | Validates keeper EV math (the v1 gap) |
| 5 | Best Ball | Validates variance-aware drafting |

Plus:

### 9.2 AI-vs-AI reddit league

- 12-team, format = SF dynasty (most discriminating + most marketable)
- Neutral commissioner (recruited from r/fantasyfootball, ideally
  someone with no AI horse in race)
- Pre-locked rules: each entrant commits AI source, posts public
  reasoning weekly
- Recruitment: r/fantasyfootball + r/dynastyff + r/DynastyFF + Twitter
- Target entrants: ChatGPT-driven, Claude-direct, Reflex.gg, our
  product, Underdog-ADP-bot, last-year-points-only baseline

### 9.3 Override budget

- Pre-registered publicly before each draft
- Budget: **2 deviations per season per league**
- Each deviation logged with reason
- Override beyond budget = forfeit "AI-only" claim for that league
- Coach low-confidence (<0.4) recommendations may be overridden without
  burning budget IF founder posts the override-reason publicly

### 9.4 Decision log infrastructure

Required before drafts (mid-August 2026):

- Public dashboard at `dynastygeneral.app/log` (or similar)
- For each stunt league: every recommendation made, action taken, result
  observed
- Timestamps must be PRE-result (logged before kickoff Sunday)
- Weekly summary post: "what Coach said, what we did, what happened"

Without the log, post-hoc claims of "the model said X" are
unverifiable. Decision log is the audit trail that makes the stunts
credible.

### 9.5 Tilt protection

Founder commits in writing:
- No model-architecture decisions Sunday afternoons during stunt season
- Bug reports during the season go in a buffer; reviewed Mondays
- Stunt outcomes inform Phase 3+ planning, not in-season weight changes
- Separation of "playing this week" Isaiah from "reviewing model" Isaiah

### 9.6 Manager profile signal (Phase 1.6 dependency)

Question-bank entries like the Sanders trade-extraction example require
**opponent-profile data** we don't currently have. Phase 1.6 builds:

- `manager_profile` table per (league_id, user_id)
- Observable signals: draft tendencies, roster construction style,
  trade history accept/reject patterns, FAAB aggression, bench depth
- LLM-extraction layer for league chat (where ToS allows): tags
  conversational patterns (FOMO, contrarian, traditional,
  analytics-pilled, casual)
- Psychology-pitch matcher: given trade target + counterparty profile,
  generates 3 pitch frames matched to that counterparty

Stunts validate this layer indirectly (we'll see if Coach's psychology
pitches actually work on real humans).

## 10. Drop-dead timeline (driven by stunt commitment)

| Date | Phase | Milestone |
|---|---|---|
| 2026-05-03 to 2026-05-10 | Phase 0 wraps + planning | This doc + DATA_ACQUISITION_PLAN.md + SOUNDBOARD_V2.md |
| 2026-05-11 to 2026-05-31 | Phase 1 | Signals + 1.6 manager profile + 1.7 data audit |
| 2026-06-01 to 2026-06-21 | Phase 1.5 | Architecture redesign + Soundboard v2 wired |
| 2026-06-22 to 2026-07-01 | Phase 2 calibration sprint | **Test A run, scoreboard published** |
| 2026-07-02 to 2026-07-31 | Phase 2.5 | Test B sim run + Question Bank v0 (50 situations) |
| 2026-08-01 to 2026-08-15 | Stunt prep | Decision log dashboard live, override rules pre-registered |
| 2026-08-16+ | NFL drafts begin | **Test C goes live** |
| 2026-08-16 to 2027-01 | 2026 season | Stunts run, decision log updated weekly |
| 2027-01 to 2027-02 | Stunt postmortem | Test C results, Phase 3+ planning |

**Drop-dead:** July 1 2026 for Test A scoreboard. If calibration slips,
stunts go live with unvalidated weights and we eat brand-equity
damage. No slack. Every week of architectural ambiguity costs a week of
the calibration window.

## 11. What the validation plan does NOT do

- It does not validate the LLM (Coach) layer separately. Coach is
  evaluated as part of the live stunts (does it produce useful prose?
  does it hallucinate?). Future versions of this plan add Coach-specific
  validation.
- It does not validate UX/conversion (separate marketing analytics).
- It does not validate Soundboard dial sensitivity. That's a Phase 3
  add-on: how much does adjusting horizon dial change the recommended
  team?
- It does not validate question-bank coverage exhaustively. Phase 2.5
  ships 50 canonical situations; full coverage is a Phase 4+ effort.

## 12. Open questions (to resolve in next 2 weeks)

1. **KTC historical access:** can we license/scrape daily snapshots
   for 2022-2024? Answered by DATA_ACQUISITION_PLAN.md.
2. **Sleeper league data ToS:** can we run sim leagues programmatically
   at scale, or do we need a separate sim harness?
3. **PFF redistribution rules:** how much PFF data can appear in the
   public scoreboard?
4. **Reddit AI league recruitment:** what's the realistic entrant pool?
   Need to scout 3-4 active AI-fantasy threads to gauge interest.
5. **Test A vintaging for hand-coded signals:** founder may not have
   time to hand-code 3 historical seasons. LLM-extraction agent (Phase
   1 reframed) becomes load-bearing.
6. **Marketing artifact format:** scoreboard page vs. blog post vs.
   conference paper vs. all three? Probably all three but order
   matters.

## 13. Next document

`DATA_ACQUISITION_PLAN.md` covers what we need, what we have access
to, what we license, what fallbacks exist if a source is blocked. It
gates Section 4 (vintaging) and Section 5 (backtest spec).
