import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { error, count } = await supa
    .from("historical_consensus_rankings")
    .delete({ count: "exact" })
    .like("source", "fantasypros_%");
  console.log("deleted:", count, "error:", error?.message ?? "none");
}

main().catch((e) => {
  console.error("fatal", e);
  process.exit(1);
});
