/**
 * Analyze the lane-identity cohort and produce a calibration report.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/analyze-cohort.ts
 *
 * Reads cohort.json (built by scripts/build-cohort.ts) and writes:
 *   - cohort-report.md (human-readable, safe to share)
 *
 * What it produces:
 *
 *   1. Per-lane state distribution (% IN / CLOSE / NOT_IN) across the
 *      whole cohort. The "shape" tells us if a threshold is sane:
 *      archetype lanes should be tight (most rosters not_in), horizon
 *      lanes should be bell-shaped.
 *
 *   2. Per-lane distribution split by format (SF vs 1QB,
 *      TE-premium vs non). If a lane's IN-rate diverges wildly across
 *      formats, either the lane's appliesTo gating is wrong or the
 *      format-scale factor needs adjustment.
 *
 *   3. Standings cross-check: bucket rosters by wins-percentile within
 *      their league (top quartile = "likely contender", bottom quartile
 *      = "likely rebuild"). For each lane, report IN-rate by bucket.
 *      Lanes like win_now_floor should have a strong positive slope
 *      from rebuild to contender; lanes like future_stock can have any
 *      slope. Standings are a partial label (a team can be win-now
 *      without making playoffs YET), but the slope is the signal.
 *
 *   4. Recommended threshold adjustments: for each lane where the
 *      distribution looks miscalibrated, propose a direction (raise /
 *      lower) and magnitude based on where the bulk of the cohort
 *      sits relative to current thresholds.
 *
 * Privacy: this report uses aggregates only. No owner names, no
 * per-roster details. Safe to commit.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Membership = {
  lane_id: string;
  label: string;
  axis: string;
  state: "in" | "close" | "not_in";
  aggregate_score: number;
  in_threshold: number;
  close_threshold: number;
  is_derived: boolean;
};

type CohortRoster = {
  league_id: string;
  league_name: string;
  league_format: string;
  league_scoring: string[];
  league_type: "redraft" | "keeper" | "dynasty";
  total_teams: number;
  roster_id: number;
  owner_name: string | null;
  wins: number | null;
  losses: number | null;
  starter_talent_score: number | null;
  player_count: number;
  ktc_total_top8: number;
  ktc_total_all: number;
  memberships: Membership[];
};

function loadCohort(): CohortRoster[] {
  const path = resolve(process.cwd(), "cohort.json");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as CohortRoster[];
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function fmtNum(n: number): string {
  return n.toFixed(0);
}

/* ============================================================
 * Per-lane distribution across the whole cohort
 * ============================================================ */

type LaneDist = {
  lane_id: string;
  label: string;
  axis: string;
  is_derived: boolean;
  in_count: number;
  close_count: number;
  not_in_count: number;
  total: number;
  scores: number[];
  in_threshold: number;
  close_threshold: number;
};

function distByLane(cohort: CohortRoster[]): Map<string, LaneDist> {
  const map = new Map<string, LaneDist>();
  for (const r of cohort) {
    for (const m of r.memberships) {
      let d = map.get(m.lane_id);
      if (!d) {
        d = {
          lane_id: m.lane_id,
          label: m.label,
          axis: m.axis,
          is_derived: m.is_derived,
          in_count: 0,
          close_count: 0,
          not_in_count: 0,
          total: 0,
          scores: [],
          in_threshold: m.in_threshold,
          close_threshold: m.close_threshold,
        };
        map.set(m.lane_id, d);
      }
      d.total++;
      d.scores.push(m.aggregate_score);
      if (m.state === "in") d.in_count++;
      else if (m.state === "close") d.close_count++;
      else d.not_in_count++;
    }
  }
  return map;
}

/* ============================================================
 * Standings buckets
 * ============================================================ */

type StandingsBucket = "top_q" | "upper_mid" | "lower_mid" | "bottom_q";

function bucketRoster(roster: CohortRoster, cohort: CohortRoster[]): StandingsBucket | null {
  if (roster.wins == null || roster.losses == null) return null;
  if (roster.wins + roster.losses === 0) return null;
  const winPct = roster.wins / (roster.wins + roster.losses);
  // Rank within league: compute league rosters and their winPcts
  const leagueRosters = cohort.filter((r) => r.league_id === roster.league_id);
  const withPct = leagueRosters
    .filter((r) => r.wins != null && r.losses != null && (r.wins! + r.losses!) > 0)
    .map((r) => ({
      roster_id: r.roster_id,
      pct: r.wins! / (r.wins! + r.losses!),
    }))
    .sort((a, b) => b.pct - a.pct);
  if (withPct.length === 0) return null;
  const idx = withPct.findIndex((x) => x.roster_id === roster.roster_id);
  if (idx < 0) return null;
  const quartile = idx / withPct.length;
  if (quartile < 0.25) return "top_q";
  if (quartile < 0.5) return "upper_mid";
  if (quartile < 0.75) return "lower_mid";
  return "bottom_q";
}

