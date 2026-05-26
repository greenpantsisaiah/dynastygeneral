# Dynasty General · Phase 3 Data Acquisition (decision-ready)

Locked 2026-05-23. This is the concrete, grounded plan to fill the
empty `player_signals` / `team_signals` tables so the parked rubric
expertise (`src/lib/engine/evaluation/`) and the inflection model can
run on real data. It is the "acquire data first" track from
`ARCHITECTURE_UNIFICATION_PLAN.md` Phase 3, researched against live
sources 2026-05-23 (agent a21cff68).

**Update 2026-05-26: Tier 1 + Tier 2 of the first cut SHIPPED. After a
read-only validation showed draft capital is a real marginal projection
signal (residualized -0.10 overall, -0.40 for young; n=626) and that
opportunity is not (~0; Stage 2b), the founder authorized the targeted
ingestion. `scripts/ingest-unlock-signals.ts` upserted 1,752
skill-position rows into `player_signals` with `draft_pick_no`,
`draft_round`, an athletic composite in `ras` (NOT the proprietary
score; per-field `source_attribution` makes the distinction explicit),
and `confidence_per_field`. Non-skill rows are dropped at ingest per
the plan. The script is dry-run by default; `--write` performed the
production upsert. Tier 3 (OL continuity from `snap_counts`) is
deferred pending its own read-only validation. Opportunity signals from
Sleeper /stats are NOT in `player_signals` because Stage 2b showed they
carry no marginal signal; they remain decision CONTEXT in the
inflection cards and The Call (Stage 1 / 2a, shipped). Phase 3b/3c (the
EnrichedPlayer resolver + wiring `evaluate()`) follow.**

