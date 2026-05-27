/**
 * Plays coverage canonical regression.
 *
 *   npx tsx --tsconfig tsconfig.json evals/plays-coverage.test.ts
 *
 * Locks the "Built / Missing" coverage read for each play archetype.
 * Founder report 2026-05-26: "It feels empty when I'm doing well at
 * one. Find a way to illustrate the strength/build that already
 * happened on it." Coverage IS that strength read; this test pins
 * its per-archetype behavior so the canonical never silently drifts.
 */

import { derivePlayCoverage } from "../src/lib/strategy/plays/coverage";
import type { OppHolder } from "../src/lib/strategy/plays/coverage";
import type { PlayCommitment, PlayPlayerRef } from "../src/lib/strategy/plays/types";
import type { OwnedRosterPlayer } from "../src/lib/strategy/plays/detect";
import type { LaneMembership } from "../src/lib/strategy/lane-identity";
import type { FormatRules } from "../src/lib/engine/llm-contract";
import type { Position } from "../src/lib/strategy/archetypes/schema";

// U+2014 (em dash) is banned in product output by BRAND_VOICE. We build
// the character via charCode so this source file passes both the
// PreToolUse hook and the check:em-dashes script.
const EM_DASH = String.fromCharCode(0x2014);

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function noEmDash(s: string | null): boolean {
  return s == null || s.indexOf(EM_DASH) < 0;
}

function basePlay(
  archetype: PlayCommitment["archetype"],
  primary: PlayCommitment["primary_player"],
  followthrough_targets: PlayPlayerRef[] = [],
): PlayCommitment {
  return {
    commitment_id: `${archetype}-test`,
    archetype,
    play_name: "Test Play",
    league_id: "L1",
    primary_player: primary,
    followthrough_targets,
    followthrough_description: "",
    committed_at_pick_no: 10,
    lapses_after_pick_no: 60,
    committed_at: new Date().toISOString(),
    status: "active",
  };
}

function holder(args: {
  roster_id: number;
  owner_name: string | null;
  counts?: Partial<Record<Position, number>>;
}): OppHolder {
  const base: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  return {
    roster_id: args.roster_id,
    owner_name: args.owner_name,
    position_counts: { ...base, ...(args.counts ?? {}) } as Record<Position, number>,
  };
}

function p(args: {
  id: string;
  name: string;
  position: OwnedRosterPlayer["position"];
  team: string | null;
  age?: number | null;
  yearsExp?: number;
  is_rookie?: boolean;
}): OwnedRosterPlayer {
  return {
    id: args.id,
    name: args.name,
    position: args.position,
    team: args.team,
    age: args.age ?? 26,
    yearsExp: args.yearsExp ?? 3,
    is_rookie: args.is_rookie ?? false,
  };
}

