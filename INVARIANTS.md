# Dynasty General · Invariants

This file captures hard-won knowledge about the data we read, the architecture we built, and the workflow rules that keep quality from drifting. It survives compaction. Read it before fixing bugs or adding new surfaces.

## Pre-fix checklist (workflow)

Before editing any code in response to a bug report:

1. State the bug as one sentence: "the bug is X **because** Y."
2. Verify Y by reading the **runtime data** at the boundary, not the schema or your memory of how it works.
3. If Y can't be verified in two minutes of focused reading, spawn the `dynasty-bug-investigator` agent with the bug description.
4. Only then edit code.

Renaming a flag is not a fix. Adding a fallback to a value that should never be missing is not a fix. If the symptom recurs after your patch, the patch was a guess.

## Subagents available (`.claude/agents/`)

Spawn via the Agent tool with `subagent_type` set to one of:

- **`dynasty-bug-investigator`**: root-cause-first bug triage. Returns diagnosis with file:line. Does not edit code.
- **`dynasty-assumption-auditor`**: defensibility audit on embedded constants and thresholds. Channels statistician + dynasty pro + coach + gambler voices. Returns Defensible / Weak / Indefensible per assumption with citations.
- **`dynasty-context-doctor`**: diagnoses LLM hallucinations by classifying as snapshot / contract / model bug.
- **`dynasty-trade-realism-tester`**: validates trade recommendations against KTC pricing within ±15%.
- **`dynasty-security-auditor`**: pre-deploy security audit (OWASP + dynasty-specific risks).
- **`dynasty-cost-watcher`**: per-endpoint Anthropic spend audit + worst-case daily-spend estimation.
- **`dynasty-legal-privacy-checker`**: privacy + ToS + data-handling audit for solo founder without an attorney.
- **`microcopy-sweeper`**: keeps user-facing strings on-brand.

## Deploy + security context

When working on deployment, security, cost, or legal:

- `web/SECURITY.md` for the threat model + standards + pre-deploy security checklist.
- `web/DEPLOYMENT.md` for env vars, deploy procedure, post-deploy verification, rollback, cost monitoring.

These are NOT auto-loaded (would inflate every-session context) but should be read directly when the work touches their topics. The relevant subagents read them as their first step.

## Brand voice (hard rules)

- **No em dashes.** U+2014 anywhere is a regression. Use periods, colons, commas, semicolons, parentheses, or rewrite. Enforced by a PreToolUse hook.
- Decisive. No hedging openers. No "it depends." No "there are several factors."
- Evidence-cited. Name specific players, leagues, gaps. Don't summarize generically.
- Voice: dynasty intelligence analyst speaking to a sophisticated reader.

## Sleeper data shapes (the gotchas that bit us)

These are not in the schemas. They are runtime quirks that have caused trust-breaking bugs.

- **`roster.players` is empty during active drafts.** Mid-draft picks live in `/draft/{draft_id}/picks`, NOT in the roster object. Use `resolveDraftState` to hydrate. The active hub does this; surfaces that don't (e.g., scout) will show drafting rosters as "0 players" when the user actually has six picks made.
- **`roster.owner_id` may be null** for orphan rosters. Always handle null.
- **`roster.co_owners`** exists. A user can be a co-owner without being primary owner. `find(r.owner_id === uid)` misses co-ownership cases.
- **`league.roster_positions` is the source of truth** for starter requirements. The literal string `"SUPER_FLEX"` marks superflex format. K and DST appear only if the league rosters them. Never hard-code roster requirements; parse this list.
- **`league.previous_league_id`** chains league history across seasons. Use it to walk back through prior years.
- **`traded_picks` reroutes draft picks.** Apply this override map on top of snake order, not after.
- **ADP variant keys** (on the cached players blob): `adp_dynasty_1qb`, `adp_dynasty_2qb`, `adp_dynasty_superflex`, `adp_dynasty_te_premium`, `adp_rookie`. Match the variant to league format. `adp_rookie` is the variant for rookie-only drafts and rookie-only ADP context.
- **Pre-NFL-draft rookies** have `team: null` and `years_exp: 0`. Their `search_rank` is unreliable and varies wildly. Filtering candidates by `team != null` will silently exclude every pre-draft rookie (Shedeur Sanders, Cam Ward, etc.). Either let them through, or admit them via the `adp_rookie` path explicitly.
- **`nfl_state.season_type`** distinguishes pre/regular/post; `nfl_state.season` is the year string.
- **Sleeper player `position` casing**: usually uppercase, but normalize defensively. `DEF` and `DST` both appear depending on era; treat as the same position.
- **`league.settings.taxi_*`** fields exist for taxi squad rules. Don't assume they're absent.

