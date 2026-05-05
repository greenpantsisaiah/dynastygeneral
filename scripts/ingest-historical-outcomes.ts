/**
 * Historical season outcomes ingest. The "what actually happened"
 * data we score backtest predictions against. Per VALIDATION_PLAN
 * section 5: actual season PPR / half-PPR / standard fantasy points
 * per player per season, plus games played.
 *
 * Source: Sleeper's `/stats/nfl/{season}?season_type=regular` endpoint
 * (free, no auth, schema known via `lib/players/season-stats.ts`).
 * Decided 2026-05-05 over nflfastR parquet ingestion because Sleeper
 * already returns PPR/half/std/gp at the season-total grain we need
 * and the schema is already validated in production code.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-historical-outcomes.ts \
 *     --seasons 2022,2023,2024 [--dry-run]
 *
 * Idempotent: writes are inserts to historical_outcomes (one row per
 * (player_id, season, week=null)); if you re-run it will create
 * duplicate rows, so don't re-run without first DELETE-ing the rows
 * you want to replace. (Future: convert to upsert keyed on
 * (player_id, season, week).)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { getSeasonStats } from "../src/lib/players/season-stats";

function parseArgs(argv: readonly string[]): {
  seasons: string[];
  dryRun: boolean;
} {
  const args = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--") && i + 1 < argv.length) {
      args.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  const seasonsArg = args.get("seasons") ?? "2022,2023,2024";
  return {
    seasons: seasonsArg.split(",").map((s) => s.trim()).filter(Boolean),
    dryRun,
  };
}

type OutcomeRow = {
  player_id: string;
  season: number;
  week: number | null;
  ppr_points: number | null;
  half_ppr_points: number | null;
  std_points: number | null;
  games_played: number | null;
  source: string;
  raw_attributes: Record<string, unknown>;
};

async function main(): Promise<void> {
  const { seasons, dryRun } = parseArgs(process.argv.slice(2));
  console.log(
    `[outcomes] seasons: ${seasons.join(", ")} ${dryRun ? "(dry-run)" : ""}`,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!supabaseUrl || !serviceKey)) {
    throw new Error("Missing Supabase env vars; aborting non-dry-run");
  }
  const supabase =
    !dryRun && supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey)
      : null;

  let totalRows = 0;

  for (const season of seasons) {
    console.log(`[outcomes] ${season}: fetching season stats...`);
    const byPlayerId = await getSeasonStats(season);
    if (byPlayerId.size === 0) {
      console.warn(`[outcomes] ${season}: no data returned, skipping`);
      continue;
    }

    const rows: OutcomeRow[] = [];
    for (const [player_id, stats] of byPlayerId.entries()) {
      // Filter team-aggregate rows. Sleeper's /stats endpoint returns
      // entries for both players AND teams; team rows have player_id
      // like "BUF" or "KC" (alpha) while real player IDs are numeric
      // strings. Without this filter, team rows top the PPR leaderboard
      // (~1900 pts in 17 games) and corrupt downstream aggregations.
      if (!/^\d+$/.test(player_id)) continue;
      // Only write rows where the player actually has SOME fantasy
      // production. Skip rows that are entirely null (Sleeper returns
      // an entry per ~5000 players many of whom didn't play).
      if (
        stats.pts_ppr == null &&
        stats.pts_half_ppr == null &&
        stats.pts_std == null
      ) {
        continue;
      }
      rows.push({
        player_id,
        season: Number(season),
        week: null, // season totals
        ppr_points: stats.pts_ppr,
        half_ppr_points: stats.pts_half_ppr,
        std_points: stats.pts_std,
        games_played: stats.games_played,
        source: "sleeper",
        raw_attributes: {},
      });
    }
    console.log(
      `[outcomes] ${season}: ${rows.length} rows queued (from ${byPlayerId.size} entries returned by Sleeper)`,
    );

    if (!dryRun && supabase && rows.length > 0) {
      // Insert in chunks of 500 to keep the request size reasonable.
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("historical_outcomes")
          .insert(chunk);
        if (error) {
          console.error(
            `[outcomes] ${season} chunk ${i / CHUNK} insert error:`,
            error.message,
          );
        }
      }
    }

    totalRows += rows.length;
  }

  console.log(`[outcomes] DONE. total rows=${totalRows}`);
}

main().catch((err) => {
  console.error("[outcomes] fatal:", err);
  process.exit(1);
});
