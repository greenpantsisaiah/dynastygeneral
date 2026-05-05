# Data Acquisition Plan v0

**Status:** in progress · sprint started 2026-05-04
**Owner:** Isaiah McPeak
**Gates:** VALIDATION_PLAN.md sections 4 (vintaging) and 5 (backtest)
**Sprint window:** 2026-05-04 to 2026-05-10 (3-day audit + 4-day procurement)

## Sprint progress log

- **2026-05-04:**
  - KTC historical via Wayback Machine: VERIFIED feasible. 31 snapshots across 2022-2024 preserve `playersArray` JSON in HTML. Script `scripts/ingest-ktc-historical.ts` built and smoke-tested: 449/500 player match rate to Sleeper IDs (~90%). Day 4 of the plan effectively complete.
  - FantasyCalc historical API: BLOCKED. No public `/historical` endpoint at any reasonable path. Falls to KTC (now unblocked) as the dynasty-prior source. FantasyCalc current still works for live values.
  - Migration `0010_validation.sql` written (historical_market_values, historical_consensus_rankings, historical_outcomes, historical_signal_codes, backtest_runs). Founder applied it 2026-05-05.
  - KTC ingest run end-to-end against production Supabase: 26,710 rows landed, 31 snapshots, 90% Sleeper match. Top-5 SF dynasty 2022-08-14 verified (Allen / Herbert / Mahomes / Jefferson / Chase).

- **2026-05-05:**
  - Day 5 prototype: invoked `historical-signal-extractor` agent on Najee_Harris 2022 as smoke test. **Result: 4 of 4 signals coded correctly** within ground-truth tolerance (rb_role_tier=bellcow, rb_traded_offseason_flag=false, rb_role_at_new_team_projected=null, compounding_news_count=1). Vintage blinding worked: agent excluded the 2022-08-29 Lisfranc diagnosis even though it would have been informative. Citation-with-date enforcement worked. Schema-enum constraint worked (returned null instead of guessing on the trade-team field).
  - Agent prompt improvements applied to spec: explicit `bellcow` vs `strict_bellcow` boundary, explicit `null`-when-no-trade convention for `rb_role_at_new_team_projected`, 6-class enumerated event taxonomy for `compounding_news_count`. Three smaller suggestions (team-blog source tier, soft `SOURCE_UNAVAILABLE` handling, WebSearch date-filter hint) deferred to next iteration.
  - Historical season outcomes ingest: `scripts/ingest-historical-outcomes.ts` shipped. Pulls Sleeper season-stats (PPR / half / std / games_played) for 2022, 2023, 2024. Result: **3,877 player-season rows in production** (1310/1269/1298 per year). Verified: top-5 PPR producers 2024 = Lamar / Chase / Allen / Burrow / Mayfield. Backtest target data in place.
  - Batch extractor script: `scripts/extract-historical-signals.ts` shipped. Reads top-N RBs at the season's pre-draft KTC snapshot, calls Anthropic API with the agent's spec + web_search tool, parses structured emit_signal_codes output, writes to historical_signal_codes. Idempotent (skips already-coded entries). Dry-run by default; --execute opt-in to spend API budget. Cost estimate: ~$0.17/extraction, ~$100 for full 200×3 batch. Smoke-tested in dry-run; targets resolve to expected top-5 RBs (Taylor / Najee / Swift / Javonte / CMC for 2022).
  - **Next step (founder action): run batch extractor with --execute --limit 5 once for each year to validate end-to-end + spot-check accuracy. Then scale to full 64×3 = 192 batch.** This unblocks Phase 2 backtest harness construction.

## 0. Purpose

VALIDATION_PLAN requires reconstructing 2022, 2023, and 2024 season
state for Test A and Test B. Some of that data is freely available.
Some requires payment. Some is gated by Terms of Service. Some doesn't
exist publicly and must be reconstructed.

This document is the audit. For each data category we list:

- What we need
- Where it lives
- Cost (free / scrape / paid)
- ToS constraints
- Fallback chain if blocked
- Verification status (UNVERIFIED / VERIFIED / BLOCKED)

