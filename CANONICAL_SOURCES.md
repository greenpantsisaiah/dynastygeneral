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

### LLM trade-pricing block

- **Canonical**: pricing block constructed in `src/app/api/coach/[leagueId]/route.ts` (Coach) and `src/lib/engine/context.ts` (decision endpoints)
- **Shape**: `{ pick_values, player_values, player_values_present: boolean }` with KTC-anchored format-multiplied pick values and FantasyCalc-normalized player values
- **Use**: every LLM endpoint that might propose trades
- **Anti-pattern**: shipping `starter_slots` without `pricing` to a trade-capable endpoint. The `player_values_present: false` flag is the GUARD signal; a pre-LLM injection prepends `[GUARD]` to forbid numeric trade math.

### KTC-anchored pick values

- **Canonical**: `startupPickValue(round, slot, format)` (and `SUPERFLEX_PICK_MULTIPLIER`) in the pricing layer
- **Use**: every place a pick number needs a market value (Coach pricing block, trade routes, decision/trade endpoint)

### Roster-fit math (position room health, starter need scoring)

- **Canonical**: `src/lib/engine/roster-fit.ts` (`buildPositionRoomHealth`, `flexShareForPosition`, `getRealisticStarterMax`, etc.)
- **Anti-pattern**: re-defining any of these functions outside `roster-fit.ts`. Lint rule "no re-derived roster-fit functions" enforces this.
- **Bug class avoided**: 2026-04-27 Mac Jones / Schultz misclassification.

### Strategy windows + archetype lean

- **Canonical**: `buildLeagueSnapshot → rankArchetypes → computeWindows`
- **Use**: every surface that needs a window, lean, or phase consumes the engine output. No surface re-derives.
- **Anti-pattern**: computing "are you win-now" from roster age in a new surface. Plumb from the snapshot/rank/windows pipeline.

### Available player pool

- **Canonical**: `getAvailablePlayers(...)` (filtered by `picks_made` during active draft, by `roster.players` union otherwise) + KTC harmonization across the FULL pool
- **Anti-pattern**: filtering by `team != null`. Pre-NFL-draft rookies have `team: null`; the filter silently excludes them. Lint rule "no team!=null player-pool filter" enforces this.

### Decision-rule scoring (multi-candidate differentiation)

- **Canonical**: every `push({ rule, score })` in `src/lib/strategy/decision-synthesis/synthesize.ts` must produce a `score` that varies based on signals already computed for that candidate (survival pct, ADP-extremeness via `adpGapModifier`, KTC value rank, position-saturation penalty, drift score). A flat literal score across multiple candidates of the same rule leaves V8's stable sort + position iteration order (`["QB", "RB", "WR", "TE"]`) as the tiebreaker. RB then always wins over TE / WR / QB regardless of relative value.
- **Returns**: `score: number` whose magnitude differentiates candidates within and across positions for the same rule.
- **Inputs**: at least one candidate-specific signal. Existing patterns to mirror:
  - `fill_starter_urgent`: `100 + adpGapModifier(top.adp, currentPickNo).adjustment`
  - `fill_starter`: `60 + adpGapModifier(top.adp, currentPickNo).adjustment`
  - `position_steal`: `85 - positionRank * 5` then capped on saturation
  - `earned_value`: `45 - i * 1.5 - sat.penalty + adpGap.adjustment`
  - `push_path`: `50 + r.drift_score * 25`
  - `future_stash`: `50 - i * 2`
- **Anti-pattern**: `score: <literal>` with no per-candidate term. If a new rule's score doesn't naturally differentiate, the rule needs another signal, not a flat number with stable-sort fallback.
- **Bug class avoided**: 2026-05-08 Warren-vs-Judkins incident. Both candidates fired `fill_starter_urgent` at flat 100; stable sort picked Judkins (RB iterates before TE) over Warren despite Warren being ADP-extreme + lower survival + higher value in TE-premium SF. Coach correctly re-derived Warren when prompted, proving the data was present but ignored at scoring time. Locked by `evals/fill-starter-urgent.test.ts`.

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
