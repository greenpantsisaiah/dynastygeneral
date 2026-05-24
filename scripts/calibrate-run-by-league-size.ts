/**
 * Calibrate the chase-vs-skip-a-run decision by LEAGUE SIZE and FORMAT.
 * Extends scripts/backtest-positional-run-edge.ts with segmentation by
 * format type (redraft / dynasty / keeper) and team count (N), plus a
 * dynasty-only KTC-points value cross-check (the "ktc-per-draft" task).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/calibrate-run-by-league-size.ts [extraUsername ...]
 *
 * The founder's question: a 30-pick dynasty draft has room to rebalance
 * after a run, but a ~15-pick redraft may not. Does the cost of declining
 * a run actually differ by league depth (R) and team count (N)?
 *
 * Method: real completed Sleeper snake drafts (founder's ecosystem). ADP is
 * corpus-derived PER (season, format-type) cohort, so redraft ADP and
 * dynasty ADP are separate and format-appropriate (the prior backtest
 * pooled them, a confound this script fixes). value-over-ADP is in ROUNDS
 * (league-size neutral). Secondary lens for dynasty only: KTC value matched
 * to each draft's nearest historical snapshot (KTC is a dynasty scale, a
 * category error for redraft, so it is applied to dynasty drafts only).
 *
 * Segments measured: format type (0 redraft / 2 dynasty / 1 keeper), team
 * count (10 vs 12), and roster depth bucket (shallow <= 17 rounds vs deep
 * >= 20). Read-only public Sleeper API + read-only Supabase. No writes.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const BASE = "https://api.sleeper.app/v1";
const SEED_USERNAMES = ["izzydabomb", "Strawhatdoofy", "lincolnenglish", "saquonatraitor"];
const SEASONS = ["2026", "2025", "2024", "2023", "2022", "2021"];
const SKILL = new Set(["QB", "RB", "WR", "TE"]);
const RUN_WINDOW = 5;
const RUN_MIN = 3;
const MIN_ADP_APPEAR = 3;
const BOOT = 2000;
const KTC_MATCH_TOLERANCE_DAYS = 150; // max gap from draft date to KTC snapshot

type TypeName = "redraft" | "keeper" | "dynasty" | "other";
type Pick = { overall: number; manager: string; player_id: string; position: string };
type Draft = {
  draft_id: string;
  season: string;
  teams: number;
  rounds: number;
  superflex: boolean;
  type: TypeName;
  startMs: number | null;
  picks: Pick[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function gj(path: string, tries = 3): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}${path}`);
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch {
      /* retry */
    }
    await sleep(150 * (i + 1));
  }
  return null;
}
function typeName(t: unknown): TypeName {
  return t === 0 ? "redraft" : t === 1 ? "keeper" : t === 2 ? "dynasty" : "other";
}

// ---- collection ------------------------------------------------------------

