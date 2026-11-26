/**
 * league_call reasons (app-only per-league call on /home). Each reason must
 * name the gate that actually kept the league from a trade card, with
 * counts read from the panel, never a fixed phrase (reviewer, PR #141).
 * Run: npm run test:league-call
 */

import { buildTradeDeskModel, type DeskLeague } from "../src/lib/email/trade-desk/model";
import { buildDecisionItems, type LeagueCallItem } from "../src/lib/decisions/items";
import type { Stance } from "../src/lib/strategy/verdict/voices";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`); }
}

const panel = (stances: Stance[], headline: Stance) => ({
  voices: (["moneyball", "gambler", "strategist"] as const).map((voice, i) => ({ voice, stance: stances[i], line: `${voice} line.` })),
  consensus: new Set(stances).size === 1,
  balance: 0,
  headline,
});
const shortBuyer = { label: "pmac", startable_at_pos: 1, starters_at_pos: 2 };
const deepBuyer = { label: "deep", startable_at_pos: 4, starters_at_pos: 2 };
const cand = (o: { stances: Stance[]; buyers?: unknown[]; value_now?: number; value_lost?: number }) => ({
  player: { player_id: "p1", name: "Saquon Barkley", position: "RB", age: 29, value: 40, ppg_started: 15 },
  decay: { value_now: o.value_now ?? 40, value_lost: o.value_lost ?? 8 },
  buyers: o.buyers ?? [shortBuyer],
  panel: panel(o.stances, "sell"),
});
function league(head: Stance, stances: Stance[], candidates: unknown[]): DeskLeague {
  return {
    leagueId: "L",
    leagueName: "Test League",
    kind: "dynasty",
    week: null,
    verdict: {
      odds: { playoff_pct: 0.5, title_pct: 0.1 },
      league: { teams: 12, fair_title_share: 1 / 12, rank_by_title_odds: 6 },
      candidates,
      trade_window: { open: true, deadline_week: 13 },
      panel: panel(stances, head),
    } as unknown as DeskLeague["verdict"],
  };
}
function call(l: DeskLeague): LeagueCallItem | undefined {
  const model = buildTradeDeskModel({ ownerName: "x", tier: "pro", resultsWeek: 11, leagues: [l] });
  return buildDecisionItems({ model, season: "2026" }).items.find((i): i is LeagueCallItem => i.kind === "league_call");
}

console.log("\nKeep branch counts the sellers");
const k0 = call(league("push", ["push", "push", "lean_push"], []));
check("0 sellers: 'none would sell'", !!k0?.reason.includes("3 of 3 analysts lean keep; none would sell"), k0?.reason);
const k1 = call(league("lean_push", ["push", "push", "lean_sell"], []));
check("1 seller: 'would sell but is outvoted'", !!k1?.reason.includes("2 of 3 analysts lean keep; 1 would sell but is outvoted"), k1?.reason);
check("never claims 'a starter'", !k0?.reason.includes("starter") && !k1?.reason.includes("starter"));

console.log("\nSell branch names the gate that failed");
const s0 = call(league("lean_sell", ["lean_sell", "sell", "push"], [cand({ stances: ["push", "push", "push"] })]));
check("fallback candidate with 0 sell voices says 'None'", !!s0?.reason.startsWith("None of the three analysts would sell Saquon Barkley"), s0?.reason);
const s1 = call(league("lean_sell", ["lean_sell", "sell", "push"], [cand({ stances: ["sell", "push", "push"] })]));
check("1 sell voice says 'Only one'", !!s1?.reason.startsWith("Only one of the three analysts would sell"), s1?.reason);
const sb = call(league("sell", ["sell", "sell", "push"], [cand({ stances: ["sell", "sell", "push"], buyers: [deepBuyer] })]));
check("no short buyer names the position", !!sb?.reason.startsWith("No team is short at RB"), sb?.reason);
const sv = call(league("sell", ["sell", "sell", "push"], [cand({ stances: ["sell", "sell", "push"], value_now: 0.3 })]));
check("value_now under 1 says the player is worth too little", !!sv?.reason.includes("worth under 1 value point"), sv?.reason);
const sl = call(league("sell", ["sell", "sell", "push"], [cand({ stances: ["sell", "sell", "push"], value_lost: 1 })]));
check("small offseason drop names the floor", !!sl?.reason.includes("avoids under 3 value points"), sl?.reason);
const ok = call(league("sell", ["sell", "sell", "push"], [cand({ stances: ["sell", "sell", "push"] })]));
check("a sale that clears every gate becomes a trade card, not a call", ok === undefined);

console.log("\nRedraft reads this season only");
const rd = (head: Stance, stances: Stance[]) => {
  const l = league(head, stances, []);
  l.kind = "redraft";
  (l.verdict as unknown as { horizon: string }).horizon = "this_season";
  return call(l);
};
const rLive = rd("lean_push", ["lean_push", "push", "push"]);
check("redraft live team: play to win this season", rLive?.title === "Play to win this season.", rLive?.title);
check("redraft reason says a sale banks nothing, no offseason copy", !!rLive?.reason.includes("a sale banks nothing") && !/offseason|August|value point/.test(rLive?.reason ?? ""), rLive?.reason);
const rDead = rd("split", ["split", "split", "split"]);
check("redraft lost season says so", !!rDead?.title.startsWith("Season is over"), rDead?.title);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
