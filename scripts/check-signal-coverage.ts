import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  for (const year of [2022, 2023, 2024]) {
    const { data } = await supa
      .from("historical_signal_codes")
      .select("player_id")
      .eq("prediction_year", year)
      .limit(50000);
    const ids = new Set((data ?? []).map((r) => r.player_id as string));
    console.log(`${year}: ${ids.size} unique players coded`);
  }
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