/* ============================================================
 * Report assembly
 * ============================================================ */

function laneTable(dist: Map<string, LaneDist>): string {
  const rows: string[] = [];
  rows.push("| Lane | Axis | IN | CLOSE | NOT_IN | Median | Threshold (CLOSE / IN) |");
  rows.push("|---|---|---|---|---|---|---|");
  const order = [
    "win_now_floor",
    "balanced",
    "future_stock",
    "rb_bellcow",
    "wr_anchor",
    "wr_stable",
    "qb_stable",
    "te_premium_lock",
    "trade_capital",
    "sustained_contender",
    "zero_rb",
  ];
  for (const id of order) {
    const d = dist.get(id);
    if (!d) continue;
    const sorted = [...d.scores].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const inPct = pct(d.in_count, d.total);
    const closePct = pct(d.close_count, d.total);
    const notInPct = pct(d.not_in_count, d.total);
    rows.push(
      `| ${d.label} | ${d.axis} | ${d.in_count} (${inPct}) | ${d.close_count} (${closePct}) | ${d.not_in_count} (${notInPct}) | ${fmtNum(median)} | ${d.close_threshold} / ${d.in_threshold} |`,
    );
  }
  return rows.join("\n");
}

function laneTableByFormat(cohort: CohortRoster[]): string {
  // Group by (format, is_te_premium)
  const groups = new Map<string, CohortRoster[]>();
  for (const r of cohort) {
    const isTep = r.league_scoring.includes("TE-premium");
    const key = `${r.league_format} ${isTep ? "TEP" : "non-TEP"}`;
    let arr = groups.get(key);
    if (!arr) {
      arr = [];
      groups.set(key, arr);
    }
    arr.push(r);
  }
  const sections: string[] = [];
  for (const [key, rosters] of [...groups.entries()].sort()) {
    const d = distByLane(rosters);
    sections.push(`### ${key} (${rosters.length} rosters)\n\n${laneTable(d)}`);
  }
  return sections.join("\n\n");
}

function standingsCrossCheck(cohort: CohortRoster[]): string {
  const buckets: StandingsBucket[] = ["top_q", "upper_mid", "lower_mid", "bottom_q"];
  const bucketLabel: Record<StandingsBucket, string> = {
    top_q: "Top quartile (likely contender)",
    upper_mid: "Upper mid",
    lower_mid: "Lower mid",
    bottom_q: "Bottom quartile (likely rebuild)",
  };
  const lanesOfInterest = [
    "win_now_floor",
    "balanced",
    "future_stock",
    "rb_bellcow",
    "wr_anchor",
    "wr_stable",
    "qb_stable",
    "te_premium_lock",
    "trade_capital",
    "sustained_contender",
    "zero_rb",
  ];

  const buckets_by_roster = new Map<string, StandingsBucket | null>();
  for (const r of cohort) {
    buckets_by_roster.set(`${r.league_id}:${r.roster_id}`, bucketRoster(r, cohort));
  }

  const counts: Map<string, Map<StandingsBucket, { in: number; total: number }>> = new Map();
  for (const r of cohort) {
    const b = buckets_by_roster.get(`${r.league_id}:${r.roster_id}`);
    if (!b) continue;
    for (const m of r.memberships) {
      let laneMap = counts.get(m.lane_id);
      if (!laneMap) {
        laneMap = new Map();
        counts.set(m.lane_id, laneMap);
      }
      let bc = laneMap.get(b);
      if (!bc) {
        bc = { in: 0, total: 0 };
        laneMap.set(b, bc);
      }
      bc.total++;
      if (m.state === "in") bc.in++;
    }
  }

  const rows: string[] = [];
  rows.push("| Lane | " + buckets.map((b) => bucketLabel[b]).join(" | ") + " |");
  rows.push("|---|" + buckets.map(() => "---").join("|") + "|");
  for (const id of lanesOfInterest) {
    const laneMap = counts.get(id);
    if (!laneMap) continue;
    const label = cohort
      .flatMap((r) => r.memberships)
      .find((m) => m.lane_id === id)?.label ?? id;
    const cells = buckets.map((b) => {
      const bc = laneMap.get(b);
      if (!bc || bc.total === 0) return "n/a";
      return `${bc.in}/${bc.total} (${pct(bc.in, bc.total)})`;
    });
    rows.push(`| ${label} | ${cells.join(" | ")} |`);
  }
  return rows.join("\n");
}

