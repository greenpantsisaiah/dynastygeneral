# Dynasty General Build Plan

**Version**: Phase 1 spec, v2 amended 2026-05-03
**Last updated**: 2026-05-03
**Status**: ready to execute
**Companion**: `MODEL_CARD.md` v1, `RESEARCH_CORPUS.md` v2, `VALIDATION_PLAN.md` v0, `DATA_ACQUISITION_PLAN.md` v0, `SOUNDBOARD_V2.md` v0

This is the actionable plan for shipping the model the corpus + model card describe. It exists because "build the engine from the model card" is a research-paper instruction, not a programmable one. This document is the programmable version: ordered backlog, deliverables, acquisition list, and the criteria to know each phase is done.

The plan is opinionated about ORDER. Some pieces could ship in parallel, but Phase 1 is sequenced so the earliest deliverables produce visible product value (so the founder is shipping working code week 1, not waiting four weeks for a backend buildout).

## v2 amendment (2026-05-03): stunt commitment changes the timeline

The 2026-season stunt commitment (5 format-diverse leagues + AI-vs-AI reddit league as the primary public validation channel) creates a hard calibration drop-dead of **July 1 2026**. See `VALIDATION_PLAN.md` for full spec; here is the impact on this plan.

### v2 changes vs original Phase 1+ definitions

1. **New Phase 1.5: Architecture redesign.** Inserted between signal ingest and calibration. Soundboard v1 retired in favor of v2 (14 dials across 3 tiers). See `SOUNDBOARD_V2.md`.
2. **New Phase 1.6: Manager Profile signal.** Required for question-bank entries that reason about opponents (e.g., trade-extraction with psychology matching). Adds `manager_profile` table.
3. **New Phase 1.7: Data Acquisition Sprint.** A 7-day audit producing `DATA_ACQUISITION_PLAN.md`. Gates Phase 2 calibration. Confirms KTC historical, FantasyCalc, FantasyPros archives, PFF redistribution, etc.
4. **Phase 1.2 manual coding reframed.** Founder named the wall on 2026-04-29 ("I don't know NFL teams cold"). Replace founder hand-coding with LLM-extraction agent (`historical-signal-extractor`). Founder reviews 10% sample for accuracy.
5. **Phase 2 calibration is now a spec, not just a harness.** Test A (2,700 player-season backtest with temporal blinding), Test B (30 simulated leagues with peer-methodology agents), Test C (live 2026 stunts). Five named public benchmarks. Public scoreboard at `dynastygeneral.app/scoreboard`.
6. **Format-aware loss functions** replace the single dynasty loss. Each format gets its own loss (redraft, dynasty standard, dynasty SF, keeper v0, Best Ball). See VALIDATION_PLAN section 8.

### v2 timeline

| Date | Phase | Milestone |
|---|---|---|
| 2026-05-03 to 2026-05-10 | Phase 0 wraps + planning + data sprint | Schema + admin + evaluate() stub. VALIDATION_PLAN, DATA_ACQUISITION_PLAN, SOUNDBOARD_V2 written. Data sprint completes. |
| 2026-05-11 to 2026-05-31 | Phase 1 + 1.6 + 1.7 | Bulk scrapers running. Manager profile scaffold. Historical-signal-extractor agent live. |
| 2026-06-01 to 2026-06-21 | Phase 1.5 | Architecture redesign + Soundboard v2 wired. |
| 2026-06-22 to 2026-07-01 | Phase 2 calibration sprint | **Test A + Test B run. Public scoreboard published.** |
| 2026-07-02 to 2026-07-31 | Phase 2.5 | Question Bank v0 (50 canonical situations) + buffer. |
| 2026-08-01 to 2026-08-15 | Stunt prep | Decision log dashboard live. Override rules pre-registered. |
| 2026-08-16+ | NFL drafts begin | **Test C goes live.** |

**Drop-dead:** July 1 2026 for Test A scoreboard. No slack. Every week of architectural ambiguity costs a week of the calibration window.

### v2 Phase definitions (deltas from original)

