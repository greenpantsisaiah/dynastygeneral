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
  const { count } = await supa
    .from("historical_outcomes")
    .select("*", { count: "exact", head: true });
  console.log(`historical_outcomes total: ${count}`);

  for (const s of [2022, 2023, 2024]) {
    const { count: c } = await supa
      .from("historical_outcomes")
      .select("*", { count: "exact", head: true })
      .eq("season", s);
    console.log(`  ${s}: ${c} rows`);
  }

  const { data: top2024 } = await supa
    .from("historical_outcomes")
    .select("player_id, ppr_points, games_played")
    .eq("season", 2024)
    .order("ppr_points", { ascending: false })
    .limit(5);
  const ids = (top2024 ?? []).map((r) => r.player_id);
  const playerMap = await resolvePlayers(ids);
  console.log("\ntop-5 PPR producers in 2024:");
  for (const r of top2024 ?? []) {
    const p = playerMap.get(r.player_id);
    const name =
      `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ||
      p?.full_name ||
      "(unresolved)";
    console.log(
      `  ${name} (${p?.position ?? "?"}): ${r.ppr_points?.toFixed(1)} pts in ${r.games_played} g`,
    );
  }
}
main();
