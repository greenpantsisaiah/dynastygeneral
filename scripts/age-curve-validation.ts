/**
 * Empirical age-curve validation. Pulls multiple seasons of Sleeper
 * stats, joins to current age data, and computes median PPG per
 * (position, age) cohort. Compares against the hardcoded age bands
 * in lane-identity/lanes.ts so we can see whether our position
 * cliffs match reality.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/age-curve-validation.ts
 *
 * Outputs:
 *   age-curve-validation.md
 *
 * Methodology:
 *   - For each season S in SEASONS, pull Sleeper /stats/nfl/regular/S
 *   - For each player in the cache, compute their age AT THAT SEASON
 *     (current_age - (2026 - S))
 *   - Filter to games_played >= 6 so per-game averages aren't noise
 *   - Group by (position, age_at_season); take MEDIAN PPG per group
 *   - Render a per-position table: age | n | median PPG | curve mult
 *
 * Survivorship caveat:
 *   The Sleeper player cache contains players who are CURRENTLY in
 *   the system. Retirees who left the league before 2026 don't show
 *   up, so age 32+ samples are biased upward (only the survivors
 *   are counted). The cliff is REAL for the surviving population;
 *   it would be steeper if retirees counted as zero. Caveat in the
 *   report.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getSeasonStats } from "../src/lib/players/season-stats";
import { __dumpAllPlayers } from "../src/lib/players/cache";

const SEASONS = ["2022", "2023", "2024", "2025"];
const CURRENT_SEASON = 2026;
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const MIN_GAMES = 6;
const MIN_COHORT_SIZE = 4;
// Starter-tier slot count per position per season. Median across ALL
// surviving players is dominated by deep-bench bodies (3rd-string RBs,
// practice-squad TEs), which buries the signal we care about.
// Filtering to the top-N PPR producers per (position, season) isolates
// "starter tier" production. Counts roughly match dynasty consensus
// for "starts in a 12-team league" (12 QBs, 24 starting RBs / WRs in
// 2RB+2WR+FLEX formats, 12 starting TEs).
const STARTER_TOP_N: Record<string, number> = {
  QB: 12,
  RB: 24,
  WR: 36,
  TE: 12,
};

type Observation = {
  player_id: string;
  position: string;
  age_at_season: number;
  ppg: number;
  total_pts: number;
  season: string;
};

async function collectObservations(): Promise<Observation[]> {
  const players = await __dumpAllPlayers();
  const playerById = new Map(players.map((p) => [p.player_id, p]));

  const observations: Observation[] = [];
  for (const season of SEASONS) {
    console.log(`  fetching stats for ${season} ...`);
    const stats = await getSeasonStats(season);
    const yearsBack = CURRENT_SEASON - Number(season);
    let kept = 0;
    let skippedNoAge = 0;
    let skippedThinGames = 0;
    let skippedNoPos = 0;
    for (const [playerId, s] of stats) {
      const p = playerById.get(playerId);
      if (!p) continue;
      const pos = (p.position ?? "").toUpperCase();
      if (!POSITIONS.includes(pos as (typeof POSITIONS)[number])) {
        skippedNoPos++;
        continue;
      }
      const currentAge = typeof p.age === "number" ? p.age : null;
      if (currentAge == null) {
        skippedNoAge++;
        continue;
      }
      const ageAtSeason = currentAge - yearsBack;
      if (ageAtSeason < 20 || ageAtSeason > 40) continue;
      const games = s.games_played ?? 0;
      if (games < MIN_GAMES) {
        skippedThinGames++;
        continue;
      }
      const pts = s.pts_ppr ?? null;
      if (pts == null || pts <= 0) continue;
      const ppg = pts / games;
      observations.push({
        player_id: playerId,
        position: pos,
        age_at_season: ageAtSeason,
        ppg,
        total_pts: pts,
        season,
      });
      kept++;
    }
    console.log(
      `    kept ${kept} (skipped: ${skippedThinGames} thin-games, ${skippedNoAge} no-age, ${skippedNoPos} non-skill)`,
    );
  }
  return observations;
}

type CohortStats = {
  position: string;
  age: number;
  n: number;
  median_ppg: number;
  p25: number;
  p75: number;
};

function aggregateByCohort(obs: Observation[]): CohortStats[] {
  const groups = new Map<string, Observation[]>();
  for (const o of obs) {
    const key = `${o.position}:${o.age_at_season}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(o);
  }
  const out: CohortStats[] = [];
  for (const [key, arr] of groups) {
    if (arr.length < MIN_COHORT_SIZE) continue;
    const [position, ageStr] = key.split(":");
    const age = Number(ageStr);
    const sorted = arr.map((o) => o.ppg).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    out.push({
      position,
      age,
      n: arr.length,
      median_ppg: median,
      p25,
      p75,
    });
  }
  out.sort((a, b) => {
    if (a.position !== b.position) return a.position.localeCompare(b.position);
    return a.age - b.age;
  });
  return out;
}

/**
 * Hardcoded position-aware age multipliers from
 * src/lib/strategy/lane-identity/lanes.ts:positionAgeMult.
 */
function modelMult(position: string, age: number): number {
  switch (position) {
    case "RB":
      if (age >= 23 && age <= 26) return 1.0;
      if (age === 27 || age === 28) return 0.8;
      if (age === 29 || age === 30) return 0.5;
      return 0;
    case "WR":
      if (age >= 24 && age <= 29) return 1.0;
      if (age === 23 || age === 30 || age === 31) return 0.85;
      if (age === 32 || age === 33) return 0.55;
      return 0;
    case "TE":
      if (age >= 25 && age <= 30) return 1.0;
      if (age === 23 || age === 24 || age === 31 || age === 32) return 0.85;
      if (age === 33 || age === 34) return 0.55;
      return 0;
    case "QB":
      if (age >= 26 && age <= 33) return 1.0;
      if ((age >= 24 && age <= 25) || (age >= 34 && age <= 36)) return 0.85;
      if (age === 37 || age === 38) return 0.6;
      return 0;
    default:
      return 0;
  }
}

