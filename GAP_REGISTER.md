# Dynasty General · Gap register

Source: `FABLE_AUDIT_2026_09_15.md` (Parts 1 and 2). This is the working list the autoloop executes against. One row per gap. The loop picks the highest open row whose `Gate` is `none`, builds it in a fresh worktree, runs build and test, ships through the PR flow, flips `Status`, and reports. Rows with a founder gate are prepared (branch, dry run, draft copy) and then wait for a plain-language yes.

Status values: `open`, `in_progress`, `blocked`, `done` (with PR number). Gates: `none`, `copy` (public marketing copy), `write` (production data write), `legal`, `pricing`, `model` (a default-model change).

Order within a phase is priority order. Phases run roughly in order, but D0 to D1 run alongside Phase 0 because they are hours, not days.

## Phase 0 · Truth and trust

| ID | Gap | Acceptance | Gate | Status |
|---|---|---|---|---|
| G01 | Remove the pricing-page calibration receipt and the methodology h2 "We beat KeepTradeCut on every horizon"; replace with the MODEL_CARD 9.7 framing and a link to the scoreboard with caveats | Neither string exists in `src/`; the /vs-fantasypros page carries no live-engine accuracy number; footer disclaimer intact | copy | open |
| G02 | Homepage truth pass: label the Build shape and Opponent fingerprint charts and both "your roster" markers as illustrative or replace with cohort-derived data; soften "Every chart ships with its sample size and source"; demote the 82-roster subhead to a proof point; update meta description and JSON-LD to match | No hardcoded chart data presented as computed; hero subhead is the opponent read | copy | open |
| G03 | Scoreboard integrity: dedupe `backtest_runs` on (loss_function, model_version, format, prediction_year) keeping newest; trace the four 2022 v1 rows and declare one canonical; relabel the page "v0/v1 backtest, 2026-05-08, not the live engine" with an as-of line; `build-scoreboard.ts` dedupes on rebuild | Page and model card agree on every cell; CSV has no duplicate keys | none | open |
| G04 | Mount the waitlist on the homepage (the MFL page links to `/#waitlist`); add a Scout entry point on the homepage | Both links resolve | none | open |
| G05 | One canonical league standing: `resolveLeagueStanding` returning value rank, record rank, win-now rank, future rank, each computed once; consumed by posture, standings table, SWOT, team identity, AAR, Coach; registered in CANONICAL_SOURCES and the object-parity lint | The Finders Keepers hub shows one consistent rank story; lint fails a fork | none | open |
| G06 | In-season hub: make `classifyStage` read NFL state so `in_season` is reachable; wire `selectSurfaceLayout` or delete it; AAR banner off after week 1; WatchlistStrip, "Best value," "Watch the board," "Sharp positioning" off in-season; every "next N picks" and "before week 4" template routed through stage | Week-2 render of Finders Keepers contains no draft-phase copy; `evals/stage-adaptation.test.ts` covers in_season | none | open |
| G07 | Coach correction rule: on a disputed roster or number, restate exactly what the snapshot contains, name the source, offer a refresh; never agree to a claim the snapshot contradicts; never reverse without new data. Add an `evals/run.ts` scenario | Scenario passes; rule cited in SYSTEM_PROMPT | none | open |
| G08 | CI: GitHub Actions running `npm test` and `npm run build` on every PR and on main | A failing test blocks merge | none | open |
| G09 | Error tracking on the hub and Coach route; a route-level `error.tsx` for `/leagues/[leagueId]` that degrades instead of full-page crashing | An injected throw renders the boundary; errors reach the tracker with stack | none | open |
| G10 | Player blob into Upstash (or Vercel runtime cache) so cold instances stop re-pulling 5MB from Sleeper | Cold render does not hit Sleeper for the blob when the cache is warm | none | open |
| G11 | Scout includes keeper leagues (Sleeper type 1 with keeper settings), or states why a league is excluded | Finders Keepers appears on the founder's scout page | none | open |
| G12 | Doc truth: cohort label to "58 rosters analyzed of 82 gathered, 5 leagues"; MODEL_CARD "174 hand-coded" to "182 LLM-coded, not used live"; TRUTH_AUDIT numbers refreshed (team_signals 100%, route participation 17%, signal codes 984) | Docs match live counts | none | open |
| G13 | Enforced daily caps on (drop `observed_only`) while beta stays open, so one cohort cannot exhaust the global budget | A user over cap gets the specific cap message; global cap unchanged | pricing | open |
| G14 | Chrome cleanup: round every rendered value; remove "v1 prototype" and "v2 prototype" labels; fix "4 extra body"; inflection template must not call a WR3 "WR1"; AAR must not propose packaging the roster anchor to fill a depth slot | No unrounded floats or prototype labels in a hub render | none | open |

