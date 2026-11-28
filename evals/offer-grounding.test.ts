/**
 * Trade check grounding (rebuild of #174 after revert #176). The offer's
 * pieces are priced in the context, and a cited number that is not in the
 * context is caught. Incident: the Moneyballer priced a 2027 1st at "57-65"
 * while reasoning said "80-95"; neither was in the context.
 */
import { normalizeName, parsePickPiece, priceOffer, renderOfferValues, type PlayerRef } from "../src/lib/engine/offer-values";
import { checkGrounding, checkOfferClaims, extractNumbers, groundingFeedback, ungroundedNumbers } from "../src/lib/engine/grounding";
import { tradeGroundingIssues } from "../src/lib/engine/decisions";
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

console.log("offer pieces");
check("normalizes punctuation and suffixes", normalizeName("D.J. Moore Jr.") === "dj moore");
check("parses '2027 1st'", JSON.stringify(parsePickPiece("2027 1st")) === JSON.stringify({ season: "2027", round: 1 }));
check("parses 'their late 2028 second round pick'", JSON.stringify(parsePickPiece("their late 2028 second round pick")) === JSON.stringify({ season: "2028", round: 2, tier: "late" }));
check("a bare '1st' has no season, so no price", parsePickPiece("1st") === null);
check("a player name is not a pick", parsePickPiece("Jaylen Warren") === null);

const players = new Map<string, PlayerRef[]>([
  ["jaylen warren", [{ id: "w", name: "Jaylen Warren", position: "RB", age: 27.4 }]],
  ["mike williams", [{ id: "m1", name: "Mike Williams", position: "WR" }, { id: "m2", name: "Mike Williams", position: "WR" }]],
  ["no value guy", [{ id: "n", name: "No Value Guy", position: "TE" }]],
]);
const values: Record<string, number> = { w: 61.6, m1: 30, m2: 20 };
const picks: Record<string, number> = { "2027:1": 72.4, "2027:1:late": 66.2 };
const price = (send: string[], receive: string[]) =>
  priceOffer({
    send,
    receive,
    players,
    playerValue: (id) => values[id],
    pickValue: (s, r, t) => picks[t ? `${s}:${r}:${t}` : `${s}:${r}`],
    bandPct: 15,
  });

const o = price(["Jaylen Warren"], ["their 2027 1st"]);
check("player priced from the value seam", o.send[0].kind === "player" && o.send[0].value === 62 && o.send[0].label === "Jaylen Warren (RB, age 27)", JSON.stringify(o.send[0]));
check("pick priced from future pick values", o.receive[0].kind === "pick" && o.receive[0].value === 72 && o.receive[0].label === "2027 1st", JSON.stringify(o.receive[0]));
check("totals and ratio", o.send_total === 62 && o.receive_total === 72 && o.complete && o.ratio !== null && Math.abs(o.ratio - 72 / 62) < 1e-9);
const tiered = price(["Jaylen Warren"], ["late 2027 1st"]);
check("tiered pick uses the tier price", tiered.receive[0].value === 66 && tiered.receive[0].label === "late 2027 1st");
const amb = price(["Mike Williams", "No Value Guy", "Nobody Known", "2031 3rd"], ["Jaylen Warren"]);
check("ambiguous, valueless, unknown and unpriced picks are UNPRICED", amb.send.every((p) => p.kind === "unpriced" && p.value === null) && !amb.complete);
check("no ratio when a side totals 0", amb.ratio === null);

const block = renderOfferValues(o);
check("block lists each piece and total", block.includes("Jaylen Warren (RB, age 27): 62") && block.includes("2027 1st: 72") && block.includes("total 62") && block.includes("total 72"));
check("block states the gap and band", block.includes("+16%") && block.includes("10 points in your favor") && block.includes("outside the ±15% band") && block.includes("53 to 71 points"), block);
check("unpriced block forbids estimates", renderOfferValues(amb).includes("UNPRICED") && renderOfferValues(amb).includes("never estimate"));

