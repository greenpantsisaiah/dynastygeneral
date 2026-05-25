/**
 * Inflection-scorecard calibration regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/inflection.test.ts
 *
 * Locks two trust fixes from the 2026-05-23 founder report ("all the
 * 'data missing' words make me think it's a bug"):
 *
 *   1. A data_missing signal never inflates the validated / partial /
 *      weak counts. The per-row badge and the header summary must agree:
 *      a blind row is DATA MISSING, not VALIDATED. (The contradiction the
 *      founder saw was "[VALIDATED] Workload trend ... data missing".)
 *
 *   2. A mostly-blind card is flagged prior_driven with a non-empty
 *      calibration_note, so a 64/36 split built from one live signal does
 *      not read as evidence-backed. A card with more live signals does not
 *      raise the prior_driven caveat.
 *
 * Tests the production hub path: resolveInflectionWindow with the inputs
 * the snapshot builder supplies, AND buildInflectionsFromSnapshot's
 * threading of prior-season usage (Sleeper /stats carries/targets) into
 * the workload-trend signal (plumbed 2026-05-23).
 */

import { resolveInflectionWindow } from "../src/lib/engine/inflection/resolve";
import type { InflectionInputs } from "../src/lib/engine/inflection/types";
import { buildInflectionsFromSnapshot } from "../src/lib/engine/inflection/from-snapshot";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { SleeperPlayer } from "../src/lib/sleeper/schemas";
import type { PlayerSeasonStats } from "../src/lib/players/season-stats";

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

function baseInputs(overrides: Partial<InflectionInputs>): InflectionInputs {
  return {
    player_id: "p1",
    player_name: "Test Player",
    position: "RB",
    age: 28,
    years_exp: 7,
    team: "PHI",
    career_carries: null,
    career_targets: null,
    prev_season_carries: null,
    prev_season_targets: null,
    prev_prev_season_carries: null,
    prev_prev_season_targets: null,
    same_team_same_position: [],
    draft_pick_overall: null,
    compounding_news_count: null,
    ...overrides,
  };
}

