/**
 * One-time corrective: consolidate the split Rams rows in team_signals.
 *
 * The earlier `ingest-player-signals` ol pass stored the Rams under the
 * nflverse code "LA" (ol_continuity_score only). Sleeper, and therefore the
 * live rubric lookup (`teamSignalsMap.get(player.team)`), uses "LAR" (verified:
 * 94 Rams players carry "LAR", there is no "LA" code in Sleeper). So the "LA"
 * row was already unreachable by the product; the Phase B #1 ingest wrote the
 * reachable "LAR" row (coaching + scheme + rates) but, being a fresh insert,
 * it has no ol_continuity_score.
 *
 * This script migrates any column the "LA" row has populated but the "LAR"
 * row is missing (ol_continuity_score and the OL companions), merges the
 * matching source_attribution entries, then deletes the orphan "LA" row.
 * After it runs, "LAR" carries both the coaching/scheme signals and the
 * ol_continuity_score, and team_signals returns to 32 rows.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/fix-rams-team-signals.ts
 *     (dry-run; prints the plan, writes nothing)
 *   npx tsx --tsconfig tsconfig.json scripts/fix-rams-team-signals.ts --write
 *     (applies the UPDATE on LAR + DELETE of LA; service-role key required)
 *
 * Idempotent: if "LA" is already gone, it reports nothing to do.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

const ORPHAN = "LA";
const CANONICAL = "LAR";
// Columns the orphan row may own that the canonical row could be missing.
const OL_COLUMNS = [
  "ol_continuity_score",
  "ol_grade_run",
  "ol_grade_pass",
  "rookie_ol_starters_count",
  "rookie_ol_position_breakdown",
] as const;

function parseArgs(argv: string[]): { write: boolean } {
  return { write: argv.includes("--write") };
}

async function main() {
  const { write } = parseArgs(process.argv.slice(2));
  console.log(`[fix-rams] mode: ${write ? "WRITE" : "DRY-RUN"}`);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Missing Supabase env vars");

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await sb
    .from("team_signals")
    .select("*")
    .in("team", [ORPHAN, CANONICAL]);
  if (error) throw new Error(`read failed: ${error.message}`);

  const rows = (data ?? []) as Record<string, unknown>[];
  const orphan = rows.find((r) => r.team === ORPHAN) ?? null;
  const canonical = rows.find((r) => r.team === CANONICAL) ?? null;

  if (!orphan) {
    console.log(`[fix-rams] no "${ORPHAN}" row present. Nothing to do.`);
    return;
  }
  if (!canonical) {
    throw new Error(
      `"${CANONICAL}" row missing; refusing to delete "${ORPHAN}" without a canonical target. Run the Phase B #1 ingest first.`,
    );
  }

  // Build the patch: only fields the orphan has and the canonical lacks.
  const patch: Record<string, unknown> = {};
  const movedAttribution: Record<string, unknown> = {};
  const orphanAttr = (orphan.source_attribution ?? {}) as Record<string, unknown>;
  const canonAttr = (canonical.source_attribution ?? {}) as Record<string, unknown>;
  for (const col of OL_COLUMNS) {
    const oVal = orphan[col];
    const cVal = canonical[col];
    const orphanHas =
      oVal != null && !(typeof oVal === "object" && Object.keys(oVal as object).length === 0);
    const canonMissing =
      cVal == null || (typeof cVal === "object" && Object.keys(cVal as object).length === 0);
    if (orphanHas && canonMissing) {
      patch[col] = oVal;
      if (orphanAttr[col] != null) movedAttribution[col] = orphanAttr[col];
    }
  }

  console.log(`[fix-rams] "${ORPHAN}" ol_continuity_score=${orphan.ol_continuity_score}`);
  console.log(`[fix-rams] "${CANONICAL}" ol_continuity_score=${canonical.ol_continuity_score} scheme_tag=${canonical.scheme_tag}`);
  console.log(`[fix-rams] columns to migrate ${ORPHAN} -> ${CANONICAL}:`, Object.keys(patch).length ? patch : "(none)");

  if (!write) {
    console.log(`\n[fix-rams] DRY-RUN. Would UPDATE ${CANONICAL} with the patch above (merging ${Object.keys(movedAttribution).length} attribution entries) and DELETE ${ORPHAN}.`);
    console.log("Re-run with --write to apply.");
    return;
  }

  if (Object.keys(patch).length > 0) {
    const mergedAttr = { ...canonAttr, ...movedAttribution };
    const { error: upErr } = await sb
      .from("team_signals")
      .update({ ...patch, source_attribution: mergedAttr })
      .eq("team", CANONICAL);
    if (upErr) throw new Error(`update ${CANONICAL} failed: ${upErr.message}`);
    console.log(`[fix-rams] updated ${CANONICAL} with ${Object.keys(patch).join(", ")}`);
  }

  const { error: delErr } = await sb.from("team_signals").delete().eq("team", ORPHAN);
  if (delErr) throw new Error(`delete ${ORPHAN} failed: ${delErr.message}`);
  console.log(`[fix-rams] deleted orphan "${ORPHAN}" row. DONE.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
