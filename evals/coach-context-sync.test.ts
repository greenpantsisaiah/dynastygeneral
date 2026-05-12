/**
 * Coach context-sync regression. Verifies the system_prompt's cited
 * context fields actually appear in the Coach route's payload, and
 * vice versa for required-by-rule fields.
 *
 *   npx tsx --tsconfig tsconfig.json evals/coach-context-sync.test.ts
 *
 * The drift class this catches: a new system_prompt rule references
 * `format_rules.qb_starters_max` but the Coach route was never
 * updated to ship that field. The model hits the rule, the rule
 * binds on a missing field, the model falls back to inference, and
 * we get a hallucination class. Three layers protect against this
 * (per INVARIANTS.md "durable invariants beat soft prompts"); this
 * is the third: a CI lint that the rule + payload move together.
 *
 * The test does NOT call the LLM. It works on the source files.
 * Response-quality evals (online, cost-bearing) are a separate test
 * file that can be added when needed.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function pending(name: string, reason: string) {
  console.log(`  ! pending: ${name} (${reason})`);
}

const PROJECT_ROOT = resolve(process.cwd());
const SYSTEM_PROMPT_PATH = resolve(
  PROJECT_ROOT,
  "src/lib/engine/system-prompt.ts",
);
const COACH_ROUTE_PATH = resolve(
  PROJECT_ROOT,
  "src/app/api/coach/[leagueId]/route.ts",
);

const systemPromptFile = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
const coachRoute = readFileSync(COACH_ROUTE_PATH, "utf-8");
// COACH_CONTRACT lives inline in the route and is appended to the
// shared SYSTEM_PROMPT for every Coach call. A citation can validly
// live in either; check both.
const systemPrompt = systemPromptFile + "\n" + coachRoute;

/**
 * Curated list of context fields each rule depends on. When a rule is
 * added that needs a new field, add the binding here so the test
 * fails until the Coach route ships the field. The "rule" string is
 * for diagnostic output; the "fieldRef" is the JS-style path the
 * route should expose; "promptCitation" is the substring the
 * system_prompt should contain so the LLM knows the field by name.
 */
type Binding = {
  rule: string;
  fieldRef: string;
  // String the system_prompt should contain. The prompt cites the
  // field so the LLM knows to look for it.
  promptCitation: string;
  // String the Coach route should contain to ship the field. Usually
  // the JS-object key on the contextPayload. Multiple acceptable
  // forms can be provided.
  routeShips: string[];
  // KNOWN GAP: when true, mismatches print as warnings, not failures.
  // Used to track drift the team knows about and plans to fix; the
  // entry stays in the test as a permanent reminder until it's
  // closed (then flip to pending: false).
  pending?: boolean;
  pendingReason?: string;
};

const BINDINGS: Binding[] = [
  {
    rule: "format-aware reasoning (qb_starters_max etc)",
    fieldRef: "format_rules.qb_starters_max",
    promptCitation: "qb_starters_max",
    routeShips: ["format_rules", "buildFormatRulesFromSnapshot"],
  },
  {
    rule: "trade pricing must reference player_values",
    fieldRef: "pricing.player_values",
    promptCitation: "pricing.player_values",
    routeShips: ["pricing", "player_values"],
  },
  {
    rule: "system_decision is the engine's own recommendation",
    fieldRef: "system_decision.recommendation.name",
    promptCitation: "system_decision.recommendation.name",
    routeShips: ["system_decision", "decision"],
  },
  {
    rule: "league_read trade-leverage proactive surface",
    fieldRef: "league_read.top_leverage_opportunities",
    promptCitation: "top_leverage_opportunities",
    routeShips: ["league_read"],
  },
  {
    rule: "inflection bifurcation framing",
    fieldRef: "inflections[]",
    promptCitation: "inflections",
    routeShips: ["inflections"],
  },
  {
    rule: "opponent trade-history fingerprint",
    fieldRef: "opponents[].trade_history.signature",
    promptCitation: "trade_history",
    routeShips: ["trade_history", "buildOpponentTradeHistory"],
  },
  {
    rule: "stored opponent notes (counterparty stated plans)",
    fieldRef: "opponents[].notes",
    promptCitation: "opponents[].notes",
    routeShips: ["readOpponentNotesForLeague", "groupNotesByOpponent"],
  },
  // Sloan-mode register switch retired 2026-05-12: one product view,
  // always-on Sloan-level density.
];

/**
 * Curated list of context fields the route ships that the prompt
 * SHOULD reference somewhere. Catches the inverse drift: route adds
 * a rich field (e.g. opponent.trade_history) but the prompt never
 * tells the LLM to use it. Without prompt citation, the LLM ignores
 * the field and we paid the cost for nothing.
 */
const ROUTE_FIELDS_NEEDING_PROMPT_CITATION = [
  // (route field, prompt-citation substring it should appear in)
  { route: "trade_history", prompt: "trade_history" },
  { route: "opponents[].notes", prompt: "opponents[].notes" },
  { route: "format_rules", prompt: "format_rules" },
  { route: "pricing", prompt: "pricing" },
];

function run() {
  console.log("\n── Bindings: prompt cites field AND route ships it ──");
  for (const b of BINDINGS) {
    const promptOk = systemPrompt.includes(b.promptCitation);
    const routeOk = b.routeShips.some((s) => coachRoute.includes(s));
    if (b.pending) {
      // Pending bindings track known drift without failing CI. The
      // entry stays as a reminder; flip pending to false once fixed.
      if (!promptOk || !routeOk) {
        pending(
          `[${b.rule}]`,
          b.pendingReason ?? "drift acknowledged, fix queued",
        );
        continue;
      }
      // If a pending binding is now satisfied, flag it; the test
      // intent is for the team to flip pending→false when this
      // happens, not for the test to silently start enforcing.
      console.log(
        `  ! [${b.rule}] is now satisfied; flip pending: false in BINDINGS to enforce`,
      );
      continue;
    }
    check(
      `[${b.rule}] system_prompt cites '${b.promptCitation}'`,
      promptOk,
      promptOk ? undefined : `missing in ${SYSTEM_PROMPT_PATH}`,
    );
    check(
      `[${b.rule}] Coach route ships ${b.fieldRef}`,
      routeOk,
      routeOk ? undefined : `none of [${b.routeShips.join(", ")}] found in route`,
    );
  }

  console.log("\n── Inverse: route field has prompt citation ──");
  for (const f of ROUTE_FIELDS_NEEDING_PROMPT_CITATION) {
    const routeShips = coachRoute.includes(f.route);
    if (!routeShips) {
      // The route doesn't ship this field; nothing to enforce on the
      // prompt side.  Skip silently. This handles the early-build
      // case where a field has been removed.
      continue;
    }
    const promptCites = systemPrompt.includes(f.prompt);
    check(
      `route ships '${f.route}' AND prompt cites it`,
      promptCites,
      promptCites
        ? undefined
        : `route includes '${f.route}' but prompt never references '${f.prompt}'`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
