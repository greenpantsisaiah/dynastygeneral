/**
 * Scrape ESPN team Pass-Block / Run-Block Win Rate (PBWR / RBWR) into the
 * `data/free-ol-grades.json` shape the QB rubric backtest reads via
 * `--ol-file` (the validate-first FREE check, zero DB writes). Phase B6 of
 * MODEL_LIVE_PLAN: a FREE alternative to the licensed PFF OL grades.
 *
 * WHY this exists: PFF OL grades are a paid feed (~$60-120 + manual
 * transcription). Before spending, the founder chose to validate the free
 * ESPN win-rate proxy first. If the QB `--with-ol` backtest shows the ESPN
 * proxy clears the lift bar, the PFF spend is unnecessary; if it does not,
 * the spend is justified (or the OL branch stays unwired for QB).
 *
 * CONSTRUCT CAVEAT (carried into the output + the analysis): ESPN PBWR/RBWR
 * is a WIN-RATE percentage (share of blocks won), NOT PFF's 0..100 charted
 * GRADE. The two correlate but are different constructs. We normalize the
 * win-rate percent to the rubric's 0..1 scale (pct / 100). The QB rubric's
 * `ol_grade_pass` effect is `(grade - 0.5) * 6`, which expects a value
 * centered near 0.5; team PBWR clusters ~0.55-0.70, so the proxy reads as a
 * mild positive tilt for most teams. That shifts the level but preserves
 * the cross-team ORDER, which is all the Spearman backtest scores. Read the
 * backtest as a rank-correlation test of the proxy, not a like-for-like
 * stand-in for the PFF grade scale.
 *
 * ESPN publishes these in annual prose articles with HARDCODED story ids
 * (not a season param) and TWO formats across years:
 *   - 2021, 2022: numbered prose blocks, fixed order
 *     [Pass Rush WR, Run Stop WR, Pass Block WR, Run Block WR]. Blocks 3
 *     and 4 are PBWR / RBWR.
 *   - 2023, 2024: HTML <table>; select the table whose header carries both
 *     PBWR and RBWR (the team table; the others are player leaderboards).
 *
 * No API key. ESPN's bot filter returns HTTP 202 with an empty body to
 * Node's fetch (it fingerprints at the TLS/HTTP-2 layer, which a UA header
 * does not disguise), but serves the real 200 HTML to curl. So this script
 * shells out to curl, which is present on macOS / CI by default.
 *
 *   # Default: scrape 2021-2024, write data/free-ol-grades.json
 *   npx tsx --tsconfig tsconfig.json scripts/scrape-espn-block-winrate.ts
 *
 *   # Specific seasons + custom out path
 *   npx tsx --tsconfig tsconfig.json scripts/scrape-espn-block-winrate.ts \
 *     --seasons 2022,2023 --out data/free-ol-grades.json
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Hardcoded ESPN story URLs per season (the id cannot be derived).
const ARTICLE_URL: Record<string, string> = {
  "2021":
    "https://www.espn.com/nfl/story/_/id/32176833/2021-nfl-pass-rushing-run-stopping-blocking-leaderboard-win-rate-rankings",
  "2022":
    "https://www.espn.com/nfl/story/_/id/34536376/2022-nfl-pass-rushing-run-stopping-blocking-leaderboard-win-rate-rankings-top-players-teams",
  "2023":
    "https://www.espn.com/nfl/story/_/id/38356170/2023-nfl-pass-rush-run-stop-blocking-win-rate-rankings-top-players-teams",
  "2024":
    "https://www.espn.com/nfl/story/_/id/41040723/2024-nfl-win-rates-top-teams-players-rankings",
};
const TABLE_FORMAT_SEASONS = new Set(["2023", "2024"]);

// ESPN team full name (and historical variants) -> abbreviation matching
// NFL_TEAMS / nflverse keys. 2021 still used "Washington Football Team".
const NAME_TO_ABBR: Record<string, string> = {
  "arizona cardinals": "ARI",
  "atlanta falcons": "ATL",
  "baltimore ravens": "BAL",
  "buffalo bills": "BUF",
  "carolina panthers": "CAR",
  "chicago bears": "CHI",
  "cincinnati bengals": "CIN",
  "cleveland browns": "CLE",
  "dallas cowboys": "DAL",
  "denver broncos": "DEN",
  "detroit lions": "DET",
  "green bay packers": "GB",
  "houston texans": "HOU",
  "indianapolis colts": "IND",
  "jacksonville jaguars": "JAX",
  "kansas city chiefs": "KC",
  "los angeles chargers": "LAC",
  "los angeles rams": "LAR",
  "las vegas raiders": "LV",
  "miami dolphins": "MIA",
  "minnesota vikings": "MIN",
  "new england patriots": "NE",
  "new orleans saints": "NO",
  "new york giants": "NYG",
  "new york jets": "NYJ",
  "philadelphia eagles": "PHI",
  "pittsburgh steelers": "PIT",
  "seattle seahawks": "SEA",
  "san francisco 49ers": "SF",
  "tampa bay buccaneers": "TB",
  "tennessee titans": "TEN",
  "washington commanders": "WAS",
  "washington football team": "WAS",
  "washington redskins": "WAS",
};

type OlRow = {
  team: string;
  season: number;
  ol_grade_run: number | null; // RBWR normalized 0..1
  ol_grade_pass: number | null; // PBWR normalized 0..1
};

function abbrFor(name: string): string | null {
  return NAME_TO_ABBR[name.trim().toLowerCase()] ?? null;
}

/** "60% (16)" / "53%" -> 0.60 / 0.53; null if no percent present. */
function pctToUnit(cell: string): number | null {
  const m = cell.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const pct = Number(m[1]);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return Number((pct / 100).toFixed(4));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function fetchArticle(season: string): string {
  const url = ARTICLE_URL[season];
  if (!url) throw new Error(`No ESPN article URL mapped for season ${season}`);
  // curl gets a real 200; Node fetch gets a 202 challenge (see header note).
  // The short generic UA gets a 200; a spoofed full-Chrome UA gets a 0-byte
  // block from ESPN's filter (verified). Counterintuitive, but stable.
  // Retry on transient curl timeouts (28); the articles are ~150-170KB.
  let html = "";
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      html = execFileSync(
        "curl",
        ["-sSL", "--max-time", "90", "--retry", "2", "-A", "Mozilla/5.0", url],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
      if (html && html.length >= 1000) break;
    } catch (e) {
      lastErr = e as Error;
    }
  }
  if (!html || html.length < 1000) {
    throw new Error(
      `ESPN ${season} fetch returned ${html?.length ?? 0} bytes via curl after retries${lastErr ? ` (${lastErr.message.slice(0, 80)})` : ""}.`,
    );
  }
  return html;
}

