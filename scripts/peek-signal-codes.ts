import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await supa
    .from("historical_signal_codes")
    .select("*")
    .eq("player_id", "6813")
    .eq("prediction_year", 2022);
  console.log(JSON.stringify(data, null, 2));
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
