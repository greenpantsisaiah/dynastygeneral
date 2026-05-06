/**
 * Phase 2 v1 pipeline orchestrator. Runs:
 *   1. engine:historical --with-signals for the target (season, format)
 *   2. score:dynasty against the v1 engine output
 *   3. scoreboard:build to refresh the published CSV
 *
 * Use this after `extract:signals --year YYYY --execute` has populated
 * `historical_signal_codes` for the season. Without signal codes, this
 * still runs but engine output will be identical to v0 nosignals.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.json scripts/run-v1-pipeline.ts \
 *     --season 2022 --format 1qb [--top 200]
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import { spawnSync } from "node:child_process";

type Args = {
  season: number;
  format: "1qb" | "sf";
  topN: number;
};

function parseArgs(argv: readonly string[]): Args {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && i + 1 < argv.length) {
      m.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  if (!m.get("season")) throw new Error("--season required");
  return {
    season: Number(m.get("season")!),
    format: (m.get("format") ?? "1qb") as "1qb" | "sf",
    topN: Number(m.get("top") ?? 200),
  };
}

function runStep(label: string, args: string[]): void {
  console.log(`\n[pipeline] ${label}`);
  console.log(`  $ npx tsx --tsconfig tsconfig.json ${args.join(" ")}`);
  const result = spawnSync(
    "npx",
    ["tsx", "--tsconfig", "tsconfig.json", ...args],
    { stdio: "inherit", encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(`[pipeline] step failed: ${label} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  const { season, format, topN } = parseArgs(process.argv.slice(2));
  console.log(
    `[pipeline] v1 run: season=${season} format=${format} top=${topN}`,
  );

  // Step 1: run engine with signals
  runStep("Engine with signals", [
    "scripts/run-engine-historical.ts",
    "--season",
    String(season),
    "--format",
    format,
    "--top",
    String(topN),
    "--with-signals",
  ]);

  // Step 2: score against actuals using dynasty loss
  runStep("Score dynasty (v1 with signals)", [
    "scripts/backtest-score-dynasty.ts",
    "--source",
    "dynasty_general_v0_signals",
    "--season",
    String(season),
    "--format",
    format,
    "--top",
    "100",
    "--write",
  ]);

  // Step 3: rebuild the scoreboard CSV
  runStep("Rebuild scoreboard CSV", ["scripts/build-scoreboard.ts"]);

  console.log(
    `\n[pipeline] DONE for season=${season} format=${format}. Check data/scoreboard/scoreboard_v1.csv for the updated row.`,
  );
}

main();