- **Phase 1.5 (week 4):** Soundboard v1 retired. v2 wired per `SOUNDBOARD_V2.md`. Engine consumers migrated to read dial values from `judgment_profiles_v2`. Old v1 component flagged behind `SOUNDBOARD_LEGACY` for one-season fallback.
- **Phase 1.6 (week 3):** `manager_profile` table per (league_id, user_id). Observable signals: draft tendencies, roster construction style, trade history accept/reject patterns, FAAB aggression, bench depth. LLM-extraction layer for league chat (where ToS allows). Psychology-pitch matcher: given trade target + counterparty profile, generates 3 pitch frames.
- **Phase 1.7 (days 1-7 of week 1):** Per `DATA_ACQUISITION_PLAN.md`. Day 1 ToS audit, Day 2 free-source verification, Day 3 paid-source procurement, Day 4 KTC historical sprint, Day 5 LLM-extraction prototype, Day 6 storage schema + migration `0010_validation.sql`, Day 7 acquisition smoke test.
- **Phase 2 (weeks 5-8):** Replaces original Phase 2 (backtest harness section below). Run Test A + Test B per VALIDATION_PLAN. Publish scoreboard. Calibrate Soundboard v2 default dial positions from backtest results.
- **Phase 2.5 (week 9):** Question Bank v0. 50 canonical situations covering trade, draft, hold/cut, lineup, lineup-injury, bye-week, dynasty-rebuild, win-now-trade, keeper-cost. Each entry: situation pattern + signal triggers + canonical answer template + which calibration test validates it.

The original Phase 1 (1.1 through 1.5) and Phase 2 sections below remain accurate for the work they describe. The amendment above adds new phases and reframes the calibration test spec.

## North star (what done looks like)

When Phase 1 ships, every player evaluation surface in the product (Decision card, Coach context, AAR, league standings, opponent characterization) reads from one `evaluate(player, league, user)` function that returns:

```typescript
{
  point_estimate: number,        // 0-100, the headline value
  variance_band: { lo: number, hi: number },  // 25th to 75th
  evidence_stack: Evidence[],    // every signal that fed in
  market_delta: number,          // posterior vs KTC prior
  confidence: number,            // 0-1, derived from band tightness
  arbitrage_flags: string[],     // e.g. ["compounding_news", "rb_cliff_breaker"]
}
```

Every consumer renders its own UX over this output. NO consumer reaches into raw signals; they read evidence stacks and ask the engine for what they need.

When this is true, the founder can:
1. Tune any weight in one place and have it propagate everywhere.
2. Backtest model versions against a held-out validation set (Phase 2).
3. Hire an analyst to refine weights via an admin console (Phase 4) without touching code.

## Phase 0: Foundation (week 1)

Ship before any Phase 1 work. These are unblocking moves with low scope.

### 0.1 Signals schema in Supabase

Migration `0009_signals.sql`. Tables:

```sql
-- Per-player slowly-changing signals. One row per player.
create table player_signals (
  player_id text primary key,
  position text,
  team text,
  age numeric,
  -- volume signals
  snap_share_priorYear numeric,
  route_participation_priorYear numeric,
  target_share_priorYear numeric,
  rush_share_priorYear numeric,
  weighted_opportunity_priorYear numeric,
  high_value_touches_priorYear numeric,
  -- efficiency signals
  yprr_priorYear numeric,
  adot_priorYear numeric,
  epa_per_play_priorYear numeric,
  cpoe_priorYear numeric,
  -- career-stage signals
  draft_round int,
  draft_pick_no int,
  ras numeric,
  college_dominator numeric,
  breakout_age numeric,
  weight_lb int,
  height_in int,
  -- contract signals
  contract_years_remaining int,
  recent_extension_flag boolean,
  contract_year_flag boolean,
  -- v1 transition signals (player-level)
  rb_role_tier text,         -- lead_back / bellcow / strict_bellcow / committee / passdown / starter_uncertain
  rb_traded_offseason_flag boolean,
  rb_role_at_new_team_projected text,
  rb_passdown_share_priorYear numeric,
  compounding_news_count int,
  -- meta
  source_attribution jsonb,  -- per-field source tags
  confidence_per_field jsonb,
  last_updated timestamptz,
  updated_by text            -- 'manual' or 'scrape:{job_name}' or 'cron:{name}'
);

-- Per-team slowly-changing signals. One row per team.
create table team_signals (
  team text primary key,
  -- OL signals
  ol_continuity_score numeric,
  ol_grade_run numeric,
  ol_grade_pass numeric,
  rookie_ol_starters_count int,
  rookie_ol_position_breakdown jsonb,  -- { tackles: 1, guards: 0, centers: 1 }
  -- coaching signals
  hc_id text,
  hc_first_time_flag boolean,
  hc_tenure_yrs int,
  hc_background_tag text,
  oc_id text,
  oc_tenure_yrs int,
  oc_first_year_with_team_flag boolean,
  -- scheme signals
  scheme_tag text,
  staff_novelty_composite int,
  scheme_pace numeric,
  pass_rate_neutral numeric,
  personnel_12_rate numeric,
  -- meta
  source_attribution jsonb,
  last_updated timestamptz,
  updated_by text
);

-- Per-player health/injury signals.
create table player_health (
  player_id text primary key,
  games_missed_3yr int,
  injury_history jsonb,  -- [{type, occurred_at, games_missed}]
  chronic_flag boolean,
  current_status text,
  off_field_flag boolean,
  holdout_flag boolean,
  last_updated timestamptz
);

-- Audit log of every signal change. For the expert console + reproducibility.
create table signal_changes (
  id bigserial primary key,
  table_name text,         -- 'player_signals' / 'team_signals' / 'player_health'
  row_id text,             -- player_id or team
  field text,
  old_value jsonb,
  new_value jsonb,
  changed_by text,         -- user_id or 'system:{job_name}'
  rationale text,
  changed_at timestamptz default now()
);
```

RLS: signals tables are read by service role + authenticated users with admin claim. Writes are service role only (cron jobs, admin console). The audit table is append-only.

### 0.2 Manual coding admin scaffold

Most v1 transition signals are SUBJECTIVE (scheme_tag, hc_background_tag, rb_role_tier when ambiguous, scheme_pace categorization). Need an admin UI for the founder to enter these.

Page: `/admin/signals/teams` and `/admin/signals/players`. Server component renders a table with editable cells. Each save fires an `INSERT INTO signal_changes` plus an `UPDATE` to the underlying table.

Scope minimum: edit team_signals fields with dropdown for scheme_tag, text input for ids, checkboxes for boolean flags. Skip fancy UX; just functional. Editor row has a `rationale` input that goes into the audit log.

Auth gate: existing pro-tier check + admin email allowlist (founder + Minhaj).

### 0.3 EvaluationEngine module skeleton

`src/lib/engine/evaluation.ts`. Exports:

```typescript
export function evaluate(
  player: PlayerSignals,
  team: TeamSignals,
  health: PlayerHealth | null,
  league: LeagueContext,
  user: UserContext,
): EvaluationOutput;
```

For Phase 0, this is a STUB that returns placeholder values matching the schema. The point is: every consumer can start importing and calling it. We swap real logic in incrementally without breaking callers.

### 0.4 Wire one consumer through the stub

Pick the Decision card. Replace its current scoring path with `evaluate()` calls. Verify output matches existing output (since stub returns placeholders that mirror current logic). Ship.

This proves the contract. Now we can refactor evaluation logic without touching the Decision card. Other consumers migrate later.

## Phase 1: Real signals + first real rubric (weeks 2-4)

### 1.1 Bulk-scrape free-tier signals

Build cron jobs (Vercel cron, runs nightly) that populate:

- `player_signals` from Sleeper stats + Pro Football Reference (last-season totals already partially flowing via `season-stats.ts` from prior work; expand to more fields)
- `team_signals.scheme_pace`, `pass_rate_neutral`, `personnel_12_rate` from nflfastR (publicly available CSV files at github.com/nflverse)
- `team_signals.ol_continuity_score` computed locally from Sleeper roster snapshots over the season (we have the data; need a small calc job)

