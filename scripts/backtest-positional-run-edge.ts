/**
 * Backtest the REALIZED draft-day edge of declining a positional run.
 * Closes (partially) RESEARCH_CORPUS.md open question 12, the observable
 * half of the "draft against a positional run" claim.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-positional-run-edge.ts [extraUsername ...]
 *
 * Two halves of the claim, both measured here as ASSOCIATIONS (not proven
 * causation; confounders named at the bottom of the output):
 *   Half A: a manager who DECLINES a run on position P (takes a different
 *           position while the room runs P) banks higher value-over-ADP on
 *           those off-run picks than the managers who CHASE P do on their
 *           in-run P picks.
 *   Half B: that decliner's LATER pick at P (after the run) comes at higher
 *           value-over-ADP than the P picks taken DURING the run, and the
 *           edge is larger for DEEP positions (WR/RB) than CLIFFY ones
 *           (QB in superflex), matching the tier-depth validation in
 *           scripts/validate-positional-run-tier-depth.ts.
 *
 * Value lens: value-over-ADP, expressed in ROUNDS (league-size neutral).
 * ADP is derived FROM the corpus, per (season, draft-kind) cohort, so it
 * is era-appropriate and self-contained. value_over_adp = ADP_round(player)
 * - round_taken(pick). Positive = taken later than the player's own market
 * = a faller captured. This is exactly the "did I get them cheaper" sense
 * the founder asked about. We deliberately do NOT use a single KTC snapshot
 * to value picks from drafts spanning many seasons (look-ahead + era bias);
 * a historical-KTC-per-draft-date enrichment is a future upgrade.
 *
 * Seed: the founder's own public Sleeper league ecosystem (the product DB
 * has zero stored leagues). Read-only public Sleeper API + read-only
 * Supabase (unused here; ADP is corpus-derived). No writes anywhere.
 */

const BASE = "https://api.sleeper.app/v1";
const SEED_USERNAMES = ["izzydabomb", "Strawhatdoofy", "lincolnenglish", "saquonatraitor"];
const SEASONS = ["2026", "2025", "2024", "2023", "2022", "2021"];
const SKILL = new Set(["QB", "RB", "WR", "TE"]);
const RUN_WINDOW = 5; // consecutive overall picks examined for a run
const RUN_MIN = 3; // >= this many of one position in the window = a run
const STARTUP_MIN_ROUNDS = 10; // rounds >= this => startup; else rookie
const MIN_ADP_APPEAR = 3; // a player needs this many cohort drafts for a stable ADP
const BOOT = 2000; // bootstrap iterations for CIs

