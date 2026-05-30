/**
 * Season-aware team-signals reader regression (Phase B sig-history).
 *
 *   npx tsx --tsconfig tsconfig.json evals/team-signals-history.test.ts
 *
 * Locks getTeamSignalsHistoryForSeason (the backtest-path reader over
 * team_signals_history). Verifies it (1) filters by the requested season,
 * (2) maps coaching/scheme columns onto the live TeamSignalsRow shape, (3)
 * leaves OL/rookie columns null (they are not in the history table), (4)
 * defaults staff_novelty_composite to 0, and (5) degrades to an empty map
 * on a read error rather than throwing (so a pre-ingest backtest reduces
 * cleanly to the A4 market+age path). Uses a fake Supabase client, not a
 * live connection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTeamSignalsHistoryForSeason } from "../src/lib/signals/team-signals-history";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` (${detail})` : ""}`);
  }
}

type Row = Record<string, unknown>;

// Minimal fake of the chained query the reader uses:
// sb.from(table).select(cols).eq(col, val) -> { data, error }.
function fakeClient(args: {
  rowsBySeason: Map<number, Row[]>;
  error?: string;
}): SupabaseClient {
  return {
    from() {
      return {
        select() {
          return {
            eq(_col: string, season: number) {
              if (args.error) return { data: null, error: { message: args.error } };
              return { data: args.rowsBySeason.get(season) ?? [], error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

async function run() {
  console.log("\n── getTeamSignalsHistoryForSeason ──");

  const rows2023: Row[] = [
    {
      team: "SF",
      season: 2023,
      hc_id: "kyle-shanahan",
      hc_first_time_flag: false,
      hc_tenure_yrs: 7,
      hc_background_tag: "offensive_coordinator",
      oc_id: "kyle-shanahan",
      oc_tenure_yrs: 7,
      oc_first_year_with_team_flag: false,
      scheme_tag: "shanahan",
      staff_novelty_composite: 0,
      scheme_pace: 64.2,
      pass_rate_neutral: 0.512,
      personnel_12_rate: 0.31,
    },
    {
      team: "CAR",
      season: 2023,
      hc_id: "frank-reich",
      hc_first_time_flag: false,
      hc_tenure_yrs: 1,
      hc_background_tag: "other",
      oc_id: "thomas-brown",
      oc_tenure_yrs: 1,
      oc_first_year_with_team_flag: true,
      scheme_tag: "pro_style",
      staff_novelty_composite: 3,
      scheme_pace: null,
      pass_rate_neutral: null,
      personnel_12_rate: null,
    },
  ];
  const rows2024: Row[] = [
    {
      team: "SF",
      season: 2024,
      hc_id: "kyle-shanahan",
      // staff_novelty_composite intentionally omitted -> should default 0
      scheme_tag: "shanahan",
      oc_first_year_with_team_flag: false,
    },
  ];

  const sb = fakeClient({
    rowsBySeason: new Map([
      [2023, rows2023],
      [2024, rows2024],
    ]),
  });

  const m2023 = await getTeamSignalsHistoryForSeason(sb, 2023);
  check("returns one row per team for the season", m2023.size === 2, `size=${m2023.size}`);

  const sf = m2023.get("SF");
  check("maps scheme_tag", sf?.scheme_tag === "shanahan", sf?.scheme_tag ?? "null");
  check("maps oc_tenure_yrs", sf?.oc_tenure_yrs === 7, String(sf?.oc_tenure_yrs));
  check(
    "maps derived pbp rates",
    sf?.pass_rate_neutral === 0.512 && sf?.personnel_12_rate === 0.31,
    `pass=${sf?.pass_rate_neutral} p12=${sf?.personnel_12_rate}`,
  );
  check(
    "OL columns absent from history -> null on the live shape",
    sf?.ol_continuity_score === null &&
      sf?.ol_grade_pass === null &&
      sf?.ol_grade_run === null &&
      sf?.rookie_ol_starters_count === 0,
  );

  const car = m2023.get("CAR");
  check(
    "first-year coordinator flag + novelty preserved",
    car?.oc_first_year_with_team_flag === true && car?.staff_novelty_composite === 3,
    `oc_first=${car?.oc_first_year_with_team_flag} novelty=${car?.staff_novelty_composite}`,
  );
  check(
    "null derived rates stay null (honest absence)",
    car?.pass_rate_neutral === null && car?.scheme_pace === null,
  );

  // Season filter: 2024 returns only the SF 2024 row, not the 2023 rows.
  const m2024 = await getTeamSignalsHistoryForSeason(sb, 2024);
  check("season filter isolates the requested year", m2024.size === 1, `size=${m2024.size}`);
  check(
    "missing staff_novelty_composite defaults to 0",
    m2024.get("SF")?.staff_novelty_composite === 0,
    String(m2024.get("SF")?.staff_novelty_composite),
  );

  // Empty season -> empty map (pre-ingest path).
  const mEmpty = await getTeamSignalsHistoryForSeason(sb, 2099);
  check("unknown season -> empty map (A4 fallback)", mEmpty.size === 0);

  // Read error -> empty map, not a throw.
  const sbErr = fakeClient({ rowsBySeason: new Map(), error: "boom" });
  const mErr = await getTeamSignalsHistoryForSeason(sbErr, 2023);
  check("read error -> empty map, no throw", mErr.size === 0);

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
