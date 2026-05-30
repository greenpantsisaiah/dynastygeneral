/**
 * Anti-pattern scanner. Greps source for known regression patterns
 * documented in INVARIANTS.md. Fails the test if any reappear.
 *
 *   npx tsx --tsconfig tsconfig.json evals/anti-patterns.test.ts
 *
 * Each rule has:
 *   - A regex or substring pattern
 *   - Files / directories to scan
 *   - Allow-list of known-OK occurrences (test files, comments
 *     describing the bad pattern, etc.)
 *
 * The point is to backstop human memory: a future contributor writes
 * `team != null` in a player-filter context and CI fails before the
 * silent-drop bug ships.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

let passed = 0;
let failed = 0;

type Hit = { file: string; line: number; content: string };

type Rule = {
  name: string;
  why: string;
  pattern: RegExp;
  scan: { dir: string; ext: string[] };
  // If file path matches any allow-prefix, occurrences are ignored.
  // Used to whitelist test files and the rule's own description.
  allowFilePrefixes?: string[];
  // If a line contains any of these, it's allowed (e.g., a comment
  // describing the anti-pattern).
  allowLineSubstrings?: string[];
};

const SRC = resolve(process.cwd(), "src");
const EVALS = resolve(process.cwd(), "evals");

const RULES: Rule[] = [
  {
    name: "no stale dynasty-bug-investigator workflow references",
    why: "The dynasty-bug-investigator workflow alias is unavailable in this environment. Reintroducing it in code/docs creates dead runbook instructions and misroutes debugging. Use the debug workflow language instead.",
    pattern: /dynasty-bug-investigator/i,
    scan: { dir: process.cwd(), ext: [".ts", ".tsx", ".md"] },
    allowFilePrefixes: [EVALS],
  },
  {
    name: "no team!=null player-pool filter",
    why: "Pre-NFL-draft rookies have team:null. Filtering by team!=null silently excludes every rookie. Per INVARIANTS.md.",
    pattern: /\.team\s*!==?\s*null/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [EVALS, join(SRC, "lib", "players", "available.ts.test")],
    allowLineSubstrings: [
      "Filtering by `team != null` excludes",
      "Filtering by `team != null` silently",
      "team != null filter",
      "Don't filter by team!=null",
    ],
  },
  // 2026-05-21 live-data check (FantasyCalc 1QB-PPR vs non-TEP Sleeper
  // ADP) proved FantasyCalc does NOT inflate TE in standard scoring:
  // top-24 TEs sit at a mean -11.2 rank displacement (market drafts
  // them HIGHER than FC ranks them). A standard-league TE down-
  // multiplier would push recommendations further from the market.
  // If "too many TEs" recurs, it's a scoring tiebreaker in
  // decision-synthesis, not the value scale. Per INVARIANTS.md.
  {
    name: "no standard-league TE down-multiplier",
    why: "FantasyCalc does not inflate TE in non-TEP (data verdict 2026-05-21). A TE_STANDARD_MULTIPLIER < 1 makes TE recommendations worse, not better.",
    pattern: /TE_STANDARD_MULTIPLIER/,
    scan: { dir: join(SRC, "lib", "players"), ext: [".ts"] },
    allowFilePrefixes: [EVALS],
  },
  // Per-pick EV is (value / 100) * (pick_no - adp), the EV-bank math.
  // It was duplicated across 5 files (ev-bank/analyze + league, what-if,
  // candidate cards, companion debate) with 5 copies of round2. One
  // canonical (perPickEv in ev-bank/formula.ts) so a calibration change
  // ripples to every EV surface. The signature `/ 100) * (` is the
  // duplicate to ban; only formula.ts may spell it out.
  {
    name: "no inline per-pick EV formula (use perPickEv canonical)",
    why: "The EV-bank formula (value/100) * (pick - adp) must live in one place (perPickEv, ev-bank/formula.ts) so a calibration change ripples everywhere. Per CANONICAL_SOURCES.md.",
    pattern: /\/\s*100\)\s*\*\s*\(/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [
      EVALS,
      join(SRC, "lib", "strategy", "ev-bank", "formula.ts"),
    ],
  },
  // The standing decision has ONE production path: resolveStandingDecision
  // (decision-bundle.ts), fed by buildPricedPool. Calling synthesizeDecision
  // directly lets a surface hand-build a divergent prelude (different value
  // coverage, different dials), the 2026-05-24 board/Coach divergence class.
  // Only the definition and the wrapper may name it with a call paren.
  {
    name: "no direct synthesizeDecision call (use resolveStandingDecision)",
    why: "The standing decision must be produced through resolveStandingDecision (decision-bundle.ts), the single production path fed by buildPricedPool. A direct synthesizeDecision call lets a surface hand-build a divergent prelude, the board/Coach bug class. Per CANONICAL_SOURCES.md.",
    pattern: /synthesizeDecision\(/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [
      EVALS,
      join(SRC, "lib", "strategy", "decision-synthesis", "synthesize.ts"),
      join(SRC, "lib", "strategy", "decision-synthesis", "decision-bundle.ts"),
    ],
  },
  // One snapshot + strategy per request. Surfaces consume the canonical
  // buildLeagueContext (engine/league-context.ts), which runs the snapshot
  // (always lastSeasonStats + projections enriched) + rankArchetypes +
  // computeWindows + buildPricedPool once. A surface that calls
  // buildLeagueSnapshot directly can re-derive strategy independently and
  // run blind to draft state, the Leak 2 / Leak 3 bug class from
  // ARCHITECTURE_UNIFICATION_PLAN.md. Only the snapshot definition, the
  // lastSeasonStats/projections wrapper (buildStrategySnapshot), and the
  // bootstrap / standalone callers that legitimately need a raw snapshot
  // (scout per-team, after-action, briefings, debug, league adapters) may
  // name it with a call paren. A `typeof buildLeagueSnapshot` type
  // reference (no paren) is fine and not matched.
  {
    name: "no direct buildLeagueSnapshot call (use buildLeagueContext)",
    why: "Per-request snapshot + strategy must come from buildLeagueContext (engine/league-context.ts) so hub, Coach, and the decision endpoints read one snapshot + values + depth. A direct buildLeagueSnapshot call reintroduces the parallel-strategy / draft-blind leaks. Per CANONICAL_SOURCES.md + ARCHITECTURE_UNIFICATION_PLAN.md Phase 1.",
    pattern: /buildLeagueSnapshot\(/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [
      EVALS,
      // The canonical definition.
      join(SRC, "lib", "strategy", "league-state", "snapshot.ts"),
      // The lastSeasonStats + projections wrapper buildLeagueContext uses.
      join(SRC, "lib", "strategy", "league-state", "strategy-snapshot.ts"),
      // Bootstrap / standalone consumers that legitimately build a raw
      // snapshot for their own purpose (not the decision pipeline).
      join(SRC, "lib", "scout", "score.ts"),
      join(SRC, "lib", "leagues", "sleeper-adapter.ts"),
      join(SRC, "app", "leagues", "[leagueId]", "aar", "page.tsx"),
      join(SRC, "app", "api", "briefings", "run", "[leagueId]", "route.ts"),
      join(SRC, "app", "api", "debug-snapshot", "[leagueId]", "route.ts"),
    ],
  },
  // Roster identity must go through isRosterOwnedBy, which checks
  // co_owners. Resolving "is this my roster" by owner_id alone silently
  // mis-identifies co-owned teams, a trust-breaking bug class
  // (INVARIANTS.md "Roster identity must be ground-truth verified").
  // Only the canonical may compare owner_id directly. A legitimate
  // non-identity owner_id comparison (two rosters sharing an owner)
  // should be added to the allow-list with a justifying comment.
  {
    name: "no raw owner_id identity resolution (use isRosterOwnedBy)",
    why: "Resolving roster ownership by owner_id alone skips co_owners and mis-identifies co-owned teams. Use isRosterOwnedBy (sleeper/roster-identity.ts). Per CANONICAL_SOURCES.md.",
    pattern: /\.owner_id\s*===/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [
      EVALS,
      join(SRC, "lib", "sleeper", "roster-identity.ts"),
    ],
  },
  // Player position must normalize through normalizePosition, which
  // merges DEF -> DST. An inline `position.toUpperCase() === "DEF"`
  // normalizer is the duplicate shape that drifts (code checking
  // "DST" silently misses "DEF"). The canonical lives in
  // archetypes/schema.ts. Slot-parsing (`p === "DEF"` over
  // roster_positions) and FantasyCalc cross-ref matching are distinct
  // concerns and use the bare string, so this bans only the
  // `.toUpperCase() === "DEF"` normalizer shape.
  {
    name: "no inline DEF->DST position normalizer (use normalizePosition)",
    why: "Player-position normalization must go through normalizePosition (archetypes/schema.ts), which merges DEF -> DST. Inline `.toUpperCase() === \"DEF\"` re-introduces the DST/DEF drift class. Per CANONICAL_SOURCES.md.",
    pattern: /\.toUpperCase\(\)\s*===\s*["']DEF["']/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [
      EVALS,
      join(SRC, "lib", "strategy", "archetypes", "schema.ts"),
    ],
  },
  // Snap share (and the rest of the opportunity read: aDOT, drop rate,
  // RZ role) must come from buildOpportunityProfile (season-stats.ts),
  // the canonical opportunity read. Dividing player snaps by team snaps
  // inline re-derives snap share and drifts from the canonical (the
  // clamp, the zero-denominator guard, the null handling). Only the
  // canonical may divide by team_off_snaps.
  {
    name: "no inline snap-share derivation (use buildOpportunityProfile)",
    why: "Snap share must be derived by buildOpportunityProfile (players/season-stats.ts), which clamps 0-1 and guards a zero denominator. Dividing by team_off_snaps inline re-derives it and drifts. Per CANONICAL_SOURCES.md.",
    pattern: /\/\s*[A-Za-z0-9_.]*team_off_snaps\b/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [
      EVALS,
      join(SRC, "lib", "players", "season-stats.ts"),
    ],
  },
  // QB starter math is the most-bugged pattern: SF / 2QB leagues have
  // their second QB slot in starter_slots.superflex, NOT in
  // starter_slots.hard.QB. Reading hard.QB without adding superflex,
  // OR using the dynamic key form hard[pos] (which dispatches to QB
  // unguarded), produces the SF QB starter bug class.
  //
  // The pattern below flags:
  //   - hard.QB unless followed on the same line by `+ X.superflex`
  //   - hard[anything]   (dynamic key, could be QB)
  // Literal hard.RB / hard.WR / hard.TE / hard.K / hard.DST are NOT
  // flagged: those positions don't have a SF analogue, so direct
  // reads are safe.
  {
    name: "no raw starter_slots.hard.QB or hard[pos] in decision-synthesis",
    why: "Engine starter-need math for QB-eligible positions must use rules.qb_starters_max (or the canonical hard.QB + ss.superflex line in the helper). Raw hard.QB / hard[pos] re-introduces the SF QB starter bug class.",
    pattern: /starter_slots\.hard\.QB(?!\s*\+\s*\w+\.superflex)|starter_slots\.hard\s*\[/,
    scan: { dir: join(SRC, "lib", "strategy", "decision-synthesis"), ext: [".ts"] },
    allowFilePrefixes: [EVALS],
    allowLineSubstrings: [
      // Doc / comment references are fine.
      "starter_slots.hard.X",
      "starter_slots.hard.QB",
      "branch on starter_slots.hard",
      "NEVER read",
    ],
  },
  {
    name: "no raw starter_slots.hard.QB or hard[pos] in swot compute",
    why: "SWOT briefing math must use buildFormatRulesFromSnapshot + startersMaxFor so SF / 2QB folds in correctly. Founder bug 2026-04-26: SWOT said 'QB room locked (3 bodies for 1 starter slot)' in a SF league because compute branched on starter_slots.hard.QB directly.",
    pattern: /starter_slots\.hard\.QB(?!\s*\+\s*\w+\.superflex)|starter_slots\.hard\s*\[/,
    scan: { dir: join(SRC, "lib", "strategy", "swot"), ext: [".ts"] },
    allowFilePrefixes: [EVALS],
    allowLineSubstrings: [
      "starter_slots.hard.X",
      "starter_slots.hard.QB",
      "branch on starter_slots.hard",
      "NEVER read",
      "NEVER branch on starter_slots.hard",
    ],
  },
  // Roster-fit math is canonical in src/lib/engine/roster-fit.ts. No
  // surface outside that module is allowed to define a function that
  // re-derives "how many starters at position X" or "realistic max"
  // or related concepts. Imports from roster-fit.ts are required.
  // Per INVARIANTS "Tuning capacity" (2026-04-27): the reason to
  // consolidate is so a tweak in one place propagates everywhere.
  // Re-derivation breaks that promise and the same bug class returns
  // on every refactor.
  {
    name: "no re-derived roster-fit functions outside engine/roster-fit.ts",
    why: "Roster-fit math (effectiveStarterReqs, realisticStarterMaxFor, startersMaxFor, getHardStarterReqs, getRealisticStarterMax, getUpperBoundStarterMax, buildPositionRoomHealth) is canonical in src/lib/engine/roster-fit.ts. Other surfaces import; they don't define. Re-derivation drifts and produces the Mac Jones / Schultz bug class (2026-04-27).",
    pattern: /^\s*(?:export\s+)?function\s+(?:effectiveStarterReqs|realisticStarterMaxFor|startersMaxFor|getHardStarterReqs|getRealisticStarterMax|getUpperBoundStarterMax|buildPositionRoomHealth|flexShareForPosition)\s*[(<]/,
    scan: { dir: SRC, ext: [".ts"] },
    allowFilePrefixes: [
      EVALS,
      // The canonical home is allowed to define these.
      join(SRC, "lib", "engine", "roster-fit.ts"),
    ],
    allowLineSubstrings: [
      "// allowed re-export",
      "// canonical",
    ],
  },
  {
    name: "no raw snap.starter_slots.hard cloning in strategy modules",
    why: "Starter-need math in strategy modules must read canonical roster-fit helpers (getHardStarterReqs / related). Cloning snap.starter_slots.hard into local helper math reintroduces split semantics and drift.",
    pattern: /const\s+hard\s*=\s*snap\.starter_slots\.hard\s*;/,
    scan: { dir: join(SRC, "lib", "strategy"), ext: [".ts"] },
    allowFilePrefixes: [EVALS],
    allowLineSubstrings: [
      "// canonical",
      "// parseStarterSlots",
    ],
  },
  // Trade-aware pick owner resolution: 2026-05-06 bug class. Three
  // independent implementations (banner / decision-card title /
  // gap-walker) drifted as patches landed out-of-sync. Canonical:
  // rosterAtPickNo in src/lib/sleeper/pick-resolution.ts. Anywhere
  // else that builds `${round}:${original_owner}` maps is re-
  // implementing the wheel.
  {
    name: "no inline traded_picks override-map construction outside the canonical resolver",
    why: "Trade-aware pick attribution must go through rosterAtPickNo (src/lib/sleeper/pick-resolution.ts). The override-map signature `${round}:${original_owner}` keyed Map is the 2026-05-06 'Decision title says 2 ahead but banner says 11' bug class. Analytics readers of traded_picks (count, filter, list) are fine; only the override-map construction is forbidden.",
    pattern: /\$\{[^}]*round[^}]*\}:\$\{[^}]*original_owner/,
    scan: { dir: SRC, ext: [".ts"] },
    allowFilePrefixes: [
      EVALS,
      // Future-picks portfolio builder uses a related but distinct
      // key shape (season:round:original_owner) for FUTURE-season
      // pick ownership. Different domain from active-draft pick
      // resolution. Allowed.
      join(SRC, "lib", "players", "future-picks.ts"),
    ],
    allowLineSubstrings: ["// canonical override map"],
  },
  // Survival pct hardcoded buckets: 2026-05-06 bug class. The
  // 90/50/15 lookup with a ±5 nudge collapsed everything to 50% and
  // disagreed with the gap-text classifier in body copy. Canonical:
  // survivalPctFor in src/lib/strategy/decision-synthesis/synthesize.ts
  // (computes a real opponent-game-theory probability). Hardcoded
  // 90/50/15 ternaries elsewhere indicate a parallel classifier.
  {
    name: "no hardcoded 90/50/15 survival-pct bucket lookup outside the canonical",
    why: "Survival pct is computed by survivalPctFor() using opponent-game-theory math. Hardcoding the legacy 90/50/15 buckets reintroduces the divergence-from-badge bug class (2026-05-06).",
    pattern: /["']likely_here["']\s*\?\s*9\d\s*:\s*["']coin_flip["']\s*\?\s*\d+\s*:/,
    scan: { dir: SRC, ext: [".ts"] },
    allowFilePrefixes: [
      EVALS,
      // The canonical home is allowed to define the legacy fallback.
      join(SRC, "lib", "strategy", "decision-synthesis", "synthesize.ts"),
    ],
    allowLineSubstrings: ["// canonical", "// fallback path"],
  },
  // Parallel pick-owner functions. A new function named like
  // rosterAtSlot / rosterAtPickNo / pickOwner / ownerOfPick outside
  // the canonical home is, by definition, a parallel implementation.
  // Allow only two homes: pick-resolution.ts (canonical) and the
  // existing thin wrapper in predict.ts (which delegates).
  {
    name: "no parallel pick-owner functions outside pick-resolution.ts",
    why: "Functions named rosterAtPickNo / rosterAtSlot / findRosterAtSlot / pickOwner / ownerOfPick / effectiveRosterIdForPickNo can only be defined in pick-resolution.ts (canonical) or as a thin wrapper in predict.ts. Anywhere else is a duplicate implementation.",
    pattern: /^\s*(?:export\s+)?function\s+(?:rosterAtPickNo|rosterAtSlot|findRosterAtSlot|pickOwner|ownerOfPick|effectiveRosterIdForPickNo)\s*[(<]/,
    scan: { dir: SRC, ext: [".ts"] },
    allowFilePrefixes: [
      EVALS,
      join(SRC, "lib", "sleeper", "pick-resolution.ts"),
      join(SRC, "lib", "strategy", "pick-approach", "predict.ts"),
    ],
    allowLineSubstrings: ["// allowed re-export", "// canonical"],
  },
  // Direct availabilityAt result compared to "probably_gone" string
  // literal. This bypasses the canonical survivalPctFor +
  // availabilityFromPct pipeline (which adds the opponent-game-theory
  // layer) and was the root cause of the 2026-05-08 AVAILABILITY_INCOHERENT
  // banner: buildNextPicksPlan filtered survivors via raw ADP gap while
  // top_candidates classified via the canonical pct pipeline. Both
  // paths must use the canonical for survival classification.
  {
    name: "no direct availabilityAt result compared to probably_gone",
    why: "Per CANONICAL_SOURCES.md anti-pattern 2: deriving the survival bucket from anything other than the canonical survivalPctFor + availabilityFromPct pipeline drifts from the opponent-game-theory layer and produces the AVAILABILITY_INCOHERENT bug class. Wrap availabilityAt's output through survivalPctFor + availabilityFromPct before classifying.",
    pattern: /availabilityAt\([^)]*\)\s*[!=]==?\s*["']probably_gone["']/,
    scan: { dir: SRC, ext: [".ts"] },
    allowFilePrefixes: [EVALS],
    allowLineSubstrings: ["// canonical pipeline OK"],
  },
  // Flat literal score in a decision-rule push. When two candidates
  // of the same rule both push at the same flat number, V8 stable
  // sort + position iteration order (QB,RB,WR,TE) becomes the
  // tiebreaker. RB always wins. 2026-05-08 Warren-vs-Judkins bug:
  // fill_starter_urgent assigned both candidates score 100, RB beat
  // TE despite Warren being ADP-extreme + lower survival + higher
  // value. Every rule's score MUST include a per-candidate
  // differentiator (adpGapModifier, drift_score, position_rank,
  // index decay, saturation penalty). Per CANONICAL_SOURCES.md
  // "Decision-rule scoring".
  {
    name: "no flat literal score in synthesize.ts decision-rule push",
    why: "Decision-rule scores must differentiate candidates within and across positions for the same rule. A literal score: <number>, leaves stable sort + iteration order (QB,RB,WR,TE) as the tiebreaker, which is the 2026-05-08 Warren-vs-Judkins bug class. Combine the base score with at least one candidate-specific signal (adpGapModifier, drift_score, position_rank, etc.).",
    pattern: /^\s*score:\s*[0-9]+\s*,/,
    scan: { dir: join(SRC, "lib", "strategy", "decision-synthesis"), ext: [".ts"] },
    allowFilePrefixes: [EVALS],
    allowLineSubstrings: [
      "// flat-score sentinel allowed",
      "score: <literal>",
    ],
  },
  {
    name: "no local ageCurveSignedFor (use canonical ageCurveSigned)",
    why: "The signed age curve is the canonical ageCurveSigned in @/lib/players/age-curve (Phase C3). A local ageCurveSignedFor was the stepwise bin curve that drifted from the rubric + rank curves. Import the canonical; do not redefine.",
    pattern: /ageCurveSignedFor/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [EVALS],
  },
  {
    name: "no re-defined ageMultiplier (use @/lib/players/age-curve)",
    why: "ageMultiplier is the canonical production-multiplier adapter in @/lib/players/age-curve (Phase C3). Defining a second one (the old stepwise bins lived in engine/evaluation/util.ts) reintroduces the four-curve drift. Import or re-export the canonical.",
    pattern: /function\s+ageMultiplier\s*\(/,
    scan: { dir: SRC, ext: [".ts", ".tsx"] },
    allowFilePrefixes: [EVALS, join(SRC, "lib", "players", "age-curve.ts")],
  },
];

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function findHits(rule: Rule): Hit[] {
  const files = walk(rule.scan.dir, rule.scan.ext);
  const hits: Hit[] = [];
  for (const file of files) {
    if (rule.allowFilePrefixes?.some((p) => file.startsWith(p))) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    // For multiline patterns, run the regex on the whole content.
    // For single-line patterns, walk lines.
    if (rule.pattern.flags.includes("s")) {
      if (rule.pattern.test(content)) {
        // Find the first match's line number for the report.
        const m = content.match(rule.pattern);
        if (!m) continue;
        const idx = content.indexOf(m[0]);
        const line = content.slice(0, idx).split("\n").length;
        hits.push({ file, line, content: m[0].split("\n")[0].slice(0, 120) });
      }
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!rule.pattern.test(ln)) continue;
      if (rule.allowLineSubstrings?.some((sub) => ln.includes(sub))) continue;
      hits.push({ file, line: i + 1, content: ln.trim().slice(0, 160) });
    }
  }
  return hits;
}

function relpath(p: string): string {
  return p.replace(`${process.cwd()}/`, "");
}

function run() {
  for (const rule of RULES) {
    console.log(`\n── ${rule.name} ──`);
    const hits = findHits(rule);
    if (hits.length === 0) {
      passed++;
      console.log(`  ✓ no occurrences`);
    } else {
      failed++;
      console.log(`  ✗ ${hits.length} occurrence${hits.length === 1 ? "" : "s"} found`);
      console.log(`    why: ${rule.why}`);
      for (const h of hits.slice(0, 5)) {
        console.log(`    - ${relpath(h.file)}:${h.line}  ${h.content}`);
      }
      if (hits.length > 5) console.log(`    + ${hits.length - 5} more`);
    }
  }
  // Coach must consume the canonical engine outputs, not re-derive them
  // (founder 2026-05-22: "the coach must use our exact architecture,
  // always, even when we update it"). These fields are produced by the
  // engine and shown to the user on the board; the Coach context MUST
  // mirror each so chat and board never disagree. When you add a new
  // user-visible decision field, add it to the Coach context AND to this
  // list. Per INVARIANTS.md "Coach consumes canonical engine outputs".
  const COACH_ROUTE = resolve(SRC, "app", "api", "coach", "[leagueId]", "route.ts");
const HUB_ROUTE = resolve(SRC, "app", "leagues", "[leagueId]", "page.tsx");
const STRATEGY_SNAPSHOT = resolve(
  SRC,
  "lib",
  "strategy",
  "league-state",
  "strategy-snapshot.ts",
);
const LEAGUE_CONTEXT = resolve(SRC, "lib", "engine", "league-context.ts");
  // Object-parity contract (upgraded 2026-05-30, Phase C4). The old
  // check only asserted each field-name STRING appeared in the coach
  // surface, which passes even when Coach computed the value from a
  // PARALLEL build. The strengthened check pairs each mirrored field
  // with the canonical source that MUST produce it: the field is emitted
  // in the payload AND the canonical builder/helper that derives it is
  // called in the coach surface. So a fork (Coach emitting `ev_bank` but
  // computing it from its own roster walk instead of analyzeLeagueEvBank,
  // or a `system_decision` re-derived without resolveStandingDecision)
  // now FAILS the lint. `field` is the payload key; `derivedFrom` is the
  // canonical that must appear; `note` explains the binding.
  const REQUIRED_IN_COACH: Array<{
    field: string;
    derivedFrom: string;
    note: string;
  }> = [
    {
      field: "system_decision",
      derivedFrom: "resolveStandingDecision",
      note: "the standing call must come from the single production decision door, not a re-synthesis",
    },
    {
      field: "board_candidates",
      derivedFrom: "decision.quadrant_candidates",
      note: "the surfaced candidate set is the board's, value-sorted; Coach ranks within it",
    },
    {
      field: "league_position_context",
      derivedFrom: "decision.league_position_context",
      note: "per-position scarcity must be the decision's, not a Coach re-read of the rosters",
    },
    {
      field: "build_vs_league",
      derivedFrom: "decision.build_vs_league",
      note: "the with/against-the-grain verdict is the decision's, not re-derived",
    },
    {
      field: "format_rules",
      derivedFrom: "opContext.format_rules",
      note: "format rules come from the canonical buildOperationalContext",
    },
    {
      field: "pricing",
      derivedFrom: "opContext.pricing",
      note: "the trade-pricing block is the canonical operational pricing, not a Coach-local price map",
    },
    {
      field: "posture",
      derivedFrom: "classifyRosterPosture",
      note: "posture mirrors the hub PostureBanner via the canonical classifier",
    },
    {
      // Recoverability slack (analyzeLeagueRead -> structural_constraints:
      // picks_remaining vs total_starter_gap) is the league-size lever for
      // the chase-vs-skip-a-run calibration; Coach cites it by name.
      field: "league_read",
      derivedFrom: "buildLeagueReadFromSnapshot",
      note: "structural_constraints come from the canonical league-read builder",
    },
    {
      // Per-player opportunity read (snap share / targets / aDOT / RZ role)
      // must be computed via the canonical buildOpportunityProfile, not a
      // re-derived inline snap-share math, so chat and the inflection cards
      // cite identical numbers.
      field: "players",
      derivedFrom: "buildOpportunityProfile",
      note: "the named-roster opportunity read is the canonical profile, not inline snap-share math",
    },
    {
      // Value-vs-ADP (ev_bank) leaderboard. The hub renders the identical
      // readout (Track Record surface + companion Checkpoint beat); Coach
      // must read the same analyzeLeagueEvBank output fed by the same
      // priced value map, never its own per-roster Value-vs-ADP walk.
      field: "ev_bank",
      derivedFrom: "analyzeLeagueEvBank",
      note: "the Value-vs-ADP standing is the canonical league ev-bank readout, not a Coach-local roster walk",
    },
  ];
  console.log("\n── coach mirrors the canonical engine outputs (object-parity) ──");
  {
    let coachContent = "";
    try {
      coachContent = readFileSync(COACH_ROUTE, "utf-8");
    } catch {
      coachContent = "";
    }
    // The Coach context is assembled in the route AND in the helpers
    // the route now calls (e.g. buildMyRosterForCoach in
    // src/lib/coach/my-roster.ts). Concatenate both so a canonical
    // field cited inside a helper still satisfies the lint. The
    // intent is "the named roster build cites the canonical
    // helper," not "the route file literally contains the substring."
    const COACH_MY_ROSTER = resolve(SRC, "lib", "coach", "my-roster.ts");
    let coachHelperContent = "";
    try {
      coachHelperContent = readFileSync(COACH_MY_ROSTER, "utf-8");
    } catch {
      coachHelperContent = "";
    }
    const coachSurface = coachContent + "\n" + coachHelperContent;
    // Object-parity: a field passes only when BOTH its payload key is
    // emitted AND the canonical that derives it is called. A field that
    // appears without its canonical is a FORK (Coach computed it itself).
    const violations: string[] = [];
    if (!coachContent) {
      violations.push("(route unreadable)");
    } else {
      for (const { field, derivedFrom, note } of REQUIRED_IN_COACH) {
        const fieldPresent = coachSurface.includes(field);
        const canonicalPresent = coachSurface.includes(derivedFrom);
        if (!fieldPresent && !canonicalPresent) {
          violations.push(`${field}: neither the field nor its canonical (${derivedFrom}) is present`);
        } else if (!fieldPresent) {
          violations.push(`${field}: canonical ${derivedFrom} is called but the field is not emitted to Coach`);
        } else if (!canonicalPresent) {
          violations.push(
            `${field}: emitted to Coach but NOT derived from the canonical ${derivedFrom} (a fork). ${note}`,
          );
        }
      }
    }
    if (violations.length === 0) {
      passed++;
      console.log("  ✓ all canonical fields mirrored AND derived from their canonical (object-parity)");
    } else {
      failed++;
      console.log(`  ✗ coach object-parity violation(s):`);
      for (const v of violations) console.log(`    - ${v}`);
      console.log(
        "    why: Coach must consume the engine's canonical outputs, not re-derive. Each mirrored field must come from its canonical builder so chat and board cannot diverge. Per INVARIANTS.md.",
      );
    }
  }

  // Posture rule must have a backing payload field. Before 2026-05-23
  // the system prompt said "Read posture BEFORE every recommendation"
  // and "Never claim absence of posture data when posture is present"
  // while the payload never set a posture key, so the rule fired with
  // nothing to bind on (the "rule fires but no data" hallucination
  // class from INVARIANTS.md). If the prompt references posture, the
  // payload MUST emit it.
  console.log("\n── coach posture prompt rule has backing data ──");
  {
    let coachContent = "";
    try {
      coachContent = readFileSync(COACH_ROUTE, "utf-8");
    } catch {
      coachContent = "";
    }
    const promptReferencesPosture = coachContent.includes(
      "posture` BEFORE every recommendation",
    );
    const payloadEmitsPosture = coachContent.includes("posture: coachPosture");
    if (!promptReferencesPosture || payloadEmitsPosture) {
      passed++;
      console.log("  ✓ coach posture prompt rule has a backing payload field");
    } else {
      failed++;
      console.log(
        "  ✗ coach prompt references posture but the payload never emits it",
      );
      console.log(
        "    why: a prompt rule that binds on a field the payload omits forces the LLM to read absent data. Populate posture in contextPayload. Per INVARIANTS.md.",
      );
    }
  }
  console.log("\n── hub/coach shared snapshot+pool parity guard ──");
  {
    let coachContent = "";
    let hubContent = "";
    let helperContent = "";
    let builderContent = "";
    try {
      coachContent = readFileSync(COACH_ROUTE, "utf-8");
    } catch {
      coachContent = "";
    }
    try {
      hubContent = readFileSync(HUB_ROUTE, "utf-8");
    } catch {
      hubContent = "";
    }
    try {
      helperContent = readFileSync(STRATEGY_SNAPSHOT, "utf-8");
    } catch {
      helperContent = "";
    }
    try {
      builderContent = readFileSync(LEAGUE_CONTEXT, "utf-8");
    } catch {
      builderContent = "";
    }
    // Both surfaces now consume the ONE canonical builder
    // (buildLeagueContext, engine/league-context.ts), which composes the
    // snapshot + strategy + priced pool once. The parity that used to be
    // hand-enforced (matching direct calls in two routes) is now
    // structural: one builder, two consumers.
    const hubUsesLeagueContext = /buildLeagueContext\(/.test(hubContent);
    const coachUsesLeagueContext = /buildLeagueContext\(/.test(coachContent);
    const builderComposesPipeline =
      /buildStrategySnapshot\(/.test(builderContent) &&
      /rankArchetypes\(/.test(builderContent) &&
      /computeWindows\(/.test(builderContent) &&
      /buildPricedPool\(/.test(builderContent);
    const helperEnrichesSnapshot =
      /getSeasonStats\(/.test(helperContent) &&
      /getProjections\(/.test(helperContent) &&
      /buildLeagueSnapshot\(/.test(helperContent);
    const hubUsesPricedPool = /leagueContext\.pricedPool/.test(hubContent);
    const coachUsesPricedPool = /leagueContext\.pricedPool/.test(coachContent);
    const hubPickApproachUsesAvailable = /buildPickApproach\(\s*snapshot,\s*rankedArchetypes,\s*availablePlayers\s*,?\s*\)/s.test(
      hubContent,
    );
    const coachCapturesAvailable = /const\s+available\s*=\s*pricedPool\.available\s*;/.test(
      coachContent,
    );
    const coachPickApproachUsesAvailable = /buildPickApproach\(\s*snapshot,\s*ranked,\s*available\s*\)/.test(
      coachContent,
    );
    const hubNoDirectBuildLeagueSnapshot = !/buildLeagueSnapshot\(/.test(
      hubContent,
    );
    const coachNoDirectBuildLeagueSnapshot = !/buildLeagueSnapshot\(/.test(
      coachContent,
    );

    // Ordering: the builder must run before the pick approach consumes
    // the priced available pool on each surface.
    const hubContextIdx = hubContent.indexOf("buildLeagueContext(");
    const hubPickApproachIdx = hubContent.indexOf("buildPickApproach(");
    const coachContextIdx = coachContent.indexOf("buildLeagueContext(");
    const coachPickApproachIdx = coachContent.indexOf(
      "buildPickApproach(snapshot, ranked, available)",
    );
    const hubOrderingOk =
      hubContextIdx >= 0 &&
      hubPickApproachIdx >= 0 &&
      hubPickApproachIdx > hubContextIdx;
    const coachOrderingOk =
      coachContextIdx >= 0 &&
      coachPickApproachIdx >= 0 &&
      coachPickApproachIdx > coachContextIdx;

    const failures: string[] = [];
    if (!hubUsesLeagueContext)
      failures.push("hub route does not call buildLeagueContext");
    if (!coachUsesLeagueContext)
      failures.push("coach route does not call buildLeagueContext");
    if (!builderComposesPipeline)
      failures.push(
        "buildLeagueContext does not compose buildStrategySnapshot + rankArchetypes + computeWindows + buildPricedPool",
      );
    if (!helperEnrichesSnapshot)
      failures.push("strategy-snapshot helper is missing season-stats/projections enrichment");
    if (!hubUsesPricedPool)
      failures.push("hub route does not consume leagueContext.pricedPool");
    if (!coachUsesPricedPool)
      failures.push("coach route does not consume leagueContext.pricedPool");
    if (!hubPickApproachUsesAvailable)
      failures.push("hub pick approach is not built from the priced available pool");
    if (!coachCapturesAvailable)
      failures.push("coach route does not bind available = pricedPool.available");
    if (!coachPickApproachUsesAvailable)
      failures.push("coach pick approach is not built from the priced available pool");
    if (!hubNoDirectBuildLeagueSnapshot)
      failures.push("hub route calls buildLeagueSnapshot directly (should use buildLeagueContext)");
    if (!coachNoDirectBuildLeagueSnapshot)
      failures.push("coach route calls buildLeagueSnapshot directly (should use buildLeagueContext)");
    if (!hubOrderingOk)
      failures.push("hub ordering drifted: buildLeagueContext should run before buildPickApproach");
    if (!coachOrderingOk)
      failures.push("coach ordering drifted: buildLeagueContext should run before buildPickApproach");

    if (failures.length === 0) {
      passed++;
      console.log(
        "  ✓ hub and coach both consume the canonical buildLeagueContext (snapshot + priced-pool) pipeline",
      );
    } else {
      failed++;
      console.log(
        `  ✗ parity guard failed (${failures.length} issue${failures.length === 1 ? "" : "s"})`,
      );
      for (const f of failures) console.log(`    - ${f}`);
      console.log(
        "    why: Hub and Coach must consume the same snapshot/available/pick-approach inputs to avoid standing-call divergence.",
      );
    }
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