function run() {
  console.log("Section 1: QB-WR Stack");
  {
    const play = basePlay("qb_wr_stack", {
      player_id: "qb1",
      name: "Lamar Jackson",
      position: "QB",
      team: "BAL",
    });
    const ownedCovered: OwnedRosterPlayer[] = [
      p({ id: "qb1", name: "Lamar Jackson", position: "QB", team: "BAL" }),
      p({ id: "te1", name: "Mark Andrews", position: "TE", team: "BAL" }),
    ];
    const valueMap: Record<string, number> = { qb1: 85, te1: 60 };
    const covered = derivePlayCoverage({
      play,
      ownedPlayers: ownedCovered,
      valueMap,
    });
    check(
      "covered when anchor + same-team pass-catcher both rostered",
      covered?.verdict === "covered" && covered.built.length === 2,
      covered?.summary,
    );
    check(
      "summary names the value (val N) for each piece",
      /val 85/.test(covered?.summary ?? "") && /val 60/.test(covered?.summary ?? ""),
      covered?.summary,
    );
    check(
      "no em dash in summary or missing",
      noEmDash(covered?.summary ?? "") && noEmDash(covered?.missing ?? null),
      "voice rule",
    );

    const ownedThin: OwnedRosterPlayer[] = [
      p({ id: "qb1", name: "Lamar Jackson", position: "QB", team: "BAL" }),
    ];
    const thin = derivePlayCoverage({
      play,
      ownedPlayers: ownedThin,
      valueMap: { qb1: 85 },
    });
    check(
      "thin when anchor only (no same-team WR/TE rostered)",
      thin?.verdict === "thin" && (thin?.missing ?? "").includes("pass-catcher"),
      thin?.summary,
    );

    const anchorNotRostered = derivePlayCoverage({
      play,
      ownedPlayers: [],
      valueMap: {},
    });
    check(
      "thin when anchor itself is not rostered",
      anchorNotRostered?.verdict === "thin",
      anchorNotRostered?.summary,
    );
  }

  console.log("\nSection 2: Anchor + Handcuff");
  {
    const play = basePlay("anchor_handcuff", {
      player_id: "rb1",
      name: "Christian McCaffrey",
      position: "RB",
      team: "SF",
    });
    const ownedCovered: OwnedRosterPlayer[] = [
      p({ id: "rb1", name: "Christian McCaffrey", position: "RB", team: "SF" }),
      p({ id: "rb2", name: "Jordan Mason", position: "RB", team: "SF" }),
    ];
    const covered = derivePlayCoverage({
      play,
      ownedPlayers: ownedCovered,
      valueMap: { rb1: 90, rb2: 25 },
    });
    check(
      "covered when anchor RB + same-team backup both rostered",
      covered?.verdict === "covered",
      covered?.summary,
    );

    const thin = derivePlayCoverage({
      play,
      ownedPlayers: [ownedCovered[0]],
      valueMap: { rb1: 90 },
    });
    check(
      "thin when anchor only (handcuff missing)",
      thin?.verdict === "thin" && /backup RB/.test(thin?.missing ?? ""),
      thin?.summary,
    );
  }

  console.log("\nSection 3: Bridge QB");
  {
    const play = basePlay("bridge_qb", {
      player_id: "qbOld",
      name: "Aaron Rodgers",
      position: "QB",
      team: "NYJ",
    });
    const owned: OwnedRosterPlayer[] = [
      p({
        id: "qbOld",
        name: "Aaron Rodgers",
        position: "QB",
        team: "NYJ",
        age: 41,
        yearsExp: 19,
      }),
      p({
        id: "qbDev",
        name: "Cam Ward",
        position: "QB",
        team: "TEN",
        age: 22,
        yearsExp: 0,
        is_rookie: true,
      }),
    ];
    const covered = derivePlayCoverage({
      play,
      ownedPlayers: owned,
      valueMap: { qbOld: 20, qbDev: 45 },
    });
    check(
      "covered when bridge + young dev QB both rostered",
      covered?.verdict === "covered" && covered.built.length === 2,
      covered?.summary,
    );

    const partial = derivePlayCoverage({
      play,
      ownedPlayers: [owned[0]],
      valueMap: { qbOld: 20 },
    });
    check(
      "partial when only the bridge is rostered, dev still missing",
      partial?.verdict === "partial" && /dev QB/.test(partial?.missing ?? ""),
      partial?.summary,
    );

    const oldStarterIsNotDev: OwnedRosterPlayer[] = [
      p({
        id: "qbOld",
        name: "Aaron Rodgers",
        position: "QB",
        team: "NYJ",
        age: 41,
        yearsExp: 19,
      }),
      p({
        id: "qbAlsoOld",
        name: "Russell Wilson",
        position: "QB",
        team: "PIT",
        age: 36,
        yearsExp: 13,
      }),
    ];
    const stillPartial = derivePlayCoverage({
      play,
      ownedPlayers: oldStarterIsNotDev,
      valueMap: { qbOld: 20, qbAlsoOld: 18 },
    });
    check(
      "second old QB does not count as a dev (age + yearsExp gates)",
      stillPartial?.verdict === "partial",
      stillPartial?.summary,
    );
  }

  console.log("\nSection 4: QB Hoard");
  {
    const play = basePlay("qb_hoard", {
      player_id: "qbAnchor",
      name: "Joe Burrow",
      position: "QB",
      team: "CIN",
    });
    const formatRules = {
      qb_starters_max: 1,
      rb_starters_max: 2,
      wr_starters_max: 3,
      te_starters_max: 1,
      k_starters_max: 1,
      dst_starters_max: 1,
      flex_starters: 1,
      has_k: true,
      has_dst: true,
      second_qb_starts: false,
      te_premium: false,
      is_superflex: false,
      idp_starters: 0,
    } as unknown as FormatRules;

    const fourQbs: OwnedRosterPlayer[] = [
      p({ id: "qb1", name: "Joe Burrow", position: "QB", team: "CIN" }),
      p({ id: "qb2", name: "Patrick Mahomes", position: "QB", team: "KC" }),
      p({ id: "qb3", name: "Justin Herbert", position: "QB", team: "LAC" }),
      p({ id: "qb4", name: "Anthony Richardson", position: "QB", team: "IND" }),
    ];
    const covered = derivePlayCoverage({
      play,
      ownedPlayers: fourQbs,
      valueMap: { qb1: 80, qb2: 88, qb3: 70, qb4: 55 },
      formatRules,
    });
    check(
      "covered with 4 QBs in a 1QB league (3 flippable past 1 starter)",
      covered?.verdict === "covered" && /three flippable/.test(covered?.summary ?? ""),
      covered?.summary,
    );

    const onlyStarter: OwnedRosterPlayer[] = [fourQbs[0]];
    const thin = derivePlayCoverage({
      play,
      ownedPlayers: onlyStarter,
      valueMap: { qb1: 80 },
      formatRules,
    });
    check(
      "thin when only the starter is rostered (no surplus)",
      thin?.verdict === "thin",
      thin?.summary,
    );
  }

  console.log("\nSection 5: Lane Path");
  {
    const memberships: LaneMembership[] = [
      {
        lane_id: "qb_stable",
        label: "QB Stable",
        blurb: "Two stable starters under center.",
        axis: "archetype",
        state: "in",
        aggregate_score: 150,
        in_threshold: 120,
        close_threshold: 90,
        contributors: [
          {
            player_id: "qb1",
            name: "Joe Burrow",
            position: "QB",
            contribution: 80,
          },
          {
            player_id: "qb2",
            name: "Patrick Mahomes",
            position: "QB",
            contribution: 90,
          },
        ],
        gap: null,
        is_derived: false,
      },
      {
        lane_id: "trade_capital",
        label: "Trade Capital",
        blurb: "Surplus value to spend.",
        axis: "composite",
        state: "close",
        aggregate_score: 90,
        in_threshold: 120,
        close_threshold: 60,
        contributors: [
          {
            player_id: "wr1",
            name: "Justin Jefferson",
            position: "WR",
            contribution: 95,
          },
        ],
        gap: { description: "one more top-12 asset.", move_type: "trade_for" },
        is_derived: true,
      },
    ];
    const owned: OwnedRosterPlayer[] = [
      p({ id: "qb1", name: "Joe Burrow", position: "QB", team: "CIN" }),
      p({ id: "qb2", name: "Patrick Mahomes", position: "QB", team: "KC" }),
      p({ id: "wr1", name: "Justin Jefferson", position: "WR", team: "MIN" }),
    ];
    const valueMap = { qb1: 80, qb2: 88, wr1: 95 };

    const inLane = basePlay("lane_path", {
      player_id: "lane:qb_stable",
      name: "QB Stable",
      position: "QB",
      team: null,
    });
    const coveredLane = derivePlayCoverage({
      play: inLane,
      ownedPlayers: owned,
      valueMap,
      laneMemberships: memberships,
    });
    check(
      "lane_path verdict = covered when membership.state = in",
      coveredLane?.verdict === "covered" && coveredLane.built.length === 2,
      coveredLane?.summary,
    );

    const closeLane = basePlay("lane_path", {
      player_id: "lane:trade_capital",
      name: "Trade Capital",
      position: "WR",
      team: null,
    });
    const partialLane = derivePlayCoverage({
      play: closeLane,
      ownedPlayers: owned,
      valueMap,
      laneMemberships: memberships,
    });
    check(
      "lane_path verdict = partial when membership.state = close",
      partialLane?.verdict === "partial" &&
        (partialLane?.missing ?? "").includes("top-12 asset"),
      partialLane?.summary,
    );

    const unknownLane = basePlay("lane_path", {
      player_id: "lane:nonexistent",
      name: "Unknown",
      position: "RB",
      team: null,
    });
    const noMembership = derivePlayCoverage({
      play: unknownLane,
      ownedPlayers: owned,
      valueMap,
      laneMemberships: memberships,
    });
    check(
      "lane_path with no membership row reads thin (no contributors)",
      noMembership?.verdict === "thin",
      noMembership?.summary,
    );
  }

  console.log("\nSection 6: Sniped verdict + trade angle");
  {
    // Anchor + Handcuff, handcuff drafted by another roster. The
    // founder's case (2026-05-27): "Quinshon Judkins + Handcuff" with
    // the named CLE backup now on lincolnenglish's roster.
    const stackPartner: PlayPlayerRef = {
      player_id: "te1",
      name: "Mark Andrews",
      position: "TE",
      team: "BAL",
    };
    const handcuffPartner: PlayPlayerRef = {
      player_id: "rbBackup",
      name: "Pierre Strong",
      position: "RB",
      team: "CLE",
    };
    const devPartner: PlayPlayerRef = {
      player_id: "qbDev",
      name: "Cam Ward",
      position: "QB",
      team: "TEN",
    };

    // -- qb_wr_stack: anchor in hand, the engine's named pass-catcher
    //    was drafted by another roster.
    {
      const play = basePlay(
        "qb_wr_stack",
        {
          player_id: "qbAnchor",
          name: "Lamar Jackson",
          position: "QB",
          team: "BAL",
        },
        [stackPartner],
      );
      const owned: OwnedRosterPlayer[] = [
        p({ id: "qbAnchor", name: "Lamar Jackson", position: "QB", team: "BAL" }),
        // User has 4 WRs (surplus past 3 starters) so a trade lever exists.
        p({ id: "wr1", name: "Justin Jefferson", position: "WR", team: "MIN" }),
        p({ id: "wr2", name: "CeeDee Lamb", position: "WR", team: "DAL" }),
        p({ id: "wr3", name: "Amon-Ra St. Brown", position: "WR", team: "DET" }),
        p({ id: "wr4", name: "Brandon Aiyuk", position: "WR", team: "SF" }),
      ];
      const oppHolders: Record<string, OppHolder> = {
        te1: holder({
          roster_id: 5,
          owner_name: "lincolnenglish",
          counts: { QB: 1, RB: 2, WR: 1, TE: 2 },
        }),
      };
      const cov = derivePlayCoverage({
        play,
        ownedPlayers: owned,
        valueMap: { qbAnchor: 85, te1: 60, wr1: 95, wr2: 88, wr3: 70, wr4: 45 },
        oppHolders,
      });
      check(
        "qb_wr_stack: sniped verdict when named partner held by opponent",
        cov?.verdict === "sniped",
        cov?.summary,
      );
      check(
        "qb_wr_stack: summary names the holder",
        (cov?.summary ?? "").includes("lincolnenglish"),
        cov?.summary,
      );
      check(
        "qb_wr_stack: sniped[] carries the partner + owner",
        cov?.sniped?.[0]?.owner_name === "lincolnenglish" &&
          cov?.sniped?.[0]?.name === "Mark Andrews",
        JSON.stringify(cov?.sniped),
      );
      check(
        "qb_wr_stack: no em dash in sniped output",
        noEmDash(cov?.summary ?? "") &&
          noEmDash(cov?.missing ?? null) &&
          noEmDash(cov?.trade_angle ?? null),
      );
    }

    // -- anchor_handcuff: anchor in hand, handcuff drafted elsewhere.
    //    Holder is light at WR; user has WR surplus -> the lever names it.
    {
      const play = basePlay(
        "anchor_handcuff",
        {
          player_id: "rbAnchor",
          name: "Quinshon Judkins",
          position: "RB",
          team: "CLE",
        },
        [handcuffPartner],
      );
      const owned: OwnedRosterPlayer[] = [
        p({ id: "rbAnchor", name: "Quinshon Judkins", position: "RB", team: "CLE" }),
        p({ id: "wr1", name: "Justin Jefferson", position: "WR", team: "MIN" }),
        p({ id: "wr2", name: "CeeDee Lamb", position: "WR", team: "DAL" }),
        p({ id: "wr3", name: "Amon-Ra St. Brown", position: "WR", team: "DET" }),
        p({ id: "wr4", name: "Brandon Aiyuk", position: "WR", team: "SF" }),
      ];
      const oppHolders: Record<string, OppHolder> = {
        rbBackup: holder({
          roster_id: 7,
          owner_name: "lincolnenglish",
          counts: { QB: 1, RB: 3, WR: 1, TE: 1 },
        }),
      };
      const formatRules = {
        qb_starters_max: 1,
        rb_starters_max: 2,
        wr_starters_max: 3,
        te_starters_max: 1,
        is_superflex: false,
      } as unknown as FormatRules;
      const cov = derivePlayCoverage({
        play,
        ownedPlayers: owned,
        valueMap: { rbAnchor: 80, rbBackup: 18, wr1: 95, wr2: 88, wr3: 70, wr4: 45 },
        oppHolders,
        formatRules,
      });
      check(
        "anchor_handcuff: sniped verdict + holder named",
        cov?.verdict === "sniped" &&
          (cov?.summary ?? "").includes("lincolnenglish"),
        cov?.summary,
      );
      check(
        "anchor_handcuff: trade_angle names holder's thin position",
        (cov?.trade_angle ?? "").includes("WR") &&
          (cov?.trade_angle ?? "").includes("lincolnenglish"),
        cov?.trade_angle ?? "",
      );
      check(
        "anchor_handcuff: trade_angle includes a surplus piece by name",
        (cov?.trade_angle ?? "").includes("Brandon Aiyuk"),
        cov?.trade_angle ?? "",
      );
    }

    // -- bridge_qb: bridge in hand, the engine's young dev was drafted.
    {
      const play = basePlay(
        "bridge_qb",
        {
          player_id: "qbBridge",
          name: "Aaron Rodgers",
          position: "QB",
          team: "NYJ",
        },
        [devPartner],
      );
      const owned: OwnedRosterPlayer[] = [
        p({
          id: "qbBridge",
          name: "Aaron Rodgers",
          position: "QB",
          team: "NYJ",
          age: 41,
          yearsExp: 19,
        }),
      ];
      const oppHolders: Record<string, OppHolder> = {
        qbDev: holder({
          roster_id: 9,
          owner_name: "izzydabomb",
          counts: { QB: 2, RB: 2, WR: 3, TE: 1 },
        }),
      };
      const cov = derivePlayCoverage({
        play,
        ownedPlayers: owned,
        valueMap: { qbBridge: 20, qbDev: 45 },
        oppHolders,
      });
      check(
        "bridge_qb: sniped fires when the named dev is held elsewhere",
        cov?.verdict === "sniped" && cov?.sniped?.[0]?.name === "Cam Ward",
        cov?.summary,
      );
    }

    // -- Fallback: no oppHolders -> sniped never fires (anchor-only
    //    handcuff play falls back to the existing "thin" verdict).
    {
      const play = basePlay(
        "anchor_handcuff",
        {
          player_id: "rbAnchor2",
          name: "Saquon Barkley",
          position: "RB",
          team: "PHI",
        },
        [{
          player_id: "rbBackup2",
          name: "Will Shipley",
          position: "RB",
          team: "PHI",
        }],
      );
      const owned: OwnedRosterPlayer[] = [
        p({ id: "rbAnchor2", name: "Saquon Barkley", position: "RB", team: "PHI" }),
      ];
      const cov = derivePlayCoverage({
        play,
        ownedPlayers: owned,
        valueMap: { rbAnchor2: 80 },
      });
      check(
        "anchor_handcuff: absent oppHolders -> thin (no false sniped)",
        cov?.verdict === "thin",
        cov?.summary,
      );
    }

    // -- No trade lever: holder has no thin positions, user has no
    //    cross-fit surplus. Sniped still fires (the play state is what
    //    it is); trade_angle is null (no fabricated angle).
    {
      const play = basePlay(
        "anchor_handcuff",
        {
          player_id: "rbAnchorB",
          name: "Bijan Robinson",
          position: "RB",
          team: "ATL",
        },
        [{
          player_id: "rbBackupB",
          name: "Tyler Allgeier",
          position: "RB",
          team: "ATL",
        }],
      );
      const owned: OwnedRosterPlayer[] = [
        p({ id: "rbAnchorB", name: "Bijan Robinson", position: "RB", team: "ATL" }),
        // No surplus at any position; opponent has full starters.
        p({ id: "qbU", name: "User QB", position: "QB", team: "PHI" }),
      ];
      const oppHolders: Record<string, OppHolder> = {
        rbBackupB: holder({
          roster_id: 3,
          owner_name: "saquonatraitor",
          // Holder has every position covered to starter req.
          counts: { QB: 1, RB: 3, WR: 3, TE: 1 },
        }),
      };
      const formatRules = {
        qb_starters_max: 1,
        rb_starters_max: 2,
        wr_starters_max: 3,
        te_starters_max: 1,
      } as unknown as FormatRules;
      const cov = derivePlayCoverage({
        play,
        ownedPlayers: owned,
        valueMap: { rbAnchorB: 90, rbBackupB: 8, qbU: 50 },
        oppHolders,
        formatRules,
      });
      check(
        "sniped fires even when no clean trade lever exists",
        cov?.verdict === "sniped",
        cov?.summary,
      );
      check(
        "trade_angle = null when no holder need + user surplus overlap",
        cov?.trade_angle == null || cov.trade_angle === null,
        `trade_angle = ${cov?.trade_angle ?? "null"}`,
      );
    }
  }

  console.log("\nSection 7: Voice A regressions");
  {
    const cases: { name: string; coverage: ReturnType<typeof derivePlayCoverage> }[] = [
      {
        name: "qb_wr_stack covered",
        coverage: derivePlayCoverage({
          play: basePlay("qb_wr_stack", {
            player_id: "qbX",
            name: "QB X",
            position: "QB",
            team: "DAL",
          }),
          ownedPlayers: [
            p({ id: "qbX", name: "QB X", position: "QB", team: "DAL" }),
            p({ id: "wrX", name: "WR X", position: "WR", team: "DAL" }),
          ],
          valueMap: { qbX: 50, wrX: 60 },
        }),
      },
      {
        name: "anchor_handcuff thin",
        coverage: derivePlayCoverage({
          play: basePlay("anchor_handcuff", {
            player_id: "rbX",
            name: "RB X",
            position: "RB",
            team: "NYG",
          }),
          ownedPlayers: [p({ id: "rbX", name: "RB X", position: "RB", team: "NYG" })],
          valueMap: { rbX: 70 },
        }),
      },
    ];
    for (const c of cases) {
      check(
        `${c.name} contains no em dash`,
        noEmDash(c.coverage?.summary ?? "") &&
          noEmDash(c.coverage?.missing ?? null),
      );
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