/** Table years (2023+): the team table is the one with PBWR AND RBWR headers. */
function parseTableFormat(html: string, season: string): OlRow[] {
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/g) ?? [];
  for (const t of tables) {
    const headerHtml = t.split("</thead>")[0] ?? t;
    const headers = (headerHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/g) ?? []).map(
      (h) => stripTags(h),
    );
    if (!(headers.includes("PBWR") && headers.includes("RBWR"))) continue;
    // The team table header is [team, PRWR, RSWR, PBWR, RBWR]; the player
    // tables carry a "Name" column, so this header check excludes them.
    const pbwrIdx = headers.indexOf("PBWR");
    const rbwrIdx = headers.indexOf("RBWR");
    const teamIdx = headers.findIndex((h) => h.toLowerCase() === "team");
    const body = t.split("</thead>").pop() ?? "";
    const rows = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
    const out: OlRow[] = [];
    for (const r of rows) {
      const cells = (r.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? []).map((c) =>
        stripTags(c),
      );
      if (cells.length <= Math.max(pbwrIdx, rbwrIdx, teamIdx)) continue;
      const abbr = abbrFor(cells[teamIdx]);
      if (!abbr) continue;
      out.push({
        team: abbr,
        season: Number(season),
        ol_grade_pass: pctToUnit(cells[pbwrIdx]),
        ol_grade_run: pctToUnit(cells[rbwrIdx]),
      });
    }
    return out;
  }
  return [];
}

/**
 * Prose years (2021-2022): four numbered team blocks in fixed order
 * [Pass Rush, Run Stop, Pass Block, Run Block]. We take block 3 (PBWR) and
 * block 4 (RBWR). Each block is one <p> whose lines read
 * "1. Team Name, 53%".
 */
