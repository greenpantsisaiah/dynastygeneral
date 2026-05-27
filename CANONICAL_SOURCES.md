# Dynasty General · Canonical Sources

This file is the index of "for each computation class, the one function that owns it." A fresh Claude session lands here BEFORE writing any code that touches the same domain. Read the relevant section before introducing a new helper. If you can't find a domain that fits, ADD an entry to this file before merging the new helper.

The bug class this prevents: two parallel implementations of the same concept, drifting independently. We've shipped at least four of these (ADP filters, pick-owner resolution, gap-text classifiers, survival pct buckets) and each one cost user trust. CI now backs this file via `evals/anti-patterns.test.ts`.

## Rules of engagement

1. Before adding a helper that returns a number, label, or boolean used in user-facing copy or scoring, search this file for the domain.
2. If the domain has a canonical, IMPORT it. Do not re-implement.
3. If the domain has no canonical, decide whether yours becomes the canonical (add an entry here) or whether you can extend an existing one. Don't ship a new helper without a decision recorded.
4. If you find an existing duplicate not yet listed here, treat it as a bug. Consolidate; add the entry.

## Computation classes

### Pick owner resolution (trade-aware)

- **Canonical**: `rosterAtPickNo(args)` in `src/lib/sleeper/pick-resolution.ts`
- **Returns**: `number | null` (effective roster_id, after applying season-matched traded_picks override)
- **Inputs**: `pickNo`, `totalTeams`, `season`, `draft: { type, reversal_round, slot_to_roster_id, picks_made?, traded_picks }`
- **Bootstrap exceptions** (allowed to construct the override map directly, because they produce the snapshot shape downstream consumes): `resolveDraftState.effectiveRosterIdForPickNo` in `src/lib/sleeper/draft-state.ts`, `buildMyPickSchedule` in `src/lib/strategy/league-state/snapshot.ts`
- **Anti-pattern**: building a `Map<\`${round}:${original_owner}\`, current_owner>` lookup inline in any other file. Lint rule "no inline traded_picks override-map construction" enforces this.
- **Bug class avoided**: 2026-05-06 "Decision title says 2 ahead but banner says 11 ahead." Three independent implementations drifted; we patched two and the third stayed wrong.

### Player position normalization (DEF = DST)

- **Canonical**: `normalizePosition(raw)` in `src/lib/strategy/archetypes/schema.ts` (with `FANTASY_POSITIONS`, the runtime companion to the `Position` type)
- **Returns**: `Position | null` (uppercases, merges `DEF` -> `DST`, returns the Position union or null for non-fantasy positions like IDP / junk)
- **Consumers**: snapshot `is_me` depth annotation + every player-position read that feeds counts/depth (`snapshot.ts`, `leagues/[leagueId]/page.tsx`, `api/coach/[leagueId]/route.ts`, `contender-outlook/forecast.ts`, `scout/score.ts`).
- **Distinct (NOT this canonical)**: slot-parsing over `league.roster_positions` (`p === "DEF"` mapping a DEF slot to the DST counter, in `snapshot.ts` / `scout/score.ts` / `llm-contract.ts`) and FantasyCalc-vs-Sleeper cross-ref matching (`players/integrity.ts`) legitimately use the bare string; they are not player-position normalization. `contender-outlook/forecast.ts` also keeps a local 4-position `FANTASY_POSITIONS` (`["QB","RB","WR","TE"]`, the rookie mix) which is a different list, not this one.
- **Anti-pattern**: an inline `position.toUpperCase() === "DEF"` normalizer, or a hand-rolled `normPos` closure that maps DEF -> DST. Lint rule "no inline DEF->DST position normalizer (use normalizePosition)" bans the `.toUpperCase() === "DEF"` shape outside `schema.ts`.
- **Bug class avoided**: 2026-05-23 architecture audit found 4 near-identical DEF -> DST normalizers (two byte-identical `normPos` closures in the hub and Coach route, plus `forecast.toPosition` and a scout inline). Code checking `=== "DST"` without the merge silently misses `DEF` and vice versa.

### Roster identity (is this my roster, co-owner-aware)

- **Canonical**: `isRosterOwnedBy(roster, sleeperUserId)` in `src/lib/sleeper/roster-identity.ts`
- **Returns**: `boolean` (true if the user is the primary owner OR a co-owner; false for a null/absent user id, so orphan rosters never false-positive)
- **Inputs**: a raw Sleeper roster (`{ owner_id, co_owners }`) and a sleeper user id. In leagues without co-owners this behaves identically to a plain `owner_id` match (no-op there, fix in co-owned leagues).
- **Consumers**: the snapshot `is_me` (`snapshot.ts`), and every "find my roster" resolution (`leagues/[leagueId]/page.tsx`, `scout/[username]/page.tsx`, `engine/context.ts`, `sleeper/draft-state.ts`, `sleeper/history.ts`, `rankings/league-context.ts`, `posture/champion-history.ts`).
- **Anti-pattern**: `roster.owner_id === userId` inline for identity resolution (skips `co_owners`). Lint rule "no raw owner_id identity resolution (use isRosterOwnedBy)" bans `.owner_id ===` outside the canonical.
- **Bug class avoided**: 2026-05-23 architecture audit found 5 identity resolutions with 3 different co-owner behaviors; the snapshot's own `is_me` omitted `co_owners` despite INVARIANTS.md flagging co-ownership as a trust-breaking class (a co-owner viewing their hub got `is_me: false` on their own team, cascading wrong identity to the Decision card, Coach context, and position counts).

### User pick schedule (trade-aware, density-classified)

- **Canonical**: `snap.draft.my_pick_schedule` (built by `buildMyPickSchedule` in `src/lib/strategy/league-state/snapshot.ts`)
- **Returns**: `PickScheduleEntry[]` ordered by pick_no, traded-away picks already filtered out, traded-in picks included, density classifications attached
- **Anti-pattern**: walking `1..maxPicks` and re-deriving "which picks are mine" with traded_picks lookups. Use `my_pick_schedule[i]` directly.

