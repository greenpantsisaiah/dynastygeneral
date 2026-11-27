/**
 * Player-value sanity check against the committed real-league snapshot.
 *
 *   npx tsx --tsconfig tsconfig.json evals/value-sanity.test.ts
 *
 * Why (2026-11-26): the weekly brief for The Final Countdown (SF dynasty)
 * valued Parker Washington 43 and Tee Higgins 40 above Jonathan Taylor 37.
 * The question was whether the VALUE_MODE rubric blend or a stale
 * FantasyCalc input produced that order. Neither: the snapshot's own
 * FantasyCalc SF-PPR pull (captured the same day) has Washington 4483,
 * Higgins 4231, Taylor 3845, and Taylor's 30-day trend is -1750. The
 * production normalizer reproduces 43 / 40 / 37 exactly. The order is the
 * market's, not a model artifact.
 *
 * This test locks two things so a real model bug cannot hide behind a
 * plausible-looking number:
 *   1. The normalizer is a monotone rescale of FantasyCalc (Spearman 1.0
 *      on the top N, golden values for the trio above).
 *   2. The rubric seam (scoringValueFor in the live VALUE_MODE) stays
 *      rank-faithful to the market prior on the top N of every format:
 *      Spearman >= MIN_SPEARMAN and no player moves more than
 *      MAX_RANK_SHIFT ranks. The blend is market-dominant by design
 *      (prior weight 0.55, MODEL_CARD 8.1); a scramble beyond that is a
 *      bug, not an opinion.
 * Offline limit: player_signals / team_signals live in Supabase, so the
 * rubric runs here with signals null (market + age + position only). The
 * live read adds signals on top; see the threshold notes below.
 */

import { loadRealLeagueSnapshot } from "./fixtures/real-leagues/load";
import { futurePickKey, normalizeFantasyCalcValues, type FantasyCalcEntry } from "../src/lib/players/values";
import { ownedPicksWithOrigin } from "../src/lib/players/future-picks";
import { evaluateForPlayer } from "../src/lib/engine/evaluation/wiring";
import { VALUE_MODE, alignPicksToScoring, scoringValueFor } from "../src/lib/players/value-mode";

/** Top-N by FantasyCalc value per format. Covers every rostered starter in a 12-team SF league. */
const TOP_N = 150;
/** Rank correlation floor, rubric seam vs FantasyCalc. INTERNAL_HEURISTIC: the 2026-11-26 snapshot reads 0.984 to 0.988 across the four formats. */
const MIN_SPEARMAN = 0.95;
/** Largest allowed rank move inside the top N. INTERNAL_HEURISTIC: 2026-11-26 max is Derrick Henry at 38 (age curve; the known RB cliff-breaker case). */
const MAX_RANK_SHIFT = 50;

const SKILL = new Set(["QB", "RB", "WR", "TE"]);

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]);
  const r = new Array<number>(xs.length);
  let k = 0;
  while (k < idx.length) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++;
    const avg = (k + j) / 2 + 1;
    for (let m = k; m <= j; m++) r[idx[m][1]] = avg;
    k = j + 1;
  }
  return r;
}

export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const mean = (n + 1) / 2;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - mean) * (rb[i] - mean);
    da += (ra[i] - mean) ** 2;
    db += (rb[i] - mean) ** 2;
  }
  return num / Math.sqrt(da * db);
}

const snap = loadRealLeagueSnapshot("izzydabomb", { allowStale: true });
const players = snap.players as Record<string, { age?: number; years_exp?: number; search_rank?: number }>;
const fc = snap.fantasycalc as Record<string, FantasyCalcEntry[]>;
console.log(`snapshot captured ${snap.captured_at}, VALUE_MODE=${VALUE_MODE}`);

console.log("── 1. normalizer is a monotone rescale of FantasyCalc ──");
for (const [fmt, entries] of Object.entries(fc)) {
  const { byPlayerId } = normalizeFantasyCalcValues(entries);
  const top = [...byPlayerId.values()].sort((a, b) => b.raw_value - a.raw_value).slice(0, TOP_N);
  // Integer rounding creates ties, so the check is non-increasing, not strict.
  const inversions = top.filter((v, i) => i > 0 && v.value > top[i - 1].value).length;
  check(`${fmt}: normalized value never reorders FantasyCalc`, inversions === 0, `${inversions} inversions`);
}

console.log("── 2. Final Countdown trio: the order is the market's ──");
{
  const { byPlayerId } = normalizeFantasyCalcValues(fc["2:1"]);
  const v = (id: string) => byPlayerId.get(id)?.value;
  check("Parker Washington 43", v("9487") === 43, String(v("9487")));
  check("Tee Higgins 40", v("6801") === 40, String(v("6801")));
  check("Jonathan Taylor 37", v("6813") === 37, String(v("6813")));
  const taylor = fc["2:1"].find((e) => e.player.sleeperId === "6813") as FantasyCalcEntry & { trend30Day?: number };
  check("Taylor's market fell over the last 30 days", (taylor?.trend30Day ?? 0) < 0, `trend30Day ${taylor?.trend30Day}`);
}

