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
  const { data } = await supa
    .from("historical_signal_codes")
    .select("player_id, prediction_year, signal_name")
    .limit(50000);
  const map = new Map<string, Map<number, Set<string>>>();
  for (const r of data ?? []) {
    const pid = r.player_id as string;
    const yr = r.prediction_year as number;
    if (!map.has(pid)) map.set(pid, new Map());
    const m = map.get(pid)!;
    if (!m.has(yr)) m.set(yr, new Set());
    m.get(yr)!.add(r.signal_name as string);
  }
  const ids = Array.from(map.keys());
  const players = await resolvePlayers(ids);
  for (const [pid, ymap] of map) {
    const p = players.get(pid);
    const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : pid;
    for (const [yr, sigs] of ymap) {
      console.log(`  ${name.padEnd(28)} (${pid}) year=${yr} signals=${sigs.size}`);
    }
  }
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
