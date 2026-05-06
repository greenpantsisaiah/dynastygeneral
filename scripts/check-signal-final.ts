import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { count } = await supa
    .from("historical_signal_codes")
    .select("*", { count: "exact", head: true });
  console.log("total:", count);
  const { data } = await supa
    .from("historical_signal_codes")
    .select("player_id, prediction_year, signal_name")
    .limit(50000);
  console.log("rows:", data?.length);
  const ids = new Set((data ?? []).map((r) => `${r.player_id}|${r.prediction_year}|${r.signal_name}`));
  console.log("unique combos:", ids.size);
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