type Pick = {
  overall: number;
  round: number;
  manager: string; // roster_id or draft_slot, stable within a draft
  player_id: string;
  position: string;
};
type Draft = {
  draft_id: string;
  league_id: string;
  season: string;
  teams: number;
  rounds: number;
  superflex: boolean;
  kind: "startup" | "rookie";
  picks: Pick[]; // sorted by overall ascending
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

// ---- collection ------------------------------------------------------------

async function collectLeagueIds(usernames: string[]): Promise<Set<string>> {
  const current = new Set<string>();
  for (const uname of usernames) {
    const u = await gj(`/user/${encodeURIComponent(uname)}`);
    if (!u?.user_id) continue;
    for (const s of SEASONS) {
      const ls = await gj(`/user/${u.user_id}/leagues/nfl/${s}`);
      if (Array.isArray(ls)) for (const l of ls) if (l.league_id) current.add(l.league_id);
      await sleep(40);
    }
  }
  // Walk previous_league_id chains to reach founding-season startups.
  const all = new Set<string>(current);
  for (const id of [...current]) {
    let cur: string | null = id;
    let hops = 0;
    while (cur && hops < 10) {
      const l = await gj(`/league/${cur}`);
      await sleep(30);
      const prev = l?.previous_league_id ?? null;
      if (prev && !all.has(prev)) {
        all.add(prev);
        cur = prev;
      } else cur = null;
      hops++;
    }
  }
  return all;
}

function isSuperflex(rosterPositions: string[] | undefined): boolean {
  return (rosterPositions ?? []).some((p) => p === "SUPER_FLEX" || p === "SF");
}

async function collectDrafts(leagueIds: Set<string>): Promise<Draft[]> {
  const out: Draft[] = [];
  for (const leagueId of leagueIds) {
    const league = await gj(`/league/${leagueId}`);
    await sleep(30);
    const superflex = isSuperflex(league?.roster_positions);
    const drafts = await gj(`/league/${leagueId}/drafts`);
    await sleep(30);
    if (!Array.isArray(drafts)) continue;
    for (const d of drafts) {
      if (d.status !== "complete" || d.type !== "snake") continue;
      const teams = Number(d.settings?.teams ?? league?.total_rosters ?? 12);
      const rounds = Number(d.settings?.rounds ?? 0);
      const rawPicks = await gj(`/draft/${d.draft_id}/picks`);
      await sleep(40);
      if (!Array.isArray(rawPicks) || rawPicks.length === 0) continue;
      const picks: Pick[] = [];
      for (const p of rawPicks) {
        const overall = Number(p.pick_no);
        const position = String(p.metadata?.position ?? "?").toUpperCase();
        const manager = String(p.roster_id ?? p.draft_slot ?? "?");
        const player_id = String(p.player_id ?? "");
        if (!Number.isFinite(overall) || !player_id) continue;
        picks.push({ overall, round: Number(p.round ?? 0), manager, player_id, position });
      }
      if (picks.length === 0) continue;
      picks.sort((a, b) => a.overall - b.overall);
      out.push({
        draft_id: d.draft_id,
        league_id: leagueId,
        season: String(d.season ?? league?.season ?? "?"),
        teams: teams > 0 ? teams : 12,
        rounds,
        superflex,
        kind: rounds >= STARTUP_MIN_ROUNDS ? "startup" : "rookie",
        picks,
      });
    }
  }
  return out;
}

// ---- ADP (corpus-derived, per season+kind, in rounds) ----------------------

type AdpKey = string; // `${season}|${kind}|${player_id}`
function adpKey(d: Draft, playerId: string): AdpKey {
  return `${d.season}|${d.kind}|${playerId}`;
}
function buildAdp(drafts: Draft[]): Map<AdpKey, number> {
  const acc = new Map<AdpKey, number[]>();
  for (const d of drafts) {
    for (const p of d.picks) {
      const rd = p.overall / d.teams; // round depth, league-size neutral
      const k = adpKey(d, p.player_id);
      const arr = acc.get(k) ?? [];
      arr.push(rd);
      acc.set(k, arr);
    }
  }
  const adp = new Map<AdpKey, number>();
  for (const [k, arr] of acc) {
    if (arr.length >= MIN_ADP_APPEAR) adp.set(k, arr.reduce((s, v) => s + v, 0) / arr.length);
  }
  return adp;
}
// value-over-ADP in rounds for a pick, or null if no stable ADP.
function vOverAdp(d: Draft, p: Pick, adp: Map<AdpKey, number>): number | null {
  const a = adp.get(adpKey(d, p.player_id));
  if (a == null) return null;
  return a - p.overall / d.teams; // positive = taken later than market = surplus
}

// ---- run detection + decline/chase classification --------------------------

type RunEvent = { pos: string; startOverall: number; endOverall: number; draft: Draft };
function detectRuns(d: Draft): RunEvent[] {
  const skill = d.picks.filter((p) => SKILL.has(p.position));
  // Index runs over the full overall sequence (gaps from K/DST are rare in
  // these formats). Use a sliding window over consecutive skill picks.
  const events: RunEvent[] = [];
  for (const pos of ["QB", "RB", "WR", "TE"]) {
    let i = 0;
    while (i < d.picks.length) {
      const win = d.picks.slice(i, i + RUN_WINDOW);
      const hits = win.filter((p) => p.position === pos);
      if (hits.length >= RUN_MIN) {
        const start = hits[0].overall;
        const end = hits[hits.length - 1].overall;
        // extend/merge with the immediately following same-pos picks
        events.push({ pos, startOverall: start, endOverall: end, draft: d });
        i = i + RUN_WINDOW; // step past this window to avoid double-counting
      } else {
        i++;
      }
    }
  }
  return events;
}

type HalfASample = { decliner: number[]; chaser: number[] };
type HalfBSample = { later: number[]; during: number[]; tier: string };

function tierClass(pos: string, superflex: boolean): "deep" | "moderate" | "cliffy" {
  if (pos === "WR" || pos === "RB") return "deep";
  if (pos === "QB") return superflex ? "cliffy" : "moderate";
  return "moderate"; // TE
}

function analyzeRun(
  ev: RunEvent,
  adp: Map<AdpKey, number>,
): { a: HalfASample; b: HalfBSample } {
  const d = ev.draft;
  const inWindow = d.picks.filter((p) => p.overall >= ev.startOverall && p.overall <= ev.endOverall);
  const managers = new Set(inWindow.map((p) => p.manager));
  const a: HalfASample = { decliner: [], chaser: [] };
  const b: HalfBSample = { later: [], during: [], tier: tierClass(ev.pos, d.superflex) };

  // during-run P picks (the "if you chased" cost basis for Half B)
  for (const p of inWindow) {
    if (p.position !== ev.pos) continue;
    const v = vOverAdp(d, p, adp);
    if (v != null) b.during.push(v);
  }

  for (const m of managers) {
    const mineInWin = inWindow.filter((p) => p.manager === m);
    const chasedHere = mineInWin.some((p) => p.position === ev.pos);
    if (chasedHere) {
      for (const p of mineInWin.filter((x) => x.position === ev.pos)) {
        const v = vOverAdp(d, p, adp);
        if (v != null) a.chaser.push(v);
      }
    } else {
      // decliner: their off-run pick(s) during the run window
      for (const p of mineInWin.filter((x) => SKILL.has(x.position))) {
        const v = vOverAdp(d, p, adp);
        if (v != null) a.decliner.push(v);
      }
      // Half B: this decliner's FIRST P pick after the run
      const laterP = d.picks
        .filter((p) => p.manager === m && p.position === ev.pos && p.overall > ev.endOverall)
        .sort((x, y) => x.overall - y.overall)[0];
      if (laterP) {
        const v = vOverAdp(d, laterP, adp);
        if (v != null) b.later.push(v);
      }
    }
  }
  return { a, b };
}

// ---- stats -----------------------------------------------------------------

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
function bootCI(xs: number[], iters = BOOT): [number, number] {
  if (xs.length < 2) return [NaN, NaN];
  const ms: number[] = [];
  for (let b = 0; b < iters; b++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[(Math.random() * xs.length) | 0];
    ms.push(s / xs.length);
  }
  ms.sort((a, c) => a - c);
  return [ms[Math.floor(iters * 0.05)], ms[Math.floor(iters * 0.95)]];
}
const r2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "  -");