Deliverable: `/api/cron/bulk-signals` route + cron config in `vercel.json`. Returns a JSON RunResult per existing cron pattern (`aar-notifications`).

NOT in this scope: PFF grades (paid; license decision deferred), Football Outsiders DVOA (paid; deferred), beat-reporter signals (Phase 3).

### 1.2 Manual coding session: top 200 players + 32 teams

Spend a focused half-day to seed the manual signals for top-200 dynasty-relevant players + all 32 teams. The admin UI from 0.2 is the input surface. Coding criteria:

**Per team:**
- `scheme_tag`: pick from (shanahan / mcvay / reid / air_raid / spread / pro_style / west_coast / erhardt_perkins / other). Use OC's coaching tree as the dominant signal.
- `hc_background_tag`: (offensive_coordinator / defensive_coordinator / college / position_coach).
- `oc_tenure_yrs`: count of consecutive years this OC has been with this team.
- `hc_first_time_flag`: is this their first NFL HC job?
- `staff_novelty_composite`: 0-3, count of (new HC + new OC + new GM in last 12 months).

**Per RB (top 64):**
- `rb_role_tier`: based on prior season snap share + projected role at new team if traded.
- `rb_traded_offseason_flag`: traded since last season ended.
- `rb_role_at_new_team_projected` (when traded): featured / committee / passdown_complement.

**Per WR / TE (top 100 each):**
- Lighter coding for v1: rely on automated signals. Manual coding only for `target_competition_score` qualitative read where the depth chart is genuinely ambiguous.

This produces a usable signal coverage matrix. Players outside top-200 carry default values until later passes.

### 1.3 RB rubric end-to-end

Pick the RB rubric as the first real implementation. RB has the most v2-corpus-affected signals (role tiers, OL transitions, post-trade flags), so getting it right validates the architecture for the others.

Implementation:
- `src/lib/engine/rubrics/rb.ts`: pure function from `(player, team, health, league)` to `{ point_estimate, evidence_stack }`.
- Hard-gate logic: committee / starter_uncertain caps at 0.60.
- Variance-band modifiers per section 5.8: low OL continuity, staff novelty, compounding news, traded offseason flag, rookie OL starters.
- Returns evidence stack: every signal that contributed, with weight + value + source.

Test: write a regression suite of 12 known archetypes (Bijan-tier bellcow + good OL, Spears-tier passdown back, Pacheco committee, post-trade Henry-tier, etc.). Each archetype has an expected score range; the test passes if the rubric output lands in the range.

Migrate the Decision card's RB scoring path to call `evaluateRb()` via `evaluate()`. Existing surfaces (lane grid, Quadrant, AAR) inherit automatically because they read from Decision card output.

### 1.4 Variance-band visualization

Update the Decision card to surface variance bands when present. Each candidate chip gets a small "confidence" tag derived from band tightness:

- band width <= 8 points: "Lock signal"
- 8-15: (no tag, default)
- 15-25: "High variance"
- 25+: "Mis-priced both directions" (the compounding-news arbitrage callout)

Same treatment in the AAR + Quadrant. The user-facing UX is light; the math is doing the heavy lifting.

### 1.5 Migrate other rubrics one at a time

Repeat 1.3 for QB, then WR, then TE. Each migration touches:
- New rubric file
- Regression suite
- Update the Decision card hook from stub to real (no consumer-side changes)

QB and WR rubrics map almost 1:1 to v0 model card weights since the v2 expansion was RB-heavy. TE rubric inherits OC tenure + scheme tag changes.

Done criterion for Phase 1: all four rubrics implemented; Decision card, AAR, Quadrant, and standings all read from `evaluate()`; manual coding covers top 200 players + 32 teams.

## Phase 2: Backtest harness (weeks 4-6)

Build the validation pipeline that turns Phase 1 into a defensible model.

### 2.1 Historical KTC ingestion

Pull KeepTradeCut historical values for 2019-2025 (the corpus uses this window). One-time script + manual upload. Schema: `ktc_history (player_id, date, value, format)`.