### Survival probability + availability bucket

- **Canonical pct**: `survivalPctFor(args)` in `src/lib/strategy/decision-synthesis/synthesize.ts`
- **Canonical bucket**: `availabilityFromPct(pct)` in the same file (re-derives `likely_here` / `coin_flip` / `probably_gone` from the pct so text and badge always agree)
- **Math**: `P(survives) = ∏ (1 - position_demand[pos] × within-position-rank-share[rankIdx])` across every pick in the gap. Per-position rank shares calibrated to dynasty mock-draft observation.
- **Fallback**: when the player is not ranked at a skill position, falls back to a 90/50/15 ADP bucket lookup (the legacy path) gated by `availabilityAt`. The fallback is internal to `survivalPctFor` and not visible to callers.
- **Anti-pattern 1**: hardcoded `90 : 50 : 15` ternary lookups outside the canonical. Lint rule "no hardcoded 90/50/15 survival-pct bucket lookup" enforces this.
- **Anti-pattern 2**: deriving the bucket from anything other than the pct (e.g., re-classifying gap arithmetic in a body-text template). The bucket comes from the pct; the pct comes from the canonical. One probability, one classifier.
- **Bug class avoided**: 2026-05-06 "every lane shows 50% even with very different position-need contexts." 2026-04-25 "ADP -3 in round 15 rendered 15% bar but is actually ~50/50." 2026-04-29 "available pool past consensus rendered probably_gone but should have been likely_here."

### Survival window (which slot survival is computed TO)

