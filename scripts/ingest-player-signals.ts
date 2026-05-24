/**
 * Phase 3 ingestion: fill player_signals + team_signals from nflverse,
 * joined to Sleeper player_ids via the DynastyProcess crosswalk.
 *
 * See DATA_ACQUISITION_PHASE3.md for the decision-ready plan. This is
 * the "recommended first cut": crosswalk + usage shares + snap share +
 * draft pick + a combine-derived athletic composite + OL continuity.
 * All sources are free + CC-BY (nflverse) / standard ecosystem
 * (crosswalk); attribution is recorded per row in source_attribution.
 *
 * SAFETY: dry-run by default. Prints coverage + sample rows and the
 * count it WOULD upsert. Writes to production Supabase ONLY with
 * --execute. Upsert (keyed on the PK), so it is re-runnable.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-player-signals.ts
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-player-signals.ts --season=2025
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-player-signals.ts --season=2025 --execute
 *
 * Data: nflverse-data releases (CC-BY-4.0), DynastyProcess db_playerids.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const EXECUTE = process.argv.includes("--execute");
const seasonArg = process.argv
  .find((a) => a.startsWith("--season="))
  ?.split("=")[1];
const SEASON = seasonArg ?? String(new Date().getFullYear() - 1);

const XWALK_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";
const NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download";
const SKILL = new Set(["QB", "RB", "WR", "TE"]);
const OL_POS = new Set(["T", "G", "C", "OT", "OG", "OL", "LT", "RT", "LG", "RG"]);

// ---------- tiny CSV parser (handles quoted fields with commas) ----------
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { headers: { accept: "text/csv" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = vals[j] ?? "";
    rows.push(row);
  }
  return rows;
}

function num(s: string | undefined): number | null {
  if (s == null || s === "" || s === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function htToInches(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+)-(\d+)$/);
  if (m) return Number(m[1]) * 12 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function pct(values: number[], v: number, lowerIsBetter: boolean): number {
  // Percentile of v among values (0..1). lowerIsBetter inverts.
  const n = values.length;
  if (n <= 1) return 0.5;
  let below = 0;
  for (const x of values) if (x < v) below++;
  const p = below / (n - 1);
  return lowerIsBetter ? 1 - p : p;
}

// ---------- partial row accumulator ----------
type PlayerRow = {
  player_id: string;
  position?: string | null;
  team?: string | null;
  snap_share_prior_year?: number | null;
  target_share_prior_year?: number | null;
  rush_share_prior_year?: number | null;
  draft_round?: number | null;
  draft_pick_no?: number | null;
  ras?: number | null;
  weight_lb?: number | null;
  height_in?: number | null;
};

async function main() {
  console.log(
    `\nPhase 3 player-signals ingestion · season ${SEASON} · ${
      EXECUTE ? "EXECUTE (writes prod)" : "DRY RUN (no writes)"
    }\n`,
  );

  // 1. Crosswalk: gsis_id / pfr_id -> sleeper_id (+ name for logging).
  const xwalk = await fetchCsv(XWALK_URL);
  const gsisToSleeper = new Map<string, string>();
  const pfrToSleeper = new Map<string, string>();
  const nameBySleeper = new Map<string, string>();
  const posBySleeper = new Map<string, string>();
  let withSleeper = 0;
  for (const r of xwalk) {
    const sleeper = r.sleeper_id?.trim();
    if (!sleeper || sleeper === "NA") continue;
    withSleeper++;
    if (r.gsis_id && r.gsis_id !== "NA") gsisToSleeper.set(r.gsis_id, sleeper);
    if (r.pfr_id && r.pfr_id !== "NA") pfrToSleeper.set(r.pfr_id, sleeper);
    if (r.name) nameBySleeper.set(sleeper, r.name);
    if (r.position) posBySleeper.set(sleeper, r.position.toUpperCase());
  }
  console.log(
    `crosswalk: ${xwalk.length} rows, ${withSleeper} with sleeper_id (gsis map ${gsisToSleeper.size}, pfr map ${pfrToSleeper.size})`,
  );

  const rows = new Map<string, PlayerRow>();
  const get = (sleeper: string): PlayerRow => {
    let row = rows.get(sleeper);
    if (!row) {
      row = { player_id: sleeper };
      rows.set(sleeper, row);
    }
    return row;
  };

  // 2. stats_player_reg_{season}: target_share (direct) + rush_share
  //    (player carries / team carries). recent_team is the team col.
  let statMatched = 0;
  try {
    const stats = await fetchCsv(`${NFLVERSE}/stats_player/stats_player_reg_${SEASON}.csv`);
    const teamCarries = new Map<string, number>();
    for (const r of stats) {
      const c = num(r.carries);
      if (c && r.recent_team)
        teamCarries.set(r.recent_team, (teamCarries.get(r.recent_team) ?? 0) + c);
    }
    for (const r of stats) {
      const pos = (r.position ?? "").toUpperCase();
      if (!SKILL.has(pos)) continue;
      const sleeper = gsisToSleeper.get(r.player_id ?? "");
      if (!sleeper) continue;
      statMatched++;
      const row = get(sleeper);
      row.position = pos;
      row.team = r.recent_team || row.team;
      row.target_share_prior_year = num(r.target_share);
      const c = num(r.carries);
      const tc = teamCarries.get(r.recent_team ?? "");
      row.rush_share_prior_year =
        c != null && tc && tc > 0 ? Number((c / tc).toFixed(4)) : null;
    }
    console.log(`stats_player ${SEASON}: ${stats.length} rows, ${statMatched} skill players matched to sleeper`);
  } catch (e) {
    console.error(`stats_player fetch failed: ${(e as Error).message}`);
  }

  // 3. snap_counts_{season}: mean offense_pct -> snap_share; OL continuity.
  let snapMatched = 0;
  const olByTeamWeek = new Map<string, Map<number, Set<string>>>();
  try {
    const snaps = await fetchCsv(`${NFLVERSE}/snap_counts/snap_counts_${SEASON}.csv`);
    const acc = new Map<string, { sum: number; n: number }>();
    for (const r of snaps) {
      const pos = (r.position ?? "").toUpperCase();
      const team = r.team ?? "";
      const week = num(r.week);
      const offPct = num(r.offense_pct); // 0..1
      // OL continuity bookkeeping (by pfr id, the snap_counts key).
      if (OL_POS.has(pos) && team && week != null && offPct != null && offPct >= 0.5) {
        const byWeek = olByTeamWeek.get(team) ?? new Map<number, Set<string>>();
        const set = byWeek.get(week) ?? new Set<string>();
        set.add(r.pfr_player_id ?? r.player ?? "");
        byWeek.set(week, set);
        olByTeamWeek.set(team, byWeek);
      }
      if (!SKILL.has(pos)) continue;
      const sleeper = pfrToSleeper.get(r.pfr_player_id ?? "");
      if (!sleeper || offPct == null) continue;
      const a = acc.get(sleeper) ?? { sum: 0, n: 0 };
      a.sum += offPct;
      a.n += 1;
      acc.set(sleeper, a);
    }
    for (const [sleeper, a] of acc) {
      if (a.n === 0) continue;
      snapMatched++;
      get(sleeper).snap_share_prior_year = Number((a.sum / a.n).toFixed(4));
    }
    console.log(`snap_counts ${SEASON}: ${snaps.length} rows, ${snapMatched} skill players matched`);
  } catch (e) {
    console.error(`snap_counts fetch failed: ${(e as Error).message}`);
  }

  // OL continuity per team: mean week-over-week overlap of the starting
  // five (offense_pct >= 50%), normalized by 5.
  const teamRows = new Map<string, { team: string; ol_continuity_score: number | null }>();
  for (const [team, byWeek] of olByTeamWeek) {
    const weeks = [...byWeek.keys()].sort((a, b) => a - b);
    if (weeks.length < 2) continue;
    let sum = 0;
    let pairs = 0;
    for (let i = 1; i < weeks.length; i++) {
      const prev = byWeek.get(weeks[i - 1])!;
      const cur = byWeek.get(weeks[i])!;
      let overlap = 0;
      for (const id of cur) if (prev.has(id)) overlap++;
      sum += Math.min(overlap, 5) / 5;
      pairs++;
    }
    teamRows.set(team, {
      team,
      ol_continuity_score: pairs > 0 ? Number((sum / pairs).toFixed(4)) : null,
    });
  }
  console.log(`OL continuity: ${teamRows.size} teams`);

  // 4. draft_picks (all years): round + overall pick.
  let draftMatched = 0;
  try {
    const draft = await fetchCsv(`${NFLVERSE}/draft_picks/draft_picks.csv`);
    for (const r of draft) {
      const sleeper =
        gsisToSleeper.get(r.gsis_id ?? "") ?? pfrToSleeper.get(r.pfr_player_id ?? "");
      if (!sleeper) continue;
      const round = num(r.round);
      const pick = num(r.pick);
      if (round == null && pick == null) continue;
      // Only fill if this player is in our signal set (skill players we
      // matched above) OR create the row (draft capital is useful even
      // for a player who had no snaps last year, e.g. a 2025 rookie).
      const row = get(sleeper);
      row.draft_round = round != null ? Math.round(round) : row.draft_round ?? null;
      row.draft_pick_no = pick != null ? Math.round(pick) : row.draft_pick_no ?? null;
      draftMatched++;
    }
    console.log(`draft_picks: ${draft.length} rows, ${draftMatched} matched to sleeper`);
  } catch (e) {
    console.error(`draft_picks fetch failed: ${(e as Error).message}`);
  }

  // 5. combine (all years): height/weight + position-relative athletic
  //    composite (our own, from the free measurables; NOT Platte's RAS).
  let combineMatched = 0;
  try {
    const combine = await fetchCsv(`${NFLVERSE}/combine/combine.csv`);
    // Build per-position metric pools for percentile math.
    const norm = (p: string) => {
      const u = (p ?? "").toUpperCase();
      if (u === "QB" || u === "RB" || u === "WR" || u === "TE") return u;
      if (u === "FB") return "RB";
      return u; // keep OL/DL/etc in their own pools for fair percentiles
    };
    const pools = new Map<string, Record<string, number[]>>();
    const metrics = ["forty", "vertical", "broad_jump", "cone", "shuttle", "bench"];
    for (const r of combine) {
      const pos = norm(r.pos ?? "");
      const pool = pools.get(pos) ?? {};
      for (const m of metrics) {
        const v = num(r[m]);
        if (v != null) (pool[m] = pool[m] ?? []).push(v);
      }
      pools.set(pos, pool);
    }
    const lowerBetter = new Set(["forty", "cone", "shuttle"]);
    for (const r of combine) {
      const sleeper = pfrToSleeper.get(r.pfr_id ?? "");
      if (!sleeper) continue;
      const pos = norm(r.pos ?? "");
      const pool = pools.get(pos) ?? {};
      const ps: number[] = [];
      for (const m of metrics) {
        const v = num(r[m]);
        if (v != null && pool[m]?.length)
          ps.push(pct(pool[m], v, lowerBetter.has(m)));
      }
      const row = get(sleeper);
      row.height_in = htToInches(r.ht) ?? row.height_in ?? null;
      row.weight_lb = num(r.wt) != null ? Math.round(num(r.wt)!) : row.weight_lb ?? null;
      row.ras =
        ps.length > 0
          ? Number(((ps.reduce((s, x) => s + x, 0) / ps.length) * 100).toFixed(1))
          : row.ras ?? null;
      combineMatched++;
    }
    console.log(`combine: ${combine.length} rows, ${combineMatched} matched to sleeper`);
  } catch (e) {
    console.error(`combine fetch failed: ${(e as Error).message}`);
  }

  // ---------- assemble + report ----------
  const attribution = {
    source: "nflverse",
    license: "CC-BY-4.0",
    crosswalk: "dynastyprocess/db_playerids",
    season: SEASON,
    ingested_at: new Date().toISOString(),
  };
  const playerPayload = [...rows.values()]
    .map((r) => ({
      ...r,
      // Fall back to the crosswalk position when stats didn't set one
      // (e.g. a skill rookie who hasn't played a snap yet but has draft
      // capital + combine measurables).
      position: r.position ?? posBySleeper.get(r.player_id) ?? null,
    }))
    .filter((r) => {
      // Skill players only: the rubric grades QB/RB/WR/TE. Drop OL/DL
      // rows that only matched via draft/combine (rubric never reads them).
      if (!SKILL.has((r.position ?? "").toUpperCase())) return false;
      return (
        r.snap_share_prior_year != null ||
        r.target_share_prior_year != null ||
        r.rush_share_prior_year != null ||
        r.draft_round != null ||
        r.ras != null ||
        r.height_in != null
      );
    })
    .map((r) => ({ ...r, source_attribution: attribution, updated_by: "ingest-player-signals" }));
  const teamPayload = [...teamRows.values()].map((r) => ({
    ...r,
    source_attribution: attribution,
    updated_by: "ingest-player-signals",
  }));

  console.log(
    `\nWOULD UPSERT: ${playerPayload.length} player_signals rows, ${teamPayload.length} team_signals rows`,
  );
  console.log("\nsample player_signals (5):");
  for (const r of playerPayload.slice(0, 5)) {
    console.log(
      `  ${nameBySleeper.get(r.player_id) ?? r.player_id} [${r.position ?? "?"}/${r.team ?? "?"}] snap=${r.snap_share_prior_year ?? "-"} tgt=${r.target_share_prior_year ?? "-"} rush=${r.rush_share_prior_year ?? "-"} draft=${r.draft_round ?? "-"}.${r.draft_pick_no ?? "-"} ras=${r.ras ?? "-"} ${r.height_in ?? "-"}in/${r.weight_lb ?? "-"}lb`,
    );
  }
  console.log("\nsample team_signals (5):");
  for (const r of teamPayload.slice(0, 5)) {
    console.log(`  ${r.team}: ol_continuity=${r.ol_continuity_score ?? "-"}`);
  }

  if (!EXECUTE) {
    console.log("\nDRY RUN complete. No database writes. Re-run with --execute to write.\n");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars; aborting write.");
  const supabase = createClient(url, key);
  const chunk = <T>(a: T[], n: number) =>
    Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunk(playerPayload, 500)) {
    const { error } = await supabase.from("player_signals").upsert(c, { onConflict: "player_id" });
    if (error) throw new Error(`player_signals upsert: ${error.message}`);
  }
  for (const c of chunk(teamPayload, 500)) {
    const { error } = await supabase.from("team_signals").upsert(c, { onConflict: "team" });
    if (error) throw new Error(`team_signals upsert: ${error.message}`);
  }
  console.log(`\nWROTE ${playerPayload.length} player_signals + ${teamPayload.length} team_signals.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
