# Dynasty General · Architecture Unification Plan (locked)

Locked 2026-05-23 after a four-pass architecture audit. This file is
the canonical record of where the platform's data and expertise are
unified, where they leak, and the phased plan to make every surface
draw on one root pool of data and one root pool of expertise, so that
improving a source ripples across the whole product.

It survives compaction. Read it before touching the snapshot builder,
the Coach context, the decision endpoints, the evaluation rubrics, or
any helper that returns a number used in two surfaces.

Protocol when this file disagrees with intent: re-read it, ask the
founder, do not ship the drift. Companion docs: `INVARIANTS.md`
(the load-bearing patterns), `CANONICAL_SOURCES.md` (one function per
computation class), `MODEL_CARD.md` + `BUILD_PLAN.md` (the rubric
migration intent this plan completes), `DATA_ACQUISITION_PLAN.md`
(the data sources this plan depends on).

---

## Verdict

The platform is not a tangle of competing implementations. It has one
good spine (the `LeagueSnapshot` plus roughly a dozen canonical
functions) that about 70% of the product already shares. The damage is
concentrated in four leaks. The platform is built in three layers:
data sources, expertise, surfaces. Today only the middle of each layer
is wired; the richest parts at both ends are built but disconnected.
Nothing in this plan throws expertise away. The work is connecting what
already exists and deleting the duplicates that drifted.

---

## The three-layer reality (audit, with file:line)

### Layer 1: Data

- **Connected:** Sleeper player metadata (`HumanPlayer` = id, name,
  position, team, age, years_exp, `src/lib/players/cache.ts:207`) and
  FantasyCalc values via the single resolver `resolvePlayerValues`
  (`src/lib/players/values.ts:247`). There is no parallel value path;
  KTC at runtime is prose-only (methodology pages), KTC data lives only
  in the backtest DB.
- **Disconnected:** `player_signals` and `team_signals` (snap/target/
  rush share, RAS, college dominator, breakout age, OL grades run/pass,
  OL continuity, OC tenure, scheme tags) exist as schema
  (`supabase/migrations/0009_signals.sql`) but are 0 rows in production
  and read by nothing live.
- **Siloed (populated, backtest-only):** `historical_signal_codes`
  (728 rows, includes `compounding_news_count` for 182 RB
  player-seasons) and `historical_outcomes` (3,877 rows, prior-season
  points) are read only by `scripts/*`, never joined at runtime.
- **Missing entirely:** career carries, career targets, athletic
  metrics (40-time / RAS / breakout age / dominator as data), and PFF
  OL grades have no populated source anywhere. nflfastR usage was
  planned (`DATA_ACQUISITION_PLAN.md` §2.2) but never ingested;
  Sleeper season-stats was chosen instead and carries only fantasy
  points + games_played (`src/lib/players/season-stats.ts`), not
  carries/targets/snaps. PFF (§2.3) was blocked on ToS.

DB row counts above were queried against production Supabase during the
2026-05-23 audit. Re-verify before acting on them; they will change as
acquisition lands.

### Layer 2: Expertise

A rich, cited per-player grading engine lives at
`src/lib/engine/evaluation/`. `evaluate(ctx)` (`index.ts:37`) dispatches
to position rubrics returning `{ point_estimate (0-100), variance_band,
evidence_stack, market_delta, confidence, arbitrage_flags }`. The
expertise encoded: RB role-tier hard gates + OL continuity
(`rubrics/rb.ts`), tier-conditional QB aging + OC tenure
(`rubrics/qb.ts`), WR target-share / scheme / pass-rate
(`rubrics/wr.ts`), TE 12-personnel + year-3 breakout
(`rubrics/te.ts`), a Bayesian market-prior blend (`util.ts`), and
variance-band tiering (`tiers.ts`).