## Phase D · Data (hours first, then the corpus)

| ID | Gap | Acceptance | Gate | Status |
|---|---|---|---|---|
| D0a | Ingest 2025 outcomes, and 2018 to 2021, via `scripts/ingest-historical-outcomes.ts` (dry run first) | `historical_outcomes` has 2018 to 2025; re-run A4 and log deltas in negative-results | write | open |
| D0b | Fix `ingest-ktc-historical.ts` to upsert; remove the fivefold 2022-12-06 duplicate | One row per (player, source, date, format) | write | open |
| D1 | New `scripts/ingest-dynastyprocess-values.ts`: walk the 362 dated `values.csv` commits (and the ECR parquet as internal baseline only) into `historical_market_values` with source `dynastyprocess`; re-run backtests | A 2023 preseason snapshot exists; every A4 cell rerun with the new baseline and recorded | write | open |
| D2a | Legal close-out before crawling at scale: Sleeper commercial-use terms, nflverse CC-BY attribution line on rendering surfaces, DynastyProcess GPL-3 note, FP archive internal-only rule | Findings recorded in LEGAL_GUARDRAILS with dates | legal | open |
| D2b | Sleeper graph crawl: `scripts/crawl-sleeper-graph.ts` seeded from the founder's leagues, BFS through league members, `previous_league_id` chains back to 2018, dynasty and keeper filter, hashed user ids, polite rate limit, resumable; tables `crawl_leagues`, `crawl_roster_seasons`, `crawl_draft_picks`, `crawl_matchups`, `crawl_trades` (migration) | Dry run reports counts; first write pass reaches 5,000 leagues | write | open |
| D3a | Cohort rebake at scale: lane scores per roster-season joined to next-season record; replace `cohort-stats.ts` bins and every "calibrated on 82" with "validated on N"; bake script committed | Hub and landing cite the new n with method | none (after D2b) | open |
| D3b | Trade corpus: market value at trade date from D1 snapshots; empirical fairness band, acceptance rate by posture and by fingerprint; published as a Library article with n | `TRADE_REALISM.md` findings; Trade Finder reads the empirical band | none (after D2b) | open |
| D3c | Calibration: Brier for `survivalPctFor` against crawled drafts; contender-odds calibration against crawled records; published on the scoreboard | Brier scores on the scoreboard with n | none (after D2b) | open |
| D4 | `player_value_history` table written on every FantasyCalc refresh, backfilled from D1; week-over-week delta canonical | Deltas render on candidate and roster cards with as-of dates | write | open |
| D5a | Ledger writes: standing call (hub render), trade verdict (trade endpoints and Coach), sell/buy flag (Phase 3), dial-driven rank departure, each with market value at decision time, the market-default alternative, resolution condition, doctrine snapshot | Rows accrue in `expectations` for signed-in users on every render that produces a call | none | open |
| D5b | Weekly resolve cron `scripts/resolve-expectations.ts` against weekly outcomes; honest-first rules from the companion classifier reused | Open rows resolve within a week of the condition; companion beats fire from real rows | none | open |
| D5c | Track-record views: personal (you vs market), default (engine vs market), crowd (doctrine patterns vs market); scoreboard v2 page as the prospective log with a pre-registration doc | Page renders from the ledger with n and CI; methodology published before the first result | copy | open |
| D6 | Dial telemetry joined to ledger rows; admin aggregate view; the year-2 doctrine-promotion protocol written down (holdout, founder gate, changelog receipt) | Protocol in MODEL_CARD; admin view live | model | open |