## Architecture pillars (do not violate)

These are the load-bearing patterns. Violating any of them creates duplication or drift between surfaces.

- **One strategy engine.** `buildLeagueSnapshot` → `rankArchetypes` → `computeWindows` is the source of truth for archetype lean, drift, win-now/future windows, and phase. EVERY surface (hub, scout, coach, decision card, pick, trade) consumes the output of this engine. No surface re-derives strategy.
- **Decision Synthesis is the killer feature.** ONE Decision card per pick, synthesizing windows + density + path + constraint into a single TAKE with WHY and TRADEOFF. Multi-panel rollouts and per-pick rec lists were explicitly killed. Never reintroduce them.
- **Coach context contract.** The coach LLM must receive the user's NAMED roster (player name, position, team, age). IDs alone produce hallucinations like "you need a TE" when the user already has Kincaid. The contract also includes `system_decision`, `windows.declared`, `starter_slots`, and `my_pick_schedule`. Coach must be told to confirm or contradict the system_decision, not freelance.
- **LLM operational-rules contract (every endpoint that uses SYSTEM_PROMPT).** Per cross-panel framework + dynasty-context-doctor 2026-04-24: Coach, decision endpoints (trade/pick/strategy via `assembleContext` + `renderContextForPrompt`), and briefings (`buildUserMessage` in `briefings/analyst.ts`) must each ship a `format_rules` block alongside raw `starter_slots`. Required fields: `qb_starters_max`, `rb_starters_max`, `wr_starters_max`, `te_starters_max`, `second_qb_starts: boolean`, `te_premium: boolean`, `is_superflex` (or equivalent). The SYSTEM_PROMPT hard rule "Respect league format before claiming a position 'doesn't start'" REFERENCES these field names; if a new endpoint ships `starter_slots` without `format_rules`, the rule fires but has no data to bind on and the LLM falls back to inferring from raw counts (which produced the "second QB doesn't start in superflex" failure).
- **LLM trade-pricing contract.** Every endpoint where the LLM might propose trades (Coach, decision/trade) must ship a `pricing` block with `pick_values` (KTC-anchored, format-multiplied via `startupPickValue` × `SUPERFLEX_PICK_MULTIPLIER`) and `player_values` (FantasyCalc, normalized 0-100 to compose with picks). The `player_values_present: boolean` flag is the GUARD signal: when false, a pre-LLM injection in the route prepends `[GUARD]` to the user message forbidding numeric trade math. The shape lives in `src/app/api/coach/[leagueId]/route.ts` (Coach) and `src/lib/engine/context.ts` (decision endpoints). Briefings don't need pricing because they don't propose trades.
- **Window declaration uses a cookie mirror.** localStorage holds the user choice; `writeDeclaredWindow` also sets a 180-day cookie so the server can read via `next/headers cookies()`. WindowsBar has a hydrate-on-mount effect to repair stale localStorage-only state from before the cookie mirror existed.
- **Density (`my_pick_schedule`) is a CONTEXT MODIFIER**, not its own panel. It feeds Decision-card framing ("you wait 16 picks until your next slot") without rendering as a separate UI section. Never give density its own panel.
- **PUSH vs EXECUTE phase.** A path's phase flips to EXECUTING when its primary position is saturated (`position_count >= starter_need + 1`). A QB Cartel path with 3 QBs already is EXECUTING, not acquiring. `derivePhase` enforces this regardless of drift score.
- **Window constraint is a soft penalty,** not a hard filter. `penalizeForConstraint` applies score adjustments to candidates (rookie penalty, age-band penalty) so the constraint can lose to a strong-enough alternative. Heavy win-now: rookie penalty 40, age penalty ×6 per year off ideal.
- **Per-team superlatives** award at most ONE badge per team via min-margin checks. A "best at X" badge with no clear leader is noise; min_margin guards prevent ties from getting badges.
- **Rookie ADP variant.** `pickAdpFromVariants` checks `isRookie` first and prefers `adp_rookie` over format-specific ADPs. New rookie-aware code paths must respect this priority.
- **Soundboard is additive, never a refactor.** The Soundboard scaffold (judgment_profiles + mixer_feedback + mixer_suggestions + /soundboard route) ships dial UI and storage WITHOUT modifying engine consumers. WindowsBar + penalizeForConstraint + fill_starter remain the source of truth. Engine wiring of dial values is a planned migration: hoist each consumer to read from JudgmentProfile, then deprecate the standalone storage. NEVER wire a dial directly into a load-bearing surface in the same commit that ships its UI; that pattern broke other things in the past. Tooltip surface lists must list ONLY actual engine touchpoints; every dial today is badged "Pending wiring" and that's correct.
- **Roster identity must be ground-truth verified.** `is_me` is set by matching `roster.owner_id === mySleeperUserId`, but a wrong `mySleeperUserId` (stale URL `?username=`, navigation accident from scout / shared link, missing saved-username on a logged-in user) silently maps the user to ANOTHER manager's roster and every downstream surface (Decision card, Coach context, my_pick_schedule, position counts) reflects the wrong team. During an active draft, `picks_made` is authoritative on which roster owns which players. `runRosterIdentityVerification` in `players/integrity.ts` flags severe when the `is_me` roster has zero attributed picks while the draft has progressed. The hub also defaults `?username=` from the signed-in user's saved `profiles.sleeper_username` when the URL is missing one, and renders a "Viewing {team}" banner when the resolved hub identity differs from the saved one. Pattern: 2026-04-25 Strawhatdoofy hub viewed under izzydabomb session, no banner, Coach delivered Strawhatdoofy's roster as "yours."
- **Pool completeness is non-negotiable.** A real, undrafted, top-100 consensus player must NEVER be silently absent from `availablePlayers`. Three layers protect this. (1) `getAvailablePlayers` exclusion is picks-only during active draft (`status === "drafting" || "paused"`); roster.players union is reserved for pre-draft/complete/no-draft. Sleeper's roster.players carries stale prior-season state, so unioning it during a live draft drops real undrafted players (Sam LaPorta incident 2026-04-25). (2) `runCompletenessSanityChecks` walks FantasyCalc top-100 and verifies presence in available OR drafted; non-empty result = severe. (3) Hub renders an unconditional danger banner when the completeness check finds missing players, plus `console.error` for Vercel logs. Never disable any layer; never re-introduce roster.players union during active drafts.

