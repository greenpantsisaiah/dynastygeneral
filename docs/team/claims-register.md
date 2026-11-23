# Claims register

Every public statistical or comparative claim the team may use, and the evidence behind it. Growth agents may only say claims listed here with status `approved`. New public statistical claims are red tier: the claims steward drafts, Isaiah approves.

Levels (from the stats and claims steward design): 0 = what the product does (a test proves the feature exists); 1 = calibration (ledger rows, interval shown); 2 = a finding about the world (a validated registry hypothesis); 3 = better than an alternative (pre-registered, forward-logged, interval excluding zero). Named-competitor claims need level 3 on the same metric over a stated window, and must follow `LEGAL_GUARDRAILS.md`.

| ID | Exact text | Level | Evidence (test, query, or doc) | As of | Review by | Status |
|---|---|---|---|---|---|---|
| C-001 | Coach context with named players, not IDs. | 0 | `evals/coach-my-roster.test.ts`, `evals/coach-context-sync.test.ts` (named roster + opponent rosters reach Coach) | 2026-11-23 | 2027-02-23 | approved |
| C-002 | Reads your league format off Sleeper: superflex, TE premium, kickers and defenses where your league rosters them. | 0 | `evals/swot.test.ts` (1QB / SF / 2QB starter math), `evals/anti-patterns.test.ts` (format_rules mirrored to Coach) | 2026-11-23 | 2027-02-23 | approved |
| C-003 | Lane identity thresholds tuned against 82 dynasty rosters from 5 leagues. | 0 | `src/lib/strategy/lane-identity/cohort-stats.ts` (`COHORT_TOTAL = 82`, `COHORT_LEAGUE_COUNT = 5`), `evals/lane-identity.test.ts`. A cohort count, not a calibration claim: say "tuned against", never "calibrated" or "proven" | 2026-11-23 | 2027-02-23 | approved |
| C-004 | One Sleeper username, no password, no install. | 0 | `src/app/connect/page.tsx` (username form, public Sleeper API). No dedicated test yet | 2026-11-23 | 2027-02-23 | draft (needs a test) |
| C-005 | Engine v0 posted 0.399 Spearman vs 0.346 to 0.365 for named consensus baselines, 2022-2024 dynasty cumulative backtest, retrospective, not the live engine. | 2 (retrospective) | `/scoreboard`, MODEL_CARD 9.7. Mixed per year; FantasyPros edged v0 in 2022 and 2023; n = 60 to 90 pairs per cell. Not pre-registered or forward-logged, so NOT a level-3 "better than" claim | 2026-11-23 | 2027-02-23 | approved only with the full qualifier and a `/scoreboard` link; never shortened to "beats consensus" |
| R-001 | "Engine v0 · 0.399 Spearman · beats consensus" (trade share card, OG image, share text) | 3 claimed | No level-3 evidence; the live engine is not v0 and no rubric beats the market (`negative-results.md`) | 2026-11-23 | n/a | retired (demotion PR, claims-steward 2026-11-23) |
| R-002 | "We publish our accuracy. They don't." / "They never publish ... the blend's accuracy" (`/vs-fantasypros`) | 3 claimed | Unverified assertion about a named competitor; FantasyPros publishes expert accuracy rankings | 2026-11-23 | n/a | retired |
| R-003 | "We publish our accuracy. The industry hides theirs." (`/scoreboard`) | 3 claimed | Unsupported industry-wide claim; LEGAL_GUARDRAILS cites FantasyCalc and Draft Sharks publishing accuracy | 2026-11-23 | n/a | softened to "Our backtest, wins and losses, with units." |
| R-004 | "calibrated prediction" / "calibrated probabilities" / "Calibrated dynasty trade verdict" (scoreboard, methodology, vs-fantasypros, trade share metadata) | 1 claimed | No prediction type is above `hypothesis` (stats-steward lab note 2026-11-23); no calibration ledger exists | 2026-11-23 | n/a | retired |
| R-005 | "(only we publish this)" on inflection scorecards and opponent fingerprints (`/methodology`) | 3 claimed | Uniqueness claim with no survey evidence | 2026-11-23 | n/a | retired |
| R-006 | `/vs-fantasypros` FantasyPros product observations (SF ADP, CSS tiers, 2-source ADP, Should I Trade, browser extension, four tabs) | 0 about a competitor | Observed 2026-05-05; LEGAL_GUARDRAILS rule 5 requires re-verification within 30 days of publication and quarterly | 2026-11-23 | re-verify before re-indexing | softened: page set to noindex and removed from sitemap pending re-verification (decision for Isaiah) |

Status values: `draft`, `approved`, `softened`, `retired`.

Known constraint (2026-11-21): no position rubric beats the market yet (see `MODEL_LIVE_PLAN.md` value-pipe entry and `negative-results.md`). "Beats the market" or "beats MIT" claims are not approvable until a position clears the Phase D3 gate.