KTC's data isn't free for bulk download; this likely requires a paid license or scraped data. Decision pending; for v1, scope as "we have 6 months of KTC daily snapshots in our own DB from when we started running, plus whatever historical we can license."

### 2.2 Backtest harness

`src/lib/engine/backtest.ts`. Inputs: model version, validation window (e.g., "train 2019-2022, validate 2023, hold 2024-2025"). Outputs: per-position MAE on KTC value at t+180 days, Brier scores on probability outputs, calibration plots, comparison vs three baselines (KTC-alone, random, expert consensus).

CLI runner: `npm run backtest -- --version=v1 --validate=2023`. Emits a markdown report at `web/backtest_reports/{version}_{date}.md`.

### 2.3 Performance dashboard

`/admin/performance` page reads the latest backtest report and renders it. This is the slide deck for the Sloan presentation, surfaced live. Each model version's headline metrics tracked over time. Weight changes that degrade headline metrics are flagged.

## Phase 3: News watcher + signal updates (weeks 6-8)

Build the offseason update pipeline that the corpus directly justifies.

### 3.1 News-watcher cron

Vercel cron, runs every 6 hours. Pulls beat-reporter feeds (start with one or two: Rotoworld, NFL.com transactions). For each headline, pass through an LLM classifier prompt: "Which player(s)? What signal updates? Confidence?" Apply approved updates to player_signals, with rationale tagged in the audit log.

Founder reviews the audit log daily for the first week, approving or rejecting updates. After trust is established, loosen the gate to auto-apply for high-confidence classifications.

Cost: ~$0.10-1.00/day in LLM classifier calls depending on news volume.

### 3.2 Update propagation

When a signal changes, the affected player's `evaluate()` re-runs. Cache invalidation: signal-driven, not time-driven.

User-facing surface: the existing watchlist + continuity infrastructure already shipped. When a watched player's signals change, fire an alert (Pro feature gate).

## Phase 4: Expert hooks (weeks 8-10)

Make the model tunable without code changes, per founder requirement to eventually hire analysts.

### 4.1 model_config table

```sql
create table model_config (
  key text primary key,
  value jsonb,
  scope text,            -- 'qb' / 'rb' / 'wr' / 'te' / 'global'
  citation text,         -- corpus reference or "internal heuristic"
  last_modified_by text,
  last_modified_at timestamptz default now(),
  rationale text
);
```

Migrate every weight, threshold, and curve constant out of TypeScript code into this table. Engine reads at request time (cached for 60 seconds; signal-driven cache invalidation on writes).

### 4.2 Expert console

`/admin/model` page. Three tabs:
- SIGNALS: schema view + freshness + sources
- WEIGHTS: every config value + last edit + citation, with edit history
- PERFORMANCE: latest backtest dashboard

Editing a weight requires entering a rationale (logged to model_config + signal_changes). Backtest re-runs automatically on weight change; if headline metric drops, the change is flagged for review but not blocked (analyst judgment overrides).

## Phase 5: Show your work UX (weeks 10-12)

Make the engine's reasoning visible to end users.

### 5.1 "Show your work" mode toggle

A small chip on every recommendation surface (Decision card, AAR, lane grid, Quadrant). Click it for a modal showing the evidence stack: each signal that contributed to the score, the weight applied, the contribution to the final number, the source citation.

This is the user-facing exposability layer that the model card promises. It's also the feature that turns "engine said so" into "here's why."

### 5.2 Doctrine-effect preview

When the user moves a Soundboard dial, surface a "what changed" chip on the Decision card: "Risk Tolerance +60 → 3 picks shifted in your lanes. Open to see which."

This makes the doctrine layer feel responsive and educational, not magical.

## Acquisition list (data the founder needs to procure)

These are the data sources that affect Phase 1+ scope. Decisions can wait until Phase 1 ships, but the menu should be clear.