async function collectDrafts(usernames: string[]): Promise<Draft[]> {
  const current = new Set<string>();
  for (const uname of usernames) {
    const u = await gj(`/user/${encodeURIComponent(uname)}`);
    if (!u?.user_id) continue;
    for (const s of SEASONS) {
      const ls = await gj(`/user/${u.user_id}/leagues/nfl/${s}`);
      if (Array.isArray(ls)) for (const l of ls) if (l.league_id) current.add(l.league_id);
      await sleep(35);
    }
  }
  const all = new Set<string>(current);
  for (const id of [...current]) {
    let cur: string | null = id;
    let hops = 0;
    while (cur && hops < 10) {
      const l = await gj(`/league/${cur}`);
      await sleep(25);
      const prev = l?.previous_league_id ?? null;
      if (prev && !all.has(prev)) {
        all.add(prev);
        cur = prev;
      } else cur = null;
      hops++;
    }
  }
  const out: Draft[] = [];
  for (const leagueId of all) {
    const league = await gj(`/league/${leagueId}`);
    await sleep(25);
    const superflex = (league?.roster_positions ?? []).some((p: string) => p === "SUPER_FLEX");
    const type = typeName(league?.settings?.type);
    const drafts = await gj(`/league/${leagueId}/drafts`);
    await sleep(25);
    if (!Array.isArray(drafts)) continue;
    for (const d of drafts) {
      if (d.status !== "complete" || d.type !== "snake") continue;
      const rawPicks = await gj(`/draft/${d.draft_id}/picks`);
      await sleep(35);
      if (!Array.isArray(rawPicks) || rawPicks.length === 0) continue;
      const picks: Pick[] = [];
      for (const p of rawPicks) {
        const overall = Number(p.pick_no);
        const player_id = String(p.player_id ?? "");
        if (!Number.isFinite(overall) || !player_id) continue;
        picks.push({
          overall,
          manager: String(p.roster_id ?? p.draft_slot ?? "?"),
          player_id,
          position: String(p.metadata?.position ?? "?").toUpperCase(),
        });
      }
      if (picks.length === 0) continue;
      picks.sort((a, b) => a.overall - b.overall);
      out.push({
        draft_id: d.draft_id,
        season: String(d.season ?? league?.season ?? "?"),
        teams: Number(d.settings?.teams ?? league?.total_rosters ?? 12) || 12,
        rounds: Number(d.settings?.rounds ?? 0),
        superflex,
        type,
        startMs: Number(d.start_time ?? 0) || null,
        picks,
      });
    }
  }
  return out;
}

// ---- KTC per-draft value (dynasty cross-check) -----------------------------

type KtcStore = {
  // format -> sorted dates (ms) -> Map<player_id, value>
  byFormat: Map<string, { dates: number[]; valuesByDate: Map<number, Map<string, number>> }>;
};
async function loadKtc(): Promise<KtcStore> {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const byFormat = new Map<string, { dates: number[]; valuesByDate: Map<number, Map<string, number>> }>();
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supa
      .from("historical_market_values")
      .select("player_id, value, format, snapshot_date")
      .eq("source", "ktc")
      .range(from, from + page - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as any[]) {
      const fmt = String(r.format);
      const dms = new Date(r.snapshot_date).getTime();
      let f = byFormat.get(fmt);
      if (!f) {
        f = { dates: [], valuesByDate: new Map() };
        byFormat.set(fmt, f);
      }
      let m = f.valuesByDate.get(dms);
      if (!m) {
        m = new Map();
        f.valuesByDate.set(dms, m);
      }
      m.set(String(r.player_id), Number(r.value));
    }
    if (data.length < page) break;
    from += page;
  }
  for (const f of byFormat.values()) f.dates = [...f.valuesByDate.keys()].sort((a, b) => a - b);
  return { byFormat };
}
function ktcValue(store: KtcStore, fmt: string, draftMs: number | null, playerId: string): number | null {
  const f = store.byFormat.get(fmt);
  if (!f || f.dates.length === 0 || draftMs == null) return null;
  // nearest snapshot date within tolerance
  let best = f.dates[0];
  for (const d of f.dates) if (Math.abs(d - draftMs) < Math.abs(best - draftMs)) best = d;
  if (Math.abs(best - draftMs) > KTC_MATCH_TOLERANCE_DAYS * 864e5) return null;
  return f.valuesByDate.get(best)?.get(playerId) ?? null;
}

// ---- ADP (per season + type, in rounds) ------------------------------------

