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
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("source", "ktc")
    .eq("format", "sf")
    .gte("snapshot_date", "2023-01-01")
    .lte("snapshot_date", "2023-12-31")
    .limit(50000);
  const dates = Array.from(new Set((data ?? []).map((r) => r.snapshot_date as string))).sort();
  console.log(`2023 SF dates (${dates.length}):`);
  for (const d of dates) console.log(`  ${d}`);
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