| Source | Cost | Phase needed | Decision |
|---|---|---|---|
| PFF grades (player + team) | Paid; ~$200/year individual or ~$500-2000/year API | Phase 1 enhancement | Defer until Phase 1 ships; backfill via free signals first. |
| Football Outsiders DVOA / ALY (full historical) | Paid via Football Outsiders Almanac, ~$25/year for current; archives variable | Phase 2 backtest enhancement | Defer; use free FO methodology articles for now. |
| KeepTradeCut historical values | License negotiation; pricing not public | Phase 2 backtest | Required for backtest; reach out before Phase 2 starts. |
| FantasyCalc historical | Public API; check terms of service | Phase 2 backtest | Probably free at our scale; check ToS before scraping. |
| Sharp Football scheme tags | Articles publicly available; no API | Phase 1 manual coding | Use as reference for manual coding session. Free. |
| Reception Perception (route success) | Paid via Matt Harmon | Phase 5+ enhancement | Defer; not critical for v1. |
| Beat-reporter feeds (Rotoworld, NFL.com) | Free RSS; some sources paywalled | Phase 3 news watcher | Free tier sufficient for v1. |
| Spotrac contract data | Free tier sufficient | Phase 1 player signals | Free; scrape with attribution. |
| Pro-football-reference stats | Free | Phase 1 player signals | Already in scope. |
| nflfastR play-by-play | Free | Phase 1 team signals | Already in scope. |

## Hired-analyst handoff template

When the time comes to hire a sports analyst to refine the model, this is what they need to be productive in week 1:

1. **Read** `MODEL_CARD.md` v1, `RESEARCH_CORPUS.md` v2, `BUILD_PLAN.md` (this doc). 90-minute read.
2. **Tour** the admin console (`/admin/signals/*`, `/admin/model`, `/admin/performance`).
3. **Run** the backtest harness for the current model version. Reproduce the latest performance report locally.
4. **Pick** an INTERNAL_HEURISTIC item from MODEL_CARD section 10 to investigate. Each item has a documented backtest plan; the analyst's job is to either validate the heuristic against historical data or propose a replacement weight.
5. **Submit** weight changes via the expert console with a written rationale. Backtest auto-runs; results displayed.

The analyst doesn't need to read product code. They read the corpus, the card, and the backtest results. They edit weights and watch performance.

## Done-criteria summary by phase

- **Phase 0 done**: signals schema migrated; admin scaffold reads/writes; `evaluate()` stub exists; Decision card calls it.
- **Phase 1 done**: bulk scrapers running; top-200 players + 32 teams manually coded; all four position rubrics live; variance bands surfaced in UI.
- **Phase 2 done**: backtest harness runs; latest report at `/admin/performance`; KTC-alone baseline beaten by N points (specific N TBD per founder gate).
- **Phase 3 done**: news watcher cron firing; signal updates auto-applying; user alerts firing on watched-player changes.
- **Phase 4 done**: model_config table populated; expert console deployed; backtest re-runs on weight change.
- **Phase 5 done**: "show your work" mode shipped; doctrine-effect preview live.

When Phase 5 ships, the model card and corpus are no longer aspirational; they're the documented reality of the system. That's the moment the conference talk becomes presentable.

## Open questions for the founder before Phase 1 starts

1. **Manual coding session timing**: when does the founder want to do the half-day coding session? Phase 1 step 1.2 is a real prerequisite; the engine can't run rubrics without it.
2. **KTC license**: should we reach out to KeepTradeCut about historical data licensing now (so it's resolved by Phase 2) or wait?
3. **PFF**: same question. PFF grades unlock real OL signals. Indicative pricing is ~$2000/year for API access; ~$200/year for the consumer subscription (manual lookup only). Decision before Phase 1 enhancement window.
4. **Manual coding cadence**: how often does the founder want to refresh subjective signals? Weekly (during offseason) is the natural baseline; monthly is the minimum to keep signals fresh.
5. **Phase 1 scope flex**: if any phase falls behind, which gets cut? Recommendation: keep Phase 1 + Phase 2 (signals + backtest) intact; Phase 3 (news watcher) is the natural slip target since it can ship later without breaking earlier work.
