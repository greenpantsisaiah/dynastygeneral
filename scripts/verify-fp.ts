import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { resolvePlayers } from "../src/lib/players/cache";

async function main(): Promise<void> {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { count: total } = await supa
    .from("historical_consensus_rankings")
    .select("*", { count: "exact", head: true });
  console.log(`historical_consensus_rankings total: ${total}`);

  // Per-source counts
  const sources = [
    "fantasypros_ecr",
    "fantasypros_adp",
    "fantasypros_top20draft2024",
  ];
  for (const src of sources) {
    const { count } = await supa
      .from("historical_consensus_rankings")
      .select("*", { count: "exact", head: true })
      .eq("source", src);
    console.log(`  source=${src}: ${count} rows`);
  }

  // Per-snapshot/format spot-check: show top-5 of FP ECR 1qb for each year
  const checkpoints: Array<{ date: string; format: string; label: string }> = [
    { date: "2022-08-15", format: "1qb", label: "ECR 1QB 2022" },
    { date: "2023-08-15", format: "1qb", label: "ECR 1QB 2023" },
    { date: "2024-08-15", format: "1qb", label: "ECR 1QB 2024" },
    { date: "2024-08-15", format: "sf", label: "ECR SF 2024" },
    { date: "2026-05-05", format: "1qb", label: "ECR 1QB current" },
  ];
  for (const cp of checkpoints) {
    const { data: top5 } = await supa
      .from("historical_consensus_rankings")
      .select("player_id, rank, position, position_rank")
      .eq("source", "fantasypros_ecr")
      .eq("snapshot_date", cp.date)
      .eq("format", cp.format)
      .order("rank", { ascending: true })
      .limit(5);
    const ids = (top5 ?? []).map((r) => r.player_id);
    const playerMap = await resolvePlayers(ids);
    console.log(`\n${cp.label} (${cp.date}, ${cp.format}):`);
    for (const r of top5 ?? []) {
      const p = playerMap.get(r.player_id);
      const name =
        `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ||
        p?.full_name ||
        "(unresolved)";
      console.log(
        `  rank ${r.rank}: ${name} (${r.position}${r.position_rank ?? ""})`,
      );
    }
  }
}

main().catch((err) => {
  console.error("verify-fp fatal:", err);
  process.exit(1);
});