function adpKey(d: Draft, playerId: string): string {
  return `${d.season}|${d.type}|${playerId}`;
}
function buildAdp(drafts: Draft[]): Map<string, number> {
  const acc = new Map<string, number[]>();
  for (const d of drafts)
    for (const p of d.picks) {
      const k = adpKey(d, p.player_id);
      const arr = acc.get(k) ?? [];
      arr.push(p.overall / d.teams);
      acc.set(k, arr);
    }
  const adp = new Map<string, number>();
  for (const [k, arr] of acc)
    if (arr.length >= MIN_ADP_APPEAR) adp.set(k, arr.reduce((s, v) => s + v, 0) / arr.length);
  return adp;
}
function vOverAdp(d: Draft, p: Pick, adp: Map<string, number>): number | null {
  const a = adp.get(adpKey(d, p.player_id));
  return a == null ? null : a - p.overall / d.teams;
}

// ---- runs + classification -------------------------------------------------

type RunEvent = { pos: string; start: number; end: number; draft: Draft };
function detectRuns(d: Draft): RunEvent[] {
  const events: RunEvent[] = [];
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    let i = 0;
    while (i < d.picks.length) {
      const win = d.picks.slice(i, i + RUN_WINDOW);
      const hits = win.filter((p) => p.position === pos);
      if (hits.length >= RUN_MIN) {
        events.push({ pos, start: hits[0].overall, end: hits[hits.length - 1].overall, draft: d });
        i += RUN_WINDOW;
      } else i++;
    }
  }
  return events;
}
function tierClass(pos: string, sf: boolean): "deep" | "moderate" | "cliffy" {
  if (pos === "WR" || pos === "RB") return "deep";
  if (pos === "QB") return sf ? "cliffy" : "moderate";
  return "moderate";
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
function bootCI(xs: number[]): [number, number] {
  if (xs.length < 2) return [NaN, NaN];
  const ms: number[] = [];
  for (let b = 0; b < BOOT; b++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[(Math.random() * xs.length) | 0];
    ms.push(s / xs.length);
  }
  ms.sort((a, c) => a - c);
  return [ms[Math.floor(BOOT * 0.05)], ms[Math.floor(BOOT * 0.95)]];
}
const r2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "  -");

// For a set of runs, compute Half A paired effect + Half B (deep) effect.
function measure(runs: RunEvent[], adp: Map<string, number>) {
  const aEffects: number[] = [];
  const bDeep: number[] = [];
  const bShallow: number[] = []; // moderate + cliffy combined (shallow positions)
  let declN = 0,
    chaseN = 0;
  for (const ev of runs) {
    const d = ev.draft;
    const inWin = d.picks.filter((p) => p.overall >= ev.start && p.overall <= ev.end);
    const managers = new Set(inWin.map((p) => p.manager));
    const decl: number[] = [];
    const chase: number[] = [];
    const during: number[] = [];
    for (const p of inWin) if (p.position === ev.pos) {
      const v = vOverAdp(d, p, adp);
      if (v != null) during.push(v);
    }
    const laterByDecliner: number[] = [];
    for (const m of managers) {
      const mine = inWin.filter((p) => p.manager === m);
      if (mine.some((p) => p.position === ev.pos)) {
        for (const p of mine.filter((x) => x.position === ev.pos)) {
          const v = vOverAdp(d, p, adp);
          if (v != null) chase.push(v);
        }
      } else {
        for (const p of mine.filter((x) => SKILL.has(x.position))) {
          const v = vOverAdp(d, p, adp);
          if (v != null) decl.push(v);
        }
        const laterP = d.picks
          .filter((p) => p.manager === m && p.position === ev.pos && p.overall > ev.end)
          .sort((x, y) => x.overall - y.overall)[0];
        if (laterP) {
          const v = vOverAdp(d, laterP, adp);
          if (v != null) laterByDecliner.push(v);
        }
      }
    }
    declN += decl.length;
    chaseN += chase.length;
    if (decl.length && chase.length) aEffects.push(mean(decl) - mean(chase));
    if (laterByDecliner.length && during.length) {
      const eff = mean(laterByDecliner) - mean(during);
      if (tierClass(ev.pos, d.superflex) === "deep") bDeep.push(eff);
      else bShallow.push(eff);
    }
  }
  return { aEffects, bDeep, bShallow, declN, chaseN };
}

