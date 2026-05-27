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
import { buildOpportunitySignal } from "../src/lib/engine/inflection/opportunity-signal";
import type { InflectionInputs } from "../src/lib/engine/inflection/types";
import { buildInflectionsFromSnapshot } from "../src/lib/engine/inflection/from-snapshot";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { SleeperPlayer } from "../src/lib/sleeper/schemas";
import type {
  OpportunityProfile,
  PlayerSeasonStats,
} from "../src/lib/players/season-stats";

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

async function run() {
  console.log("\n── 1. Aging RB, no usage data (the live hub case) ──");
  {
    // What from-snapshot.ts actually builds: roster signals only, no
    // career/prev-season carries/opportunity. 5 of 6 signals go
    // data_missing (the opportunity signal added 2026-05-25 is blind
    // here too, since baseInputs carries no prior-season role data).
    const r = resolveInflectionWindow(
      "aging_cliff_rb",
      baseInputs({ player_name: "Saquon Barkley" }),
    );
    const cs = r.confidence_summary;
    check(
      "5 of 6 signals data missing",
      cs.data_missing_count === 5 && r.signals.length === 6,
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
    // Career mileage + workload trend now resolve; the two v2 hardcoded
    // signals (athletic decline, OL trajectory) plus the opportunity
    // signal (no role data supplied here) stay missing.
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
      "three signals live, three missing",
      cs.live_signal_count === 3 && cs.data_missing_count === 3,
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
    const findWorkload = (ctx: Awaited<ReturnType<typeof buildInflectionsFromSnapshot>>) =>
      ctx[0]?.resolutions
        .flatMap((r) => r.signals)
        .find((s) => s.name === "Workload trend");

    const withUsage = await buildInflectionsFromSnapshot({
      snap,
      playersMap,
      playerSignalsMap: new Map(),
      teamSignalsMap: new Map(),
      playerHealthMap: new Map(),
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

    const withoutUsage = await buildInflectionsFromSnapshot({ snap, playersMap, playerSignalsMap: new Map(), teamSignalsMap: new Map(), playerHealthMap: new Map() });
    const wlWithout = findWorkload(withoutUsage);
    check(
      "without usage maps, workload trend is data_missing (graceful)",
      wlWithout != null && wlWithout.direction === "data_missing",
      wlWithout?.direction ?? "none",
    );

    // careerUsage threads career_carries -> the mileage signal.
    const findMileage = (
      ctx: Awaited<ReturnType<typeof buildInflectionsFromSnapshot>>,
    ) =>
      ctx[0]?.resolutions
        .flatMap((r) => r.signals)
        .find((s) => s.name === "Career mileage");
    const withCareer = await buildInflectionsFromSnapshot({
      snap,
      playersMap,
      playerSignalsMap: new Map(),
      teamSignalsMap: new Map(),
      playerHealthMap: new Map(),
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

  console.log("\n── 5. buildOpportunitySignal direction is trend-based ──");
  {
    const prof = (over: Partial<OpportunityProfile>): OpportunityProfile => ({
      snap_share: null,
      targets_per_game: null,
      adot: null,
      drop_rate: null,
      rz_targets_per_game: null,
      targets: null,
      ...over,
    });

    const rising = buildOpportunitySignal({
      position: "WR",
      prev: prof({ snap_share: 0.5, targets_per_game: 4.6 }),
      prevPrev: prof({ snap_share: 0.35, targets_per_game: 3.2 }),
    });
    check(
      "rising snap share reads story_a (continued role)",
      rising.direction === "story_a" && /up 15 pts/.test(rising.observation ?? ""),
      rising.observation ?? "none",
    );

    const falling = buildOpportunitySignal({
      position: "WR",
      prev: prof({ snap_share: 0.45 }),
      prevPrev: prof({ snap_share: 0.65 }),
    });
    check(
      "eroding snap share reads story_b (cliff edge)",
      falling.direction === "story_b" && /down 20 pts/.test(falling.observation ?? ""),
      falling.observation ?? "none",
    );

    const stable = buildOpportunitySignal({
      position: "WR",
      prev: prof({ snap_share: 0.62 }),
      prevPrev: prof({ snap_share: 0.6 }),
    });
    check("stable snap share reads neutral", stable.direction === "neutral");

    const missing = buildOpportunitySignal({
      position: "WR",
      prev: null,
      prevPrev: null,
    });
    check(
      "no prior role data degrades to data_missing",
      missing.direction === "data_missing",
    );

    // Targets-per-game fallback when snap share is absent both seasons.
    const tgtFallback = buildOpportunitySignal({
      position: "TE",
      prev: prof({ targets_per_game: 6 }),
      prevPrev: prof({ targets_per_game: 4 }),
    });
    check(
      "targets/game trend fires when snap share is absent",
      tgtFallback.direction === "story_a",
      tgtFallback.observation ?? "none",
    );

    // One season of role data: report the level, claim no direction.
    const oneSeason = buildOpportunitySignal({
      position: "WR",
      prev: prof({ snap_share: 0.7 }),
      prevPrev: null,
    });
    check(
      "single season of role data stays neutral",
      oneSeason.direction === "neutral" && /one season/.test(oneSeason.observation ?? ""),
      oneSeason.observation ?? "none",
    );

    // RB carries the pass-down framing, not the receiver framing.
    const rb = buildOpportunitySignal({
      position: "RB",
      prev: prof({ snap_share: 0.4 }),
      prevPrev: prof({ snap_share: 0.55 }),
    });
    check(
      "RB opportunity signal uses the pass-down-role name",
      rb.name === "Pass-down role + snap share" && rb.direction === "story_b",
      rb.name,
    );
  }

  console.log(
    "\n── 6. buildInflectionsFromSnapshot threads opportunity from /stats ──",
  );
  {
    // Aging WR (31) whose snap share climbed 35% -> 50% across the two
    // prior seasons. The builder must derive opportunity via the canonical
    // buildOpportunityProfile from the SAME /stats maps and light up the
    // signal as story_a, with no extra fetch.
    const snap = {
      rosters: [{ is_me: true, player_ids: ["wr1"] }],
    } as unknown as LeagueSnapshot;
    const playersMap = new Map<string, SleeperPlayer>([
      [
        "wr1",
        {
          player_id: "wr1",
          full_name: "Aging WR",
          position: "WR",
          team: "MIA",
          age: 31,
          years_exp: 9,
        } as unknown as SleeperPlayer,
      ],
    ]);
    const stat = (
      offSnaps: number,
      targets: number,
    ): PlayerSeasonStats => ({
      player_id: "wr1",
      pts_ppr: null,
      pts_half_ppr: null,
      pts_std: null,
      games_played: 16,
      carries: null,
      targets,
      receptions: null,
      rec_yards: null,
      rec_tds: null,
      air_yards: null,
      drops: null,
      rz_targets: null,
      off_snaps: offSnaps,
      team_off_snaps: 1000,
    });
    const findOpportunity = (
      ctx: Awaited<ReturnType<typeof buildInflectionsFromSnapshot>>,
    ) =>
      ctx[0]?.resolutions
        .flatMap((r) => r.signals)
        .find((s) => s.name === "Earned opportunity (snap share + targets)");

    const withUsage = await buildInflectionsFromSnapshot({
      snap,
      playersMap,
      playerSignalsMap: new Map(),
      teamSignalsMap: new Map(),
      playerHealthMap: new Map(),
      prevSeasonStats: new Map([["wr1", stat(500, 90)]]),
      prevPrevSeasonStats: new Map([["wr1", stat(350, 70)]]),
    });
    const oppWith = findOpportunity(withUsage);
    check(
      "snap share 35% -> 50% lights up opportunity as story_a",
      oppWith != null && oppWith.direction === "story_a",
      oppWith?.observation ?? "no signal",
    );

    const withoutUsage = await buildInflectionsFromSnapshot({ snap, playersMap, playerSignalsMap: new Map(), teamSignalsMap: new Map(), playerHealthMap: new Map() });
    const oppWithout = findOpportunity(withoutUsage);
    check(
      "without /stats maps, opportunity is data_missing (graceful)",
      oppWithout != null && oppWithout.direction === "data_missing",
      oppWithout?.direction ?? "none",
    );
  }

  console.log(
    "\n── 7. buildInflectionsFromSnapshot threads draftPickByPlayerId (Phase 3b) ──",
  );
  {
    // A true rookie (years_exp=0) enters the rookie-debut window. With a
    // draftPickByPlayerId entry the "Draft capital" signal must light up
    // with the right tier label and direction. Without it, it stays
    // data_missing (graceful). Locks the Phase 3b wiring of
    // player_signals.draft_pick_no into the inflection model.
    const snap = {
      rosters: [{ is_me: true, player_ids: ["rk1"] }],
    } as unknown as LeagueSnapshot;
    const playersMap = new Map<string, SleeperPlayer>([
      [
        "rk1",
        {
          player_id: "rk1",
          full_name: "Rookie Test WR",
          position: "WR",
          team: "ATL",
          age: 22,
          years_exp: 0,
        } as unknown as SleeperPlayer,
      ],
    ]);
    const findDraft = (
      ctx: Awaited<ReturnType<typeof buildInflectionsFromSnapshot>>,
    ) =>
      ctx[0]?.resolutions
        .flatMap((r) => r.signals)
        .find((s) => s.name === "Draft capital");

    const withPick = await buildInflectionsFromSnapshot({
      snap,
      playersMap,
      playerSignalsMap: new Map(),
      teamSignalsMap: new Map(),
      playerHealthMap: new Map(),
      draftPickByPlayerId: new Map([["rk1", 8]]),
    });
    const dWith = findDraft(withPick);
    check(
      "pick 8 lights up Draft capital as top-15 / story_a",
      dWith != null &&
        dWith.direction === "story_a" &&
        /top-15/i.test(dWith.observation ?? ""),
      dWith?.observation ?? "no signal",
    );

    const withDay3 = await buildInflectionsFromSnapshot({
      snap,
      playersMap,
      playerSignalsMap: new Map(),
      teamSignalsMap: new Map(),
      playerHealthMap: new Map(),
      draftPickByPlayerId: new Map([["rk1", 200]]),
    });
    const dDay3 = findDraft(withDay3);
    check(
      "pick 200 lights up Draft capital as Day 3 / story_b",
      dDay3 != null &&
        dDay3.direction === "story_b" &&
        /Day 3/.test(dDay3.observation ?? ""),
      dDay3?.observation ?? "no signal",
    );

    const withoutPick = await buildInflectionsFromSnapshot({ snap, playersMap, playerSignalsMap: new Map(), teamSignalsMap: new Map(), playerHealthMap: new Map() });
    const dNone = findDraft(withoutPick);
    check(
      "without draftPickByPlayerId, Draft capital is data_missing",
      dNone != null && dNone.direction === "data_missing",
      dNone?.direction ?? "none",
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
