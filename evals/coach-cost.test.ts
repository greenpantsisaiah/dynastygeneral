/**
 * Coach cost controls (2026-11-24).
 *
 *   npx tsx --tsconfig tsconfig.json evals/coach-cost.test.ts
 *
 * Locks three things:
 *   1. The cached Coach layout keeps the 25k-40k token <current_state>
 *      snapshot in a cache_control system block, NOT in the last user
 *      message, and the last user message still carries the [STATE]
 *      recency pointer (the "7.12 vs 9.12" stale-pick bug class).
 *   2. Spend accounting prices cache reads at 0.1x and cache writes at
 *      1.25x the input rate, so the budget cap and the per-user cost
 *      readout stay honest once caching is on.
 *   3. Cap windows: free caps bucket by Monday-start UTC week, Pro by
 *      UTC day, and the reset copy matches the window.
 */

import { buildCoachTurn, renderStatePointer } from "../src/lib/coach/turn";
import { costUsd } from "../src/lib/budget";
import { capWindowFor, windowBucket } from "../src/lib/consumption/track";
import { capWindowCopy } from "../src/lib/consumption/window-copy";

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

console.log("Coach cached layout");
const payload = { draft: { my_next_pick_label: "9.12" }, big: "x".repeat(5000) };
const turn = buildCoachTurn({
  system: "SYSTEM",
  contextPayload: payload,
  history: [
    { role: "user", content: "who at 7.12?" },
    { role: "assistant", content: "At 7.12 take A." },
  ],
  guards: "\n\n[GUARD] test guard\n",
  message: "and now?",
  nextPickLabel: "9.12",
  standingCallName: "Player B",
});
check("two system blocks", turn.system.length === 2);
check(
  "both system blocks carry cache_control",
  turn.system.every((b) => b.cache_control?.type === "ephemeral"),
);
check("state lives in system[1]", turn.system[1].text.includes("<current_state>"));
const last = turn.messages[turn.messages.length - 1];
const lastText = typeof last.content === "string" ? last.content : "";
check("last message is the user", last.role === "user");
check("snapshot NOT in last user message", !lastText.includes("<current_state>\n"));
check("pointer names live pick label", lastText.includes("next pick 9.12"));
check("pointer names standing call", lastText.includes("standing call Player B"));
check("guards kept", lastText.includes("[GUARD] test guard"));
check("user message kept last", lastText.endsWith("and now?"));
check("history order kept", turn.messages.length === 3 && turn.messages[1].role === "assistant");
const again = buildCoachTurn({
  system: "SYSTEM",
  contextPayload: payload,
  history: [],
  guards: "",
  message: "next q",
});
check(
  "same state serializes byte-identically (cache prefix stable)",
  again.system[1].text === turn.system[1].text,
);
check(
  "pointer without facts still asserts authority",
  renderStatePointer(null, null).includes("authoritative"),
);

console.log("Spend accounting");
const base = costUsd({ model: "claude-sonnet-4-6", input_tokens: 1_000_000, output_tokens: 0 });
const read = costUsd({ model: "claude-sonnet-4-6", input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 });
const write = costUsd({ model: "claude-sonnet-4-6", input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 });
check("1M uncached input = $3", Math.abs(base - 3) < 1e-9, base.toFixed(4));
check("1M cache read = $0.30", Math.abs(read - 0.3) < 1e-9, read.toFixed(4));
check("1M cache write = $3.75", Math.abs(write - 3.75) < 1e-9, write.toFixed(4));
const search = costUsd({ model: "claude-sonnet-4-6", input_tokens: 0, output_tokens: 0, web_search_requests: 3 });
check("3 web searches = $0.03", Math.abs(search - 0.03) < 1e-9);

console.log("Cap windows");
check("free is weekly", capWindowFor("free") === "week");
check("pro is daily", capWindowFor("pro") === "day");
// 2026-11-24 is a Tuesday; its week starts Monday 2026-11-23.
check("tuesday buckets to monday", windowBucket("week", new Date("2026-11-24T15:00:00Z")) === "w2026-11-23");
check("sunday late buckets to prior monday", windowBucket("week", new Date("2026-11-29T23:59:59Z")) === "w2026-11-23");
check("monday 00:00 starts a new week", windowBucket("week", new Date("2026-11-30T00:00:00Z")) === "w2026-11-30");
check("day bucket is the UTC date", windowBucket("day", new Date("2026-11-24T23:30:00Z")) === "2026-11-24");
check("weekly copy", capWindowCopy("week").reset === "Resets Monday at midnight UTC.");
check("daily copy", capWindowCopy("day").period === "today");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
