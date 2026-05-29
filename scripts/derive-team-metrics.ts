/**
 * Phase B #1 (MODEL_LIVE_PLAN, sig-scheme32): derive the numeric
 * team_signals columns from free nflverse data for the previous
 * completed NFL season (2025, since today is May 2026).
 *
 * Columns this script produces:
 *   - pass_rate_neutral (neutral game-script pass rate; 0..1)
 *   - scheme_pace (offensive plays per regulation game; raw count)
 *   - personnel_12_rate (12-personnel snap share among offensive
 *     pass+rush plays; 0..1)
 *
 * Sources (free, CC-BY-4.0):
 *   - nflverse play_by_play_<season>.csv  (gameplay-level rows;
 *     posteam, play_type, down, qtr, score_differential, etc.)
 *   - nflverse pbp_participation_<season>.csv  (per-play personnel
 *     packages; offense_personnel string e.g. "1 RB, 2 TE, 2 WR")
 *
 * The neutral game-script filter follows the standard definition (down
 * 1 or 2; score differential within +/-10; H2 time remaining > 5 min;
 * regular regular-season plays only; pass_attempt or rush_attempt only).
 * Field naming notes: nflverse pbp uses `pass_attempt` and `rush_attempt`
 * (0/1 flags) which are the cleanest pure-play counters. We also drop
 * QB-spike and QB-kneel plays from the denominator.
 *
 *   # Dry-run (default; fetches data, prints sample, writes nothing):
 *   npx tsx --tsconfig tsconfig.json scripts/derive-team-metrics.ts
 *
 *   # Write JSON for the ingester to read:
 *   npx tsx --tsconfig tsconfig.json scripts/derive-team-metrics.ts \
 *     --season 2025 --out data/team-derived-metrics-2025.json
 *
 * Output is a single JSON document; ingest-team-signals.ts loads it and
 * merges with the LLM-extracted coaching+scheme rows before upserting.
 */
import { config as loadEnv } from "dotenv";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { NFL_TEAMS, type NflTeam } from "../src/lib/signals/schema";

const DEFAULT_SEASON = 2025;

// nflverse posteam codes diverge from Sleeper for the Rams ("LA" vs "LAR").
// Normalize so the join hits our canonical team list.
const POSTEAM_ALIASES: Record<string, NflTeam> = {
  LA: "LAR",
};

function normalizeTeam(raw: string): string {
  return POSTEAM_ALIASES[raw] ?? raw;
}

function parseArgs(argv: readonly string[]): {
  season: number;
  outPath: string;
  pbpCachePath: string | null;
  partCachePath: string | null;
} {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && i + 1 < argv.length) {
      args.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  const season = Number(args.get("season") ?? DEFAULT_SEASON);
  const outPath = args.get("out") ?? `data/team-derived-metrics-${season}.json`;
  return {
    season,
    outPath,
    pbpCachePath: args.get("pbp-cache") ?? null,
    partCachePath: args.get("part-cache") ?? null,
  };
}

/**
 * Minimal CSV parser: handles quoted fields with embedded commas /
 * escaped quotes. Returns header + rows separately so callers can build
 * a column-index map.
 */
function parseCsvHeaderAndRows(text: string): {
  header: string[];
  rows: string[][];
} {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n") {
        row.push(cur);
        cur = "";
        rows.push(row);
        row = [];
      } else if (c === "\r") {
        // skip
      } else cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  if (rows.length === 0) throw new Error("empty CSV");
  const header = rows[0];
  return { header, rows: rows.slice(1) };
}

async function fetchCsv(url: string): Promise<string> {
  console.log(`[derive] fetch ${url}`);
  const resp = await fetch(url);
  if (!resp.ok)
    throw new Error(`fetch failed: ${resp.status} ${resp.statusText} for ${url}`);
  const text = await resp.text();
  console.log(
    `[derive]   got ${(text.length / 1024 / 1024).toFixed(1)} MB`,
  );
  return text;
}

async function loadOrFetch(
  cachePath: string | null,
  url: string,
): Promise<string> {
  if (cachePath && existsSync(cachePath)) {
    console.log(`[derive] using cache: ${cachePath}`);
    return readFileSync(cachePath, "utf8");
  }
  const text = await fetchCsv(url);
  if (cachePath) {
    const dir = dirname(cachePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath, text, "utf8");
    console.log(`[derive] cached: ${cachePath}`);
  }
  return text;
}

