/**
 * Lane Identity regression. Locks the per-player + per-roster lane
 * scoring + aggregation. Replaces the legacy "declared window" concept
 * with multi-attribute lane membership.
 *
 *   npx tsx --tsconfig tsconfig.json evals/lane-identity.test.ts
 *
 * What's tested:
 *   1. Each lane fires HIGH for archetype-fitting players.
 *   2. Each lane fires 0 for clearly-not-fitting players.
 *   3. Format gating: TE-Premium Lock only in TE-premium leagues.
 *   4. Format gating: QB Cartel only in SF leagues.
 *   5. Roster aggregator classifies IN / CLOSE / NOT_IN correctly.
 *   6. Gap description fires only when state === "close".
 *   7. Multi-membership: a single player contributes to multiple
 *      lanes simultaneously (the Venn picture).
 *   8. Founder's 2026-05-11 Finders Keepers draft retroactively
 *      reads as the expected shape: IN for QB Cartel + TE-Premium
 *      Lock + Future Stock + Trade Capital, CLOSE-or-better on
 *      Win-Now Floor + WR Stable, NOT_IN on RB Bellcow + Balanced.
 */

import type { LeagueSnapshot } from "../src/lib/strategy/league-state/snapshot";
import {
  scorePlayerPerLane,
  aggregateRosterIdentity,
  LANE_SPECS,
  type LaneId,
  type LaneMembership,
  type PlayerForLane,
  type PlayerMeta,
  type PlayerValueRecord,
} from "../src/lib/strategy/lane-identity";

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

function snap(overrides: Partial<LeagueSnapshot> = {}): LeagueSnapshot {
  return {
    league_id: "test",
    season: "2026",
    total_teams: 12,
    format: "superflex",
    league_type: "dynasty",
    max_keepers: null,
    scoring: ["PPR", "TE-premium"],
    starter_slots: {
      hard: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
      flex: 2,
      superflex: 1,
      rec_flex: 0,
      bench: 12,
    },
    rosters: [],
    my_roster_id: 1,
    draft: {
      status: "post_draft",
      type: "snake",
      rounds: 20,
      reversal_round: null,
      slot_to_roster_id: {},
      my_slot: null,
      next_pick_no: null,
      picks_made: [],
      traded_picks: [],
      my_pick_schedule: [],
    },
    agg: {
      teams_without_position_after_round: () => 0,
      avg_position_count: () => 0,
    },
    ...overrides,
  } as unknown as LeagueSnapshot;
}

function mkPlayer(p: Partial<PlayerForLane> & { id: string }): PlayerForLane {
  return {
    id: p.id,
    name: p.name ?? p.id,
    position: p.position ?? null,
    team: p.team ?? "TST",
    age: p.age ?? null,
    years_exp: p.years_exp ?? null,
    is_rookie: p.is_rookie ?? false,
    search_rank: p.search_rank ?? 200,
    value: p.value ?? null,
  };
}

console.log("\nLane Identity regression\n");

