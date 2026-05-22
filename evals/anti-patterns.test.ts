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
  // Trade-aware pick owner resolution: 2026-05-06 bug class. Three
  // independent implementations (banner / decision-card title /
  // gap-walker) drifted; we patched two and the third quietly stayed
  // wrong. Canonical: rosterAtPickNo in src/lib/sleeper/pick-resolution.ts.
  // The bootstrap in resolveDraftState (draft-state.ts) is the only
  // accepted alternate (it produces the snapshot shape the canonical
  // consumes). Anywhere else that loops over traded_picks or accesses
  // tp.original_owner is reimplementing the wheel.
  {
    name: "no inline traded_picks override-map construction outside the canonical resolver",
    why: "Trade-aware pick attribution must go through rosterAtPickNo (src/lib/sleeper/pick-resolution.ts). The override-map signature `${round}:${original_owner}` keyed Map is the 2026-05-06 'Decision title says 2 ahead but banner says 11' bug class. Analytics readers of traded_picks (count, filter, list) are fine; only the override-map construction is forbidden.",
    pattern: /\$\{[^}]*round[^}]*\}:\$\{[^}]*original_owner/,
    scan: { dir: SRC, ext: [".ts"] },
    allowFilePrefixes: [
      EVALS,
      // The canonical resolver does the iteration directly without an
      // override map, so it does not match the pattern. Bootstraps are
      // allowed because they produce the snapshot shape downstream
      // surfaces consume.
      join(SRC, "lib", "sleeper", "draft-state.ts"),
      join(SRC, "lib", "strategy", "league-state", "snapshot.ts"),
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
    why: "Functions named rosterAtPickNo / rosterAtSlot / pickOwner / ownerOfPick / effectiveRosterIdForPickNo can only be defined in pick-resolution.ts (canonical), draft-state.ts (bootstrap), or as a thin wrapper in predict.ts. Anywhere else is a duplicate implementation.",
    pattern: /^\s*(?:export\s+)?function\s+(?:rosterAtPickNo|pickOwner|ownerOfPick|effectiveRosterIdForPickNo)\s*[(<]/,
    scan: { dir: SRC, ext: [".ts"] },
    allowFilePrefixes: [
      EVALS,
      join(SRC, "lib", "sleeper", "pick-resolution.ts"),
      join(SRC, "lib", "sleeper", "draft-state.ts"),
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
  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
