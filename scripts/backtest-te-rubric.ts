/**
 * TE rubric backtest. Read-only. Does the TE rubric grade TEs better than
 * the market prior (KTC)?
 *
 * Phase B sig-history upgrade: runs the cohort twice per year (A4 baseline
 * with no team signals, then rubric + historical scheme) and prints both
 * lifts plus the scheme marginal. The TE rubric's team branches are
 * personnel_12_rate, oc_tenure_yrs, and oc_first_year_with_team_flag. One
 * data path via runPositionBacktest; outcome = realized season-Y PPR PPG;
 * decision years 2023 + 2024.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backtest-te-rubric.ts
 *
 * Before team_signals_history is ingested the two rubric columns are
 * identical and the harness says so.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });
import { createClient } from "@supabase/supabase-js";
import { runPositionBacktest } from "../src/lib/signals/position-backtest";
import { evaluateTe } from "../src/lib/engine/evaluation";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await runPositionBacktest({ sb, position: "TE", evaluate: evaluateTe });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
