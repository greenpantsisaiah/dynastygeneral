/**
 * The trade check shows three analysts, not one verdict (core principle:
 * competing perspectives). The schema accepts their takes, an older shared
 * verdict without them still parses, and the card renders the split.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { tradeIncomingOutputSchema, tradeIncomingOutputJsonSchema } from "../src/lib/engine/schemas";
import { TradeIncomingResult } from "../src/components/decision/result-card";
import { SYSTEM_PROMPT } from "../src/lib/engine/system-prompt";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

const base = {
  action: "counter",
  recommendation: "Counter: ask for their 2027 2nd.",
  reasoning: ["Value is 8% short.", "You start 2 RBs."],
  strategy_fit: "on_strategy",
  opportunity_cost: "Lose your RB2.",
  opponent_read: "They need a WR.",
  leverage: "moderate",
  walk_away_floor: "Their 2027 2nd added.",
  confidence: 0.6,
};
const takes = [
  { voice: "moneyball", stance: "counter", line: "The offer is 8% short by the pricing values." },
  { voice: "strategist", stance: "decline", line: "You start 2 RBs and this leaves 1 startable." },
  { voice: "gambler", stance: "counter", line: "Their WR is 24; yours drops by August." },
];

const parsed = tradeIncomingOutputSchema.safeParse({ ...base, analysts: takes });
check("schema accepts three analyst takes", parsed.success, JSON.stringify(parsed.error?.issues));
check("older verdict without analysts still parses", tradeIncomingOutputSchema.safeParse(base).success);
check("LLM JSON schema requires the analysts", (tradeIncomingOutputJsonSchema.required as readonly string[]).includes("analysts"));
check("system prompt names the analysts rule", typeof SYSTEM_PROMPT === "string" && SYSTEM_PROMPT.includes("`analysts` (incoming): REQUIRED"));

if (parsed.success) {
  const html = renderToStaticMarkup(<TradeIncomingResult result={parsed.data} mode="live" />);
  check("card shows the three analysts with their own calls", html.includes("Moneyballer · Counter.") && html.includes("Strategist · Pass.") && html.includes("Gambler · Counter."));
  check("card says how they split", html.includes("They split: 2 counter, 1 pass."));
}
const old = tradeIncomingOutputSchema.parse(base);
check("older verdict renders without the analysts row", !renderToStaticMarkup(<TradeIncomingResult result={old} mode="live" />).includes("The three analysts"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