function reportSegment(label: string, drafts: Draft[], adp: Map<string, number>) {
  if (drafts.length === 0) {
    console.log(`\n${label}: no drafts`);
    return;
  }
  const runs: RunEvent[] = [];
  for (const d of drafts) runs.push(...detectRuns(d));
  const { aEffects, bDeep, bShallow, declN, chaseN } = measure(runs, adp);
  const aCI = bootCI(aEffects);
  const dCI = bootCI(bDeep);
  const sCI = bootCI(bShallow);
  const avgRounds = mean(drafts.map((d) => d.rounds));
  const avgTeams = mean(drafts.map((d) => d.teams));
  console.log(`\n${label}`);
  console.log(
    `  drafts=${drafts.length} avg_rounds=${avgRounds.toFixed(0)} avg_teams=${avgTeams.toFixed(0)} runs=${runs.length} (decliner picks=${declN}, chaser picks=${chaseN})`,
  );
  console.log(
    `  Half A decliner-minus-chaser off-run surplus: ${r2(mean(aEffects))} rounds [90% CI ${r2(aCI[0])}, ${r2(aCI[1])}] over ${aEffects.length} runs`,
  );
  console.log(
    `  Half B later-minus-during, DEEP (WR/RB):    ${r2(mean(bDeep))} rounds [90% CI ${r2(dCI[0])}, ${r2(dCI[1])}] over ${bDeep.length} runs`,
  );
  console.log(
    `  Half B later-minus-during, SHALLOW (TE/QB): ${r2(mean(bShallow))} rounds [90% CI ${r2(sCI[0])}, ${r2(sCI[1])}] over ${bShallow.length} runs`,
  );
}

// ---- main ------------------------------------------------------------------