console.log(`── 3. rubric seam stays rank-faithful to the market (top ${TOP_N}) ──`);
for (const [fmt, entries] of Object.entries(fc)) {
  const { byPlayerId } = normalizeFantasyCalcValues(entries);
  // Players only: draft picks ride the pick-value scale, not the rubric.
  const top = [...byPlayerId.values()]
    .filter((v) => SKILL.has((v.position ?? "").toUpperCase()))
    .sort((a, b) => b.raw_value - a.raw_value)
    .slice(0, TOP_N);
  const scored = top.map((v) => {
    const p = players[v.player_id] ?? {};
    const out = evaluateForPlayer({
      player_signals: null,
      team_signals: null,
      ktc_value: v.value,
      adp: null,
      search_rank: typeof p.search_rank === "number" ? p.search_rank : null,
      position: v.position,
      age: typeof p.age === "number" ? p.age : null,
      years_exp: typeof p.years_exp === "number" ? p.years_exp : null,
    });
    return scoringValueFor(v, out, VALUE_MODE);
  });
  const market = top.map((v) => v.value);
  const rho = spearman(market, scored);
  const rm = ranks(market);
  const rs = ranks(scored);
  let worst = 0;
  let worstName = "";
  top.forEach((v, i) => {
    const d = Math.abs(rm[i] - rs[i]);
    if (d > worst) {
      worst = d;
      worstName = v.name;
    }
  });
  check(`${fmt}: scoring vs FantasyCalc Spearman >= ${MIN_SPEARMAN}`, rho >= MIN_SPEARMAN, rho.toFixed(4));
  check(`${fmt}: largest rank move <= ${MAX_RANK_SHIFT}`, worst <= MAX_RANK_SHIFT, `${worstName} ${worst}`);
}

console.log("── 4. future picks ride the player scale (one normalization) ──");
{
  const { pickValues, byPlayerId } = normalizeFantasyCalcValues(fc["2:1"]);
  const p = (season: string, round: number) => pickValues.get(futurePickKey(season, round));
  check("2027 1st priced", typeof p("2027", 1) === "number" && p("2027", 1)! > 0, String(p("2027", 1)));
  check("rounds descend: 2027 1st > 2nd > 3rd > 4th", p("2027", 1)! > p("2027", 2)! && p("2027", 2)! > p("2027", 3)! && p("2027", 3)! >= p("2027", 4)!);
  check("years descend: 2027 1st > 2028 1st > 2029 1st", p("2027", 1)! > p("2028", 1)! && p("2028", 1)! > p("2029", 1)!);
  check("picks never land in the player map", ![...byPlayerId.values()].some((v) => (v.position ?? "").toUpperCase() === "PICK"));
  check("2027 1st on the player scale (FantasyCalc 2844 / top-3 avg)", p("2027", 1) === Math.round((2844 / ((10619 + 10461 + 10387) / 3)) * 100), String(p("2027", 1)));
}

console.log("── 5. picks sit on the scoring scale players are priced on ──");
{
  const picks = new Map([["2027:1", 27], ["2027:2", 15]]);
  const marketById = new Map<string, number>();
  const scoredById: Record<string, number> = {};
  for (let i = 0; i < 10; i++) {
    marketById.set(`a${i}`, 26 + i * 0.2);
    scoredById[`a${i}`] = 26 + i * 0.2 - 1; // the blend reads 1 point under market here
  }
  const aligned = alignPicksToScoring({ picks, marketById, scoredById });
  check("a pick takes its market neighbours' scoring shift", aligned.get("2027:1") === 26, String(aligned.get("2027:1")));
  check("too few neighbours leaves the market price", aligned.get("2027:2") === 15, String(aligned.get("2027:2")));
  const same: Record<string, number> = Object.fromEntries([...marketById]);
  check("market mode (scoring == market) leaves picks exactly at market", alignPicksToScoring({ picks, marketById, scoredById: same }).get("2027:1") === 27);
}
{
  // Live seam on the real snapshot: the aligned 2027 1st moves by the
  // blend's local shift, which is small (under 3 points) and never up.
  const { byPlayerId, pickValues } = normalizeFantasyCalcValues(fc["2:1"]);
  const marketById = new Map([...byPlayerId].map(([id, v]) => [id, v.value]));
  const scoredById: Record<string, number> = {};
  for (const v of byPlayerId.values()) {
    if (!SKILL.has((v.position ?? "").toUpperCase())) continue;
    const p = players[v.player_id] ?? {};
    scoredById[v.player_id] = scoringValueFor(v, evaluateForPlayer({ player_signals: null, team_signals: null, ktc_value: v.value, adp: null, search_rank: typeof p.search_rank === "number" ? p.search_rank : null, position: v.position, age: typeof p.age === "number" ? p.age : null, years_exp: typeof p.years_exp === "number" ? p.years_exp : null }), VALUE_MODE);
  }
  const a = alignPicksToScoring({ picks: pickValues, marketById, scoredById });
  const m1 = pickValues.get("2027:1")!;
  const s1 = a.get("2027:1")!;
  check("real snapshot: aligned 2027 1st within 3 points of market", Math.abs(s1 - m1) < 3, `${m1} -> ${s1}`);
}

console.log("── 6. next draft's picks priced by the original owner's slot ──");
{
  const { pickValues } = normalizeFantasyCalcValues(fc["2:1"]);
  const late = pickValues.get(futurePickKey("2027", 1, "late"));
  const early = pickValues.get(futurePickKey("2027", 1, "early"));
  const generic = pickValues.get(futurePickKey("2027", 1));
  check("tiered 2027 1sts parsed: early > generic > late", early! > generic! && generic! > late!, `${early} ${generic} ${late}`);
  const owned = ownedPicksWithOrigin({ rosterId: 2, rosterIds: [1, 2, 3], season: "2027", rounds: 2, tradedPicks: [{ season: "2027", round: 1, original_owner: 3, current_owner: 2, owner_id: 2, previous_owner_id: 3, roster_id: 3 } as never, { season: "2027", round: 2, original_owner: 2, current_owner: 1, owner_id: 1, previous_owner_id: 2, roster_id: 2 } as never] });
  check("owned picks keep their original owner (traded-in 1st from roster 3, own 1st; 2nd traded away)", JSON.stringify(owned.map((p) => [p.round, p.original_owner])) === JSON.stringify([[1, 2], [1, 3]]), JSON.stringify(owned));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
