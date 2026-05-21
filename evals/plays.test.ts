/**
 * Plays detection regression. Locks in the Phase 1 library so future
 * refactors don't quietly drop the qb_wr_stack / anchor_handcuff /
 * bridge_qb archetypes or change their detection gates without a
 * deliberate decision.
 *
 *   npx tsx --tsconfig tsconfig.json evals/plays.test.ts
 *
 * Founder direction 2026-05-20: "We have to help me see it, choose
 * it, and then remember it / stay disciplined." This eval pins the
 * SEE half (detect.ts) so the surface keeps working as we add play
 * archetypes.
 */

import { detectPlaysEnabledBy } from "../src/lib/strategy/plays/detect";
import { canEmitPlay } from "../src/lib/strategy/plays/catalog";
import {
  derivePlayUrgency,
  urgencyFromSurvival,
} from "../src/lib/strategy/plays/urgency";
import type { PlayPlayerRef } from "../src/lib/strategy/plays/types";
import type { SurvivalResolver } from "../src/lib/strategy/decision-synthesis/synthesize";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "../src/lib/players/available";

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

function makeSnap(
  format: "superflex" | "1qb",
  opts?: { tePremium?: boolean },
): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: 12,
    format,
    league_type: "dynasty",
    max_keepers: null,
    scoring: opts?.tePremium ? ["PPR", "TE-premium"] : ["PPR"],
    starter_slots: {
      hard: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
      flex: 1,
      superflex: format === "superflex" ? 1 : 0,
      rec_flex: 0,
      bench: 6,
    },
    draft: { my_pick_schedule: [] },
  } as unknown as LeagueSnapshot;
}

let nextId = 1;
function makePlayer(opts: {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  team: string | null;
  age?: number;
  is_rookie?: boolean;
  yearsExp?: number;
}): AvailablePlayer {
  return {
    id: `p${nextId++}`,
    name: opts.name,
    position: opts.position,
    team: opts.team,
    age: opts.age ?? 26,
    yearsExp: opts.yearsExp ?? 3,
    is_rookie: opts.is_rookie ?? false,
    search_rank: 100,
    dynasty_rank: 100,
    adp: null,
    adp_variant: null,
  } as unknown as AvailablePlayer;
}