type TeamPbpAccum = {
  // Pace (regulation, regular-season, offensive plays only)
  reg_offensive_plays: number;
  reg_games: Set<string>;
  // Neutral pass rate
  neutral_pass_attempts: number;
  neutral_rush_attempts: number;
};

function emptyAccum(): TeamPbpAccum {
  return {
    reg_offensive_plays: 0,
    reg_games: new Set(),
    neutral_pass_attempts: 0,
    neutral_rush_attempts: 0,
  };
}

function buildIdx(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) idx[header[i]] = i;
  return idx;
}

function require(
  idx: Record<string, number>,
  ...cols: string[]
): void {
  const missing = cols.filter((c) => idx[c] == null || idx[c] < 0);
  if (missing.length)
    throw new Error(`CSV missing columns: ${missing.join(", ")}`);
}

function num(s: string | undefined): number | null {
  if (s == null || s === "" || s === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function int01(s: string | undefined): boolean {
  // nflverse encodes 0/1 flags as numeric strings; treat anything not 1
  // as false to be forgiving (some columns appear as "TRUE"/"FALSE").
  if (s == null) return false;
  return s === "1" || s.toLowerCase() === "true";
}

function aggregatePbp(text: string): {
  byTeam: Map<string, TeamPbpAccum>;
  totals: {
    rows: number;
    regular_rows: number;
    plays_kept_neutral: number;
    plays_kept_pace: number;
  };
} {
  console.log(`[derive] parsing pbp CSV...`);
  const { header, rows } = parseCsvHeaderAndRows(text);
  const idx = buildIdx(header);
  require(
    idx,
    "season_type",
    "posteam",
    "qtr",
    "down",
    "score_differential",
    "half_seconds_remaining",
    "pass_attempt",
    "rush_attempt",
    "qb_kneel",
    "qb_spike",
    "play_type",
    "game_id",
  );

  const byTeam = new Map<string, TeamPbpAccum>();
  let regular_rows = 0;
  let plays_kept_neutral = 0;
  let plays_kept_pace = 0;

  for (const r of rows) {
    if (r.length < header.length) continue;
    const season_type = r[idx.season_type];
    if (season_type !== "REG") continue;
    regular_rows++;
    const rawPosteam = r[idx.posteam];
    if (!rawPosteam) continue;
    const posteam = normalizeTeam(rawPosteam);
    const qtr = num(r[idx.qtr]);
    const game_id = r[idx.game_id] ?? "";

    const isPass = int01(r[idx.pass_attempt]);
    const isRush = int01(r[idx.rush_attempt]);
    const isKneel = int01(r[idx.qb_kneel]);
    const isSpike = int01(r[idx.qb_spike]);
    if (isKneel || isSpike) continue;
    if (!isPass && !isRush) continue;

    let team = byTeam.get(posteam);
    if (!team) {
      team = emptyAccum();
      byTeam.set(posteam, team);
    }

    // Pace: regulation only (qtr 1-4), every offensive pass/rush attempt
    if (qtr != null && qtr >= 1 && qtr <= 4) {
      team.reg_offensive_plays++;
      team.reg_games.add(game_id);
      plays_kept_pace++;
    }

    // Neutral pass rate: down 1-2, score diff |x| <= 10, NOT (H2 with <= 5 min left)
    const down = num(r[idx.down]);
    const score_diff = num(r[idx.score_differential]);
    const half_sec = num(r[idx.half_seconds_remaining]);
    if (
      down != null &&
      down >= 1 &&
      down <= 2 &&
      score_diff != null &&
      Math.abs(score_diff) <= 10 &&
      qtr != null &&
      qtr <= 4 &&
      // Exclude H2 final 5 minutes (300s) where late-game tactics distort
      !(qtr >= 3 && half_sec != null && half_sec <= 300)
    ) {
      if (isPass) {
        team.neutral_pass_attempts++;
        plays_kept_neutral++;
      } else if (isRush) {
        team.neutral_rush_attempts++;
        plays_kept_neutral++;
      }
    }
  }
  return {
    byTeam,
    totals: {
      rows: rows.length,
      regular_rows,
      plays_kept_neutral,
      plays_kept_pace,
    },
  };
}

// 12-personnel = 1 RB, 2 TE, 2 WR. nflverse pbp_participation
// offense_personnel strings are normalized to "1 RB, 2 TE, 2 WR" (order
// can be inconsistent across years, so we parse rather than substring-match).
function isPersonnel12(off: string): boolean {
  if (!off) return false;
  const counts: Record<string, number> = {};
  // Split on comma; each piece "N POS" (e.g. " 2 TE")
  for (const part of off.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)\s+([A-Z]+)$/);
    if (!m) continue;
    counts[m[2]] = (counts[m[2]] ?? 0) + Number(m[1]);
  }
  return counts.RB === 1 && counts.TE === 2 && counts.WR === 2;
}