- **Canonical**: `computeSurvivalWindow(snap, schedule)` in `src/lib/strategy/decision-synthesis/synthesize.ts`
- **Returns**: `SurvivalWindow` = `{ live_pick_no, target_pick_no, from_pick_no, to_pick_no, kind: "pre_turn" | "at_turn" }`
- **Rule**: `from_pick_no` + `to_pick_no` are the (exclusive, exclusive) bounds for the opponent gap walk. `target_pick_no` is what the rest of the engine treats as "the user's next slot" for ADP-gap copy and downstream consumers.
- **Pre-turn** (live pick on the clock < user's first upcoming pick): walks live → user's first pick. The user's question is "will this player be there when my turn comes."
- **At-turn** (live === user's first upcoming pick): walks user's first pick → first CONTESTED next slot. Back-to-back consecutive picks (snake wraparound, traded slots) are skipped because they contribute zero opponent contention.
- **Anti-pattern**: setting `nextUserPickNo = schedule[1]?.pick_no` inline without going through this helper. That was the old broken behavior: pre-turn showed 100% survival on candidates with 37 picks of cushion before the user's turn; at-turn back-to-back ownership showed trivial 100% on every candidate.
- **Bug class avoided**: 2026-05-19 founder report (lincolnenglish / Finders Keepers). Skattebo "coin flip 40%" with 37 picks of cushion (real ~3%); DeVonta Smith "likely here 100%" with 2-3 opponents about to pick (real ~70%); every Win-Now-lane candidate trivially 100% for back-to-back owners. Locked by `evals/survival-window.test.ts`.

### Opponent gap analysis (per-position demand in the gap before user's next pick)

- **Canonical**: `analyzeOpponentsInGap(args)` in `src/lib/strategy/decision-synthesis/synthesize.ts`
- **Returns**: `OpponentGapAnalysis` with per-opponent `position_demand` (normalized 0..1 across QB/RB/WR/TE), aggregate demand, and primary opponent
- **Inputs**: snapshot, `fromPickNo`, `toPickNo` (the half-open window from `computeSurvivalWindow`). Pass the window directly; do not pass `current` or `nextUserPickNo` shapes.
- **Internal**: uses `rosterAtPickNo` (the canonical above) to attribute pick numbers to rosters
- **Anti-pattern**: re-walking the gap to compute "what does opponent X need" anywhere else. Consume the gap analysis result. Also: deriving `fromPickNo` / `toPickNo` inline rather than going through `computeSurvivalWindow`.

### Starter requirements

- **Canonical**: `effectiveStarterReqs(snap)` and `buildStarterDemand` in `src/lib/engine/llm-contract.ts`; re-exported via `getHardStarterReqs` in `src/lib/engine/roster-fit.ts`
- **Returns**: `Record<Position, number>` of REALISTIC starter counts (folds in superflex, te_premium, k/dst, etc.)
- **Anti-pattern**: reading `starter_slots.hard.QB` directly. SF / 2QB leagues put the second QB slot in `starter_slots.superflex`, not in `hard.QB`. Lint rule "no raw starter_slots.hard.QB or hard[pos]" enforces this.
- **Bug class avoided**: 2026-04-26 SWOT "QB room locked (3 bodies for 1 starter slot)" in a SF league.

### Format rules block (LLM contract)

- **Canonical**: `buildFormatRulesFromSnapshot(snap)` in `src/lib/engine/llm-contract.ts`
- **Returns**: `{ qb_starters_max, rb_starters_max, wr_starters_max, te_starters_max, second_qb_starts, te_premium, is_superflex, ... }`
- **Use**: every endpoint where the LLM might reason about format (Coach, decision/trade, briefings) must ship this block alongside `starter_slots`
- **Anti-pattern**: relying on the LLM to infer format from raw counts. The system prompt rule "Respect league format" references these field names; missing them = LLM falls back to inference and hallucinates.

### League position scarcity (per-position demand across rosters)

- **Canonical**: `buildLeaguePositionContext(snap)` in `src/lib/strategy/decision-synthesis/synthesize.ts`, surfaced as `decision.league_position_context`
- **Returns**: `Record<Position, { teams_light, total_teams, avg_per_team, over_rostered }>` (teams_light = count of rosters below their starter requirement at that position)
- **Use**: the board's "trade leverage" micro-note AND the Coach leverage/scarcity claims must both read these numbers. One scarcity computation, two surfaces, identical numbers.
- **Anti-pattern**: estimating "QB is scarce" from a separate read of the rosters in any surface, or letting the Coach LLM infer scarcity from raw counts. Cite `teams_light` / `over_rostered`.
- **Bug class avoided**: 2026-05-22 founder wanted the "Penix is QB trade leverage because the league overprioritized WRs" note grounded, not flavor.

### LLM trade-pricing block

- **Canonical**: pricing block constructed in `src/app/api/coach/[leagueId]/route.ts` (Coach) and `src/lib/engine/context.ts` (decision endpoints)
- **Shape**: `{ pick_values, player_values, player_values_present: boolean }` with KTC-anchored format-multiplied pick values and FantasyCalc-normalized player values
- **Use**: every LLM endpoint that might propose trades
- **Anti-pattern**: shipping `starter_slots` without `pricing` to a trade-capable endpoint. The `player_values_present: false` flag is the GUARD signal; a pre-LLM injection prepends `[GUARD]` to forbid numeric trade math.

### KTC-anchored pick values

- **Canonical**: `startupPickValue(round, slot, format)` (and `SUPERFLEX_PICK_MULTIPLIER`) in the pricing layer
- **Use**: every place a pick number needs a market value (Coach pricing block, trade routes, decision/trade endpoint)

### Per-pick EV (EV-bank delta math)

- **Canonical**: `perPickEv(value, pickNo, adp)` in `src/lib/strategy/ev-bank/formula.ts` (with the shared `round2`)
- **Returns**: `number` (RAW, unrounded) = `(value / 100) * (pickNo - adp)`. The ADP-noise envelope passes a shifted adp (`adp + shift`); there is no separate shifted function.
- **Rounding rule**: `perPickEv` does NOT round. Callers round where they currently do: the EV bank rounds the summed total (`analyze.ts`, `league.ts`) while per-candidate surfaces round each value (`whatif.ts`, `candidate-bits.tsx`, `companion/debate.ts`). One formula, caller-owned rounding, so the two rounding regimes stay exact.
- **Consumers**: `ev-bank/analyze.ts`, `ev-bank/league.ts`, `decision-synthesis/whatif.ts`, `the-call/candidate-bits.tsx`, `companion/debate.ts`.
- **Anti-pattern**: writing `(value / 100) * (pick - adp)` inline, or re-defining a local `round2`. Lint rule "no inline per-pick EV formula (use perPickEv canonical)" bans the `/ 100) * (` signature outside `formula.ts`.
- **Bug class avoided**: 2026-05-23 architecture audit found 5 independent copies of the formula and 5 of `round2`; the hub's inline copy had drifted enough to warrant a comment admitting it duplicated the EV bank. A calibration change to the EV math would have had to be made in five places. Note `aar/page.tsx` `adp_delta = pick_no - adp` (the signed ADP distance) and `companion/classify.ts` `expected_value / 100` (a stored-value normalization) are DISTINCT metrics, not this formula.

### Roster-fit math (position room health, starter need scoring)

- **Canonical**: `src/lib/engine/roster-fit.ts` (`buildPositionRoomHealth`, `flexShareForPosition`, `getRealisticStarterMax`, etc.)
- **Anti-pattern**: re-defining any of these functions outside `roster-fit.ts`. Lint rule "no re-derived roster-fit functions" enforces this.
- **Bug class avoided**: 2026-04-27 Mac Jones / Schultz misclassification.

### Startable / stable depth (quality-calibrated position counts)

- **Canonical**: `buildPositionDepth({ snap, valueOf, positionOf })` and the applier `annotateStartableDepth(...)` in `src/lib/engine/roster-fit.ts`
- **Returns**: per roster, per position `{ body, startable, stable }`. `body` = raw rostered count. `startable` = players whose value places them in the leaguewide STARTABLE TIER (top `total_teams × realistic starters at the position` by value, the jobs that actually start somewhere). `stable` = the tier one starter deeper (`× (realistic + 1)`, bench insurance above replacement). `annotateStartableDepth` writes `startable_counts` + `stable_depth_counts` onto `snapshot.rosters[]`.
- **Inputs**: snapshot, a value lookup (FantasyCalc-normalized, same map trade pricing uses), a position lookup (Sleeper players blob). Annotated at the entry points that have both: the hub (`page.tsx`) and Coach (`route.ts`).
- **Rule**: depth is STARTABLE QUALITY, not headcount. "Do I have enough at X / am I deep at X / is the room saturated" must read `startable_counts[pos]` (with body fallback when unannotated), never raw `position_counts[pos]`. Rank-based, not an absolute KTC cutoff (the only constants are structural: starters × teams, +1 for depth). K / DST carry no value scale, so their startable == stable == body. Per-position fallback: a position with bodies but no resolved values keeps its body count rather than reading 0.
- **Consumers**: `buildPositionRoomHealth` (room + surplus, drives the Decision card saturation penalty); the `fill_starter` / `push_path` / counter-view gates in `decision-synthesis/synthesize.ts` (via `startableHaveFor`); the SWOT statistician count-ranks + surplus/deficit opportunities + dominator threats in `swot/compute.ts` (via `cnt`). The SWOT coach "bench depth" reads intentionally stay body-based (injury insurance is about warm bodies, a different question).
- **Anti-pattern**: reading `me.position_counts[pos] >= reqs[pos]` to decide "starter hole filled," or ranking teams by `position_counts[pos]` for a "deep / thin at X" claim. Six replacement-level WRs are not "deep at WR."
- **Bug class avoided**: 2026-05-16 founder report: "strategy advice over-weights total RB/WR counts instead of startable quality and stable depth." A roster stacked with low-value bench bodies read as saturated / deep, suppressing real starter recommendations and producing body-count SWOT reads. Locked by `evals/startable-depth.test.ts`.

### Opportunity profile (earned-role usage read)

- **Canonical**: `buildOpportunityProfile(stats)` in `src/lib/players/season-stats.ts`
- **Returns**: `OpportunityProfile` = `{ snap_share, targets_per_game, adot, drop_rate, rz_targets_per_game, targets }`, every field nullable (graceful when a season carries no usage row)
- **Inputs**: one `PlayerSeasonStats` (or `undefined`) from the free Sleeper `/stats` feed. Pure, no fetch. Clamps `snap_share` to 0-1 and guards a zero-snap denominator.
- **Use**: the per-player earned-role read anywhere it surfaces (inflection opportunity signal, Coach `my_roster.players[].opportunity`, Stage 2 candidate / player cards). Per the dynasty-canon-keeper grounding (2026-05-25, ARCHITECTURE_UNIFICATION_PLAN.md "data right" addendum): opportunity (target / weighted-opportunity share, sticky ~0.70 YoY, ~0.95 corr with PPR) is the research-defensible usage signal. It informs a PROJECTION read, never a value-scale multiplier.
- **Anti-pattern**: dividing player snaps by `team_off_snaps` inline (re-derives snap share without the clamp / zero-guard), or re-computing aDOT / drop rate / RZ-per-game in a surface. Lint rule "no inline snap-share derivation (use buildOpportunityProfile)" bans the `/ ...team_off_snaps` signature outside the canonical.
- **Bug class avoided**: the value-scale trap. A rookie / proven multiplier on FantasyCalc value is indefensible (Brill-Wyner 2024; same lesson as the data-disproven TE down-multiplier). The defensible lever is age-adjusted opportunity wired as a projection prior, position-conditioned. Locked by `evals/opportunity-profile.test.ts`.

### Opportunity role read (trend + display string)

- **Canonical**: `readOpportunity({ prev, prevPrev })` (with `describeRole`) in `src/lib/players/opportunity-read.ts`
- **Returns**: `OpportunityRead | null` = `{ line, trend, detail }` where `line` is the role string ("49% snaps, 4.6 tgt/g, 5 aDOT"), `trend` is `"rising" | "falling" | "flat" | "single_season"`, and `detail` is the plain-English trend ("snap share up 14 pts from 35%"). `null` when the prior season carries no role data (rookie / injury year), so callers hide the line or render `data_missing`.
- **Inputs**: the most-recent two `OpportunityProfile`s (from `buildOpportunityProfile`). Pure; type-only dependency on season-stats so it is safe to import server-side without the fetch/zod weight.
- **Owns**: the single rising/falling threshold (snap share >= 7 pts, or targets >= 1.0/g fallback) AND the role-description string. Both the inflection opportunity signal and The Call candidate-card `RoleLine` consume it, so the scorecard, chat, and the board never disagree on the trend call or the numbers.
- **Anti-pattern**: re-implementing the snap-share / target trend or the role string in a surface, or hardcoding a second material-change threshold. One read, every consumer.
- **Bug class avoided**: drift between the inflection card's trend and the candidate card's trend for the same player. Locked by `evals/opportunity-read.test.ts`.

### Inflection opportunity signal (aging-cliff role trend)

- **Canonical**: `buildOpportunitySignal({ position, prev, prevPrev })` in `src/lib/engine/inflection/opportunity-signal.ts`
- **Returns**: one `InflectionSignal`. Wraps `readOpportunity` and maps its trend onto the window's stories: rising role -> `story_a`, eroding -> `story_b`, flat / single_season -> `neutral`; `data_missing` when the prior season has no role data.
- **Inputs**: position (RB / WR / TE) and the most-recent two `OpportunityProfile`s (from `buildOpportunityProfile`). Consumed by the aging-cliff RB / WR / TE resolvers in `resolve.ts`; threaded by `buildInflectionsFromSnapshot` from the same `/stats` maps that feed the workload signal (zero extra fetch).
- **Anti-pattern**: re-deriving an opportunity direction inline in a resolver, or re-implementing the snap-share / target trend (use `readOpportunity`). One signal builder, consumed by every aging window.
- **Bug class avoided**: aging-cliff cards that rendered `data_missing` for role even though the snap-share / target data was sitting in the `/stats` feed we already fetch (the "data right" Stage 1 gap). Locked by `evals/inflection.test.ts`.

### Draft capital (`draft_pick_overall`)

- **Canonical**: `getDraftPickMap()` in `src/lib/players/draft-capital.ts`
- **Returns**: `Promise<Map<string, number>>` of `Sleeper player_id -> NFL overall draft pick`, sourced from production `player_signals.draft_pick_no`. 24h in-process cache; in-flight requests dedupe.
- **Inputs**: none (reads the table). Server-only via `getAdminClient()`; never import in client components.
- **Use**: threaded by the hub and Coach into `buildInflectionsFromSnapshot` as `draftPickByPlayerId`, which sets `InflectionInputs.draft_pick_overall`. Consumed by `resolveRookieDebut` for the "Draft capital" scorecard row (tier-graded story_a / neutral / story_b). The eventual `EnrichedPlayer` resolver (Phase 3b/3c) reads through this canonical too.
- **Anti-pattern**: a surface that reads `player_signals.draft_pick_no` directly, re-implementing its own caching / draft-pick lookup. One read, one cache. Data populated by `scripts/ingest-unlock-signals.ts` (founder-authorized 2026-05-26).
- **Bug class avoided**: rookie-debut cards rendering `data_missing` for draft capital even though the data is now in `player_signals`. Locked by `evals/inflection.test.ts` section 7.

### Market divergence (ADP vs trade-value rank)

- **Canonical**: `readMarketDivergence({ adp, valueRank })` in `src/lib/players/market-divergence.ts`
- **Returns**: `MarketDivergence | null`. Non-null only when the gap between the two markets is at least `MEANINGFUL_GAP_PICKS` (15 picks). The shape carries `gap` (absolute pick gap), `lean` (`"adp_earlier"` or `"value_earlier"`), and pre-formatted Voice-A `line` ("ADP 196 · value rank 242") + `detail` ("ADP 46 earlier"). Pure function, no IO, safe in client components.
- **Inputs**: `adp` (the player's draft-market consensus pick number, e.g. Sleeper format-aware ADP) and `valueRank` (the trade-market overall rank from FantasyCalc / KTC; on candidates this is `ktc_overall_rank`). Both must be present; either null returns null.
- **Use**: The Call's `DivergenceLine` renders on the standing-call card + each candidate row. Stage 2c of the "data right" on-ramp. Surfaces the founder's Adonai Mitchell case (ADP 196 vs value rank 242 = ADP 46 earlier) neutrally; the user decides whether ADP is overpaying or the trade market is sleeping.
- **Anti-pattern**: a surface that subtracts ADP from value rank inline, picks its own threshold, or invents a "draft market overpaying" verdict in copy. One helper, one threshold, neutral framing.
- **Bug class avoided**: drift between surfaces on what "the two markets disagree" means, and editorializing the disagreement. Locked by `evals/market-divergence.test.ts`.

### Player + team signals readers (production `player_signals` / `team_signals`)

- **Canonical**: `getPlayerSignalsMap()` and `getTeamSignalsMap()` in `src/lib/players/player-signals.ts`
- **Returns**: `Promise<Map<player_id | team, row>>`, fetched server-side via `getAdminClient()` (service role), cached 24h with in-flight dedupe.
- **Inputs**: none. Reads the whole table (both are small).
- **Use**: every consumer of `evaluate()` (the rubric pipeline) reads through these. The hub fetches both once per render and threads them into `evaluateForPlayer`. Future Coach + EnrichedPlayer wiring reads the same maps.
- **Anti-pattern**: a surface that reads `from("player_signals")` or `from("team_signals")` inline. One read, one cache. Data populated by `scripts/ingest-unlock-signals.ts` plus admin manual coding.
- **Bug class avoided**: each surface paying its own DB round-trip + drifting on what columns to select.

### Live rubric wiring (`evaluate()` per player)

- **Canonical**: `evaluateForPlayer(args)` in `src/lib/engine/evaluation/wiring.ts`; honest-framing helper `isRubricPriorDriven(out)` in the same file.
- **Returns**: `EvaluationOutput | null`. Null only when position is unknown; otherwise the rubric's point estimate + variance band + evidence stack + market delta + confidence. Pure adapter: builds an `EvaluationContext` from already-fetched `player_signals` + `team_signals` + meta and calls `evaluate()`.
- **Use**: Phase 3c wiring. Currently consumed ONLY for rostered rookies (the user's `years_exp === 0` players) and surfaced as a Layer-3 footer on the inflection rookie-debut card, never into value scoring or `synthesize` (the Stage 2b backtest showed opportunity-class signals carry no marginal forward-VALUE edge; the rubric's value-wiring stays parked). `isRubricPriorDriven` flags reads dominated by the Bayesian prior so the UI footer renders an honest caveat instead of a confident projection it isn't.
- **Anti-pattern**: building an `EvaluationContext` inline in a surface, or calling `evaluate()` outside this wrapper without consuming `getPlayerSignalsMap`. One adapter, one read.
- **Bug class avoided**: surfaces drifting on how they hydrate the rubric, and value-scale wiring that the 2b evidence doesn't support. Locked by `evals/evaluation-wiring.test.ts`.

### Strategy windows + archetype lean

- **Canonical**: `buildLeagueSnapshot → rankArchetypes → computeWindows`
- **Use**: every surface that needs a window, lean, or phase consumes the engine output. No surface re-derives.
- **Anti-pattern**: computing "are you win-now" from roster age in a new surface. Plumb from the snapshot/rank/windows pipeline.

### Available player pool

- **Canonical**: `getAvailablePlayers(...)` (filtered by `picks_made` during active draft, by `roster.players` union otherwise) + KTC harmonization across the FULL pool
- **Anti-pattern**: filtering by `team != null`. Pre-NFL-draft rookies have `team: null`; the filter silently excludes them. Lint rule "no team!=null player-pool filter" enforces this.

### Priced decision pool (the synthesize prelude)

- **Canonical**: `buildPricedPool(snap)` in `src/lib/strategy/decision-synthesis/priced-pool.ts`
- **Returns**: `{ available, valueMap, playerValuesById, ktcOverallRanksById }`. Fetches the realistic available pool (`getAvailableForRequest`), prices EVERY rostered player across the league PLUS the full available pool (`resolvePlayerValues`), reranks `available` by the consensus cascade (`rerankByConsensus`), and annotates the snapshot in place with value-calibrated startable / stable depth (`annotateStartableDepth`).
- **Inputs**: the league snapshot. MUTATES it (startable-depth annotation), the same in-place contract the inline callers relied on.
- **Consumers**: the hub board (`leagues/[leagueId]/page.tsx`) and Coach (`api/coach/[leagueId]/route.ts`). BOTH must build the synthesize inputs through this helper so their `synthesizeDecision` calls receive identical pool + values + depth and the standing call cannot diverge between surfaces.
- **Load-bearing detail**: pricing ALL rosters (not `me + available`) is required because the startable-depth tier is built from priced bodies only; omitting opponents inflates the user's own startable counts and silently flips the `fill_starter` + saturation gates. It also keeps the leaguewide rank metric honest (unpriced opponents -> "Lead X pts (100%)").
- **Anti-pattern**: a hand-rolled `getAvailableForRequest` -> `resolvePlayerValues` -> `rerankByConsensus` -> `annotateStartableDepth` prelude inline in any surface, or pricing only `me + available` before synthesizing/annotating. Import `buildPricedPool`.
- **Bug class avoided**: 2026-05-24 the hub board recommended Jaylin Noel while Coach recommended Adonai Mitchell for the same pick; Coach priced only `me + available` so its startable annotation inflated and suppressed the WR fill that the hub fired. Two hand-copied preludes had drifted on the opponent-pricing line.

### Standing decision (single production path)

- **Canonical**: `resolveStandingDecision(args)` in `src/lib/strategy/decision-synthesis/decision-bundle.ts`
- **Returns**: `Decision | null`. The ONE production entry point that calls `synthesizeDecision`. Both the hub board and Coach call this; `synthesizeDecision` is never called directly in app code.
- **Inputs**: `{ snap, ranked, available, windows, picksUntilMe, playerValues, ktcOverallRanks, dials }`. The `available` + `playerValues` + `ktcOverallRanks` MUST come from `buildPricedPool` (all-rosters priced).
- **Anti-pattern**: a direct `synthesizeDecision(...)` call in any surface. A new decision surface that hand-builds the prelude can feed a divergent value map or dials, the board/Coach divergence class. Lint rule "no direct synthesizeDecision call (use resolveStandingDecision)" bans the call paren outside `synthesize.ts` (the definition) and `decision-bundle.ts` (the wrapper).
- **Bug class avoided**: 2026-05-24 board/Coach divergence. With one door fed by the canonical priced pool, a future surface cannot reintroduce a parallel decision derivation.

### Structural constraint state (hold-pick-equity gating)

- **Canonical**: `analyzeLeagueRead(args)` in `src/lib/strategy/league-read/analyze.ts`. Returns `StructuralConstraint[]` with fields `positions_unfilled`, `starter_gap_by_position`, `total_starter_gap`, `picks_remaining`, `unrecoverable_severity`, `early_round_pick_equity`, `is_active`, `guardrail_message`.
- **Returns**: structured data. `is_active: true` only when (unrecoverable_severity AND early_round_pick_equity AND a real positions_unfilled gap) all hold; this is the narrow Massey-Thaler-supported case.
- **Inputs**: `userState.position_counts`, `formatRules` starter maxes, `currentPickNo`, `userPicksRemaining` (from `snap.draft.my_pick_schedule` post-traded_picks).
- **Anti-pattern 1**: re-deriving "is the user below starter requirement at any position → should they hold picks" inline in any other surface. The check has no useful signal as a binary; consume the canonical's structured fields and respect the conditional.
- **Anti-pattern 2**: appending a prescriptive "hold pick equity" sentence to trade evaluations or pick recommendations when `is_active: false`. The COMMON case of `positions_unfilled.length > 0` with `is_active: false` is recoverable; standard ±15% fairness band governs. Lint rule "no structural-guardrail prescription when is_active: false" enforces the conditional.
- **Bug class avoided**: 2026-05-20 founder report on the lincolnenglish/izzydabomb offer. Coach correctly declined a 2.3:1 lopsided trade but appended "you are below starter requirement at RB, WR, TE → hold pick equity until those holes fill," which is tautological in mid-draft and contradicts the EV-arbitrage thesis (Principle 8). Three independent reports (dynasty-canon-keeper DEBUNK, dynasty-assumption-auditor, founder critique) agreed the prior binary was research-indefensible. Sources: Massey-Thaler 2013, Stuart Football Perspective AV chart, KTC FAQ repricing latency.

### Decision-rule scoring (multi-candidate differentiation)

- **Canonical**: every `push({ rule, score })` in `src/lib/strategy/decision-synthesis/synthesize.ts` must produce a `score` that varies based on signals already computed for that candidate (survival pct, ADP-extremeness via `adpGapModifier`, KTC value rank, position-saturation penalty, drift score). A flat literal score across multiple candidates of the same rule leaves V8's stable sort + position iteration order (`["QB", "RB", "WR", "TE"]`) as the tiebreaker. RB then always wins over TE / WR / QB regardless of relative value.
- **Returns**: `score: number` whose magnitude differentiates candidates within and across positions for the same rule.
- **Inputs**: at least one candidate-specific signal. Existing patterns to mirror:
  - `fill_starter_urgent`: `100 + adpGapModifier(top.adp, currentPickNo).adjustment`
  - `fill_starter`: `60 + adpGapModifier(top.adp, currentPickNo).adjustment`
  - `position_steal`: `85 - positionRank * 5` then capped on saturation
  - `earned_value`: `45 - i * 1.5 - sat.penalty + adpGap.adjustment`
  - `push_path`: `50 + r.drift_score * 25 + adpGapModifier(matching.adp, currentPickNo).adjustment`, gated so it never fires for a position whose starter need is already met (`me.position_counts[pos] >= reqs[pos]` = executing, take value not a forced push) and never for a reach (`currentPickNo - adp <= PUSH_PATH_REACH_LIMIT`, the adpGapModifier reaching boundary). Bug class avoided: 2026-05-21 Mark Andrews (starter-met TE, ~40-pick reach, -3 EV) won THE CALL via a flat push_path score when all quotas were met and fill_starter could not fire. Locked by `evals/push-path-reach.test.ts`.
  - `future_stash`: `50 - i * 2`
- **Anti-pattern**: `score: <literal>` with no per-candidate term. If a new rule's score doesn't naturally differentiate, the rule needs another signal, not a flat number with stable-sort fallback.
- **Bug class avoided**: 2026-05-08 Warren-vs-Judkins incident. Both candidates fired `fill_starter_urgent` at flat 100; stable sort picked Judkins (RB iterates before TE) over Warren despite Warren being ADP-extreme + lower survival + higher value in TE-premium SF. Coach correctly re-derived Warren when prompted, proving the data was present but ignored at scoring time. Locked by `evals/fill-starter-urgent.test.ts`.

### Play state (the Plays panel)

- **Canonical**: `derivePlayState(snap, play, userOptIn)` (to be added at `src/lib/strategy/plays/state.ts`)
- **Returns**: `PlayState` = `"suggested" | "tracking" | "auto_active" | "committed" | "dismissed" | "achieved" | "dead" | "morphed"`
- **Inputs**: snapshot (for roster signals + format_rules), play definition (with anchor + partners + format_gates), user opt-in record (commit / track / dismiss state from storage), stage (draft / in-season)
- **State transitions**: documented in `REDESIGN_INTENTIONS.md` under "Plays panel" → "Play state model"
- **Anti-pattern**: deriving state inline in render components. The render reads `play.state`; the engine derives.

### Play urgency (per-partner survival rolled up)

- **Canonical per-partner survival**: `survivalPctFor` from `decision-synthesis/synthesize.ts` (the existing canonical), consumed once per partner per play card render.
- **Canonical play urgency**: `derivePlayUrgency(partners)` (to be added at `src/lib/strategy/plays/urgency.ts`)
- **Returns**: `Urgency` = `"act_now" | "this_round" | "two_round_cushion" | "no_rush"`
- **Math**: per-partner urgency from `urgencyFromSurvival(survival_pct_to_next_pick)` (`act_now` if <25%, `this_round` if 25-50%, `two_round_cushion` if 50-75%, `no_rush` if 75%+). Play urgency = urgency of the partner with the highest `(ev_contribution × urgencyScalar)` where `urgencyScalar` weights `act_now` partners much more than `no_rush` partners. A high-EV anchor at 18% survival pulls the play to `act_now` regardless of fallback comfort.
- **Anti-pattern 1**: hardcoded "next N picks" copy in play cards. The urgency comes from the canonical above; the follow-through copy names a specific deadline pick number, not a generic window. Bug: 2026-05-20 "Your active plays" shipped with identical "next 4 picks" framing on every play card.
- **Anti-pattern 2**: deriving play urgency in a render component instead of consuming `play.play_urgency`. The engine derives; the render reads.

### Play coverage (built / missing read off the user's roster)

- **Canonical**: `derivePlayCoverage(args)` in `src/lib/strategy/plays/coverage.ts`
- **Returns**: `PlayCoverage | null` = `{ verdict: "covered" | "partial" | "thin", built: PlayCoverageBuiltPiece[], missing: string | null, summary: string }`. Per-archetype branch (qb_wr_stack, anchor_handcuff, bridge_qb, qb_hoard, lane_path) reads the user's rostered players against the play's anchor + partner template.
- **Inputs**: `{ play: PlayCommitment, ownedPlayers, valueMap, laneMemberships?, formatRules? }`. `ownedPlayers` is the same `OwnedRosterPlayer[]` the hub builds for `suggestPlaysFromRoster`; `laneMemberships` is required for `lane_path` (the play's primary_player.player_id is `lane:{lane_id}` and coverage reads off the live `LaneMembership` for that lane).
- **Use**: the active-play card in `decision-board.tsx` consumes this so a well-built play reads "Built: A (val X), B (val Y) · covered" instead of the empty "No target on the board yet." Founder report 2026-05-26: "It feels empty when I'm doing well at one." Voice A: numbers carry units (val N), no em dashes, no hedging.
- **Anti-pattern**: a render component that walks the roster inline to decide whether a play is "covered" or counts QBs against starter need outside this helper. One canonical, every play card.

### Play format gates (engine emission gate)

- **Canonical**: `playFormatGates: Record<PlayType, FormatGates>` (to be added at `src/lib/strategy/plays/catalog.ts`) + `canEmitPlay(snap, playType)` consumer
- **Returns**: boolean (whether a play type is eligible for the league's format)
- **Inputs**: snapshot (for `buildFormatRulesFromSnapshot(snap)` access), play type
- **Use**: `canEmitPlay` consults the matrix + `format_rules` before emitting a play. The engine MUST NOT emit a play whose gates are unsatisfied.
- **Anti-pattern**: per-play-type if/else format checks scattered across emission code. One matrix, one gate.
- **Bug class avoided**: 2026-05-20 founder report "The platform has been over-prioritizing TEs in my no-TEP league." Two-pronged fix: (1) gate TE-Premium Double-Up play at emission via `requires_te_premium: true` matrix entry; (2) fix non-TEP TE EV overweighting in scoring (tracked separately via the debug workflow).

### Companion beat classification (the emotional ROI loop)

- **Canonical**: `classifyBeats(args)` in `src/lib/strategy/companion/classify.ts`
- **Returns**: `Beat[]` (grounded emotional reactions; see `companion/types.ts` for `Beat` / `BeatKind` / `BeatTone`)
- **Inputs**: snapshot plus the existing canonical readouts (`computeWhatIfReadout`, `detectPlanDisruption`, survival via `survivalPctFor`, `analyzeLeagueEvBank`) and resolved `ExpectationRecord[]` from the ledger. The classifier is a thin grounded adapter over existing canonicals; it does NOT re-derive any number.
- **In-season members** (the draft-only beats are blind after the draft; these keep the check-in alive in-season, all grounded): `classifySeasonStandingBeat(standing, stage)` (a record-based milestone over `calcStanding`, the in-season twin of the draft EV-bank milestone; fires only in-season with games played); `classifyCallbackBeats({ openBets, valueOf, ... })` (the running-story head-to-head over OPEN ledger bets, current value via the FantasyCalc `valueOf` map, NON-destructive, never marks a bet resolved); `buildPickResolutions({ openBets, valueOf })` (turns a decisively separated value race, `>= DECISIVE_VALUE_GAP`, into an `ExpectationResolution` for the terminal reconcile). The hub (`leagues/[leagueId]/page.tsx`) reads the ledger, reconciles + persists, writes a divergent pick as a new bet, and passes `seasonStanding` / `openExpectations` / `valueOf` / `resolvedBeats` to `classifyBeats`.
- **Anti-pattern**: emitting a beat with no `source` provenance, or computing a reaction from anything other than an existing canonical. A beat is a phrasing of a grounded delta, never a new derivation. Lint candidate: every `Beat` must carry a non-empty `source.signal`. A callback that marks its bet `resolved` (a season-long dynasty race is not settled mid-season) is bug-class; only `buildPickResolutions` + `reconcileExpectations` resolve, and only on a decisive separation.
- **Bug class avoided**: the slime quadrant. 2026-05-21 founder direction: companionship must deliver Eyal's Hooked loop "without being slimy." Grounding every beat in a real signal is the Facilitator-quadrant guarantee, the same discipline as no-hardcoded-numbers. AND 2026-05-25 founder report: the companion was invisible in-season because every wired beat was draft-gated (the milestone was fed by draft-pick EV, empty in-season) and the ledger was built but never read/written. Locked by `evals/companion.test.ts`.

### Beat phrasing (Voice A, scoped 'we')

- **Canonical**: `phraseBeat(beat)` in `src/lib/strategy/companion/voice.ts`
- **Returns**: `{ headline, body? }` Voice A strings (deterministic templates; scoped 'we' allowed per BRAND_VOICE "Companion register"; no em dashes, no exclamation points, numbers carry units)
- **Anti-pattern**: phrasing beats via the LLM (hallucination risk plus cost) or hardcoding "next N picks" windows. Beats are templated from grounded fields; the LLM enters only on the Coach debate handoff (pull).

### Beat priority (what surfaces first)

- **Canonical**: `rankBeats(beats)` / `topBeat(beats)` in `src/lib/strategy/companion/priority.ts`
- **Returns**: beats ordered by `tone-weight × magnitude × recency`; mirrors `urgentPartnerOf` in `plays/urgency.ts`
- **Anti-pattern**: rendering beats in classifier emission order. The check-in surface leads with the most resonant grounded beat.

### Expectation ledger (companion memory)

- **Canonical**: `ExpectationRecord` rows in the `expectations` table (migrations 0015 + 0016 `alternative_player_id`), read/write via `src/lib/companion/ledger.ts`; reconciled by `reconcileExpectations(records, resolved)` in `src/lib/strategy/companion/classify.ts`
- **Returns**: persisted bets (expected metric / value / CI, alternative label + value + `alternative_player_id`, thesis, resolution condition, horizon, resolved / outcome) and, on reconciliation, typed beats (vindication / bad_beat / critique)
- **Wired from the hub** (`leagues/[leagueId]/page.tsx`, best-effort + RLS-scoped to `authUser`): the WRITE side logs a divergent pick via `expectationFromPickDeviation` + `upsertExpectation` (idempotent on `bet_id`, never re-write an existing id or it resets a resolved row to open); the READ side feeds the callback running-story; the RECONCILE side runs `buildPickResolutions` -> `reconcileExpectations` -> `persistResolved` only when the value race separates decisively. `alternative_player_id` (0016) is required so the callback + reconcile read the call's CURRENT value, not just the draft-time `alternative_value`.
- **Honesty rule**: `bad_beat` fires ONLY when `expected_value` showed the user ahead (high win prob / positive EV) and the outcome flipped on variance; `critique` fires ONLY when the user chose the lower-EV option and a real gap was left. The record's `expected_value` plus `alternative_value` make the distinction computable. A pick deviation is contrarian by construction (the user took the lower-EV side), so its terminal outcome is vindication (won the value race) or critique (lost it), never a bad_beat. Counterfactual attribution ("the injury cost you the win") fires only when the outcome actually flips the result (reuse the `computeWhatIfReadout` counterfactual pattern).
- **Anti-pattern**: commiserating on a loss the user was never favored to win (sycophancy), or attributing a loss to an event that did not flip the result (false drama). Also: marking a season-long bet `resolved` on the first post-draft hub load (a mid-season value read is a checkpoint, not a verdict); only a decisive separation resolves.

### Debate-beat reconstruction (the "you took Y over the call X" beat)

- **Canonical**: `reconstructPickDebate(args)` in `src/lib/strategy/companion/debate.ts`
- **Returns**: `{ whatIf: WhatIfReadout; chosenId } | null` (null = no trustworthy divergence, stay silent)
- **Inputs**: the last-visit cookie's `standing_call_id` + `total_picks_made`, the user's `roster_id`, `picks_made`, the CURRENT decision's candidate id set, and a POOL-AWARE name resolver (available pool + rostered + drafted) plus value / ADP lookups
- **Honesty gates** (all required to fire): anchor to the user's FIRST post-visit pick (not the latest); freshness (`pick_no - total_picks_made <= COMPANION_DEBATE_FRESH_PICKS`, the cookie call is only the call the user faced when the pick followed the render closely); corroboration (the cookie call must still be a current decision candidate, re-pointing the beat at the live Decision Board); name resolution (both ids resolve, else suppress)
- **Anti-pattern 1**: comparing the user's pick to a stale cookie `standing_call_id` without the freshness + corroboration gates. After several intervening picks (or a pre-refactor cookie) the call shifted; a "divergence" is a false chide. Honest-first: a missed debate is benign, a false chide kills trust.
- **Anti-pattern 2**: resolving the call / chosen names through a rostered-only lookup (e.g. `playersMap` built from `allRosterIds`). A real divergence is available-vs-available, so the standing call is an undrafted player absent from a rostered-only map, and the raw id reaches copy + the Coach seed. `classifyDebateBeat` carries a backstop: a beat whose standing-call `player_name === player_id` does not ship.
- **Bug class avoided**: 2026-05-23 founder report. "I picked Elijah because it was the call, then I felt chided for it" (stale 12h/9-pick cookie call drove a false debate beat) + "no idea who 13320 is" (the available standing call leaked its raw Sleeper id into the headline and Coach handoff). Locked by `evals/companion.test.ts`.

## Adding a new entry

Use this template:

```
### <Domain name>

- **Canonical**: `funcName(args)` in `src/path/to/file.ts`
- **Returns**: <type + meaning>
- **Inputs**: <what it needs>
- **Bootstrap exceptions**: <files allowed to compute this differently because they produce the canonical shape>
- **Anti-pattern**: <the duplicate signature to ban>
- **Bug class avoided**: <the incident that motivated consolidation, with date>
```

If the anti-pattern is mechanically detectable (regex-able), add a rule to `evals/anti-patterns.test.ts`. The lint rule is what makes the canonical actually load-bearing; the doc is what makes a fresh session discover it.