// 1. Per-lane scoring sanity
{
  console.log("── 1. per-lane scoring fires for archetype fits ──");
  const ctx = snap();

  // Chase-shape: WR, age 26, value 95 → wr_anchor high
  const chase = mkPlayer({
    id: "chase",
    name: "Ja'Marr Chase",
    position: "WR",
    age: 26,
    years_exp: 5,
    value: 95,
    search_rank: 1,
  });
  const chaseScores = scorePlayerPerLane(chase, ctx);
  check(
    "Chase scores 80+ on wr_anchor",
    chaseScores.wr_anchor >= 80,
    `got ${chaseScores.wr_anchor}`,
  );
  check(
    "Chase scores 60+ on win_now_floor",
    chaseScores.win_now_floor >= 60,
    `got ${chaseScores.win_now_floor}`,
  );
  check(
    "Chase scores 0 on rb_bellcow (wrong position)",
    chaseScores.rb_bellcow === 0,
    `got ${chaseScores.rb_bellcow}`,
  );

  // Bijan-shape: RB, age 23, value 90 → rb_bellcow high
  const bijan = mkPlayer({
    id: "bijan",
    name: "Bijan Robinson",
    position: "RB",
    age: 23,
    years_exp: 3,
    value: 90,
    search_rank: 3,
  });
  const bijanScores = scorePlayerPerLane(bijan, ctx);
  check(
    "Bijan scores 80+ on rb_bellcow",
    bijanScores.rb_bellcow >= 80,
    `got ${bijanScores.rb_bellcow}`,
  );
  check(
    "Bijan scores 60+ on win_now_floor",
    bijanScores.win_now_floor >= 60,
    `got ${bijanScores.win_now_floor}`,
  );
  check(
    "Bijan scores 30+ on trade_capital",
    bijanScores.trade_capital >= 30,
    `got ${bijanScores.trade_capital}`,
  );

  // Tyler Warren-shape rookie TE in TE-premium SF
  const warren = mkPlayer({
    id: "warren",
    name: "Tyler Warren",
    position: "TE",
    age: 21,
    years_exp: 0,
    is_rookie: true,
    value: 55,
    search_rank: 35,
  });
  const warrenScores = scorePlayerPerLane(warren, ctx);
  check(
    "Warren (rookie TE in TE-premium) scores 50+ on te_premium_lock",
    warrenScores.te_premium_lock >= 50,
    `got ${warrenScores.te_premium_lock}`,
  );
  check(
    "Warren scores 50+ on future_stock (rookie)",
    warrenScores.future_stock >= 50,
    `got ${warrenScores.future_stock}`,
  );
  check(
    "Warren contributes to win_now_floor (scarce-pos rookie)",
    warrenScores.win_now_floor >= 25,
    `got ${warrenScores.win_now_floor}`,
  );
}

// 2. Per-lane scoring: zero for not-fitting + sliding scale for win-now
{
  console.log("── 2. zero for not-fitting + sliding-scale floor ──");
  const ctx = snap();
  const lowValueRb = mkPlayer({
    id: "mason",
    name: "Jordan Mason",
    position: "RB",
    age: 26,
    years_exp: 3,
    value: 13,
  });
  const scores = scorePlayerPerLane(lowValueRb, ctx);
  // Bellcow / Anchor are tier-archetypes. Below tier = not a bellcow.
  check(
    "Low-value RB scores 0 on rb_bellcow (archetype tier-gated)",
    scores.rb_bellcow === 0,
    `got ${scores.rb_bellcow}`,
  );
  check(
    "Low-value player scores 0 on trade_capital",
    scores.trade_capital === 0,
    `got ${scores.trade_capital}`,
  );
  // Win-Now Floor is a SLIDING SCALE per founder direction 2026-05-12.
  // A value-13 vet RB contributes a small but non-zero amount: bye-
  // week / injury depth that's still real. Should be in [1, 10].
  check(
    "Low-value RB has small but non-zero win_now_floor (sliding scale)",
    scores.win_now_floor >= 1 && scores.win_now_floor <= 10,
    `got ${scores.win_now_floor}`,
  );

  // Aged-out vet falls outside the age band entirely.
  const oldQbBackup = mkPlayer({
    id: "oldqb",
    position: "QB",
    age: 38,
    years_exp: 16,
    value: 25,
  });
  const oldScores = scorePlayerPerLane(oldQbBackup, ctx);
  check(
    "Age 38 QB scores 0 on win_now_floor (outside age band)",
    oldScores.win_now_floor === 0,
    `got ${oldScores.win_now_floor}`,
  );

  // Sliding-scale specifics: each tier produces a meaningful gradient.
  // WR3 (value 30, age 25): expect mid-20s contribution.
  // WR2 (value 55, age 25): expect mid-50s contribution.
  // WR1 (value 90, age 25): expect 90+.
  const wr3 = mkPlayer({
    id: "wr3",
    position: "WR",
    age: 25,
    years_exp: 3,
    value: 30,
  });
  const wr2 = mkPlayer({
    id: "wr2",
    position: "WR",
    age: 25,
    years_exp: 3,
    value: 55,
  });
  const wr1 = mkPlayer({
    id: "wr1",
    position: "WR",
    age: 25,
    years_exp: 3,
    value: 90,
  });
  const s3 = scorePlayerPerLane(wr3, ctx).win_now_floor;
  const s2 = scorePlayerPerLane(wr2, ctx).win_now_floor;
  const s1 = scorePlayerPerLane(wr1, ctx).win_now_floor;
  check(
    "WR3 (value 30) contributes 18-30 to win_now_floor",
    s3 >= 18 && s3 <= 30,
    `got ${s3}`,
  );
  check(
    "WR2 (value 55) contributes 45-60 to win_now_floor",
    s2 >= 45 && s2 <= 60,
    `got ${s2}`,
  );
  check(
    "WR1 (value 90) contributes 90+ to win_now_floor",
    s1 >= 90,
    `got ${s1}`,
  );
  check(
    "Win-now contribution strictly increases with value (sliding scale)",
    s1 > s2 && s2 > s3,
    `WR1=${s1} WR2=${s2} WR3=${s3}`,
  );
}