function run() {
  console.log("\n── 1. QB-WR Stack detected for starting-tier QB ──");
  {
    const mayfield = makePlayer({
      name: "Baker Mayfield",
      position: "QB",
      team: "TB",
      age: 30,
    });
    const evans = makePlayer({
      name: "Mike Evans",
      position: "WR",
      team: "TB",
    });
    const godwin = makePlayer({
      name: "Chris Godwin",
      position: "WR",
      team: "TB",
    });
    const otton = makePlayer({
      name: "Cade Otton",
      position: "TE",
      team: "TB",
    });
    const unrelated = makePlayer({
      name: "Random Guy",
      position: "WR",
      team: "NYJ",
    });
    const ktcValues: Record<string, number> = {
      [mayfield.id]: 40,
      [evans.id]: 50,
      [godwin.id]: 45,
      [otton.id]: 25,
      [unrelated.id]: 30,
    };
    const plays = detectPlaysEnabledBy({
      winner: mayfield,
      snap: makeSnap("superflex"),
      available: [mayfield, evans, godwin, otton, unrelated],
      ktcValues,
    });
    const stack = plays.find((p) => p.archetype === "qb_wr_stack");
    check("QB-WR Stack detected", stack != null, `plays=${plays.length}`);
    check(
      "Stack partners include same-team WR/TE",
      stack
        ? stack.followthrough.target_candidates.some(
            (t) => t.name === "Mike Evans",
          ) &&
            stack.followthrough.target_candidates.some(
              (t) => t.name === "Chris Godwin",
            )
        : false,
    );
    check(
      "Unrelated team WR is NOT a stack partner",
      stack
        ? !stack.followthrough.target_candidates.some(
            (t) => t.name === "Random Guy",
          )
        : false,
    );
    check(
      "Stack name references the QB and team",
      stack ? stack.name.includes("Baker Mayfield") : false,
      stack?.name,
    );
  }

  console.log("\n── 2. Anchor + Handcuff detected for elite RB ──");
  {
    const mccaffrey = makePlayer({
      name: "Christian McCaffrey",
      position: "RB",
      team: "SF",
      age: 29,
    });
    const guerendo = makePlayer({
      name: "Isaac Guerendo",
      position: "RB",
      team: "SF",
      age: 25,
    });
    const otherRb = makePlayer({
      name: "Other Team RB",
      position: "RB",
      team: "LAR",
    });
    const ktcValues: Record<string, number> = {
      [mccaffrey.id]: 90,
      [guerendo.id]: 18,
      [otherRb.id]: 30,
    };
    const plays = detectPlaysEnabledBy({
      winner: mccaffrey,
      snap: makeSnap("superflex"),
      available: [mccaffrey, guerendo, otherRb],
      ktcValues,
    });
    const handcuff = plays.find((p) => p.archetype === "anchor_handcuff");
    check("Handcuff detected for elite RB", handcuff != null);
    check(
      "Handcuff target is the same-team RB",
      handcuff
        ? handcuff.followthrough.target_candidates.some(
            (t) => t.name === "Isaac Guerendo",
          )
        : false,
    );
    check(
      "Other-team RB is NOT a handcuff target",
      handcuff
        ? !handcuff.followthrough.target_candidates.some(
            (t) => t.name === "Other Team RB",
          )
        : false,
    );
  }

  console.log("\n── 3. Bridge QB → Developmental QB detected (SF only) ──");
  {
    const stafford = makePlayer({
      name: "Matthew Stafford",
      position: "QB",
      team: "LAR",
      age: 38,
    });
    const rookieQb = makePlayer({
      name: "Rookie QB",
      position: "QB",
      team: "CHI",
      age: 22,
      is_rookie: true,
    });
    const ktcValues: Record<string, number> = {
      [stafford.id]: 24,
      [rookieQb.id]: 30,
    };
    const plays = detectPlaysEnabledBy({
      winner: stafford,
      snap: makeSnap("superflex"),
      available: [stafford, rookieQb],
      ktcValues,
    });
    const bridge = plays.find((p) => p.archetype === "bridge_qb");
    check("Bridge QB detected for aging QB in SF", bridge != null);
    check(
      "Dev QB target is the rookie",
      bridge
        ? bridge.followthrough.target_candidates.some(
            (t) => t.name === "Rookie QB",
          )
        : false,
    );
  }

  console.log("\n── 4. Bridge QB suppressed in 1QB league ──");
  {
    const stafford = makePlayer({
      name: "Matthew Stafford",
      position: "QB",
      team: "LAR",
      age: 38,
    });
    const rookieQb = makePlayer({
      name: "Rookie QB",
      position: "QB",
      team: "CHI",
      age: 22,
      is_rookie: true,
    });
    const ktcValues: Record<string, number> = {
      [stafford.id]: 24,
      [rookieQb.id]: 30,
    };
    const plays = detectPlaysEnabledBy({
      winner: stafford,
      snap: makeSnap("1qb"),
      available: [stafford, rookieQb],
      ktcValues,
    });
    const bridge = plays.find((p) => p.archetype === "bridge_qb");
    check("Bridge QB NOT detected in 1QB", bridge == null);
  }

  console.log("\n── 5. WR winner produces no plays (Phase 1 library) ──");
  {
    const wr = makePlayer({
      name: "WR Winner",
      position: "WR",
      team: "DAL",
    });
    const teammate = makePlayer({
      name: "Teammate QB",
      position: "QB",
      team: "DAL",
    });
    const ktcValues: Record<string, number> = {
      [wr.id]: 60,
      [teammate.id]: 40,
    };
    const plays = detectPlaysEnabledBy({
      winner: wr,
      snap: makeSnap("superflex"),
      available: [wr, teammate],
      ktcValues,
    });
    check(
      "WR winner produces 0 plays (Phase 1)",
      plays.length === 0,
      `plays=${plays.length}`,
    );
  }

  console.log("\n── 6. Survival-grounded urgency replaces fixed window ──");
  {
    const mayfield = makePlayer({
      name: "Baker Mayfield",
      position: "QB",
      team: "TB",
      age: 30,
    });
    const evans = makePlayer({ name: "Mike Evans", position: "WR", team: "TB" });
    const godwin = makePlayer({
      name: "Chris Godwin",
      position: "WR",
      team: "TB",
    });
    const ktcValues: Record<string, number> = {
      [mayfield.id]: 40,
      [evans.id]: 50,
      [godwin.id]: 45,
    };
    // Evans about to go (12%), Godwin comfortable (88%).
    const survMap: Record<string, number> = {
      [evans.id]: 12,
      [godwin.id]: 88,
    };
    const survival: SurvivalResolver = (p) => {
      const pct = survMap[p.id];
      if (pct == null) return null;
      return {
        pct,
        ci_low: Math.max(2, pct - 8),
        ci_high: Math.min(98, pct + 8),
        to_pick_no: 50,
      };
    };
    const plays = detectPlaysEnabledBy({
      winner: mayfield,
      snap: makeSnap("superflex"),
      available: [mayfield, evans, godwin],
      ktcValues,
      survival,
    });
    const stack = plays.find((p) => p.archetype === "qb_wr_stack");
    check("Stack carries play_urgency", stack?.play_urgency != null);
    check(
      "High-value urgent partner pulls play to act_now",
      stack?.play_urgency === "act_now",
      stack?.play_urgency,
    );
    const evansRef = stack?.followthrough.target_candidates.find(
      (t) => t.name === "Mike Evans",
    );
    check("Evans survival attached at 12%", evansRef?.survival?.pct === 12);
    check("Evans urgency is act_now", evansRef?.survival?.urgency === "act_now");
    const godwinRef = stack?.followthrough.target_candidates.find(
      (t) => t.name === "Chris Godwin",
    );
    check("Godwin urgency is no_rush", godwinRef?.survival?.urgency === "no_rush");
    const copy = `${stack?.genius_vs_average_line} ${stack?.followthrough.description}`;
    check(
      "Copy cites survival %, not a fixed 'next N picks' window",
      copy.includes("12%") && !/next \d+ (of your )?picks/i.test(copy),
      copy,
    );
  }

  console.log("\n── 7. No-survival copy is window-free (cite-or-flag) ──");
  {
    const mayfield = makePlayer({
      name: "Baker Mayfield",
      position: "QB",
      team: "TB",
      age: 30,
    });
    const evans = makePlayer({ name: "Mike Evans", position: "WR", team: "TB" });
    const ktcValues: Record<string, number> = {
      [mayfield.id]: 40,
      [evans.id]: 50,
    };
    const plays = detectPlaysEnabledBy({
      winner: mayfield,
      snap: makeSnap("superflex"),
      available: [mayfield, evans],
      ktcValues,
      // No survival resolver: fallback copy must still avoid windows.
    });
    const stack = plays.find((p) => p.archetype === "qb_wr_stack");
    const copy = `${stack?.genius_vs_average_line} ${stack?.followthrough.description}`;
    check(
      "Fallback copy has no 'next N picks' window",
      !/next \d+ (of your )?picks/i.test(copy),
      copy,
    );
  }

  console.log("\n── 8. Format-gate matrix (canEmitPlay) ──");
  {
    check(
      "bridge_qb blocked in 1qb",
      canEmitPlay(makeSnap("1qb"), "bridge_qb") === false,
    );
    check(
      "bridge_qb allowed in superflex",
      canEmitPlay(makeSnap("superflex"), "bridge_qb") === true,
    );
    check(
      "qb_wr_stack ungated by format",
      canEmitPlay(makeSnap("1qb"), "qb_wr_stack") === true,
    );
    check(
      "anchor_handcuff ungated by format",
      canEmitPlay(makeSnap("1qb"), "anchor_handcuff") === true,
    );
  }

  console.log("\n── 9. Urgency thresholds + EV-weighted rollup ──");
  {
    check("survival <25 = act_now", urgencyFromSurvival(12) === "act_now");
    check("survival 25-50 = this_round", urgencyFromSurvival(40) === "this_round");
    check(
      "survival 50-75 = two_round_cushion",
      urgencyFromSurvival(60) === "two_round_cushion",
    );
    check("survival >=75 = no_rush", urgencyFromSurvival(88) === "no_rush");
    // A high-value comfortable partner (60 x 1 = 60) outweighs a
    // low-value urgent one (5 x 4 = 20): the play is no_rush because
    // the piece worth wanting is going to reach you.
    const partners: PlayPlayerRef[] = [
      {
        player_id: "a",
        name: "A",
        position: "WR",
        team: "X",
        ktc_value: 60,
        survival: {
          pct: 88,
          ci_low: 80,
          ci_high: 94,
          to_pick_no: 50,
          urgency: "no_rush",
        },
      },
      {
        player_id: "b",
        name: "B",
        position: "WR",
        team: "X",
        ktc_value: 5,
        survival: {
          pct: 12,
          ci_low: 4,
          ci_high: 20,
          to_pick_no: 50,
          urgency: "act_now",
        },
      },
    ];
    check(
      "EV-weighted rollup favors valuable comfortable partner",
      derivePlayUrgency(partners) === "no_rush",
      derivePlayUrgency(partners) ?? "null",
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
