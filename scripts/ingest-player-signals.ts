/**
 * Phase 3 ingestion: fill player_signals + team_signals from nflverse,
 * joined to Sleeper player_ids via the DynastyProcess crosswalk. The
 * fetch/join/compute lives in src/lib/signals/nflverse.ts (shared with
 * the backtest). This script is the thin write wrapper.
 *
 * See DATA_ACQUISITION_PHASE3.md. Fills usage shares, snap share, draft
 * pick, a combine-derived athletic composite, height/weight, team OL
 * continuity, AND the derived rb_role_tier the RB rubric actually reads.
 *
 * SAFETY: dry-run by default. Writes to production Supabase ONLY with
 * --execute. Upsert (keyed on PK), re-runnable.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-player-signals.ts --season=2025
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-player-signals.ts --season=2025 --execute
 *
 * Data: nflverse-data releases (CC-BY-4.0), DynastyProcess db_playerids.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import {
  SKILL,
  loadCrosswalk,
  fetchSleeperActiveIds,
  buildSeasonSignals,
} from "../src/lib/signals/nflverse";

const EXECUTE = process.argv.includes("--execute");
const seasonArg = process.argv
  .find((a) => a.startsWith("--season="))
  ?.split("=")[1];
const SEASON = seasonArg ?? String(new Date().getFullYear() - 1);

async function main() {
  console.log(
    `\nPhase 3 player-signals ingestion · season ${SEASON} · ${
      EXECUTE ? "EXECUTE (writes prod)" : "DRY RUN (no writes)"
    }\n`,
  );

  const xwalk = await loadCrosswalk();
  console.log(
    `crosswalk: gsis map ${xwalk.gsisToSleeper.size}, pfr map ${xwalk.pfrToSleeper.size}`,
  );
  const activeIds = await fetchSleeperActiveIds();
  console.log(`sleeper active players: ${activeIds.size}`);

  const { players, teams } = await buildSeasonSignals(SEASON, xwalk);
  console.log(`computed: ${players.size} players, ${teams.size} teams`);

  const attribution = {
    source: "nflverse",
    license: "CC-BY-4.0",
    crosswalk: "dynastyprocess/db_playerids",
    season: SEASON,
    ingested_at: new Date().toISOString(),
  };

  const playerPayload = [...players.values()]
    .filter((r) => {
      if (!SKILL.has((r.position ?? "").toUpperCase())) return false;
      if (activeIds.size > 0 && !activeIds.has(r.player_id)) return false;
      return (
        r.snap_share_prior_year != null ||
        r.target_share_prior_year != null ||
        r.rush_share_prior_year != null ||
        r.rb_role_tier != null ||
        r.draft_round != null ||
        r.ras != null ||
        r.height_in != null
      );
    })
    .map((r) => ({
      player_id: r.player_id,
      position: r.position,
      team: r.team,
      snap_share_prior_year: r.snap_share_prior_year,
      target_share_prior_year: r.target_share_prior_year,
      rush_share_prior_year: r.rush_share_prior_year,
      rb_role_tier: r.rb_role_tier,
      draft_round: r.draft_round,
      draft_pick_no: r.draft_pick_no,
      ras: r.ras,
      weight_lb: r.weight_lb,
      height_in: r.height_in,
      source_attribution: attribution,
      updated_by: "ingest-player-signals",
    }));
  const teamPayload = [...teams.values()].map((r) => ({
    team: r.team,
    ol_continuity_score: r.ol_continuity_score,
    source_attribution: attribution,
    updated_by: "ingest-player-signals",
  }));

  const rbTiers = playerPayload.filter((r) => r.rb_role_tier != null).length;
  console.log(
    `\nWOULD UPSERT: ${playerPayload.length} player_signals (${rbTiers} with rb_role_tier), ${teamPayload.length} team_signals`,
  );
  console.log("\nsample RBs with derived role tier:");
  for (const r of playerPayload.filter((r) => r.rb_role_tier).slice(0, 6)) {
    console.log(
      `  ${xwalk.nameBySleeper.get(r.player_id) ?? r.player_id} [${r.team}] snap=${r.snap_share_prior_year ?? "-"} rush=${r.rush_share_prior_year ?? "-"} -> ${r.rb_role_tier}`,
    );
  }

  if (!EXECUTE) {
    console.log("\nDRY RUN complete. No writes. Re-run with --execute.\n");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars; aborting write.");
  const supabase = createClient(url, key);
  const chunk = <T>(a: T[], n: number) =>
    Array.from({ length: Math.ceil(a.length / n) }, (_, i) =>
      a.slice(i * n, i * n + n),
    );
  for (const c of chunk(playerPayload, 500)) {
    const { error } = await supabase
      .from("player_signals")
      .upsert(c, { onConflict: "player_id" });
    if (error) throw new Error(`player_signals upsert: ${error.message}`);
  }
  for (const c of chunk(teamPayload, 500)) {
    const { error } = await supabase
      .from("team_signals")
      .upsert(c, { onConflict: "team" });
    if (error) throw new Error(`team_signals upsert: ${error.message}`);
  }
  console.log(
    `\nWROTE ${playerPayload.length} player_signals + ${teamPayload.length} team_signals.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