// 3. Format gating
{
  console.log("── 3. format gating ──");
  const nonSf = snap({ format: "1qb", scoring: ["PPR"] });
  const sf = snap({ format: "superflex", scoring: ["PPR"] });
  const tePremiumNonSf = snap({ format: "1qb", scoring: ["PPR", "TE-premium"] });

  // QB Cartel should only contribute in SF
  const qb = mkPlayer({
    id: "qb",
    position: "QB",
    age: 28,
    years_exp: 6,
    value: 80,
  });
  check(
    "qb_cartel scores 0 in 1QB format",
    scorePlayerPerLane(qb, nonSf).qb_cartel === 0,
  );
  check(
    "qb_cartel scores high in SF format",
    scorePlayerPerLane(qb, sf).qb_cartel >= 70,
  );

  // TE-Premium Lock should only contribute in TE-premium
  const te = mkPlayer({
    id: "te",
    position: "TE",
    age: 26,
    years_exp: 5,
    value: 65,
  });
  check(
    "te_premium_lock scores 0 in non-TE-premium PPR",
    scorePlayerPerLane(te, nonSf).te_premium_lock === 0,
  );
  check(
    "te_premium_lock scores high in 1QB TE-premium",
    scorePlayerPerLane(te, tePremiumNonSf).te_premium_lock >= 60,
  );
}

// 4. Roster aggregator: IN / CLOSE / NOT_IN classification
{
  console.log("── 4. roster aggregator classification ──");
  const ctx = snap({ format: "1qb", scoring: ["PPR"] });

  // Build a roster that's clearly IN wr_stable + wr_anchor: 3 strong WRs
  const valueMap = new Map<string, PlayerValueRecord>([
    ["wr1", { value: 95, overall_rank: 1 }],
    ["wr2", { value: 70, overall_rank: 8 }],
    ["wr3", { value: 60, overall_rank: 18 }],
  ]);
  const lookup = (id: string): PlayerMeta | null => {
    const map: Record<string, PlayerMeta> = {
      wr1: {
        name: "WR Anchor",
        position: "WR",
        team: "X",
        age: 26,
        years_exp: 5,
        is_rookie: false,
        search_rank: 1,
      },
      wr2: {
        name: "WR Stable A",
        position: "WR",
        team: "Y",
        age: 25,
        years_exp: 4,
        is_rookie: false,
        search_rank: 12,
      },
      wr3: {
        name: "WR Stable B",
        position: "WR",
        team: "Z",
        age: 24,
        years_exp: 3,
        is_rookie: false,
        search_rank: 30,
      },
    };
    return map[id] ?? null;
  };

  const memberships = aggregateRosterIdentity({
    playerIds: ["wr1", "wr2", "wr3"],
    playerLookup: lookup,
    playerValueMap: valueMap,
    snap: ctx,
  });

  const wrAnchor = memberships.find((m) => m.lane_id === "wr_anchor")!;
  const wrStable = memberships.find((m) => m.lane_id === "wr_stable")!;
  const rbBellcow = memberships.find((m) => m.lane_id === "rb_bellcow")!;

  check(
    "WR Anchor lane: 1 elite WR → state=in",
    wrAnchor.state === "in",
    `state=${wrAnchor.state} agg=${wrAnchor.aggregate_score}`,
  );
  check(
    "WR Stable lane: 3 quality WRs → state=in",
    wrStable.state === "in",
    `state=${wrStable.state} agg=${wrStable.aggregate_score}`,
  );
  check(
    "RB Bellcow lane: no RBs → state=not_in",
    rbBellcow.state === "not_in",
    `state=${rbBellcow.state} agg=${rbBellcow.aggregate_score}`,
  );
  check(
    "RB Bellcow gap is null when state=not_in",
    rbBellcow.gap === null,
  );
}

