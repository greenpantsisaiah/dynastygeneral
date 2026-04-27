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
