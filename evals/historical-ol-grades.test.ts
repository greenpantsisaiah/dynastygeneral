/**
 * Historical OL-grade loader regression (Phase B6, sig-ol-grade).
 *
 *   npx tsx --tsconfig tsconfig.json evals/historical-ol-grades.test.ts
 *
 * Locks the vintage-blinding + normalization + team-keying contract the
 * QB backtest's --with-ol pass depends on. Pure: the loader is exercised
 * against a stub Supabase query so no DB is touched. The bug class this
 * guards: a backtest that reads OL grades coded AFTER preseason Y (a
 * temporal leak), or that silently passes through PFF's native 0..100
 * scale into a rubric branch that expects 0..1 centered at 0.5.
 */
import {
  coerceGrade,
  loadHistoricalOlGrades,
  normalizePffGrade,
  normalizeTeam,
  olMapFromRows,
  OL_GRADE_PASS_SIGNAL,
  OL_GRADE_RUN_SIGNAL,
} from "../src/lib/signals/historical-ol-grades";

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

type CodeRow = {
  team: string | null;
  signal_name: string;
  signal_value: unknown;
  coded_with_knowledge_through: string | null;
};

/**
 * Minimal stub of the chained Supabase query the loader uses:
 *   .from(t).select(c).eq("prediction_year", y).in("signal_name", names)
 * Returns the seeded rows regardless of the filter chain; the loader's
 * own vintage filter is what we are testing.
 */
function stubClient(rows: CodeRow[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => Promise.resolve({ data: rows, error: null }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => builder } as any;
}

async function run() {
  console.log("\n── normalizePffGrade ──");
  check("82.4 -> 0.824", normalizePffGrade(82.4) === 0.824);
  check("0 -> 0", normalizePffGrade(0) === 0);
  check("100 -> 1", normalizePffGrade(100) === 1);
  check("null -> null", normalizePffGrade(null) === null);
  check("out of range (101) -> null", normalizePffGrade(101) === null);
  check("negative -> null", normalizePffGrade(-1) === null);

  console.log("\n── coerceGrade ──");
  check("bare number in range", coerceGrade(0.78) === 0.78);
  check("object-wrapped { value }", coerceGrade({ value: 0.72 }) === 0.72);
  check("numeric string", coerceGrade("0.69") === 0.69);
  check("out-of-range 0..1 rejected (1.2)", coerceGrade(1.2) === null);
  check("native 0..100 leak rejected (78)", coerceGrade(78) === null);
  check("garbage -> null", coerceGrade("abc") === null);

  console.log("\n── loadHistoricalOlGrades: team keying ──");
  const map = await loadHistoricalOlGrades(
    stubClient([
      {
        team: "phi",
        signal_name: OL_GRADE_RUN_SIGNAL,
        signal_value: { value: 0.82 },
        coded_with_knowledge_through: "2024-09-15",
      },
      {
        team: "PHI",
        signal_name: OL_GRADE_PASS_SIGNAL,
        signal_value: 0.78,
        coded_with_knowledge_through: "2024-09-15",
      },
    ]),
    2024,
    "2024-09-15",
  );
  const phi = map.get("PHI");
  check(
    "lower/upper team keys merge to one upper-cased entry",
    map.size === 1 && phi?.ol_grade_run === 0.82 && phi?.ol_grade_pass === 0.78,
    phi ? `run=${phi.ol_grade_run} pass=${phi.ol_grade_pass}` : "missing",
  );

  console.log("\n── loadHistoricalOlGrades: vintage blinding ──");
  const blinded = await loadHistoricalOlGrades(
    stubClient([
      {
        // Knowable in time: coded as of preseason 2024.
        team: "SF",
        signal_name: OL_GRADE_PASS_SIGNAL,
        signal_value: { value: 0.74 },
        coded_with_knowledge_through: "2024-09-01",
      },
      {
        // LEAK: coded with knowledge through end of 2024, after the cutoff.
        team: "KC",
        signal_name: OL_GRADE_PASS_SIGNAL,
        signal_value: { value: 0.9 },
        coded_with_knowledge_through: "2024-12-31",
      },
      {
        // No vintage at all: cannot prove it was knowable, drop under blinding.
        team: "DAL",
        signal_name: OL_GRADE_PASS_SIGNAL,
        signal_value: { value: 0.66 },
        coded_with_knowledge_through: null,
      },
    ]),
    2024,
    "2024-09-15",
  );
  check(
    "in-time row kept",
    blinded.get("SF")?.ol_grade_pass === 0.74,
  );
  check("post-cutoff leak dropped", !blinded.has("KC"));
  check("null-vintage row dropped under blinding", !blinded.has("DAL"));
  check("blinded map has exactly the one in-time team", blinded.size === 1);

  console.log("\n── loadHistoricalOlGrades: no vintage filter (snapshot read) ──");
  const unblinded = await loadHistoricalOlGrades(
    stubClient([
      {
        team: "KC",
        signal_name: OL_GRADE_PASS_SIGNAL,
        signal_value: { value: 0.9 },
        coded_with_knowledge_through: "2024-12-31",
      },
    ]),
    2024,
  );
  check(
    "omitting the cutoff keeps every row (no blinding)",
    unblinded.get("KC")?.ol_grade_pass === 0.9,
  );

  console.log("\n── loadHistoricalOlGrades: empty result ──");
  const empty = await loadHistoricalOlGrades(stubClient([]), 2023, "2023-09-15");
  check("no rows -> empty map (honest no-data path)", empty.size === 0);

  console.log("\n── normalizeTeam (legacy aliases) ──");
  check("LA -> LAR", normalizeTeam("LA") === "LAR");
  check("OAK -> LV", normalizeTeam("oak") === "LV");
  check("plain team passes through", normalizeTeam("phi") === "PHI");

  console.log("\n── olMapFromRows (FREE-check file path) ──");
  const fileRows = [
    { team: "LA", season: 2022, ol_grade_run: 0.4, ol_grade_pass: 0.32 },
    { team: "PHI", season: 2022, ol_grade_run: 0.9, ol_grade_pass: 0.84 },
    { team: "PHI", season: 2023, ol_grade_run: 0.7, ol_grade_pass: 0.71 },
  ];
  // season-S enriches decision year S+1, so 2023 reads only season-2022 rows.
  const m2023 = olMapFromRows(fileRows, 2023);
  check(
    "2023 decision reads season-2022 rows, LA aliased to LAR",
    m2023.size === 2 &&
      m2023.get("LAR")?.ol_grade_pass === 0.32 &&
      m2023.get("PHI")?.ol_grade_pass === 0.84,
  );
  const m2024 = olMapFromRows(fileRows, 2024);
  check(
    "2024 decision reads season-2023 rows only",
    m2024.size === 1 && m2024.get("PHI")?.ol_grade_pass === 0.71,
  );

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
