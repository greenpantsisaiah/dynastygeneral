import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  // Total
  const { count: total } = await supa
    .from("historical_market_values")
    .select("*", { count: "exact", head: true });
  console.log(`historical_market_values total: ${total}`);

  // Distinct sources and formats
  const { data: src } = await supa
    .from("historical_market_values")
    .select("source, format")
    .limit(2000);
  const sf = new Set((src ?? []).map((r) => `${r.source}|${r.format}`));
  console.log("source|format combos:", [...sf]);

  // Distinct dates per (source, format)
  for (const combo of sf) {
    const [source, format] = combo.split("|");
    const { count } = await supa
      .from("historical_market_values")
      .select("*", { count: "exact", head: true })
      .eq("source", source)
      .eq("format", format);
    console.log(`  ${combo}: ${count} rows`);
  }

  // Min/max date for ktc
  const { data: minDate } = await supa
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("source", "ktc")
    .order("snapshot_date", { ascending: true })
    .limit(1);
  const { data: maxDate } = await supa
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("source", "ktc")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  console.log(`KTC date range: ${minDate?.[0]?.snapshot_date} to ${maxDate?.[0]?.snapshot_date}`);
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