By end of sprint window every row reads VERIFIED or BLOCKED. If
BLOCKED, the fallback is committed and pinned in MODEL_CARD.

## 1. Data categories required

The validation plan needs five buckets of data per season:

| Bucket | Used by | Vintaging |
|---|---|---|
| Player attributes | All tests | Annual snapshot |
| Game-level performance | Tests A, B (outcome scoring) | Weekly |
| Pre-draft market values | Test A (Bayesian prior), Test B (KTC-only baseline) | Snapshot at draft date |
| Pre-draft expert rankings | Test A (consensus baseline), Test B (consensus agent) | Snapshot at draft date |
| Manual signals (RB role, scheme, HC, OL, etc.) | Test A | Coded with knowledge through pre-draft date |

Plus two buckets for the live stunts (Test C):

| Bucket | Used by |
|---|---|
| Manager profile signals | Phase 1.6 manager_profile |
| Decision log (forward) | Stunt dashboard |

## 2. Source-by-source audit

### 2.1 Sleeper API

- **Need:** player data, historical drafts, league data for leagues founder belongs to
- **Cost:** free
- **ToS:** read API explicitly allowed for personal use; commercial use unclear; no rate-limit published but `~1000/min` works in practice
- **Verification:** UNVERIFIED for commercial use. Action: read https://docs.sleeper.com/ ToS section, document specific clauses on redistribution
- **Fallback:** none needed for player data; if commercial use blocked we redact to non-commercial path
- **Coverage:** 2018-present roster/draft data is solid. No KTC values, no advanced stats.

### 2.2 nflfastR