Already shipped (Phase 3a, PR #21): prior-season carries + targets from
the free Sleeper `/stats` endpoint, lighting up the inflection
workload-trend signal. That needed no new source and no DB write. This
doc covers everything past it.

## What I need you to decide (the short version)

1. **Authorize production-DB writes.** Every step here writes to the
   production Supabase (`player_signals` / `team_signals`) via the
   service-role key, the only instance configured. I will not run a
   non-dry-run write without your go-ahead. The ingestion script will
   default to `--dry-run` and print a diff first.
2. **RAS / athletic metrics.** Pick one: (a) RECOMMENDED: compute our
   OWN position-relative athletic composite from the free nflverse
   `combine` data (40-time, vertical, broad, cone, shuttle, height,
   weight); (b) skip athletic metrics for now (column stays null,
   rubric degrades gracefully). Licensing RAS itself is not an option:
   it has no free, redistributable download.
3. **Offensive line.** Pick one: (a) RECOMMENDED: build OUR OWN OL
   continuity signal from free nflverse `snap_counts` (same-five-starters
   week over week); (b) skip OL for now (null). A bought PFF grade
   cannot be published (ToS), and ESPN/FTN numbers are scrape-only and
   not licensed for redistribution.
4. **Breakout age / college dominator.** RECOMMENDED: defer. The only
   free path is a CollegeFootballData.com pipeline (real engineering,
   separate from this track). Not in the first cut.
5. **Attribution.** nflverse + the crosswalk are CC-BY / GPL. We must
   add a visible "Data via nflverse (CC-BY-4.0)" line where the product
   shows these numbers, and take a quick legal glance at the GPL-3.0 on
   the crosswalk file before shipping a redistributed product.

If you approve 1 + 2a + 3a + 5 and defer 4, the first cut fills:
per-season + career carries/targets/snaps, snap share, draft pick,
an athletic composite, and OL continuity. That is most of what both the
rubric and the inflection model want, all GREEN/clean-YELLOW.

## The load-bearing enabler: the ID crosswalk

nflverse keys on `gsis_id` (stats, draft) and `pfr_id` (snap counts,
combine, advanced), NOT Sleeper ids. Our rosters are Sleeper ids. The
bridge is the DynastyProcess player-id map, the de-facto standard the
whole fantasy ecosystem uses:

- URL (direct CSV, TS-fetchable): `https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv`
- One row carries `sleeper_id`, `gsis_id`, `pfr_id`, `name`,
  `merge_name`, `position`, `birthdate`, `draft_ovr`, `ktc_id`. ~12k
  rows, refreshed regularly, already includes 2026 rookies.
- License: GPL-3.0 on the repo (the legal-glance item in decision 5).
- Caveat: `sleeper_id` is not 100% populated. A small fraction of joins
  fall back to `merge_name` + position. The ingestion script logs every
  unmatched player so the gap is visible, never silent.

This crosswalk is fetched once per ingestion run and used by every
signal below. It is the reason any of this can join to a live roster.

## Per-signal source map (grounded 2026-05-23)

All nflverse assets follow `https://github.com/nflverse/nflverse-data/releases/download/<TAG>/<FILE>`, published as CSV (direct fetch) and parquet. License CC-BY-4.0 (attribution required).

| Signal | Source | Key | Verdict | Effort |
|---|---|---|---|---|
| per-season + career carries/targets | nflverse `stats_player` (`stats_player_reg_{season}.csv`); cols `carries`, `targets`, `target_share`, `wopr` | gsis_id | GREEN | low (CSV per season, sum for career) |
| snap share / offense snaps | nflverse `snap_counts` (`snap_counts_{season}.csv`); col `offense_pct` | pfr_id | GREEN | low |
| route participation / routes run | NOT a ready column anywhere free. Derivable from `pbp_participation` play-by-play, or a paid PFF/PlayerProfiler field | gsis_id | YELLOW (defer) | high (pbp aggregation) |
| draft pick (overall) | nflverse `draft_picks` (`draft_picks.csv`); col `pick` | gsis_id + pfr_id | GREEN | low (one file) |
| combine measurables (40, vert, broad, cone, shuttle, ht, wt) | nflverse `combine` (`combine.csv`) | pfr_id | GREEN | low (one file) |
| RAS score (Kent Lee Platte) | ras.football, no free/redistributable download, "all rights reserved" | n/a | RED | n/a |
| athletic composite (our own) | computed from nflverse `combine` (position-relative percentile of the measurables) | pfr_id | YELLOW (clean: we own it) | medium (compute + calibrate) |
| OL continuity | computed from nflverse `snap_counts` filtered to T/G/C (same-5 week over week) | pfr_id | YELLOW (clean: we build it) | medium |
| OL graded quality | PFF (ToS-blocked redistribution); ESPN/FTN (scrape-only, unlicensed) | n/a | RED | n/a |
| breakout age / college dominator | CollegeFootballData.com API + crosswalk birthdate | name/cfb | YELLOW (defer) | high (college pipeline) |

`nextgen_stats` (separation, YAC-over-expected) is parquet-only (needs a
parquet reader); not in the first cut.

## Implementation (once authorized)

One new ingestion script, mirroring the existing
`scripts/ingest-historical-outcomes.ts` pattern (the same proven
service-role write client, `--dry-run` default, chunked upserts):

1. **Crosswalk load.** Fetch `db_playerids.csv`, build
   `gsis_id -> sleeper_id` and `pfr_id -> sleeper_id` maps. Log
   coverage (how many of the current player universe resolve).
2. **Fetch + join.** For the chosen seasons, fetch `stats_player`,
   `snap_counts`, `draft_picks`, `combine`; translate each to Sleeper
   ids via the crosswalk; drop/log non-skill and unmatched rows.
3. **Compute derived signals.** Career sums (carries/targets), snap
   share, the athletic composite (position-relative percentile), OL
   continuity (per team, into `team_signals`).
4. **Upsert.** `player_signals` keyed on `player_id` (Sleeper id),
   `team_signals` keyed on `team`. Dry-run prints the row diff; the
   write flag is explicit. Re-runnable (upsert, not insert, so no
   duplicate-row hazard).
5. **Attribution.** Add the CC-BY line to the product surfaces that
   render these numbers; record the source in each row's
   `source_attribution` jsonb (the column already exists).

Then (separate, already specified in the unification plan as 3b/3c):
the `EnrichedPlayer` resolver reads these populated tables, and
`evaluate()` gets wired into scoring with the backtest gate. Those do
not run until the tables hold real data.

## Cost, risk, sequencing

- **Cost:** $0 in data fees for the GREEN/clean-YELLOW set (nflverse +
  crosswalk are free). Engineering time only. No Anthropic spend (this
  is deterministic ingestion, not LLM extraction).
- **Risk:** all writes are to production; mitigated by dry-run-first,
  upsert (re-runnable), and per-row source attribution. The crosswalk
  coverage gap is logged, never silent.
- **Recommended first cut (smallest useful):** crosswalk + `stats_player`
  (career/season carries+targets) + `snap_counts` (snap share) +
  `draft_picks` (draft_ovr, which also finally fills the inflection
  `draft_pick_overall` gap). That is four GREEN datasets, one script,
  one authorized dry-run-then-write. Athletic composite (2a) and OL
  continuity (3a) follow as the second and third datasets in the same
  script.
- **Deferred:** route participation, breakout age / dominator, nextgen
  parquet. Each is its own pipeline; none blocks the first cut.

## Open legal items (decision 5)

- nflverse CC-BY-4.0: attribution line required in-product.
- DynastyProcess crosswalk GPL-3.0: standard ecosystem tool; the
  copyleft concern is about distributing derived SOFTWARE, not using a
  lookup table. Worth a quick founder/attorney glance before a paid
  product ships on it. `dynasty-legal-privacy-checker` can run this.
- CollegeFootballData.com terms (only if breakout-age path is later
  taken): free key implies agreeing to their T&C; review commercial use.
