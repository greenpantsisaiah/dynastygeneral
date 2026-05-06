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
    for (const fmt of ["sf", "1qb"]) {
      const { data } = await supa
        .from("historical_market_values")
        .select("snapshot_date")
        .eq("source", "ktc")
        .eq("format", fmt)
        .gte("snapshot_date", `${year}-06-01`)
        .lte("snapshot_date", `${year}-09-30`)
        .limit(50000);
      const dates = Array.from(new Set((data ?? []).map((r) => r.snapshot_date as string)));
      console.log(`${year} ${fmt}: ${dates.length} distinct dates: ${dates.slice(0, 5).join(", ")}`);
    }
  }
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
