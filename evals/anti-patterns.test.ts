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
  {
    name: "no raw starter_slots.hard in decision-synthesis loops",
    why: "Engine starter-need math must use effectiveStarterReqs() so it stays aligned with format_rules. Reading starter_slots.hard directly in synthesize.ts loops re-introduces the SF QB starter bug class.",
    // Allow `ss.hard.QB + ss.superflex` style (the canonical helper
    // implementation in effectiveStarterReqs), but flag any other
    // `starter_slots.hard.X` reference inside synthesize.ts.
    pattern: /snap\.starter_slots\.hard(?!\s*\.\s*\w+\s*\+\s*\w+\.superflex)/,
    scan: { dir: join(SRC, "lib", "strategy", "decision-synthesis"), ext: [".ts"] },
    allowFilePrefixes: [EVALS],
    allowLineSubstrings: [
      "ss.hard.QB + ss.superflex",
      "// effectiveStarterReqs",
      "* `starter_slots.hard.X`",
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