function parseProseFormat(html: string, season: string): OlRow[] {
  const paras = html.match(/<p[^>]*>([\s\S]*?)<\/p>/g) ?? [];
  const blocks: Map<string, number>[] = [];
  for (const p of paras) {
    const txt = stripTags(p);
    if (!/^\s*1\.\s/.test(txt) || !txt.includes("%")) continue;
    const teamPct = new Map<string, number>();
    for (const line of txt.split(/\n|(?=\d+\.\s)/)) {
      // "12. Los Angeles Rams, 53%"
      const m = line.match(/^\s*\d+\.\s*(.+?),\s*(\d+(?:\.\d+)?)\s*%/);
      if (!m) continue;
      const abbr = abbrFor(m[1]);
      const unit = pctToUnit(`${m[2]}%`);
      if (abbr && unit != null) teamPct.set(abbr, unit);
    }
    if (teamPct.size >= 20) blocks.push(teamPct); // a real 32-team block
  }
  // Fixed order: [0]=Pass Rush, [1]=Run Stop, [2]=Pass Block, [3]=Run Block.
  if (blocks.length < 4) {
    throw new Error(
      `ESPN ${season} prose parse found ${blocks.length} team blocks (expected 4: PRWR, RSWR, PBWR, RBWR). Article format may have changed.`,
    );
  }
  const pbwr = blocks[2];
  const rbwr = blocks[3];
  const teams = new Set([...pbwr.keys(), ...rbwr.keys()]);
  const out: OlRow[] = [];
  for (const team of teams) {
    out.push({
      team,
      season: Number(season),
      ol_grade_pass: pbwr.get(team) ?? null,
      ol_grade_run: rbwr.get(team) ?? null,
    });
  }
  return out;
}

function parseArgs(argv: readonly string[]): { seasons: string[]; out: string } {
  let seasons = ["2021", "2022", "2023", "2024"];
  let out = "data/free-ol-grades.json";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--seasons" && argv[i + 1]) {
      seasons = argv[i + 1].split(",").map((s) => s.trim());
      i++;
    } else if (argv[i] === "--out" && argv[i + 1]) {
      out = argv[i + 1];
      i++;
    }
  }
  return { seasons, out };
}

async function main(): Promise<void> {
  const { seasons, out } = parseArgs(process.argv.slice(2));
  console.log(
    `[espn-ol] scraping seasons=${seasons.join(",")} -> ${out}\n` +
      `[espn-ol] NOTE: ESPN PBWR/RBWR is a WIN-RATE %, not a PFF 0..100 grade. ` +
      `Normalized pct/100 to the 0..1 rubric scale. Validate as a rank proxy.`,
  );
  const all: OlRow[] = [];
  for (const season of seasons) {
    try {
      const html = fetchArticle(season);
      const rows = TABLE_FORMAT_SEASONS.has(season)
        ? parseTableFormat(html, season)
        : parseProseFormat(html, season);
      const withPass = rows.filter((r) => r.ol_grade_pass != null).length;
      if (rows.length < 28) {
        console.warn(
          `[espn-ol] ${season}: only ${rows.length} teams parsed (expected ~32). Inspect the article; not writing a partial season would skew the join.`,
        );
      }
      console.log(
        `[espn-ol] ${season}: ${rows.length} teams (${withPass} with PBWR). ` +
          `sample: ${rows
            .slice(0, 3)
            .map((r) => `${r.team} pass=${r.ol_grade_pass} run=${r.ol_grade_run}`)
            .join(", ")}`,
      );
      all.push(...rows);
    } catch (e) {
      // Fail-loud per season; one bad season does not poison the others.
      console.error(
        `[espn-ol] ${season} FAILED: ${(e as Error).message}. Skipping this season.`,
      );
    }
  }
  if (all.length === 0) {
    console.error("[espn-ol] no rows scraped; not writing an empty file.");
    process.exit(1);
  }
  const outPath = resolve(process.cwd(), out);
  writeFileSync(outPath, JSON.stringify(all, null, 2));
  console.log(`[espn-ol] wrote ${all.length} team-season rows to ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
