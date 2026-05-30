/**
 * Ingest WR / TE route participation into production `player_signals`
 * (`route_participation_prior_year`). Phase B #3 of MODEL_LIVE_PLAN.md.
 *
 * Route participation is the well-established free proxy: the share of
 * his team's dropbacks a receiver was on the field for, from nflverse
 * pbp_participation (CC-BY-4.0). It is computed by the ONE canonical
 * `buildRouteParticipation` in src/lib/signals/nflverse.ts, the same
 * function the WR / TE backtest reads per-season, so the live value and
 * the backtested value cannot drift.
 *
 * Sources (free + redistributable):
 *   - nflverse pbp_participation_<season>.csv (CC-BY-4.0): per-play
 *     on-field player lists + a dropback marker (time_to_throw).
 *   - DynastyProcess crosswalk db_playerids.csv (GPL-3.0): gsis_id <->
 *     sleeper_id.
 *
 * Writes (production Supabase, service-role; only with --write):
 *   - player_signals.route_participation_prior_year (0..1, the latest
 *     COMPLETED season's rate; this is the "prior year" relative to the
 *     upcoming season, matching how snap_share_prior_year is named)
 *   - player_signals.position           (WR / TE, ensures classifiable)
 *   - player_signals.team               (the player's primary team that
 *                                        season; only set when absent)
 *   - player_signals.source_attribution (per-field source + license)
 *   - player_signals.confidence_per_field
 *   - player_signals.last_updated, updated_by
 *
 * Upsert is keyed on player_id (Sleeper id); only the columns this
 * script sets are touched. The default season is the latest one with a
 * pbp_participation file; override with --season=YYYY.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-route-participation.ts
 *     (default dry-run; prints the plan, writes nothing)
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-route-participation.ts --write
 *     (actually writes; service-role key required; FOUNDER-AUTHORIZED)
 *
 * Re-runnable (upsert, not insert). Players with route data but no
 * crosswalk Sleeper id are dropped inside buildRouteParticipation (it
 * keys on the crosswalk), so any join gap is reflected in the resolved
 * count printed below, never silent.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import {
  loadCrosswalk,
  buildRouteParticipation,
  type RouteParticipation,
} from "../src/lib/signals/nflverse";

const CHUNK = 500;
// pbp_participation availability window (nflverse releases). The script
// probes downward from the latest until a file resolves.
const SEASON_CANDIDATES = [2025, 2024, 2023, 2022, 2021];

function parseArgs(argv: string[]): { write: boolean; season: number | null } {
  let write = false;
  let season: number | null = null;
  for (const a of argv) {
    if (a === "--write") write = true;
    const m = a.match(/^--season=(\d{4})$/);
    if (m) season = Number(m[1]);
  }
  return { write, season };
}

async function resolveLatestSeason(): Promise<number> {
  for (const y of SEASON_CANDIDATES) {
    const url = `https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_${y}.csv`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return y;
    } catch {
      /* try the next */
    }
  }
  throw new Error("no pbp_participation file resolved in the candidate window");
}

type Row = {
  player_id: string;
  position: string;
  team: string | null;
  route_participation_prior_year: number;
  source_attribution: Record<string, unknown>;
  confidence_per_field: Record<string, string>;
  last_updated: string;
  updated_by: string;
};

function buildRows(routes: Map<string, RouteParticipation>, season: number): Row[] {
  const now = new Date().toISOString();
  const updatedBy = `ingest-route-participation@${now.slice(0, 10)}`;
  const out: Row[] = [];
  for (const [sleeper, rp] of routes) {
    out.push({
      player_id: sleeper,
      position: rp.position,
      team: rp.team,
      route_participation_prior_year: rp.route_rate,
      source_attribution: {
        route_participation_prior_year: {
          source: "nflverse/pbp_participation",
          license: "CC-BY-4.0",
          season,
          method:
            "dropback plays on field (time_to_throw non-null) / team dropbacks in those games; WR/TE only; min 100 team dropbacks",
          fetched_at: now,
        },
      },
      confidence_per_field: { route_participation_prior_year: "partial" },
      last_updated: now,
      updated_by: updatedBy,
    });
  }
  return out;
}

async function main() {
  const { write, season: seasonArg } = parseArgs(process.argv.slice(2));
  console.log(
    `[route] mode: ${write ? "WRITE (production Supabase)" : "DRY-RUN (no writes)"}`,
  );

  if (write) {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("Missing Supabase env vars; aborting --write");
    }
  }

  const season = seasonArg ?? (await resolveLatestSeason());
  console.log(`[route] season: ${season} (the latest completed season)`);

  const xwalk = await loadCrosswalk();
  console.log(`[route] crosswalk: ${xwalk.gsisToSleeper.size} gsis->sleeper ids`);

  const routes = await buildRouteParticipation(String(season), xwalk);
  if (routes.size === 0) {
    throw new Error(
      `buildRouteParticipation returned 0 rows for ${season}; the season file may be absent or the crosswalk failed`,
    );
  }

  const rows = buildRows(routes, season);
  const wr = rows.filter((r) => r.position === "WR").length;
  const te = rows.filter((r) => r.position === "TE").length;
  console.log(
    `[route] rows to upsert: ${rows.length} (WR: ${wr}, TE: ${te})`,
  );

  // Sample for review: highest + lowest route rates (sanity check the
  // shape; the top should be known full-time receivers).
  const sorted = [...rows].sort(
    (a, b) =>
      b.route_participation_prior_year - a.route_participation_prior_year,
  );
  const sample = [...sorted.slice(0, 5), ...sorted.slice(-3)];
  const nameBy = xwalk.nameBySleeper;
  console.log("\n[route] sample (top 5 + bottom 3 by route rate):");
  for (const r of sample) {
    console.log(
      `  ${r.player_id} ${r.position} ${nameBy.get(r.player_id) ?? "?"}: ${(
        r.route_participation_prior_year * 100
      ).toFixed(1)}% (team ${r.team})`,
    );
  }

  if (!write) {
    console.log("\n[route] DRY-RUN complete. No writes performed.");
    console.log("Re-run with --write to perform the upsert (founder-authorized).");
    return;
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  console.log(`\n[route] writing ${rows.length} rows in chunks of ${CHUNK}...`);
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await sb
      .from("player_signals")
      .upsert(chunk, { onConflict: "player_id" });
    if (error) {
      console.error(`[route] chunk ${i / CHUNK} upsert error:`, error.message);
      process.exit(1);
    }
    written += chunk.length;
    if ((i / CHUNK) % 4 === 0) console.log(`  written ${written}/${rows.length}`);
  }
  console.log(`[route] DONE. ${written} rows upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
