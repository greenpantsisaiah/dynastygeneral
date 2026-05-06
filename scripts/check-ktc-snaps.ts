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
    .eq("format", "1qb")
    .order("snapshot_date");
  const dates = Array.from(new Set((data ?? []).map((r) => r.snapshot_date as string)));
  console.log("KTC 1qb snapshot dates:");
  for (const d of dates) console.log(`  ${d}`);
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