console.log("\ngrounding");
check("extracts ranges, percents, decimals", JSON.stringify(extractNumbers("57-65, +8%, 1.15x, 1,200")) === JSON.stringify([57, 65, 8, 1.15, 1200]));
const context = `# Decision\n${block}\n- Bijan Robinson: 98`;
check("the incident's invented range is caught", JSON.stringify(ungroundedNumbers("The 2027 1st is worth 57-65 to you.", context)) === JSON.stringify([57, 65]));
check("the incident's other range is caught", JSON.stringify(ungroundedNumbers("Picks like this go for 80-95.", context)) === JSON.stringify([80, 95]));
check("quoted offer values pass", ungroundedNumbers("Warren is 62 and their 2027 1st is 72, +16% in your favor.", context).length === 0);
check("rounding slack passes", ungroundedNumbers("about 61 points", context).length === 0);
check("small counts pass", ungroundedNumbers("You start 2 RBs and get 1 pick.", context).length === 0);
check("seasons pass", ungroundedNumbers("Their 2028 2nd matters by the 2029 draft.", context).length === 0);
check("a near-miss still fails", ungroundedNumbers("worth 68", context).length === 1);

const verdict = {
  action: "accept" as const,
  analysts: [
    { voice: "moneyball" as const, stance: "accept" as const, line: "You receive 72 for 62, 10 points in your favor." },
    { voice: "strategist" as const, stance: "counter" as const, line: "You start 2 RBs and this leaves 1." },
    { voice: "gambler" as const, stance: "accept" as const, line: "Warren is 27; the pick is worth 57-65 by spring." },
  ],
  recommendation: "Accept.",
  reasoning: ["Value is +16%.", "Pick prices peak before the draft."],
  strategy_fit: "on_strategy" as const,
  opportunity_cost: "Lose your RB2.",
  opponent_read: "They are contending.",
  leverage: "moderate" as const,
  walk_away_floor: "Their 2027 1st alone.",
} as unknown as Parameters<typeof tradeGroundingIssues>[0];
const issues = tradeGroundingIssues(verdict, context);
check("verdict check names the analyst who invented", issues.length === 1 && issues[0].field === "analysts[2] gambler" && JSON.stringify(issues[0].numbers) === JSON.stringify([57, 65]), JSON.stringify(issues));
check("feedback names the numbers", groundingFeedback(issues).includes("57, 65") && groundingFeedback(issues).includes("Offer values"));
check("empty and null fields are skipped", checkGrounding([{ field: "x", text: null }, { field: "y", text: "" }], context).length === 0);
// The loose check passes anything somewhere in a long context; the clause
// check holds claims about the offer to the Offer values block.
const longContext = `${context}\n${Array.from({ length: 100 }, (_, i) => `- Player ${i}: ${i}`).join("\n")}`;
check("a long context lets the invented range slip the loose check", ungroundedNumbers("The 1st is worth 57-65.", longContext).length === 0);
const pieces = [...o.send, ...o.receive];
const claim = (text: string) => checkOfferClaims([{ field: "f", text }], pieces, block);
check("clause check catches a price on the pick", JSON.stringify(claim("The 1st is worth 57-65 to a contender.")[0]?.numbers) === JSON.stringify([57, 65]));
check("clause check catches a price on the player by last name", JSON.stringify(claim("Warren is a 85 in this format.")[0]?.numbers) === JSON.stringify([85]));
check("clause check passes the block's own numbers", claim("Warren is 62 and their 2027 1st is 72; you gain 10 points (+16%), outside the 15% band.").length === 0, JSON.stringify(claim("Warren is 62 and their 2027 1st is 72; you gain 10 points (+16%), outside the 15% band.")));
check("clause check ignores clauses about other players", claim("Warren is 62. Bijan is 98.").length === 0);
check("verdict check uses the offer block too", tradeGroundingIssues({ ...(verdict as object), analysts: [{ voice: "moneyball", stance: "accept", line: "Their 1st is a 40." }] } as typeof verdict, longContext.replace("- Player 40: 40", ""), o, block).some((i) => i.field.startsWith("analysts")));
check("system prompt points the analysts at the Offer values block", SYSTEM_PROMPT.includes("`Offer values` block") && SYSTEM_PROMPT.includes("UNPRICED"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
