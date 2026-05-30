/**
 * Phase B6 free-alternative check (sig-ol-grade): derive a FREE offensive-
 * line proxy per (team, season) from nflverse play-by-play, in the same
 * shape scripts/ingest-pff-ol-grades.ts reads. This is the "try free
 * first" path: if this proxy lifts the QB rubric over the market, we
 * never need to pay for PFF.
 *
 * Source: nflverse-data pbp releases (CC-BY-4.0, free). One pass per
 * season, streamed so the ~100MB file never fully buffers; only the few
 * columns we need are kept.
 *
 * Two team-season metrics, both percentile-normalized to 0..1 (the scale
 * the rubrics read; same convention as normalizePffGrade):
 *   - ol_grade_pass = inverse sack rate allowed (sacks / dropbacks),
 *     percentile-ranked across the league that season. Higher = better
 *     protection. This is the QB rubric's actual OL branch.
 *   - ol_grade_run  = yards per rush attempt, percentile-ranked. Higher =
 *     better run blocking (a coarse proxy; true adjusted-line-yards needs
 *     yards-before-contact, which pbp does not carry). Emitted for
 *     completeness / future RB use; QB does not read it.
 *
 * These are PROXIES, not PFF charting grades. Sack rate conflates OL with
 * QB time-to-throw and scramble tendency; YPC conflates OL with the back.
 * That is exactly why we backtest: a proxy that does not lift is the
 * money-saving signal that the cheap version is not good enough (or that
 * OL is not where the QB lift is).
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/derive-free-ol-grades.ts \
 *     --seasons 2021,2022,2023,2024 --out data/free-ol-grades.json
 *
 * Output is JSON the ingest script consumes with --already-normalized.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const NFLVERSE =
  "https://github.com/nflverse/nflverse-data/releases/download";

type Args = { seasons: number[]; out: string };
function parseArgs(argv: readonly string[]): Args {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && i + 1 < argv.length) {
      m.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  const seasons = (m.get("seasons") ?? "2021,2022,2023,2024")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));
  return { seasons, out: m.get("out") ?? "data/free-ol-grades.json" };
}

type TeamAgg = {
  dropbacks: number;
  sacks: number;
  rushAtt: number;
  rushYds: number;
};

/** Split one CSV line, respecting double-quoted fields (pbp has them). */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Stream one season's pbp, aggregating only the needed columns per team. */
async function aggregateSeason(season: number): Promise<Map<string, TeamAgg>> {
  const url = `${NFLVERSE}/pbp/play_by_play_${season}.csv`;
  const res = await fetch(url, { headers: { accept: "text/csv" } });
  if (!res.ok || !res.body) throw new Error(`${url} -> ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let header: string[] | null = null;
  let idx: Record<string, number> = {};
  const teams = new Map<string, TeamAgg>();

  const handleLine = (line: string) => {
    if (!line) return;
    if (!header) {
      header = splitCsv(line);
      for (let i = 0; i < header.length; i++) idx[header[i]] = i;
      return;
    }
    const c = splitCsv(line);
    const seasonType = c[idx["season_type"]];
    if (seasonType !== "REG") return;
    const team = c[idx["posteam"]];
    if (!team || team === "NA") return;
    const agg =
      teams.get(team) ?? { dropbacks: 0, sacks: 0, rushAtt: 0, rushYds: 0 };
    const dropback = c[idx["qb_dropback"]] === "1";
    const sack = c[idx["sack"]] === "1";
    const rushAtt = c[idx["rush_attempt"]] === "1";
    const ry = Number(c[idx["rushing_yards"]]);
    if (dropback) {
      agg.dropbacks++;
      if (sack) agg.sacks++;
    }
    if (rushAtt) {
      agg.rushAtt++;
      if (Number.isFinite(ry)) agg.rushYds += ry;
    }
    teams.set(team, agg);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      handleLine(buf.slice(0, nl).replace(/\r$/, ""));
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
    }
    if (done) {
      handleLine(buf.replace(/\r$/, ""));
      break;
    }
  }
  return teams;
}

/** Percentile-rank a value within a list, 0..1 (higher input -> higher). */
function pctRank(values: number[], v: number): number {
  const n = values.length;
  if (n <= 1) return 0.5;
  let below = 0;
  for (const x of values) if (x < v) below++;
  return Number((below / (n - 1)).toFixed(4));
}

async function main() {
  const { seasons, out } = parseArgs(process.argv.slice(2));
  console.log("=== free OL-proxy derivation (nflverse pbp, CC-BY) ===");
  const rows: {
    team: string;
    season: number;
    ol_grade_run: number;
    ol_grade_pass: number;
  }[] = [];

  for (const season of seasons) {
    process.stdout.write(`  ${season}: fetching + aggregating pbp ... `);
    const teams = await aggregateSeason(season);
    // sack rate (lower = better) and YPC (higher = better) per team.
    const entries = [...teams.entries()].filter(
      ([, a]) => a.dropbacks >= 50 && a.rushAtt >= 50,
    );
    const protect = entries.map(
      ([, a]) => 1 - a.sacks / a.dropbacks, // inverse sack rate
    );
    const runEff = entries.map(([, a]) => a.rushYds / a.rushAtt);
    for (let i = 0; i < entries.length; i++) {
      const [team] = entries[i];
      rows.push({
        team,
        season,
        ol_grade_pass: pctRank(protect, protect[i]),
        ol_grade_run: pctRank(runEff, runEff[i]),
      });
    }
    console.log(`${entries.length} teams`);
  }

  const path = resolve(process.cwd(), out);
  writeFileSync(path, JSON.stringify(rows, null, 2));
  console.log(
    `\nWrote ${rows.length} team-season rows to ${out} (normalized 0..1).`,
  );
  console.log(
    `Feed to the ingest with: npx tsx --tsconfig tsconfig.json scripts/ingest-pff-ol-grades.ts --file ${out} --already-normalized\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