## Known anti-patterns (do not do these)

- **Renaming a flag is not a fix.** We renamed `is_pending` to `build_phase` once but the underlying data was empty for a different reason. Fix the data flow, not the label.
- **Filtering by `team != null` excludes pre-NFL-draft rookies entirely.** Don't.
- **Adding a panel for a new idea instead of folding it into the Decision card.** Multi-panel sprawl was explicitly killed.
- **Mocking Sleeper in tests when the bug class involves real-API edge cases** (mid-draft roster shape, traded picks, co-owners). Use a fixture from a real call.
- **Recomputing strategy in a new surface** instead of consuming the engine output. If you need win-now score in a new place, plumb it from the snapshot/rank/windows pipeline.
- **Hedging in coach output** ("you might consider..."). The coach is an analyst, not a search result.
- **Reading `starter_slots.hard.QB` or `starter_slots.hard[pos]` as the QB starter count.** SF / 2QB leagues put the second QB slot in `starter_slots.superflex`, not `hard.QB`. Reading `hard.QB` alone treats SF as 1QB. Use `buildFormatRulesFromSnapshot(snap).qb_starters_max` (canonical helper) or, in `decision-synthesis/synthesize.ts`, the local `realisticStarterMaxFor(snap, pos)`. Lint rule in `evals/anti-patterns.test.ts` flags both `hard.QB` (unguarded) and dynamic `hard[pos]` access in `decision-synthesis/` and `swot/`. Add the rule to a new directory before writing engine math there. Bug: 2026-04-26 SWOT card said "QB room locked (3 bodies for 1 starter slot)" in a SF league because compute branched on `hard.QB` directly.

## Quality gates worth automating

These exist or should exist:

- **Em dash blocker.** PreToolUse hook on Edit/Write that denies any payload containing U+2014. Installed in `.claude/settings.local.json`.
- **Build before claiming a fix is shipped.** `npm run build` from `web/` must pass with zero warnings. TypeScript catches type drift but does not catch behavior bugs.
- **`npm test` before claiming a feature ships.** Runs integrity + draft-math + anti-patterns + rerank + swot + em-dash. Catches: SF QB starter math regressions, raw `hard[pos]` bug class, em dashes, ranking cascade drift, snake-pick math, integrity issues. Cheap, ~10s, no network.
- **For UI changes:** start the dev server and exercise the feature in a browser. Type checks are not feature checks.
- **For coach prompt changes:** test with thin-roster and named-player edge cases before shipping.
- **For new engine surfaces that compute starter math:** add the directory to the SF QB lint rule in `evals/anti-patterns.test.ts` AND add a regression test in `evals/swot.test.ts` style covering 1QB + SF + 2QB + flex semantics. The lint catches the syntax pattern; the test catches the semantic bug.