async function main() {
  const extra = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const usernames = [...new Set([...SEED_USERNAMES, ...extra])];
  console.log("=== Run-edge calibration by league size + format (real Sleeper drafts) ===");
  console.log(`Seed: ${usernames.join(", ")}`);
  const drafts = await collectDrafts(usernames);
  const adp = buildAdp(drafts);
  console.log(`\nCollected ${drafts.length} completed snake drafts; ADP entries=${adp.size}`);
  const byType = new Map<string, number>();
  for (const d of drafts) byType.set(d.type, (byType.get(d.type) ?? 0) + 1);
  console.log(`  by type: ${[...byType.entries()].map(([k, v]) => `${k}:${v}`).join("  ")}`);

  console.log(`\n--- Value lens: value-over-ADP in ROUNDS (per season+type cohort) ---`);
  reportSegment("ALL", drafts, adp);

  console.log(`\n##### Segment by FORMAT TYPE (the founder's redraft-vs-dynasty question)`);
  reportSegment("REDRAFT (type 0)", drafts.filter((d) => d.type === "redraft"), adp);
  reportSegment("DYNASTY (type 2)", drafts.filter((d) => d.type === "dynasty"), adp);
  reportSegment("KEEPER (type 1)", drafts.filter((d) => d.type === "keeper"), adp);

  console.log(`\n##### Segment by ROSTER DEPTH (rounds)`);
  reportSegment("SHALLOW (<= 17 rounds)", drafts.filter((d) => d.rounds <= 17), adp);
  reportSegment("DEEP (>= 20 rounds)", drafts.filter((d) => d.rounds >= 20), adp);

  console.log(`\n##### Segment by TEAM COUNT (N -> snake gap size)`);
  reportSegment("10-TEAM", drafts.filter((d) => d.teams === 10), adp);
  reportSegment("12-TEAM", drafts.filter((d) => d.teams === 12), adp);

  // ---- KTC-points cross-check, dynasty only --------------------------------
  console.log(`\n--- KTC-points cross-check (dynasty drafts only; date-matched snapshots) ---`);
  const dyn = drafts.filter((d) => d.type === "dynasty");
  const ktc = await loadKtc();
  // build expected-KTC-by-round baseline for dynasty (per superflex/1qb)
  const expBy = new Map<string, Map<number, number[]>>(); // fmt -> roundBucket -> values
  let cov = 0,
    tot = 0;
  for (const d of dyn) {
    const fmt = d.superflex ? "sf" : "1qb";
    for (const p of d.picks) {
      tot++;
      const v = ktcValue(ktc, fmt, d.startMs, p.player_id);
      if (v == null) continue;
      cov++;
      const rb = Math.ceil(p.overall / d.teams);
      const m = expBy.get(fmt) ?? new Map<number, number[]>();
      const arr = m.get(rb) ?? [];
      arr.push(v);
      m.set(rb, arr);
      expBy.set(fmt, m);
    }
  }
  const expMean = new Map<string, Map<number, number>>();
  for (const [fmt, m] of expBy) {
    const mm = new Map<number, number>();
    for (const [rb, arr] of m) mm.set(rb, mean(arr));
    expMean.set(fmt, mm);
  }
  console.log(`  KTC coverage on dynasty picks: ${cov}/${tot} (${tot ? ((cov / tot) * 100).toFixed(0) : 0}% matched within ${KTC_MATCH_TOLERANCE_DAYS}d)`);
  // Half B in KTC points: decliner later-P KTC surplus minus during-run P KTC surplus, deep tier
  const ktcDeep: number[] = [];
  let usable = 0;
  for (const d of dyn) {
    const fmt = d.superflex ? "sf" : "1qb";
    const exp = expMean.get(fmt);
    if (!exp) continue;
    const surplus = (p: Pick): number | null => {
      const v = ktcValue(ktc, fmt, d.startMs, p.player_id);
      if (v == null) return null;
      const e = exp.get(Math.ceil(p.overall / d.teams));
      return e == null ? null : v - e;
    };
    for (const ev of detectRuns(d)) {
      if (tierClass(ev.pos, d.superflex) !== "deep") continue;
      const inWin = d.picks.filter((p) => p.overall >= ev.start && p.overall <= ev.end);
      const managers = new Set(inWin.map((p) => p.manager));
      const during = inWin.filter((p) => p.position === ev.pos).map(surplus).filter((x): x is number => x != null);
      const later: number[] = [];
      for (const m of managers) {
        const mine = inWin.filter((p) => p.manager === m);
        if (mine.some((p) => p.position === ev.pos)) continue;
        const laterP = d.picks
          .filter((p) => p.manager === m && p.position === ev.pos && p.overall > ev.end)
          .sort((x, y) => x.overall - y.overall)[0];
        if (laterP) {
          const s = surplus(laterP);
          if (s != null) later.push(s);
        }
      }
      if (later.length && during.length) {
        ktcDeep.push(mean(later) - mean(during));
        usable++;
      }
    }
  }
  const kCI = bootCI(ktcDeep);
  console.log(
    `  Half B (deep) later-minus-during in KTC points: ${r2(mean(ktcDeep))} [90% CI ${r2(kCI[0])}, ${r2(kCI[1])}] over ${usable} runs`,
  );
  console.log(`  (KTC is a dynasty value scale; negative/near-zero = no late discount, consistent with the rounds lens.)`);

  console.log(`\nReading the calibration:`);
  console.log(`  - Half A > 0 across segments = declining a run banks off-run surplus everywhere.`);
  console.log(`  - Half B deep ~ 0 = waiting on WR/RB is roughly free; more negative = waiting costs more.`);
  console.log(`  - Compare REDRAFT vs DYNASTY and 10 vs 12 team: a MORE NEGATIVE Half B (esp. shallow)`);
  console.log(`    in redraft / smaller-roster / more-teams means a run is more pressing there.`);
  console.log(`  Confounders unchanged: single ecosystem, manager skill, corpus-derived ADP, thin cells.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