function aggregateParticipation(
  text: string,
  pbpJoin: Map<string, { posteam: string; isOffensivePlay: boolean }>,
): {
  byTeam: Map<string, { personnel_12: number; offensive_plays: number }>;
  totals: { rows: number; matched: number };
} {
  console.log(`[derive] parsing pbp_participation CSV...`);
  const { header, rows } = parseCsvHeaderAndRows(text);
  const idx = buildIdx(header);
  // play_id + game_id forms the join key per nflverse convention. The
  // older column name is "old_game_id"; newer files just use game_id.
  // offense_personnel column ships as "offense_personnel".
  require(idx, "play_id", "offense_personnel");
  const gameIdCol =
    idx.nflverse_game_id != null
      ? "nflverse_game_id"
      : idx.game_id != null
        ? "game_id"
        : idx.old_game_id != null
          ? "old_game_id"
          : null;
  if (!gameIdCol)
    throw new Error(
      "pbp_participation missing game_id / nflverse_game_id / old_game_id column",
    );

  const byTeam = new Map<
    string,
    { personnel_12: number; offensive_plays: number }
  >();
  let matched = 0;
  for (const r of rows) {
    if (r.length < header.length) continue;
    const play_id = r[idx.play_id];
    const game_id = r[idx[gameIdCol]];
    if (!play_id || !game_id) continue;
    const key = `${game_id}:${play_id}`;
    const pbpRow = pbpJoin.get(key);
    if (!pbpRow || !pbpRow.isOffensivePlay) continue;
    matched++;
    const off = r[idx.offense_personnel];
    const team = pbpRow.posteam;
    let acc = byTeam.get(team);
    if (!acc) {
      acc = { personnel_12: 0, offensive_plays: 0 };
      byTeam.set(team, acc);
    }
    acc.offensive_plays++;
    if (isPersonnel12(off)) acc.personnel_12++;
  }
  return { byTeam, totals: { rows: rows.length, matched } };
}

/**
 * Build a join key map from pbp rows so we can attribute participation
 * plays to teams (participation file has no posteam column).
 */
function buildPbpJoin(
  text: string,
): Map<string, { posteam: string; isOffensivePlay: boolean }> {
  const { header, rows } = parseCsvHeaderAndRows(text);
  const idx = buildIdx(header);
  require(
    idx,
    "play_id",
    "game_id",
    "posteam",
    "season_type",
    "pass_attempt",
    "rush_attempt",
  );
  const out = new Map<string, { posteam: string; isOffensivePlay: boolean }>();
  for (const r of rows) {
    if (r.length < header.length) continue;
    if (r[idx.season_type] !== "REG") continue;
    const play_id = r[idx.play_id];
    const game_id = r[idx.game_id];
    const rawPosteam = r[idx.posteam];
    if (!play_id || !game_id || !rawPosteam) continue;
    const posteam = normalizeTeam(rawPosteam);
    const isOff = int01(r[idx.pass_attempt]) || int01(r[idx.rush_attempt]);
    out.set(`${game_id}:${play_id}`, {
      posteam,
      isOffensivePlay: isOff,
    });
  }
  return out;
}

type DerivedTeamMetric = {
  team: NflTeam;
  pass_rate_neutral: number | null;
  scheme_pace: number | null; // offensive plays per regulation game
  personnel_12_rate: number | null;
  sample: {
    neutral_attempts: number;
    regulation_offensive_plays: number;
    regulation_games: number;
    participation_offensive_plays: number;
    participation_personnel_12: number;
  };
};

