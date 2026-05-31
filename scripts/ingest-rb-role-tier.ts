/**
 * Ingest the WINNING rb_role_tier source into player_signals. Phase B2 of
 * MODEL_LIVE_PLAN.
 *
 * The B2 bake-off (scripts/backtest-rb-tier-bakeoff.ts) compared two tier
 * sources as the RB-rubric hard gate:
 *   - SNAP-DERIVED (deriveRbRoleTier over prior-season nflverse usage)
 *   - LLM-CODED    (historical-signal-extractor, vintage-blinded)
 * The snap-derived source won (it never ranks worse than the LLM tier, the
 * paired head-to-head CI straddles zero, and it covers the full pool). The
 * LLM tier is recorded as a negative result; see the PR body. This script
 * therefore (re)derives and upserts the SNAP-DERIVED tier, the source the
 * production RB rubric already reads.
 *
 * `rb_role_tier` is a HARD GATE: committee_member / starter_uncertain caps
 * the RB rubric at 60. So the column has to stay fresh per completed
 * season. This script derives it from the latest completed NFL season's
 * realized usage (snap / rush / target share) and writes ONLY that column
 * plus its attribution, leaving every other player_signals column intact.
 *
 * Pattern matches scripts/ingest-unlock-signals.ts: dry-run default,
 * explicit --write, chunked upsert on player_id, per-field source
 * attribution. The production write is FOUNDER-AUTHORIZED: dry-run first,
 * surface the sample + distribution, then the founder green-lights --write.
 *
 *   # Dry-run (default; derives + prints, writes nothing):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-rb-role-tier.ts
 *
 *   # Specific season (default: latest completed):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-rb-role-tier.ts --season 2025
 *
 *   # Execute (FOUNDER-AUTHORIZED, writes production player_signals):
 *   npx tsx --tsconfig tsconfig.json scripts/ingest-rb-role-tier.ts --write
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { loadCrosswalk, buildSeasonSignals } from "../src/lib/signals/nflverse";
import type { RbRoleTier } from "../src/lib/signals/schema";

const CHUNK = 200;
// Most recent COMPLETED NFL season. The 2025 regular season finished in
// Jan 2026; this is the realized-usage vintage the live gate reads.
const DEFAULT_SEASON = "2025";

function parseArgs(argv: string[]): { write: boolean; season: string } {
  let write = false;
  let season = DEFAULT_SEASON;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--write") write = true;
    else if (argv[i] === "--season" && argv[i + 1]) {
      season = argv[i + 1];
      i++;
    }
  }
  return { write, season };
}

type TierRow = {
  player_id: string;
  position: string;
  rb_role_tier: RbRoleTier;
  source_attribution: Record<string, unknown>;
  confidence_per_field: Record<string, string>;
  last_updated: string;
  updated_by: string;
};

async function main(): Promise<void> {
  const { write, season } = parseArgs(process.argv.slice(2));
  const mode = write ? "WRITE (founder-authorized)" : "dry-run";
  console.log(`[rb-tier] season=${season} mode=${mode}`);

  if (write) {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      throw new Error("Missing Supabase env vars; aborting --write");
    }
  }

  const xwalk = await loadCrosswalk();
  const { players } = await buildSeasonSignals(season, xwalk);

  // Stamp ISO date without Date (forbidden in tooling); derive from season.
  const updatedBy = `ingest-rb-role-tier@snap-derived:${season}`;
  const rows: TierRow[] = [];
  const dist: Record<string, number> = {};
  for (const p of players.values()) {
    if ((p.position ?? "").toUpperCase() !== "RB") continue;
    const tier = p.rb_role_tier;
    if (!tier) continue;
    dist[tier] = (dist[tier] ?? 0) + 1;
    rows.push({
      player_id: p.player_id,
      position: "RB",
      rb_role_tier: tier,
      source_attribution: {
        rb_role_tier: {
          source: "nflverse snap_counts + stats_player (CC-BY-4.0)",
          method: "deriveRbRoleTier(snap/rush/target share)",
          season,
        },
      },
      confidence_per_field: {
        // A real snap share => validated; null snap => starter_uncertain
        // is a derived default, flagged partial so consumers know.
        rb_role_tier:
          p.snap_share_prior_year != null ? "validated" : "partial",
      },
      last_updated: `${season}-season-final`,
      updated_by: updatedBy,
    });
  }

  console.log(
    `[rb-tier] derived rb_role_tier for ${rows.length} RBs from season ${season}`,
  );
  console.log(`[rb-tier] tier distribution: ${JSON.stringify(dist)}`);

  // Sample for review: one per tier where available.
  const seen = new Set<string>();
  console.log("\n[rb-tier] sample (one per tier):");
  for (const r of rows) {
    if (seen.has(r.rb_role_tier)) continue;
    seen.add(r.rb_role_tier);
    const name = xwalk.nameBySleeper.get(r.player_id) ?? r.player_id;
    console.log(
      `  ${name} (${r.player_id}): ${r.rb_role_tier} [${r.confidence_per_field.rb_role_tier}]`,
    );
  }

  if (!write) {
    console.log("\n[rb-tier] DRY-RUN complete. No writes performed.");
    console.log(
      "Re-run with --write (FOUNDER-AUTHORIZED) to upsert rb_role_tier into player_signals.",
    );
    return;
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  console.log(`\n[rb-tier] writing ${rows.length} rows in chunks of ${CHUNK}...`);
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    // Cast around generated types: player_signals jsonb columns are typed
    // loosely; same workaround as ingest-unlock-signals.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any)
      .from("player_signals")
      .upsert(chunk, { onConflict: "player_id" });
    if (error) {
      console.error(`[rb-tier] chunk ${i / CHUNK} upsert error:`, error.message);
      process.exit(1);
    }
    written += chunk.length;
    if ((i / CHUNK) % 4 === 0)
      console.log(`  written ${written}/${rows.length}`);
  }
  console.log(`[rb-tier] DONE. ${written} rows upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
