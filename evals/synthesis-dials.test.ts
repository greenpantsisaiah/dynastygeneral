/**
 * Synthesis-dial wiring regression. Locks in the 2026-05-14 dial
 * integration: when the user passes non-neutral dials into
 * synthesizeDecision, candidate scoring shifts in the expected
 * direction and dial_influences carries the named contributions.
 *
 *   npx tsx --tsconfig tsconfig.json evals/synthesis-dials.test.ts
 *
 * Critical invariant: with neutral dials (the default), scoring is
 * identical to the pre-wiring behavior. This protects every other
 * eval fixture in the suite (they don't pass dials, so they rely on
 * neutral default producing zero delta).
 */

import { synthesizeDecision } from "../src/lib/strategy/decision-synthesis/synthesize";
import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import type { AvailablePlayer } from "../src/lib/players/available";
import type { RankedArchetype } from "../src/lib/strategy/archetypes/schema";
import type { WindowsResult } from "../src/lib/strategy/windows/compute";

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

let nextId = 1;
function makePlayer(opts: {
  name: string;
  position: "QB" | "RB" | "WR" | "TE";
  age: number;
  is_rookie?: boolean;
  adp?: number;
  search_rank?: number;
}): AvailablePlayer {
  return {
    id: `p${nextId++}`,
    name: opts.name,
    position: opts.position,
    team: "TST",
    age: opts.age,
    yearsExp: opts.is_rookie ? 0 : Math.max(1, opts.age - 22),
    search_rank: opts.search_rank ?? 200,
    dynasty_rank: opts.search_rank ?? 200,
    adp: opts.adp ?? null,
    adp_variant: "dynasty_superflex",
    is_rookie: opts.is_rookie ?? false,
  } as unknown as AvailablePlayer;
}

function makeSnapshot(currentPickNo: number, nextPickNo: number): LeagueSnapshot {
  const rosters: LeagueSnapshot["rosters"] = [];
  for (let rid = 1; rid <= 12; rid++) {
    const isMe = rid === 1;
    rosters.push({
      roster_id: rid,
      owner_id: `u${rid}`,
      owner_name: isMe ? "Me" : `Opp${rid}`,
      is_me: isMe,
      position_counts: { QB: 1, RB: 0, WR: 1, TE: 0, K: 0, DST: 0 },
      position_ranks: { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] },
      player_ids: [],
      avg_age: 26,
      starter_avg_age: 26,
      starter_talent_score: 0.5,
      wins: 0,
      losses: 0,
      ties: 0,
    });
  }
  const slot_to_roster_id: Record<number, number> = {};
  for (let s = 1; s <= 12; s++) slot_to_roster_id[s] = s;
  return {
    league_id: "test",
    season: "2026",
    total_teams: 12,
    format: "superflex",
    league_type: "keeper",
    max_keepers: 3,
    scoring: ["PPR", "TE-premium"],
    starter_slots: {
      hard: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
      flex: 1,
      superflex: 1,
      rec_flex: 0,
      bench: 5,
    },
    rosters,
    my_roster_id: 1,
    draft: {
      status: "drafting",
      type: "snake",
      rounds: 20,
      reversal_round: null,
      slot_to_roster_id,
      my_slot: 1,
      next_pick_no: currentPickNo,
      picks_made: [],
      traded_picks: [],
      my_pick_schedule: [
        {
          pick_no: currentPickNo,
          round: Math.ceil(currentPickNo / 12),
          pick_label: `${Math.ceil(currentPickNo / 12)}.X`,
          gap_to_prev: 12,
          gap_to_next: nextPickNo - currentPickNo,
          density_kind: "normal",
        },
        {
          pick_no: nextPickNo,
          round: Math.ceil(nextPickNo / 12),
          pick_label: `${Math.ceil(nextPickNo / 12)}.X`,
          gap_to_prev: nextPickNo - currentPickNo,
          gap_to_next: 12,
          density_kind: "normal",
        },
      ],
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
  } as unknown as LeagueSnapshot;
}

const emptyArchetypes: RankedArchetype[] = [];
const emptyWindows: WindowsResult = {
  declared: null,
  auto: { label: "Balanced", strength: "none" as const, sentence: "" },
  win_now_score: 50,
  future_score: 50,
  composite: 0,
} as unknown as WindowsResult;