## Phase 1 · In-season data spine

| ID | Gap | Acceptance | Gate | Status |
|---|---|---|---|---|
| S1 | Current-season weekly stats from Sleeper into `buildOpportunityProfile`; season aggregate plus weekly | Week-N hub reads this season's snap share and targets | none | open |
| S2 | Transactions feed wired: adds, drops, trades, FAAB into opponent fingerprints and the between-visit diff | Opponent card shows player trades, not only future picks | none | open |
| S3 | `injury_status` consumed on the roster read, Coach context, inflection cards, value deltas | An IR or OUT player is flagged everywhere he appears | none | open |
| S4 | FantasyCalc TTL to 1 to 6 hours in-season (env-tunable) | Documented TTL; value history from D4 | none | open |
| S5 | Usage-trend canonical (week-over-week snap and target change), registered | One helper; consumed by inflection, FA watch, Sell/Buy | none | open |

## Phase 2 · The Trade Finder

| ID | Gap | Acceptance | Gate | Status |
|---|---|---|---|---|
| T1 | Opponent scoring canonical: need-fit from startable depth, posture fit, fingerprint including player trades, stated plans, receptivity | Deterministic, tested, registered | none | open |
| T2 | Offer generation: three ranked offers inside the empirical band (D3b, or ±15% until it lands) with named "why they say yes," KTC anchors, pick-scale conversion, copy-ready message; LLM only for the message | Offers for every opponent on the founder's seven leagues read as sendable | none | open |
| T3 | Render as the in-season hero in The Call's slot; Coach cites the same objects; object-parity lint extended; retire the empty TradeStrategyPanel and the round-8-capped TradeOpportunitiesPanel in-season | Week-N hub leads with the Trade Finder | none | open |
| T4 | Founder dogfood week across seven leagues; log every offer and outcome in the ledger | One week of logged offers before any marketing | none | open |

## Phase 3 · Value maximization

| ID | Gap | Acceptance | Gate | Status |
|---|---|---|---|---|
| V1 | Sell / Buy / Hold board per rostered player: value delta over 2 and 4 weeks, age curve, usage trend, injury, posture; one reason line, provenance on tap; writes ledger rows | Renders in-season under the Trade Finder | none | open |
| V2 | Free-agent watch: unrostered pool with usage-trend triggers; remove the Coach waiver refusal once data exists | A rising unrostered player surfaces within a week of the trend | none | open |
| V3 | Handcuff Watch and Buy-the-Dip as real play morphs with format gates | Plays render in-season | none | open |

## Phase 4 · Next season

| ID | Gap | Acceptance | Gate | Status |
|---|---|---|---|---|
| N1 | Keeper decision engine (keeper cost vs market value vs replacement) | Renders for keeper leagues from January | none | open |
| N2 | 2027 pick market: cabinet vs class strength, who is selling futures, 2027 1st Sniping as a play | Renders from week 6 | none | open |
| N3 | Offseason posture plan generated from V1, replacing the AAR's hardcoded calendar | AAR prose retired | none | open |

## Marketing and pricing

| ID | Gap | Acceptance | Gate | Status |
|---|---|---|---|---|
| M1 | Pricing flip when T4 is done: Pro monthly and annual plus day pass, caps enforced | Stripe live; beta users grandfathered as decided | pricing | open |
| M2 | The ad: Trade Finder screenshot, "Every opponent in your league, read before you offer the trade," Scout as the no-login landing page | Runs only after T4 | copy | open |
