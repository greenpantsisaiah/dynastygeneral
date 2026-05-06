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
  console.log(`historical_signal_codes total: ${count}`);
  if (count && count > 0) {
    const { data } = await supa
      .from("historical_signal_codes")
      .select("signal_name, prediction_year, coded_by, player_id")
      .limit(5);
    console.log("sample rows:", data);
  }
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
