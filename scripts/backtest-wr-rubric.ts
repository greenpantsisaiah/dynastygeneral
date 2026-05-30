/**
 * WR rubric backtest. Read-only. Does feeding the WR rubric the signals we
 * can ingest (age curve, prior-year usage, and now the per-season team
 * coaching/scheme row from team_signals_history) grade WRs BETTER than the
 * market prior (KTC) alone?
 *
 * Phase B sig-history upgrade: this now runs the cohort twice per year (A4
 * baseline with no team signals, then rubric + historical scheme) and
 * prints both lifts plus the scheme marginal, so the scheme signal's effect
 * is isolated. One data path via runPositionBacktest; outcome = realized
 * season-Y PPR PPG; decision years 2023 + 2024.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-wr-rubric.ts
 *
 * Before team_signals_history is ingested the two rubric columns are
 * identical and the harness says so. After the founder-authorized ingest,
 * re-run to read the real scheme marginal.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { runPositionBacktest } from "../src/lib/signals/position-backtest";
import { evaluateWr } from "../src/lib/engine/evaluation";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await runPositionBacktest({ sb, position: "WR", evaluate: evaluateWr });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