function run() {
  console.log("\n── synthesis dial wiring ──");

  // Case 1: neutral dials produce zero delta + no influences.
  {
    const snap = makeSnapshot(5, 17);
    const bijan = makePlayer({
      name: "Top RB",
      position: "RB",
      age: 24,
      adp: 4,
      search_rank: 5,
    });
    const wr1 = makePlayer({
      name: "Top WR",
      position: "WR",
      age: 24,
      adp: 6,
      search_rank: 8,
    });
    const decisionNeutral = synthesizeDecision({
      snap,
      ranked: emptyArchetypes,
      available: [bijan, wr1],
      windows: emptyWindows,
      picks_until_me: 12,
    });
    const decisionExplicitNeutral = synthesizeDecision({
      snap,
      ranked: emptyArchetypes,
      available: [bijan, wr1],
      windows: emptyWindows,
      picks_until_me: 12,
      dials: { youth: 0, bellcow: 0, rookie: 0, horizon: 0 },
    });
    check(
      "neutral default reproduces explicit neutral",
      decisionNeutral?.recommendation.name ===
        decisionExplicitNeutral?.recommendation.name,
      `default=${decisionNeutral?.recommendation.name} explicit=${decisionExplicitNeutral?.recommendation.name}`,
    );
    const recDials = decisionNeutral?.recommendation.dial_influences;
    check(
      "neutral default leaves dial_influences empty",
      Array.isArray(recDials) && recDials.length === 0,
      `influences=${JSON.stringify(recDials)}`,
    );
  }

  // Case 2: Bellcow +60 produces an influence on a top-tier RB.
  {
    const snap = makeSnapshot(5, 17);
    const topRb = makePlayer({
      name: "Top RB",
      position: "RB",
      age: 24,
      adp: 4,
      search_rank: 5,
    });
    const cmtRb = makePlayer({
      name: "Committee RB",
      position: "RB",
      age: 27,
      adp: 40,
      search_rank: 60,
    });
    const decision = synthesizeDecision({
      snap,
      ranked: emptyArchetypes,
      available: [topRb, cmtRb],
      windows: emptyWindows,
      picks_until_me: 12,
      dials: { youth: 0, bellcow: 60, rookie: 0, horizon: 0 },
    });
    const rec = decision?.recommendation;
    const hasBellcow =
      rec?.dial_influences?.some((d) => d.dial === "bellcow_pref") ?? false;
    check(
      "Bellcow +60 records an influence on the lean",
      hasBellcow,
      `lean=${rec?.name} influences=${JSON.stringify(rec?.dial_influences)}`,
    );
    const bellcow = rec?.dial_influences?.find(
      (d) => d.dial === "bellcow_pref",
    );
    check(
      "Bellcow influence label includes the dial value",
      typeof bellcow?.label === "string" && bellcow.label.includes("+60"),
      `label=${bellcow?.label}`,
    );
  }

  // Case 3: Rookie tilt +60 produces an influence on a rookie candidate.
  {
    const snap = makeSnapshot(5, 17);
    const rookie = makePlayer({
      name: "Rookie WR",
      position: "WR",
      age: 22,
      adp: 8,
      search_rank: 12,
      is_rookie: true,
    });
    const vet = makePlayer({
      name: "Vet WR",
      position: "WR",
      age: 27,
      adp: 10,
      search_rank: 15,
    });
    const decision = synthesizeDecision({
      snap,
      ranked: emptyArchetypes,
      available: [rookie, vet],
      windows: emptyWindows,
      picks_until_me: 12,
      dials: { youth: 0, bellcow: 0, rookie: 60, horizon: 0 },
    });
    const allTop = decision?.top_candidates ?? [];
    const rookieEntry = allTop.find((c) => c.is_rookie);
    const hasRookieInfluence =
      rookieEntry?.dial_influences?.some((d) => d.dial === "rookie_tilt") ??
      false;
    check(
      "Rookie tilt +60 records an influence on a rookie",
      hasRookieInfluence,
      `influences=${JSON.stringify(rookieEntry?.dial_influences)}`,
    );
  }

  // Case 4: small dial values (below noise floor) do NOT record an influence.
  {
    const snap = makeSnapshot(5, 17);
    const topRb = makePlayer({
      name: "Top RB",
      position: "RB",
      age: 24,
      adp: 4,
      search_rank: 5,
    });
    const decision = synthesizeDecision({
      snap,
      ranked: emptyArchetypes,
      available: [topRb],
      windows: emptyWindows,
      picks_until_me: 12,
      dials: { youth: 2, bellcow: 3, rookie: 0, horizon: 0 },
    });
    const rec = decision?.recommendation;
    check(
      "tiny dial moves do not record an influence (noise floor)",
      Array.isArray(rec?.dial_influences) &&
        (rec?.dial_influences?.length ?? 0) === 0,
      `influences=${JSON.stringify(rec?.dial_influences)}`,
    );
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