- **Need:** play-by-play 2022-2024 for snap counts, target share, YPRR, route participation
- **Cost:** free (R package + parquet files at https://github.com/nflverse)
- **ToS:** MIT license, redistribution allowed
- **Verification:** VERIFIED (founder confirms package access)
- **Fallback:** none needed
- **Coverage:** play-by-play 1999-present, snap counts since 2012, advanced metrics derived. Solid.

### 2.3 PFF (Pro Football Focus)

- **Need:** OL grades by season, OL Continuity Score, advanced WR metrics (YPRR, contested catch rate), advanced QB metrics (CPOE, time-to-throw)
- **Cost:** paid subscription, founder green-lit annual ($499/yr or similar tier)
- **ToS:** **MAJOR CONSTRAINT.** PFF ToS prohibits redistribution of grades and most derived stats. We can USE them internally for predictions; we likely CANNOT publish them on the scoreboard or in a public conference paper without licensing.
- **Verification:** UNVERIFIED. Action: read PFF ToS, contact PFF licensing team, confirm what we can show publicly
- **Fallback chain if blocked:**
  1. Use PFF privately for prediction; publish scoreboard without raw PFF stats (just our derived signal name)
  2. If even that's blocked, swap to nflfastR-derived advanced stats (less accurate but free + redistributable)
  3. Pure box-score baseline (last resort, weakens model materially)

### 2.4 KTC (KeepTradeCut)

- **Need:** dynasty trade values, historical daily snapshots 2022-2024
- **Cost:** unclear; their public site shows current values only
- **ToS:** unknown; KTC has been litigation-cautious historically
- **Verification:** **VERIFIED feasible via Wayback Machine** (2026-05-04). 31 preserved snapshots across 2022-2024 (11/7/13 per year). KTC embeds the full player roster as a JS variable (`playersArray = [...]`) directly in the HTML; Wayback preserves it. Sleeper ID match rate ~90% on smoke test. Per-snapshot data: 500 players, oneQB + superflex values, overall + positional ranks, age, draft capital. Script `scripts/ingest-ktc-historical.ts` is the production ingestion path.
- **Open ToS question:** KTC ToS doesn't explicitly bless or block historical-data archiving via Wayback. If we ever publish raw KTC values in our scoreboard we should check; for internal model use, archived public data is a defensible posture. Email to KTC about a commercial license is still worth sending (founder action).
- **Fallback chain (now downgraded since primary is unblocked):**
  1. ~~Primary: FantasyCalc~~ → **BLOCKED**, no historical API. Only useful for live values.
  2. **Tertiary: FP ECR as prior** if KTC Wayback ever fails (used for years missing snapshots).

### 2.5 FantasyCalc

- **Need:** dynasty values, historical snapshots, format variations (1QB / SF / TEP)
- **Cost:** free API for current values
- **ToS:** unclear for redistribution; current API works without auth or rate limit issues at our scale
- **Verification:** **PARTIAL** (2026-05-04). Current values: VERIFIED working (already in production via `resolvePlayerValues`). Historical: BLOCKED. Probed `/values/historical`, `/history/values`, `/historicalValues`, `/snapshot`, `/historical`, `/values/{date}` and all return 404. No public historical endpoint exists.
- **Fallback:** KTC Wayback (now unblocked, see 2.4) replaces FantasyCalc as the historical dynasty market source. FantasyCalc remains the live values source.

### 2.6 FantasyPros (expert consensus)

- **Need:** ECR weekly + preseason rankings 2022-2024, position-specific
- **Cost:** Paid for archive access ($7-10/mo for premium tier with archives), or scrape current from public pages
- **ToS:** prohibits scraping; archives are paid feature
- **Verification:** UNVERIFIED. Action: founder buys 1 month archive subscription, exports relevant rankings as CSV, then unsubscribes
- **Fallback:** Wayback Machine snapshots of FantasyPros consensus pages (spotty coverage)

### 2.7 Underdog ADP

- **Need:** Best Ball ADP 2022-2024 (Best Ball Mania, Pomeranian, etc.)
- **Cost:** free for current; archives via Underdog blog posts and tweets
- **ToS:** unclear for scraping; ADP data is informally redistributed across the industry
- **Verification:** UNVERIFIED. Action: check if Underdog publishes historical ADP datasets (they sometimes do via the @UDFantasy blog and tweets); check community-shared CSVs
- **Fallback:** GoingFor2.com or similar third-party ADP aggregators

### 2.8 Sharp Football Analysis

- **Need:** scheme tags, OL transitions, coaching changes (qualitative)
- **Cost:** subscription required for premium articles ($12-18/mo)
- **ToS:** standard publication ToS; quoted text + cited use allowed under fair use
- **Verification:** UNVERIFIED. Action: founder confirms whether existing subscription includes archive access for 2022-2024 articles
- **Fallback:** ESPN, The Athletic, Sports Info Solutions for similar coverage

### 2.9 ESPN / The Athletic

- **Need:** beat reporter columns, depth charts, training camp reports for hand-coding signals
- **Cost:** founder has The Athletic subscription, ESPN+ available
- **ToS:** personal use ok; cannot redistribute full articles; OK to extract dated facts
- **Verification:** VERIFIED (subscription access)
- **Fallback:** Pro Football Reference for depth charts, RotoBaller for training camp summaries

### 2.10 Pro Football Reference

- **Need:** depth charts, snap counts, basic season stats (cross-validation)
- **Cost:** free
- **ToS:** scraping discouraged but tolerated for academic / personal use; rate limit = 20 requests/min
- **Verification:** VERIFIED for personal use
- **Fallback:** none needed

### 2.11 OurLads / NFL.com depth charts

- **Need:** historical depth charts for OL transitions and skill position roles
- **Cost:** free
- **ToS:** standard scraping etiquette
- **Verification:** UNVERIFIED. OurLads has historical depth charts but UI is hostile. Action: confirm scrape feasibility
- **Fallback:** Pro Football Reference depth charts (less granular)

### 2.12 Twitter / X (manual signal coding source)

- **Need:** beat reporter intel for hand-coding RB role tier and compounding-news count
- **Cost:** Twitter API access tightly limited under current pricing; manual reading via web is feasible
- **ToS:** non-commercial reading is allowed; programmatic scrape requires API (paid tier)
- **Verification:** UNVERIFIED for sustained scraping. Manual reading is viable.
- **Fallback:** Reddit r/dynastyff / r/fantasyfootball historical threads for community-coded sentiment

### 2.13 Manager profile sources (Phase 1.6)

- **Need:** league chat + transaction history + draft tendencies for opponents in stunt leagues
- **Cost:** free (via Sleeper API for own leagues)
- **ToS:** Sleeper allows reading own leagues' transactions and chat. Programmatic monitoring of CHAT may have additional ToS layer; need to read Sleeper ToS section on bot/automated access
- **Verification:** UNVERIFIED. Action: read Sleeper ToS for chat access, scope a small prototype that reads chat from one of founder's existing leagues
- **Fallback:** transaction-only profiling (no chat tone analysis); still useful but less rich

## 3. Cost summary

| Source | Annual cost | Notes |
|---|---|---|
| Sleeper API | $0 | |
| nflfastR | $0 | |
| PFF | ~$500 | Founder confirmed annual subscription |
| KTC historical | $0 to ~$500 | Unknown; depends on outcome of section 2.4 inquiry |
| FantasyCalc API | $0 | |
| FantasyPros archives | ~$10 (1 month) | Cancel after archive download |
| Underdog ADP | $0 | |
| Sharp Football | ~$200 | Founder may already subscribe |
| The Athletic | ~$80 | Founder has |
| ESPN+ | ~$110 | Optional |
| Pro Football Reference | $0 | |
| Twitter/X | $0 (manual) | API tier prohibitive |
| **Total worst case** | ~$1,400/yr | |
| **Total expected** | ~$700/yr | If KTC historical doesn't require licensing |

## 4. Vintaging strategy per source

Per VALIDATION_PLAN section 4, each piece of data must be tagged with
the latest year of knowledge it could have used in production.

### 4.1 Time-stamped data (easy)

- nflfastR plays: timestamp = game date
- Box scores from PFR: timestamp = game date
- ADP snapshots: timestamp = snapshot date (must capture pre-draft)
- KTC values: timestamp = snapshot date
- FantasyPros ECR: timestamp = ranking date
- Beat reporter articles: timestamp = publication date

### 4.2 Hand-coded data (hard)

For RB role tier, scheme tag, HC background coded by founder:

- Coded value carries `coded_with_knowledge_through` = pre-draft date
  for that prediction year
- Founder must NOT use 2023 outcomes to inform 2022 codes
- Coding pass must search dated sources only (e.g. The Athletic articles
  filtered by date range, training camp roundups from that summer)
- 10% spot check by independent reviewer (or LLM agent, see section 5)

### 4.3 LLM-extracted data (hardest)

If we use an LLM to extract historical signals from articles, the LLM
must not have post-cutoff knowledge bleeding in. Realistic options:

- Use a model with a known training cutoff before the prediction year
  (e.g. for 2022 prediction, use a model trained on data ≤ June 2022)
- Or, sandbox the prompt to ONLY use articles passed in (no model
  knowledge), with explicit instruction to refuse if the article doesn't
  contain the info

Second approach is more robust and what we'll default to.

## 5. LLM-extraction agent for hand-coded signals (load-bearing)

If founder cannot hand-code 3 historical seasons of RB role, scheme,
HC, OL transitions, and compounding news (likely; founder named the
"I don't know NFL teams cold" wall on 2026-04-29), we must build:

- An agent that reads dated articles for a given (player, year) and
  extracts signal values per the schema
- Sandboxed prompt: "Using ONLY the articles provided, code RB role
  tier from {lead_back, bellcow, strict_bellcow, committee_member,
  passdown, starter_uncertain}. If the articles don't contain enough
  info, return null."
- Cite: agent must include the article URL + paragraph that informed
  each signal
- Validation: 10% sample human-reviewed; if accuracy < 85%, retrain
  prompt or add more source articles

This agent is the long pole for Phase 1.5. If we don't build it, the
backtest is anchored only on automatically-extractable signals (KTC,
ADP, basic stats, nflfastR derivations) and we lose the "scheme +
role + transition" layer that makes our model distinctive.

## 6. Sprint plan

### Day 1 (2026-05-04): ToS audit

- Read Sleeper, FantasyCalc, FantasyPros, PFF ToS
- Email KTC and PFF licensing teams (start clock on responses)
- Document each ToS verdict in this file (move UNVERIFIED to VERIFIED/BLOCKED)

### Day 2 (2026-05-05): Free-source verification

- Confirm nflfastR coverage: pull 2022 sample, verify columns
- Confirm Sleeper API: pull 2022 draft sample
- Confirm Pro Football Reference scrape: pull one 2022 game
- Confirm FantasyCalc API: hit `/historicalRanks` endpoint, document depth

### Day 3 (2026-05-06): Paid-source procurement

- FantasyPros 1-month archive subscription
- Confirm PFF archive access depth
- Buy The Athletic / Sharp Football archive access if not already

### Day 4 (2026-05-07): KTC historical sprint

- Wayback Machine: scrape weekly snapshots of KTC for 2022, 2023, 2024
- Build KTC historical CSV (one row per (player, snapshot_date, value))
- If Wayback coverage is sparse, FantasyCalc historical takes over

### Day 5 (2026-05-08): LLM-extraction prototype

- Build agent for RB role tier extraction
- Test on 5 known cases per season (founder validates labels)
- If accuracy < 85%, iterate prompt and source corpus
- Document agent in `/agents/historical-signal-extractor.md`

### Day 6 (2026-05-09): Storage schema

- Add `validation/` directory at repo root
- Create migration `0010_validation.sql` with tables:
  - `historical_player_attributes(year, player_id, position, team, age, ...)`
  - `historical_market_values(snapshot_date, source, player_id, value)`
  - `historical_consensus_rankings(snapshot_date, source, player_id, rank)`
  - `historical_outcomes(year, week, player_id, ppr_points, ...)`
  - `historical_signal_codes(year, player_id, signal_name, signal_value, coded_with_knowledge_through, source)`
- Index per (year, player_id) for fast retrieval

### Day 7 (2026-05-10): Acquisition smoke test

- Pull all 2022 data
- Run a single prediction through the harness end-to-end
- If any source missing data for 2022, escalate or cut signal
- Mark this doc COMPLETE

## 7. Decision tree for blocked sources

```
Is source S verified accessible?
├── YES → use directly, vintage by date
└── NO
    ├── Has paid alternative? → buy if cost < $200
    │   └── still no? → fall to community fallback
    └── Has community fallback (Wayback, GitHub gist, 3rd party)?
        ├── YES with full coverage → use, document data quality risk
        ├── YES with partial → use for years available, cut signal for missing years
        └── NO → cut signal entirely from backtest, document in MODEL_CARD limitations
```

## 8. Risks

1. **KTC historical is unrecoverable.** Mitigation: FantasyCalc fallback is acceptable; published scoreboard simply runs on FC values instead.
2. **PFF redistribution blocks public scoreboard.** Mitigation: scoreboard shows our score and baseline scores but does not raw-cite PFF; methodology section says "internal use only of PFF inputs."
3. **LLM-extraction accuracy too low for hand-coded signals.** Mitigation: we cut transition signals from Test A entirely if accuracy < 85%; backtest runs on KTC + ADP + nflfastR-derivable signals only. Loses some predictive power but is honest.
4. **Sprint slips past 2026-05-10.** Mitigation: Phase 1 signal ingest can start in parallel with sprint days 5-7. Worst case: 1-week delay on the calibration drop-dead.
5. **Sleeper ToS update mid-stream.** Mitigation: monitor; pin ToS version with each release; have legal-privacy-checker subagent re-audit before launch.

## 9. Outputs by end of sprint

- This document, every row VERIFIED or BLOCKED
- `validation/2022_sample.json` showing one prediction with all source data attached
- KTC + FantasyCalc + ADP historical CSVs imported to `historical_*` tables
- LLM-extraction agent live in `/agents/`
- DATA_ACQUISITION_PLAN updated with final cost summary