function run() {
  console.log("\n── 1. Aging RB, no usage data (the live hub case) ──");
  {
    // What from-snapshot.ts actually builds: roster signals only, no
    // career/prev-season carries. 4 of 5 signals go data_missing.
    const r = resolveInflectionWindow(
      "aging_cliff_rb",
      baseInputs({ player_name: "Saquon Barkley" }),
    );
    const cs = r.confidence_summary;
    check(
      "4 of 5 signals data missing",
      cs.data_missing_count === 4 && r.signals.length === 5,
      cs.text,
    );
    check(
      "only the live successor signal counts as validated",
      cs.validated_count === 1,
      `validated=${cs.validated_count}`,
    );
    check(
      "no data_missing row is also counted validated/partial/weak",
      cs.validated_count + cs.partial_count + cs.weak_count ===
        r.signals.filter((s) => s.direction !== "data_missing").length,
      `live=${cs.live_signal_count}`,
    );
    check(
      "live_signal_count is 1",
      cs.live_signal_count === 1,
      `live=${cs.live_signal_count}`,
    );
    check(
      "evidence_basis is prior_driven",
      cs.evidence_basis === "prior_driven",
      cs.evidence_basis,
    );
    check(
      "calibration_note fires and reads as a base-rate lean",
      cs.calibration_note != null &&
        /prior-driven/i.test(cs.calibration_note),
      cs.calibration_note ?? "null",
    );
  }

  console.log("\n── 2. Aging QB, every signal data missing ──");
  {
    const r = resolveInflectionWindow(
      "aging_cliff_qb",
      baseInputs({ position: "QB", age: 38, player_name: "Aaron Rodgers" }),
    );
    const cs = r.confidence_summary;
    check(
      "all signals data missing",
      cs.data_missing_count === r.signals.length && cs.live_signal_count === 0,
      cs.text,
    );
    check(
      "evidence_basis is prior_driven with zero live signals",
      cs.evidence_basis === "prior_driven",
      cs.evidence_basis,
    );
    check(
      "calibration_note names it as the base rate, not a player read",
      cs.calibration_note != null && /base rate/i.test(cs.calibration_note),
      cs.calibration_note ?? "null",
    );
  }

  console.log("\n── 3. Aging RB WITH usage data: more live signals, no false caveat ──");
  {
    // Career mileage + workload trend now resolve; only the two v2
    // hardcoded signals (athletic decline, OL trajectory) stay missing.
    const r = resolveInflectionWindow(
      "aging_cliff_rb",
      baseInputs({
        career_carries: 1820,
        prev_season_carries: 280,
        prev_prev_season_carries: 300,
      }),
    );
    const cs = r.confidence_summary;
    check(
      "three signals live, two missing",
      cs.live_signal_count === 3 && cs.data_missing_count === 2,
      cs.text,
    );
    check(
      "evidence_basis is mixed, not prior_driven",
      cs.evidence_basis === "mixed",
      cs.evidence_basis,
    );
    check(
      "calibration_note is the quieter partial-read line",
      cs.calibration_note != null && /partial read/i.test(cs.calibration_note),
      cs.calibration_note ?? "null",
    );
  }

  console.log(
    "\n── 4. buildInflectionsFromSnapshot threads prior-season usage ──",
  );
  {
    // The plumbing fix (2026-05-23): the builder must pass carries/targets
    // from the Sleeper /stats maps into the inputs. Before this, the maps
    // existed but the builder dropped them, so the workload-trend signal
    // rendered data_missing for every aging-RB card (the founder's report).
    const snap = {
      rosters: [{ is_me: true, player_ids: ["4866"] }],
    } as unknown as LeagueSnapshot;
    const playersMap = new Map<string, SleeperPlayer>([
      [
        "4866",
        {
          player_id: "4866",
          full_name: "Workload Test RB",
          position: "RB",
          team: "PHI",
          age: 28,
          years_exp: 7,
        } as unknown as SleeperPlayer,
      ],
    ]);
    const stat = (carries: number): PlayerSeasonStats => ({
      player_id: "4866",
      pts_ppr: null,
      pts_half_ppr: null,
      pts_std: null,
      games_played: 16,
      carries,
      targets: 40,
      receptions: null,
      rec_yards: null,
      rec_tds: null,
      air_yards: null,
      drops: null,
      rz_targets: null,
      off_snaps: null,
      team_off_snaps: null,
    });
    const findWorkload = (ctx: ReturnType<typeof buildInflectionsFromSnapshot>) =>
      ctx[0]?.resolutions
        .flatMap((r) => r.signals)
        .find((s) => s.name === "Workload trend");

    const withUsage = buildInflectionsFromSnapshot({
      snap,
      playersMap,
      prevSeasonStats: new Map([["4866", stat(240)]]),
      prevPrevSeasonStats: new Map([["4866", stat(300)]]),
    });
    const wlWith = findWorkload(withUsage);
    check(
      "with usage maps, workload trend resolves (not data_missing)",
      wlWith != null && wlWith.direction !== "data_missing",
      wlWith?.observation ?? "no signal",
    );
    check(
      "the carries drop is read as story_b (240 vs 300)",
      wlWith?.direction === "story_b",
      wlWith?.direction ?? "none",
    );

    const withoutUsage = buildInflectionsFromSnapshot({ snap, playersMap });
    const wlWithout = findWorkload(withoutUsage);
    check(
      "without usage maps, workload trend is data_missing (graceful)",
      wlWithout != null && wlWithout.direction === "data_missing",
      wlWithout?.direction ?? "none",
    );

    // careerUsage threads career_carries -> the mileage signal.
    const findMileage = (
      ctx: ReturnType<typeof buildInflectionsFromSnapshot>,
    ) =>
      ctx[0]?.resolutions
        .flatMap((r) => r.signals)
        .find((s) => s.name === "Career mileage");
    const withCareer = buildInflectionsFromSnapshot({
      snap,
      playersMap,
      careerUsage: new Map([["4866", { carries: 1850, targets: 300 }]]),
    });
    const mileage = findMileage(withCareer);
    check(
      "careerUsage lights up the mileage signal as high-mileage story_b",
      mileage != null &&
        mileage.direction === "story_b" &&
        /1850/.test(mileage.observation),
      mileage?.observation ?? "no signal",
    );
    const mileageWithout = findMileage(withoutUsage);
    check(
      "without careerUsage, mileage is data_missing (graceful)",
      mileageWithout != null && mileageWithout.direction === "data_missing",
      mileageWithout?.direction ?? "none",
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