// 5. CLOSE state fires gap description; IN state does not
{
  console.log("── 5. gap description gated on close state ──");
  const ctx = snap({ format: "1qb", scoring: ["PPR"] });
  // Two WR2 producers; not enough for WR Stable IN but should be CLOSE.
  // Per spec: closeThreshold=130, inThreshold=180.
  // Each WR at value 55 scores: 50 + (55-50)*0.5 = 52.5 → 53.
  // Three at value 55 would sum to 159 (CLOSE).
  const valueMap = new Map<string, PlayerValueRecord>([
    ["w1", { value: 55, overall_rank: 30 }],
    ["w2", { value: 55, overall_rank: 31 }],
    ["w3", { value: 55, overall_rank: 32 }],
  ]);
  const lookup = (id: string): PlayerMeta | null => ({
    name: id,
    position: "WR",
    team: "X",
    age: 24,
    years_exp: 3,
    is_rookie: false,
    search_rank: 30,
  });

  const memberships = aggregateRosterIdentity({
    playerIds: ["w1", "w2", "w3"],
    playerLookup: lookup,
    playerValueMap: valueMap,
    snap: ctx,
  });
  const wrStable = memberships.find((m) => m.lane_id === "wr_stable")!;
  check(
    "WR Stable: 3 WR2s near threshold → state=close",
    wrStable.state === "close",
    `state=${wrStable.state} agg=${wrStable.aggregate_score}`,
  );
  check(
    "Gap description present when state=close",
    wrStable.gap !== null && wrStable.gap.description.length > 0,
  );
  check(
    "Gap move_type is trade_for (close-lane default for WR stable)",
    wrStable.gap?.move_type === "trade_for",
  );
}

// 6. Multi-membership: a player contributes to multiple lanes
{
  console.log("── 6. multi-membership (Venn picture) ──");
  const ctx = snap();
  const warren = mkPlayer({
    id: "warren",
    name: "Tyler Warren",
    position: "TE",
    age: 21,
    years_exp: 0,
    is_rookie: true,
    value: 55,
    search_rank: 35,
  });
  const scores = scorePlayerPerLane(warren, ctx);
  const lanesHit = Object.entries(scores).filter(([, v]) => v > 0);
  check(
    "Warren contributes to 3+ lanes (rookie TE in TE-premium SF)",
    lanesHit.length >= 3,
    `hit ${lanesHit.length}: ${lanesHit.map(([k, v]) => `${k}=${v}`).join(", ")}`,
  );
}