function findCliffAge(rows: CohortStats[]): number | null {
  const sorted = [...rows].sort((a, b) => a.age - b.age);
  const peakMedian = Math.max(...sorted.map((r) => r.median_ppg));
  let cliffAge: number | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.median_ppg / peakMedian < 0.75) continue;
    if (curr.median_ppg / prev.median_ppg < 0.75) {
      cliffAge = curr.age;
      break;
    }
  }
  return cliffAge;
}

/**
 * Filter observations to starter-tier only: top-N PPR producers per
 * (position, season). Median PPG within this set isolates starter-
 * tier production from the deep-bench dilution that masks age cliffs
 * in the all-survivors view.
 */
function filterStarterTier(obs: Observation[]): Observation[] {
  const bySeasonPos = new Map<string, Observation[]>();
  for (const o of obs) {
    const key = `${o.season}:${o.position}`;
    let arr = bySeasonPos.get(key);
    if (!arr) {
      arr = [];
      bySeasonPos.set(key, arr);
    }
    arr.push(o);
  }
  const kept: Observation[] = [];
  for (const [key, arr] of bySeasonPos) {
    const [, pos] = key.split(":");
    const topN = STARTER_TOP_N[pos] ?? 24;
    arr.sort((a, b) => b.total_pts - a.total_pts);
    kept.push(...arr.slice(0, topN));
  }
  return kept;
}

async function main() {
  console.log("collecting historical observations...");
  const observations = await collectObservations();
  console.log(`\ntotal observations: ${observations.length}`);

  const allCohorts = aggregateByCohort(observations);
  console.log(`all-survivors cohorts (>= ${MIN_COHORT_SIZE} obs): ${allCohorts.length}`);

  const starterObs = filterStarterTier(observations);
  console.log(`starter-tier observations: ${starterObs.length}`);
  const starterCohorts = aggregateByCohort(starterObs);
  console.log(`starter-tier cohorts: ${starterCohorts.length}`);

  const lines: string[] = [];
  lines.push("# Empirical Age-Curve Validation");
  lines.push("");
  lines.push(
    `Seasons sampled: ${SEASONS.join(", ")}. Per-player threshold: >= ${MIN_GAMES} games. Cohort threshold: >= ${MIN_COHORT_SIZE} observations.`,
  );
  lines.push("");
  lines.push(
    `Two views per position:`,
  );
  lines.push(
    `  - **All survivors**: every player with >= ${MIN_GAMES} games in the season. Median includes deep-bench depth (3rd-string RBs, practice-squad TEs). Useful as a population baseline but flat curves don't necessarily refute starter-tier cliffs.`,
  );
  lines.push(
    `  - **Starter tier**: top-N PPR producers per (position, season). N = QB:${STARTER_TOP_N.QB}, RB:${STARTER_TOP_N.RB}, WR:${STARTER_TOP_N.WR}, TE:${STARTER_TOP_N.TE}. Isolates the production the engine actually cares about; cliffs that exist in the starter cohort but not in the all-survivors cohort are real.`,
  );
  lines.push("");
  lines.push(
    `Survivorship caveat: the Sleeper player cache only contains players still in the system in 2026. Retirees who left before 2026 are excluded, so age 32+ cohorts are upward-biased (counting retirees as zero would steepen the cliff). Treat cliff AGE as more reliable than cliff MAGNITUDE.`,
  );
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push("# Starter-Tier View (the one that matters)");
  lines.push("");
  lines.push(renderTablesPerPosition(starterCohorts));

  lines.push("---");
  lines.push("");
  lines.push("# All-Survivors View (for context)");
  lines.push("");
  lines.push(renderTablesPerPosition(allCohorts));

  const outPath = resolve(process.cwd(), "age-curve-validation.md");
  writeFileSync(outPath, lines.join("\n"));
  console.log(`\nwrote ${outPath}`);
}

function renderTablesPerPosition(cohorts: CohortStats[]): string {
  const lines: string[] = [];
  for (const pos of POSITIONS) {
    const rows = cohorts.filter((c) => c.position === pos);
    if (rows.length === 0) continue;
    lines.push(`## ${pos}`);
    lines.push("");
    lines.push(
      "| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |",
    );
    lines.push("|---|---|---|---|---|---|---|---|");
    const peakMedian = Math.max(...rows.map((r) => r.median_ppg));
    for (const r of rows) {
      const empiricalMult = peakMedian > 0 ? r.median_ppg / peakMedian : 0;
      const model = modelMult(pos, r.age);
      const delta = Math.abs(empiricalMult - model);
      const verdict =
        delta < 0.1
          ? "match"
          : empiricalMult > model + 0.1
            ? "we underprice"
            : "we overprice";
      lines.push(
        `| ${r.age} | ${r.n} | ${r.median_ppg.toFixed(1)} | ${r.p25.toFixed(1)} | ${r.p75.toFixed(1)} | ${empiricalMult.toFixed(2)} | ${model.toFixed(2)} | ${verdict} |`,
      );
    }
    lines.push("");
    const cliffAge = findCliffAge(rows);
    if (cliffAge != null) {
      lines.push(
        `Empirical cliff: median PPG first drops materially at age ${cliffAge}.`,
      );
    } else {
      lines.push("Empirical cliff: no clear cliff in sampled range.");
    }
    lines.push("");
  }
  return lines.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