Its header claims "Every consumer (Decision card, Coach context, AAR,
Quadrant) reads from this output" (`index.ts:11-13`). This is false
today. The only importers are `src/app/admin/evaluate/page.tsx` (a
noindex admin debug surface whose own header says "When the founder
validates the output here matches intuition, we wire production
surfaces to evaluate() in Phase 1.5") and `src/components/league/
tier-map.tsx`, which is never rendered. Phase 1.5 never happened.

The live decision pipeline grades player quality on market value
(FantasyCalc / KTC + ADP) plus a coarse heuristic
`search_rank x ageFactor x positionFactor` (`src/lib/players/
available.ts:54`). It reads no rubric signal.

### Layer 3: Surfaces

Most surfaces consume the same canonical functions (snapshot, ranks,
windows, available pool, values, startable depth, decision synthesis,
league read, inflections, opponents). Two real exceptions, in the
leaks below.

---

## The four leaks (the sloppiness)

### Leak 1: Coach is told to read data that is never sent

The Coach system prompt has a ~50-line block "Read `posture` BEFORE
every recommendation" (`src/app/api/coach/[leagueId]/route.ts:741-790`),
cites `posture.contender_window.peak_year`, and ends with the hard rule
"Never claim absence of posture data when posture is present."
Verified: `classifyRosterPosture` is called only on the hub
(`src/app/leagues/[leagueId]/page.tsx:1189`); the Coach route never
populates a `posture` key in its payload (no `posture:` key exists in
the `contextPayload` object). This is the exact failure mode
`INVARIANTS.md` warns about (the K/DST and SF-QB incidents): a rule
fires with nothing to bind on, and the LLM is forbidden from admitting
the gap. It is a hallucination generator and a likely contributor to
"Coach was not reading the core data on the page."

### Leak 2: The decision endpoints are a second, parallel strategy engine

`/api/decisions/pick`, `/trade`, `/strategy` do not call
`buildLeagueSnapshot -> rankArchetypes -> computeWindows`. They route
through `assembleContext` (`src/lib/engine/context.ts`), which re-fetches
Sleeper, re-resolves values, and infers strategy via a different
function `inferStrategyFromRoster` (`context.ts:165`), running with
`currentPickNo: null` (`context.ts:394`). Those endpoints get a
different strategy read than the hub and Coach, and run blind to draft
position. This violates the "one strategy engine" pillar outright.

### Leak 3: Coach's snapshot is not the hub's snapshot

Both call `buildLeagueSnapshot`, but the hub feeds it
`lastSeasonStats + projections` (`page.tsx:429`) and Coach does not
(`route.ts:928`). Those inputs populate `starter_talent_score`
(`snapshot.ts:557`), which flows into ranking, windows, and the
decision. The `REQUIRED_IN_COACH` lint cannot catch this because it
only checks that field-name strings are present, not that the two
snapshots were built from the same inputs. The board and the chat are
computed off non-identical snapshots.

### Leak 4: The expertise is parked and the data feeding it is empty

Both inflection builder paths (`from-snapshot.ts:63` and
`context.ts:285`) call `buildInflectionInputsFromHumanPlayer({ player,
sameTeamSamePosition })` and pass none of the seven usage args the
function accepts (`build-inputs.ts:27-34`). So career carries,
prior-season usage, draft capital, and compounding-news are null for
every inflection card. For an aging RB card, 4 of 5 signals are
structurally blind; for a QB card, 3 of 3. Three root causes, three
fixes:

- `compounding_news_count` and prior-season points: exist, but siloed
  in backtest tables. A runtime join lights them up.
- `draft_pick_overall`: NOT one field away. Verified 2026-05-23 against
  `api.sleeper.app/v1/players/nfl`: the blob carries only
  `metadata.rookie_year`, no NFL draft position. The earlier "one field
  away" read trusted a stale comment in `build-inputs.ts`; the comment
  is now corrected. This is missing data, acquisition track, not wiring.
- career carries, RAS, OL grades: do not exist anywhere. Data
  acquisition, not wiring.

Being honest about which bucket each signal is in is the whole game.

### Supporting leaks (de-risking, not symptoms)

- **Unregistered duplicate calcs (drift waiting to happen):**
  - Per-pick EV `(value/100) x (pick_no - adp)`: 7 copies (ev-bank
    `analyze.ts:39,79`, `league.ts:85`; `whatif.ts:104`;
    `the-call/candidate-bits.tsx:15`; `companion/classify.ts:318,365`;
    hub `page.tsx:1519` with a comment admitting the duplication;
    `aar/page.tsx:413,470`). No canonical.
  - Position normalization `position.toUpperCase()`: 30+ inline sites,
    only 3 merge DST/DEF, so the rest treat them as different
    positions. No exported `normalizePosition`.
  - Age-curve math: 3-4 divergent models with different shapes AND
    different value semantics (`players/age-curve.ts:100`,
    `evaluation/util.ts:115`, `windows/compute.ts:93,118`,
    `synthesize.ts:858`). A 31-year-old RB gets a different number from
    each.
  - `is_me` / roster identity: 5 resolutions, 3 co-owner behaviors. The
    snapshot's own `is_me` (`snapshot.ts:648`) omits `co_owners`
    despite `INVARIANTS.md` flagging it as a trust-breaking bug class.
- **Redundant re-resolution inside one request:** 8 independent
  `buildLeagueSnapshot` call sites; scout builds it twice per team per
  render (`scout/score.ts:304,536`). Within one hub render
  `resolvePlayerValues` runs 3-4 times (hub plus `draft-paths/
  project.ts` and `class-strength/compute.ts` re-resolving on the
  snapshot they were handed), `getAvailableForRequest` twice,
  `loadEffectiveDials` three times. Warm caches absorb the network
  cost; the structure is still the opposite of "one pool."

---

## Target architecture: four "ones"

The root-pool goal means four single sources, each the place you tune
once and have it ripple:

1. **One enriched player.** A single `EnrichedPlayer` resolver merges
   Sleeper meta + value + whatever signals exist + inflection inputs,
   and flags what is missing rather than silently nulling it. Improve a
   source feeding this resolver and every surface gets it.
2. **One snapshot per request.** Build the snapshot once at the request
   boundary and pass it to every consumer (hub children, Coach, decision
   endpoints). No surface rebuilds it; no surface re-derives strategy.
3. **One expertise grade.** The rubric `evaluate()` becomes the single
   per-player quality grade that the live pipeline, rankings, and
   inflection consume. The 3-4 age curves and 3 bellcow models collapse
   into it.
4. **One Coach mirror.** Every user-visible signal flows to Coach from
   the same computed objects the board renders. The lint enforces object
   parity, not field-name string presence.

---

## Phased plan

Decisions baked in (founder, 2026-05-23):
- **Decision endpoints:** converge the engine now, defer the deletion.
  The unsustainable thing is the parallel engine
  (`inferStrategyFromRoster` + assembleContext's private
  re-derivations), not the existence of focused deep-link routes. Once
  `/pick`, `/trade`, `/strategy` consume the same shared context builder
  and the same canonical strategy outputs as the hub and Coach, they are
  thin shells over one engine. Deleting user-facing surfaces just before
  release is risk with little upside and is reversible later. Schedule a
  usage-gated "retire if dead" review post-release.
- **Expertise (Phase 3):** acquire data first. The rubric stays parked
  until `player_signals` / `team_signals` carry real signals, with one
  carve-out: the data we already have but siloed (compounding-news,
  prior-season points, draft pick) gets connected early, because that is
  real data first, not fallback.

### Phase 0: Correctness (small, ship first)

0.1 Fix posture (Leak 1): call `classifyRosterPosture` in the Coach
route and add `posture` to the payload, mirroring the hub. Keep the
active-draft suppression the prompt already describes. (Alternative if
posture is intentionally out of chat scope: delete the prompt block.
Either way the rule and the data must agree.)

0.2 (RECLASSIFIED) `draft_pick_overall` was thought to be one field away
on the Sleeper blob. It is not there (verified 2026-05-23). The
misleading `build-inputs.ts` comment is corrected; the signal moves to
the Phase 3 acquisition track. No 0.2 wiring ships.

Gate: `npm run build` clean, `npm test` green. Add a Coach context test
asserting `posture` present when classifiable.

### Phase 1: One snapshot per request (closes Leaks 2 and 3)

1.1 Introduce a single per-request `LeagueContext` builder that runs
snapshot + values + available pool + startable-depth once, with the
same inputs everywhere. Hoist `lastSeasonStats + projections` into it so
hub/Coach parity is structural (closes Leak 3).

1.2 Hub children (`draft-paths/project.ts`, `class-strength/
compute.ts`) and Coach consume the handed-down `LeagueContext` instead
of re-resolving values and the available pool.

1.3 Rewire `assembleContext` to consume `LeagueContext` and the
canonical strategy outputs (`rankArchetypes` + `computeWindows`) with
real draft state, deleting `inferStrategyFromRoster` (closes Leak 2 and
the "one strategy engine" violation). `/pick`, `/trade`, `/strategy`
keep their routes; they now read one engine.

1.4 Register `LeagueContext` in `CANONICAL_SOURCES.md`. Add a lint that
fails when a route or server component calls `buildLeagueSnapshot`
directly outside the approved builder boundary.

Gate: build + test green; a manual exercise of hub, Coach, and each
decision endpoint confirming identical standing-call and strategy reads.

### Phase 2: Collapse duplicate calcs into canonicals (pure de-risking)

2.1 DONE (commit 15a85ed). `perPickEv(value, pickNo, adp)` canonical in
`ev-bank/formula.ts` (with shared `round2`). 5 formula copies + 5
`round2` copies collapsed (the audit's 7-copy count predated main's
companion-debate merge, which had already removed the hub inline copy
and added the debate copy). Lint bans the `/ 100) * (` signature outside
`formula.ts`. Behavior-preserving (callers keep their exact rounding
points). Registered.

2.2 DONE (commit de79ca7), TARGETED not blind. `normalizePosition(raw)`
canonical promoted into `archetypes/schema.ts` (next to the `Position`
type) with `FANTASY_POSITIONS`, merges DEF -> DST. Replaced the 4
player-position normalizers (hub + Coach `normPos`, `forecast.toPosition`,
scout inline). The audit's 30+ count conflated three concerns: the blind
sweep was rejected because slot-parsing over `roster_positions` and
FantasyCalc cross-ref matching legitimately use the bare string, and some
`.toUpperCase()` sites handle position strings the canonical would null
out. Lint bans the `.toUpperCase() === "DEF"` normalizer shape. Registered.

2.3 NOT DONE (next check point). One `ageEffect` canonical collapsing the
3-4 divergent models. This CHANGES NUMBERS (each curve gives a 31yo RB a
different value), so it is NOT a safe pre-release pass: it needs a founder
decision on the canonical shape (the rubric Bayesian curve is the most
defensible candidate) plus `dynasty-assumption-auditor` +
`dynasty-canon-keeper` review and an `evals/age-curve.test.ts` per
position. Deferred out of the pre-release "safe wins" set.

2.4 DONE (commit 298859f). `isRosterOwnedBy(roster, userId)` canonical in
`sleeper/roster-identity.ts`, co-owner-aware. Fixed the snapshot `is_me`
co-owner bug (a co-owner saw is_me:false on their own team) and unified 8
resolutions. Lint bans `.owner_id ===` outside the canonical;
`evals/roster-identity.test.ts` covers co-owner / orphan / null. No-op in
non-co-owner leagues. Registered.

Gate: build + test green on each (met). The age-curve work (2.3) still
needs the snapshot-diff check that it does not silently move standing
calls in fixture leagues.

### Phase 3: Acquire data, then wire the expertise (the big one)

This phase has a data track that runs first and a wiring track gated on
it. The correctness and consolidation phases (0, 1, 2, 4) do not depend
on this and should not wait for it.

3a. Data acquisition (first, per founder direction). Investigation
2026-05-23 (agent a29ef579) corrected the sequencing below:
- CORRECTION: the "connect the siloed historical data" idea is illusory
  for LIVE cards. `historical_signal_codes` (compounding_news, RB-only,
  2022-2024) and `historical_outcomes` (points only, no carries/targets)
  are backtest-grade history; joining them to a live 2026 roster lights
  up almost nothing. They help BACKTESTING, not the blind aging-RB cards
  the founder flagged. Do not spend the "free win" budget there.
- DONE (commit 2eed1eb): prior-season carries + targets from the FREE
  Sleeper `/stats` endpoint the app already calls (`rush_att` / `rec_tgt`,
  keyed by Sleeper player_id, verified live). Parsed in `season-stats.ts`,
  threaded through `buildInflectionsFromSnapshot` on hub + Coach. Lights
  up the inflection workload-trend signal. No new dependency, no DB write.
- NEXT (still free, autonomous-safe): `career_carries` / `career_targets`
  via a multi-season sum of the same Sleeper `/stats` (the mileage signal
  + the 1500-carry RB cliff trigger). Needs a dedicated career-totals
  aggregator with a bounded season window + its own cache (the per-render
  fetch cost is the design question), so it is its own step, not a
  trivial extension of 3a-DONE.
- HEAVIER (needs founder decision + prod-DB-write authorization): ingest
  nflfastR usage (snap share, route participation, EPA) into
  `player_signals` (`DATA_ACQUISITION_PLAN.md` §2.2; repo is all-TS, so
  this means fetching nflverse parquet/CSV from a TS script, MIT-licensed).
  draft_pick_overall from nflverse `draft_picks` (gsis_id, needs a
  crosswalk to Sleeper ids).
- DECISIONS REQUIRED: athletic metrics (RAS) have NO source entry yet
  (open gap); OL grades are PFF-ToS-blocked (proxy via snap-count
  continuity, or accept null). Both, plus any `player_signals` backfill,
  WRITE to production Supabase via the service-role key (the only instance
  configured) and must be founder-authorized before running.

3b. Build the `EnrichedPlayer` resolver: merge meta + value + signals +
inflection inputs, flag missing fields explicitly (no silent null).
Make both inflection builder paths consume it; the seven optional args
in `build-inputs.ts` finally get supplied from one place.

3c. Wire `evaluate()` into available-pool scoring and `synthesize`,
replacing the market-only grade, using the rubric's existing Bayesian
fallback where a signal is still null. Collapse `rankings/build.ts`
`bellcowScore` and the stubbed `continuityScore` (returns 0 today) to
consume the rubric. Update the `index.ts` header claim to match
reality, and register the rubric as the canonical player-quality grade
in `CANONICAL_SOURCES.md`.

Gate: backtest the rubric-graded pipeline against KTC/FantasyCalc
historical values before flipping it on live; spawn
`dynasty-canon-keeper` (CRITIQUE) and `dynasty-assumption-auditor` on
the wired weights.

### Phase 4: One Coach mirror

4.1 Widen the mirror so every board-visible signal flows to Coach from
the same computed object: posture (done in 0.1), EV bank
(`analyzeLeagueEvBank`), inflections-with-data, engine-suggested plays
(not just client-committed `active_plays`).

4.2 Strengthen `REQUIRED_IN_COACH` in `evals/anti-patterns.test.ts` from
"field-name string present" to "same computed object referenced," so
divergence between chat and board becomes structurally impossible, not
just discouraged. This is the durable enforcement of the "Coach uses
our exact architecture" invariant.

---

## What we must NOT lose (expertise + data-model inventory)

Preserve every item below; the plan connects them, never deletes them.

- The position rubrics and their cited weights/thresholds
  (`engine/evaluation/rubrics/*`, `MODEL_CARD.md` section 4).
- The variance-band + Bayesian-prior machinery (`util.ts`, `tiers.ts`).
- The inflection model and its citations (`engine/inflection/*`).
- The full snapshot data model (`LeagueSnapshot`, `RosterSnapshot`,
  `my_pick_schedule`, density classifications).
- Every canonical already registered in `CANONICAL_SOURCES.md`.
- The backtest corpus (`historical_*` tables) and the scripts that built
  it; the runtime joins read from it, they do not replace it.
- The DB schema for `player_signals` / `team_signals` / `player_health`;
  acquisition fills it, the plan does not redesign it.

---

## Sequencing and dependencies

- Phases 0, 1, 2, 4 are independent of data acquisition and can ship in
  order without waiting on Phase 3.
- Phase 3b/3c depend on 3a (data) and benefit from 1 (one resolver to
  plug into) and 2.3 (one age curve so the rubric is the age authority).
- Recommended order: 0 -> 1 -> 2 -> 4, with the 3a data track started in
  parallel at Phase 1 and 3b/3c landing whenever the data does.
- Each phase ships behind the standard gate (build clean, tests green,
  manual feature exercise for UI/Coach changes) on its own `work/<name>`
  branch and PR per `AGENTS.md`.

## Open questions

- Decision-endpoint usage data for the post-release "retire if dead"
  review (Decision A): instrument or log the three routes to learn
  whether anything still deep-links them.
- Age-curve canonical shape (2.3): confirm the rubric Bayesian curve is
  the one true shape before collapsing the other three, or pick another
  and migrate the rubric to it.
- OL-grade source (3a): PFF is blocked; decide proxy vs null-and-degrade.