function recommendations(dist: Map<string, LaneDist>, cohort: CohortRoster[]): string {
  const lines: string[] = [];
  // Heuristic rules:
  //   - If a lane is IN for > 70% of rosters, threshold likely too low.
  //   - If a lane is IN for < 5% of rosters, threshold likely too high
  //     (unless it's an archetype lane where tight is expected).
  //   - If a lane's median sits inside the CLOSE band, the bulk of
  //     rosters are near-miss; thresholds plausibly tracking reality.
  //   - If median is below CLOSE threshold AND IN-rate > 30%, scores
  //     are bimodal (suggests format-scale issue).
  for (const [, d] of dist) {
    const inRate = d.total > 0 ? d.in_count / d.total : 0;
    const sorted = [...d.scores].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
    const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
    const expectsTight = d.axis === "archetype" && !d.is_derived;
    const expectsRare = d.lane_id === "sustained_contender" || d.lane_id === "zero_rb";

    const notes: string[] = [];
    if (inRate > 0.7) {
      notes.push(`IN-rate ${pct(d.in_count, d.total)} is high. Threshold likely too low; consider raising IN to ~${Math.round(p75)}.`);
    } else if (inRate < 0.05 && !expectsTight && !expectsRare) {
      notes.push(`IN-rate ${pct(d.in_count, d.total)} is tiny. Threshold likely too high; consider lowering IN to ~${Math.round(p75)}.`);
    } else if (inRate >= 0.2 && inRate <= 0.45) {
      notes.push(`IN-rate ${pct(d.in_count, d.total)} looks healthy.`);
    }
    if (expectsTight && inRate > 0.4) {
      notes.push(`Archetype lane: IN-rate ${pct(d.in_count, d.total)} too generous. Most rosters shouldn't have this archetype IN.`);
    }
    if (expectsRare && inRate > 0.25) {
      notes.push(`Composite lane: IN-rate ${pct(d.in_count, d.total)} too generous. Should be RARE (~10-15%).`);
    }
    notes.push(`Median ${fmtNum(median)}; p25-p75: ${fmtNum(p25)} to ${fmtNum(p75)}; thresholds CLOSE ${d.close_threshold} / IN ${d.in_threshold}.`);
    lines.push(`#### ${d.label} (${d.lane_id})`);
    for (const n of notes) lines.push(`- ${n}`);
    lines.push("");
  }
  return lines.join("\n");
}

/* ============================================================
 * Main
 * ============================================================ */

function main() {
  const raw = loadCohort();
  // Filter pre-draft leagues (every roster has 0 players). Including
  // them skews every distribution toward 100% NOT_IN.
  const droppedLeagues = new Set<string>();
  const byLeague = new Map<string, CohortRoster[]>();
  for (const r of raw) {
    let arr = byLeague.get(r.league_name);
    if (!arr) {
      arr = [];
      byLeague.set(r.league_name, arr);
    }
    arr.push(r);
  }
  const cohort: CohortRoster[] = [];
  for (const [name, rosters] of byLeague) {
    const totalPlayers = rosters.reduce((s, r) => s + r.player_count, 0);
    if (totalPlayers === 0) {
      droppedLeagues.add(name);
      continue;
    }
    cohort.push(...rosters);
  }
  console.log(`loaded ${raw.length} rosters from cohort.json`);
  if (droppedLeagues.size > 0) {
    console.log(
      `excluded ${droppedLeagues.size} pre-draft leagues (empty rosters): ${[...droppedLeagues].join(", ")}`,
    );
  }
  console.log(`analyzing ${cohort.length} rosters across ${byLeague.size - droppedLeagues.size} leagues`);

  const dist = distByLane(cohort);
  const reportLines: string[] = [];
  reportLines.push("# Lane-Identity Cohort Calibration Report");
  reportLines.push("");
  reportLines.push(`Cohort size: ${cohort.length} rosters across ${new Set(cohort.map((r) => r.league_id)).size} leagues.`);
  reportLines.push("");
  reportLines.push("## Whole-cohort state distribution");
  reportLines.push("");
  reportLines.push(laneTable(dist));
  reportLines.push("");
  reportLines.push("## State distribution by format");
  reportLines.push("");
  reportLines.push(laneTableByFormat(cohort));
  reportLines.push("");
  reportLines.push("## Standings cross-check (IN-rate by win-pct bucket)");
  reportLines.push("");
  reportLines.push("If a lane's IN-rate slopes positively from bottom-quartile to top-quartile, it correlates with team success. Win-now-floor and sustained-contender should slope hard; future-stock can slope either way.");
  reportLines.push("");
  reportLines.push(standingsCrossCheck(cohort));
  reportLines.push("");
  reportLines.push("## Per-lane recommendations");
  reportLines.push("");
  reportLines.push(recommendations(dist, cohort));

  const outPath = resolve(process.cwd(), "cohort-report.md");
  writeFileSync(outPath, reportLines.join("\n"));
  console.log(`wrote report to ${outPath}`);
}

main();