// ---- main ------------------------------------------------------------------

async function main() {
  const extra = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const usernames = [...new Set([...SEED_USERNAMES, ...extra])];
  console.log("=== Realized positional-run edge backtest (real Sleeper drafts) ===");
  console.log(`Seed usernames: ${usernames.join(", ")}`);
  console.log("Collecting leagues + drafts (read-only public Sleeper API)...");

  const leagueIds = await collectLeagueIds(usernames);
  const drafts = await collectDrafts(leagueIds);
  console.log(`\nLeagues (incl. history chains): ${leagueIds.size}`);
  console.log(`Completed snake drafts: ${drafts.length}`);

  // corpus summary
  const byKind = new Map<string, number>();
  let totalPicks = 0;
  for (const d of drafts) {
    byKind.set(d.kind, (byKind.get(d.kind) ?? 0) + 1);
    totalPicks += d.picks.length;
  }
  console.log(
    `  startup: ${byKind.get("startup") ?? 0}, rookie: ${byKind.get("rookie") ?? 0}, total picks: ${totalPicks}`,
  );
  const sfCount = drafts.filter((d) => d.superflex).length;
  console.log(`  superflex drafts: ${sfCount} of ${drafts.length}`);

  const adp = buildAdp(drafts);
  console.log(`  ADP entries (>= ${MIN_ADP_APPEAR} appearances in a season+kind cohort): ${adp.size}`);

  // Analyze startups primarily (the multi-position draft the question is
  // about), then report rookie + pooled for completeness.
  for (const scope of ["startup", "rookie", "all"] as const) {
    const pool = scope === "all" ? drafts : drafts.filter((d) => d.kind === scope);
    if (pool.length === 0) {
      console.log(`\n##### Scope ${scope}: no drafts.`);
      continue;
    }
    const runs: RunEvent[] = [];
    for (const d of pool) runs.push(...detectRuns(d));
    console.log(`\n##### Scope ${scope}: ${pool.length} drafts, ${runs.length} run-events`);
    const runsByPos = new Map<string, number>();
    for (const r of runs) runsByPos.set(r.pos, (runsByPos.get(r.pos) ?? 0) + 1);
    console.log(`  runs by position: ${[...runsByPos.entries()].map(([p, c]) => `${p}:${c}`).join("  ")}`);

    // Half A: per run-event, mean decliner off-run surplus minus mean
    // chaser in-run surplus. Bootstrap over run-events.
    const aEffects: number[] = [];
    const declinerAll: number[] = [];
    const chaserAll: number[] = [];
    for (const ev of runs) {
      const { a } = analyzeRun(ev, adp);
      declinerAll.push(...a.decliner);
      chaserAll.push(...a.chaser);
      if (a.decliner.length && a.chaser.length) aEffects.push(mean(a.decliner) - mean(a.chaser));
    }
    const aCI = bootCI(aEffects);
    console.log(`\n  Half A (decline a run -> off-run value-over-ADP, in rounds):`);
    console.log(`    decliner off-run picks: n=${declinerAll.length}, mean surplus ${r2(mean(declinerAll))} rounds`);
    console.log(`    chaser   in-run  picks: n=${chaserAll.length}, mean surplus ${r2(mean(chaserAll))} rounds`);
    console.log(
      `    paired effect (decliner - chaser) over ${aEffects.length} run-events: ${r2(mean(aEffects))} rounds [90% CI ${r2(aCI[0])}, ${r2(aCI[1])}]`,
    );
    console.log(
      `    -> ${mean(aEffects) > 0 && aCI[0] > 0 ? "SUPPORTED: declining banks more surplus on off-run picks" : mean(aEffects) > 0 ? "directional (CI crosses 0)" : "not supported in this corpus"}`,
    );

    // Half B: decliner's later P surplus vs during-run P surplus, by tier.
    const tiers = ["deep", "moderate", "cliffy"] as const;
    console.log(`\n  Half B (later run-position pick vs during-run pick, value-over-ADP rounds, by tier):`);
    for (const t of tiers) {
      const later: number[] = [];
      const during: number[] = [];
      const effects: number[] = [];
      for (const ev of runs) {
        const { b } = analyzeRun(ev, adp);
        if (b.tier !== t) continue;
        later.push(...b.later);
        during.push(...b.during);
        if (b.later.length && b.during.length) effects.push(mean(b.later) - mean(b.during));
      }
      if (later.length === 0 && during.length === 0) continue;
      const ci = bootCI(effects);
      console.log(
        `    ${t.padEnd(9)} later n=${String(later.length).padStart(3)} mean ${r2(mean(later))} | during n=${String(during.length).padStart(3)} mean ${r2(mean(during))} | later-during ${r2(mean(effects))} [90% CI ${r2(ci[0])}, ${r2(ci[1])}] over ${effects.length} runs`,
      );
    }
  }

  console.log(`\nConfounders (this is association, not proven causation):`);
  console.log(`  - Manager skill: decliners may simply be better drafters overall.`);
  console.log(`  - Single ecosystem: the founder's leagues share managers and norms;`);
  console.log(`    not a random sample of all dynasty leagues.`);
  console.log(`  - ADP is corpus-derived; thin cohorts widen the noise.`);
  console.log(`  - value-over-ADP sums to ~0 within a draft, so the meaningful`);
  console.log(`    quantity is the RELATIVE decliner-vs-chaser difference, reported above.`);
  console.log(`  - Half A is near-mechanical; a positive result confirms the mechanism`);
  console.log(`    operates in real drafts. Half B's tier ordering is the real test.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