// 7. Founder's Finders Keepers draft retroactively reads as expected
{
  console.log("── 7. founder's 2026-05-11 draft reads correctly ──");
  const ctx = snap({ format: "superflex", scoring: ["PPR", "TE-premium"] });

  // 20 picks at approximate values. Values are rough but representative
  // of the EV bank screenshot. The test asserts SHAPE not exact numbers.
  const meta: Record<string, PlayerMeta> = {
    chase: {
      name: "Ja'Marr Chase",
      position: "WR",
      team: "CIN",
      age: 26,
      years_exp: 5,
      is_rookie: false,
      search_rank: 1,
    },
    lamar: {
      name: "Lamar Jackson",
      position: "QB",
      team: "BAL",
      age: 29,
      years_exp: 8,
      is_rookie: false,
      search_rank: 4,
    },
    mahomes: {
      name: "Patrick Mahomes",
      position: "QB",
      team: "KC",
      age: 30,
      years_exp: 9,
      is_rookie: false,
      search_rank: 8,
    },
    warren: {
      name: "Tyler Warren",
      position: "TE",
      team: "NYJ",
      age: 21,
      years_exp: 0,
      is_rookie: true,
      search_rank: 35,
    },
    tate: {
      name: "Carnell Tate",
      position: "WR",
      team: "ATL",
      age: 22,
      years_exp: 0,
      is_rookie: true,
      search_rank: 50,
    },
    mcconkey: {
      name: "Ladd McConkey",
      position: "WR",
      team: "LAC",
      age: 23,
      years_exp: 1,
      is_rookie: false,
      search_rank: 22,
    },
    price: {
      name: "Jadarian Price",
      position: "RB",
      team: "NO",
      age: 22,
      years_exp: 0,
      is_rookie: true,
      search_rank: 90,
    },
    monangai: {
      name: "Kyle Monangai",
      position: "RB",
      team: "CHI",
      age: 22,
      years_exp: 0,
      is_rookie: true,
      search_rank: 130,
    },
    mason: {
      name: "Jordan Mason",
      position: "RB",
      team: "MIN",
      age: 26,
      years_exp: 3,
      is_rookie: false,
      search_rank: 170,
    },
    concepcion: {
      name: "KC Concepcion",
      position: "WR",
      team: "NE",
      age: 22,
      years_exp: 0,
      is_rookie: true,
      search_rank: 110,
    },
    sadiq: {
      name: "Kenyon Sadiq",
      position: "TE",
      team: "DEN",
      age: 21,
      years_exp: 0,
      is_rookie: true,
      search_rank: 145,
    },
    charbonnet: {
      name: "Zach Charbonnet",
      position: "RB",
      team: "SEA",
      age: 24,
      years_exp: 2,
      is_rookie: false,
      search_rank: 80,
    },
    stowers: {
      name: "Eli Stowers",
      position: "TE",
      team: "PHI",
      age: 23,
      years_exp: 0,
      is_rookie: true,
      search_rank: 155,
    },
    penix: {
      name: "Michael Penix",
      position: "QB",
      team: "ATL",
      age: 25,
      years_exp: 1,
      is_rookie: false,
      search_rank: 80,
    },
    andrews: {
      name: "Mark Andrews",
      position: "TE",
      team: "BAL",
      age: 30,
      years_exp: 7,
      is_rookie: false,
      search_rank: 60,
    },
    mitchell: {
      name: "Adonai Mitchell",
      position: "WR",
      team: "IND",
      age: 23,
      years_exp: 1,
      is_rookie: false,
      search_rank: 120,
    },
    neal: {
      name: "Devin Neal",
      position: "RB",
      team: "NO",
      age: 22,
      years_exp: 0,
      is_rookie: true,
      search_rank: 180,
    },
    sampson: {
      name: "Dylan Sampson",
      position: "RB",
      team: "CLE",
      age: 21,
      years_exp: 0,
      is_rookie: true,
      search_rank: 150,
    },
    shedeur: {
      name: "Shedeur Sanders",
      position: "QB",
      team: "CLE",
      age: 23,
      years_exp: 0,
      is_rookie: true,
      search_rank: 70,
    },
    richardson: {
      name: "Anthony Richardson",
      position: "QB",
      team: "IND",
      age: 23,
      years_exp: 2,
      is_rookie: false,
      search_rank: 75,
    },
  };

  const values: Record<string, number> = {
    chase: 95,
    lamar: 80,
    mahomes: 70,
    warren: 55,
    tate: 40,
    mcconkey: 55,
    price: 25,
    monangai: 18,
    mason: 13,
    concepcion: 28,
    sadiq: 35,
    charbonnet: 35,
    stowers: 28,
    penix: 35,
    andrews: 45,
    mitchell: 30,
    neal: 18,
    sampson: 25,
    shedeur: 42,
    richardson: 32,
  };

  const playerIds = Object.keys(meta);
  const valueMap = new Map<string, PlayerValueRecord>();
  for (const id of playerIds) {
    valueMap.set(id, { value: values[id], overall_rank: null });
  }
  const lookup = (id: string) => meta[id] ?? null;

  const memberships = aggregateRosterIdentity({
    playerIds,
    playerLookup: lookup,
    playerValueMap: valueMap,
    snap: ctx,
  });
  const get = (id: LaneId): LaneMembership =>
    memberships.find((m) => m.lane_id === id)!;

  check(
    "QB Cartel: IN (2 elite QBs + 3 stash in SF)",
    get("qb_cartel").state === "in",
    `state=${get("qb_cartel").state} agg=${get("qb_cartel").aggregate_score}`,
  );
  check(
    "TE-Premium Lock: IN (Warren + Andrews + Sadiq + Stowers in TE-premium)",
    get("te_premium_lock").state === "in",
    `state=${get("te_premium_lock").state} agg=${get("te_premium_lock").aggregate_score}`,
  );
  check(
    "Future Stock: IN (rookies + year-2 throughout)",
    get("future_stock").state === "in",
    `state=${get("future_stock").state} agg=${get("future_stock").aggregate_score}`,
  );
  check(
    "Trade Capital: IN (multi-asset KTC depth)",
    get("trade_capital").state === "in",
    `state=${get("trade_capital").state} agg=${get("trade_capital").aggregate_score}`,
  );
  check(
    "Win-Now Floor: CLOSE or worse (barbell roster: 3 elite vets, depth-thin)",
    get("win_now_floor").state !== "in",
    `state=${get("win_now_floor").state} agg=${get("win_now_floor").aggregate_score}`,
  );
  check(
    "RB Bellcow: NOT_IN (no top-tier RB)",
    get("rb_bellcow").state === "not_in",
    `state=${get("rb_bellcow").state} agg=${get("rb_bellcow").aggregate_score}`,
  );
  check(
    "WR Anchor: IN (Chase)",
    get("wr_anchor").state === "in",
    `state=${get("wr_anchor").state} agg=${get("wr_anchor").aggregate_score}`,
  );
  check(
    "Balanced: NOT_IN (barbell, no prime-age depth)",
    get("balanced").state === "not_in",
    `state=${get("balanced").state} agg=${get("balanced").aggregate_score}`,
  );
}

// 8. Aggregator only returns lanes that applyTo the format
{
  console.log("── 8. aggregator filters by appliesTo ──");
  const nonSfNonTep = snap({ format: "1qb", scoring: ["PPR"] });
  const memberships = aggregateRosterIdentity({
    playerIds: [],
    playerLookup: () => null,
    playerValueMap: new Map(),
    snap: nonSfNonTep,
  });
  const ids = new Set(memberships.map((m) => m.lane_id));
  check(
    "qb_cartel excluded in 1QB format",
    !ids.has("qb_cartel"),
  );
  check(
    "te_premium_lock excluded in non-TE-premium",
    !ids.has("te_premium_lock"),
  );
  check(
    "win_now_floor still present (format-agnostic)",
    ids.has("win_now_floor"),
  );
}

console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
