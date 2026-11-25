/**
 * Weekly brief email: free shows who to sell but never who to sell TO;
 * Pro names buyers; every render carries the unsubscribe link and the
 * mailing address; user-controlled names are escaped; unsubscribe tokens
 * verify only for the user they were minted for.
 * Run: npm run test:weekly-brief
 */

import { buildContendOrSellVerdict } from "../src/lib/strategy/verdict/compose";
import type { SimInput } from "../src/lib/strategy/verdict/season-sim";
import {
  briefSubject,
  renderWeeklyBriefHtml,
  renderWeeklyBriefText,
  type BriefArgs,
} from "../src/lib/email/weekly-brief";
import { unsubscribeToken, verifyUnsubscribeToken } from "../src/lib/email/unsubscribe";
import { resolveSendMode } from "../src/lib/email/send-guard";
import { WEEKLY_BRIEF_TEMPLATE_VERSION } from "../src/lib/email/weekly-brief";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

const ids = Array.from({ length: 12 }, (_, i) => i + 1);
const scored: Record<number, number[]> = {};
for (const id of ids) scored[id] = Array.from({ length: 10 }, (_, w) => 90 + id * 4 + (((id * 7 + w * 13) % 21) - 10) * 2);
const teams = ids.map((id) => ({ roster_id: id, wins: Math.round((id - 1) * (10 / 11)), losses: 0, ties: 0, points_for: scored[id].reduce((s, x) => s + x, 0) }));
for (const t of teams) t.losses = 10 - t.wins;
const remaining: SimInput["remaining"] = [];
for (let w = 0; w < 4; w++) {
  const wk: Array<[number, number]> = [];
  for (let k = 0; k < 6; k++) wk.push([ids[(k + w) % 12], ids[(11 - k + w) % 12]]);
  remaining.push(wk);
}
const sim: SimInput = { teams, scored, remaining, playoffTeams: 6 };
const r = buildContendOrSellVerdict({
  sim,
  rosterId: 8,
  sims: 2000,
  players: [{ player_id: "old", name: "Old WR", position: "WR", age: 33, value: 35, ppg_started: 16, weeks_started: 9, replacement_ppg: 8 }],
  buyers: () => teams.map((t) => ({ roster_id: t.roster_id, label: t.roster_id === 11 ? "<script>Evil</script>" : `Team ${t.roster_id}`, title_pct: 0, playoff_pct: 0, startable_at_pos: t.roster_id % 4, starters_at_pos: 3 })),
});
if (!r.ok) throw new Error(r.reason);
const buyerNames = r.verdict.candidates[0].buyers.map((b) => b.label);

const base: BriefArgs = {
  ownerName: "Izzy",
  tier: "free",
  leagues: [{ leagueId: "123", leagueName: "Finders & Keepers", verdict: r.verdict }],
  appUrl: "https://dynastygeneral.app",
  unsubscribeUrl: "https://dynastygeneral.app/api/email/unsubscribe?u=x&t=y",
  mailingAddress: "PO Box 1, Chicago IL",
  weekLabel: "Week 12",
};

console.log("\n── free vs pro ──");
const freeHtml = renderWeeklyBriefHtml(base);
const freeText = renderWeeklyBriefText(base);
const proHtml = renderWeeklyBriefHtml({ ...base, tier: "pro" });
const proText = renderWeeklyBriefText({ ...base, tier: "pro" });
check("free names the sell candidate", freeHtml.includes("Old WR") && freeText.includes("Old WR"));
check("free never names a buyer", buyerNames.every((n) => !freeText.includes(n)), buyerNames.join(","));
check("free says how many buyers were ranked", freeText.includes(`${buyerNames.length} managers ranked`));
check("pro names every buyer (text)", buyerNames.every((n) => proText.includes(n)));
check("pro has no upgrade pitch", !proText.includes("Pro names") && !proHtml.includes("See who to sell to"));

console.log("\n── compliance ──");
for (const [name, body] of [["free html", freeHtml], ["free text", freeText], ["pro html", proHtml], ["pro text", proText]] as const) {
  check(`${name} carries unsubscribe + address`, body.includes("unsubscribe") && body.includes("PO Box 1, Chicago IL"));
}
check("no em dashes", ![freeHtml, freeText, proHtml, proText, briefSubject(base)].some((s) => s.includes("—")));

console.log("\n── escaping ──");
check("team names are escaped in html", !proHtml.includes("<script>") && proHtml.includes("&lt;script&gt;"));
check("league name is escaped", proHtml.includes("Finders &amp; Keepers"));

console.log("\n── no-league nudge ──");
const nudge = renderWeeklyBriefText({ ...base, leagues: [] });
check("accounts without a Sleeper username get the connect nudge", nudge.includes("/connect"));
check("no copy promises every league (caps are 3 free / 10 Pro)", ![freeHtml, freeText, proHtml, proText, nudge, renderWeeklyBriefHtml({ ...base, leagues: [] })].some((s) => s.includes("every league")));

console.log("\n── beta + feedback ask ──");
for (const [name, body] of [["free html", freeHtml], ["free text", freeText], ["pro html", proHtml], ["pro text", proText]] as const) {
  check(`${name} says beta and asks for a reply`, /beta/i.test(body) && body.includes("hit reply") && body.includes("Isaiah, founder"));
}

console.log("\n── nameless owner ──");
const nameless = renderWeeklyBriefHtml({ ...base, ownerName: "" });
check("no dangling comma when the owner has no name", nameless.includes("Keep going or sell?") && !nameless.includes("sell, ?"));

console.log("\n── unsubscribe tokens ──");
const uid = "11111111-2222-3333-4444-555555555555";
const tok = unsubscribeToken(uid, "weekly_brief", "k1")!;
check("token verifies for its user", verifyUnsubscribeToken(uid, tok, "weekly_brief", "k1"));
check("token fails for another user", !verifyUnsubscribeToken("11111111-2222-3333-4444-555555555556", tok, "weekly_brief", "k1"));
check("token fails under another key", !verifyUnsubscribeToken(uid, tok, "weekly_brief", "k2"));
check("no key, no token", unsubscribeToken(uid, "weekly_brief", null) === null);

console.log("\n── send guard (no broadcast without an approved template) ──");
const V = WEEKLY_BRIEF_TEMPLATE_VERSION;
const g = (o: Partial<Parameters<typeof resolveSendMode>[0]>) =>
  resolveSendMode({ templateVersion: V, approvedVersion: undefined, previewTo: undefined, replyTo: "owner@dg.app", requestedMode: null, ...o });
check("approved version matching the deploy broadcasts", g({ approvedVersion: V }).mode === "broadcast");
const noApproval = g({});
check("no approval previews to the reply-to inbox only", noApproval.mode === "preview" && noApproval.to.join() === "owner@dg.app");
const stale = g({ approvedVersion: "2020-01-01.old" });
check("stale approval never broadcasts", stale.mode === "preview" && stale.reason.includes("mismatch"));
check("explicit preview list wins over reply-to", (() => { const r = g({ previewTo: "A@x.com, b@y.com" }); return r.mode === "preview" && r.to.join() === "a@x.com,b@y.com"; })());
check("?mode=preview forces preview even when approved", g({ approvedVersion: V, requestedMode: "preview" }).mode === "preview");
check("no approval and no admin address refuses", g({ replyTo: undefined }).mode === "refuse");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
