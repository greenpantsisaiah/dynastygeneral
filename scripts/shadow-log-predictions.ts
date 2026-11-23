/**
 * Weekly shadow logger for the prediction ledger (`prediction_log`,
 * migration 0019). Logs value_decay@v1 for the top 400 players by value.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/shadow-log-predictions.ts
 *     (default dry-run: prints row count + 5 samples, writes nothing)
 *   npx tsx --tsconfig tsconfig.json scripts/shadow-log-predictions.ts --write
 *     (inserts via the admin client; requires migration 0019 applied,
 *      which needs Isaiah's approval)
 *
 * Idempotent per UTC day: already-logged subjects are skipped, and the
 * unique index on prediction_log backstops a race.
 *
 * Value path: the cohort is ranked from the FantasyCalc dataset
 * (getPlayerValues, not the banned resolvePlayerValues call), then the
 * value that gets logged is read through the value seam
 * (scoringValueByIds) and age through the EnrichedPlayer resolver.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { getPlayerValues } from "../src/lib/players/values";
import { scoringValueByIds } from "../src/lib/players/value-mode";
import { resolveEnrichedPlayers } from "../src/lib/players/enriched-player";
import {
  buildValueDecayShadowRows,
  VALUE_DECAY_TOP_N,
  type ValueDecayInput,
} from "../src/lib/predictions/ledger";

const CHUNK = 200;

async function main() {
  const write = process.argv.includes("--write");
  // Default league format: 1QB, PPR (the dataset the shadow cohort uses).
  const entry = await getPlayerValues({ numQbs: 1, ppr: 1 });
  const topIds = [...entry.byPlayerId.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, VALUE_DECAY_TOP_N)
    .map((v) => v.player_id);

  const { valueById, valueMap } = await scoringValueByIds({
    ids: topIds,
    valueMap: entry.byPlayerId,
    isSuperflex: false,
    isPpr: true,
    isHalfPpr: false,
  });
  const enriched = await resolveEnrichedPlayers({
    playerIds: topIds,
    valueMap,
  });

  const values: ValueDecayInput[] = [];
  for (const id of topIds) {
    const e = enriched.get(id);
    const value = valueById[id];
    if (!e || value == null) continue;
    values.push({
      player_id: id,
      position: e.position,
      age: e.age,
      value,
      name: e.name,
    });
  }

  const rows = buildValueDecayShadowRows({ values, loggedAt: new Date() });
  console.log(`value_decay@v1 rows: ${rows.length} (of ${topIds.length} ranked)`);
  for (const r of rows.slice(0, 5)) console.log(JSON.stringify(r));

  if (!write) {
    console.log("dry-run: nothing written. Pass --write to insert.");
    return;
  }
  const { getAdminClient } = await import("../src/lib/supabase/admin");
  const sb = getAdminClient();
  // The daily-unique index is an expression index, which upsert onConflict
  // cannot target, so skip today's already-logged subjects up front.
  const dayStart = new Date(rows[0]?.logged_at ?? Date.now());
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: existing, error: selErr } = await sb
    .from("prediction_log")
    .select("subject_id")
    .eq("prediction_type", "value_decay@v1")
    .eq("subject_kind", "player")
    .is("league_id", null)
    .gte("logged_at", dayStart.toISOString());
  if (selErr) throw new Error(`select failed: ${selErr.message}`);
  const done = new Set((existing ?? []).map((r: { subject_id: string }) => r.subject_id));
  const fresh = rows.filter((r) => !done.has(r.subject_id));
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const chunk = fresh.slice(i, i + CHUNK);
    const { error } = await sb.from("prediction_log").insert(chunk);
    if (error) throw new Error(`insert failed: ${error.message}`);
    inserted += chunk.length;
  }
  console.log(`inserted ${inserted} rows`);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.message}\n${err.stack}` : err);
  process.exit(1);
});
