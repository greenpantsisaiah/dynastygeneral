import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { resolvePlayers } from "../src/lib/players/cache";

async function main() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Total
  const { count: total } = await supa
    .from("historical_market_values")
    .select("*", { count: "exact", head: true });
  console.log(`historical_market_values total: ${total}`);

  // Distinct snapshot dates per year
  for (const year of [2022, 2023, 2024]) {
    const { data: distinct } = await supa
      .from("historical_market_values")
      .select("snapshot_date")
      .gte("snapshot_date", `${year}-01-01`)
      .lte("snapshot_date", `${year}-12-31`);
    const dates = new Set((distinct ?? []).map((r) => r.snapshot_date));
    const { count: rowCount } = await supa
      .from("historical_market_values")
      .select("*", { count: "exact", head: true })
      .gte("snapshot_date", `${year}-01-01`)
      .lte("snapshot_date", `${year}-12-31`);
    console.log(
      `  ${year}: ${dates.size} distinct snapshots, ${rowCount} total rows`,
    );
  }

  // Resolve top 5 names
  const { data: top2022 } = await supa
    .from("historical_market_values")
    .select("player_id, value, overall_rank, position, position_rank")
    .eq("snapshot_date", "2022-08-14")
    .eq("format", "sf")
    .order("overall_rank", { ascending: true })
    .limit(5);
  const ids = (top2022 ?? []).map((r) => r.player_id);
  const playerMap = await resolvePlayers(ids);
  console.log("\ntop-5 SF dynasty 2022-08-14 (Sleeper resolved):");
  for (const r of top2022 ?? []) {
    const p = playerMap.get(r.player_id);
    const name =
      `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ||
      p?.full_name ||
      "(unresolved)";
    console.log(
      `  rank ${r.overall_rank}: ${name} (${r.position}) value=${r.value}`,
    );
  }
}
main();