async function main(): Promise<void> {
  const { season, outPath, pbpCachePath, partCachePath } = parseArgs(
    process.argv.slice(2),
  );
  console.log(`[derive] season=${season} out=${outPath}`);

  const PBP_URL = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv`;
  const PART_URL = `https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_${season}.csv`;

  const pbpText = await loadOrFetch(pbpCachePath, PBP_URL);
  const { byTeam, totals } = aggregatePbp(pbpText);
  console.log(
    `[derive] pbp totals: rows=${totals.rows} reg=${totals.regular_rows} pace_plays=${totals.plays_kept_pace} neutral_plays=${totals.plays_kept_neutral}`,
  );

  const join = buildPbpJoin(pbpText);
  console.log(`[derive] pbp join map size: ${join.size}`);

  let participationByTeam: Map<
    string,
    { personnel_12: number; offensive_plays: number }
  > = new Map();
  try {
    const partText = await loadOrFetch(partCachePath, PART_URL);
    const partAgg = aggregateParticipation(partText, join);
    participationByTeam = partAgg.byTeam;
    console.log(
      `[derive] participation totals: rows=${partAgg.totals.rows} joined=${partAgg.totals.matched}`,
    );
  } catch (err) {
    console.warn(
      `[derive] participation file unavailable or failed; personnel_12_rate will be null (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const results: DerivedTeamMetric[] = [];
  for (const team of NFL_TEAMS) {
    const acc = byTeam.get(team) ?? emptyAccum();
    const partAcc = participationByTeam.get(team) ?? {
      personnel_12: 0,
      offensive_plays: 0,
    };
    const neutralTotal = acc.neutral_pass_attempts + acc.neutral_rush_attempts;
    const passRate = neutralTotal > 0
      ? acc.neutral_pass_attempts / neutralTotal
      : null;
    const games = acc.reg_games.size;
    const pace = games > 0 ? acc.reg_offensive_plays / games : null;
    const p12Rate = partAcc.offensive_plays > 0
      ? partAcc.personnel_12 / partAcc.offensive_plays
      : null;

    results.push({
      team,
      pass_rate_neutral:
        passRate != null ? Math.round(passRate * 10000) / 10000 : null,
      scheme_pace: pace != null ? Math.round(pace * 100) / 100 : null,
      personnel_12_rate:
        p12Rate != null ? Math.round(p12Rate * 10000) / 10000 : null,
      sample: {
        neutral_attempts: neutralTotal,
        regulation_offensive_plays: acc.reg_offensive_plays,
        regulation_games: games,
        participation_offensive_plays: partAcc.offensive_plays,
        participation_personnel_12: partAcc.personnel_12,
      },
    });
  }

  // Sanity reads
  const withPass = results.filter((r) => r.pass_rate_neutral != null);
  const withPace = results.filter((r) => r.scheme_pace != null);
  const withP12 = results.filter((r) => r.personnel_12_rate != null);
  console.log(
    `[derive] coverage: pass=${withPass.length}/32 pace=${withPace.length}/32 personnel_12=${withP12.length}/32`,
  );
  if (withPass.length > 0) {
    const passVals = withPass.map((r) => r.pass_rate_neutral as number).sort();
    const passMin = passVals[0];
    const passMed = passVals[Math.floor(passVals.length / 2)];
    const passMax = passVals[passVals.length - 1];
    console.log(
      `[derive] pass_rate_neutral range: min=${passMin.toFixed(3)} median=${passMed.toFixed(3)} max=${passMax.toFixed(3)}`,
    );
  }
  if (withPace.length > 0) {
    const paceVals = withPace.map((r) => r.scheme_pace as number).sort((a, b) => a - b);
    console.log(
      `[derive] scheme_pace plays/game: min=${paceVals[0].toFixed(1)} median=${paceVals[Math.floor(paceVals.length / 2)].toFixed(1)} max=${paceVals[paceVals.length - 1].toFixed(1)}`,
    );
  }
  if (withP12.length > 0) {
    const vals = withP12.map((r) => r.personnel_12_rate as number).sort((a, b) => a - b);
    console.log(
      `[derive] personnel_12_rate: min=${vals[0].toFixed(3)} median=${vals[Math.floor(vals.length / 2)].toFixed(3)} max=${vals[vals.length - 1].toFixed(3)}`,
    );
  }

  const doc = {
    season,
    generated_at: new Date().toISOString(),
    source: {
      pbp: PBP_URL,
      participation: PART_URL,
      license: "CC-BY-4.0 (nflverse)",
    },
    neutral_filter:
      "season_type=REG, down 1-2, |score_differential|<=10, qtr<=4, exclude H2<=5min, exclude qb_kneel/qb_spike",
    metrics: results,
  };
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(`[derive] wrote ${outPath}`);
}

main().catch((err) => {
  console.error("[derive] fatal:", err);
  process.exit(1);
});
