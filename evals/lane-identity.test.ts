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
 *   4. Format gating: QB Stable only in SF leagues.
 *   5. Roster aggregator classifies IN / CLOSE / NOT_IN correctly.
 *   6. Gap description fires only when state === "close".
 *   7. Multi-membership: a single player contributes to multiple
 *      lanes simultaneously (the Venn picture).
 *   8. Founder's 2026-05-11 Finders Keepers draft retroactively
 *      reads as the expected shape: IN for QB Stable + TE-Premium
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
  // Bijan at age 23 is an ANCHOR, not consolidation fodder. The
  // audit-driven eligibility restriction on trade_capital (age >= 25
  // OR scarce-pos rookie at value >= 50) correctly excludes anchor-
  // tier young assets. Bijan counts on rb_bellcow + win_now_floor;
  // he doesn't count on trade_capital because you wouldn't trade
  // your bellcow as "depth."
  check(
    "Bijan (age 23 RB anchor) scores 0 on trade_capital (not consolidation fodder)",
    bijanScores.trade_capital === 0,
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

  // Aged-out vet under position-aware QB curve: age 37-38 still
  // contributes (0.6x band), per sliding-scale principle. A deep-
  // bench QB is not zero, just small.
  const oldQbBackup = mkPlayer({
    id: "oldqb",
    position: "QB",
    age: 38,
    years_exp: 16,
    value: 25,
  });
  const oldScores = scorePlayerPerLane(oldQbBackup, ctx);
  check(
    "Age 38 QB (low value) contributes small win_now_floor (sliding scale + position-aware)",
    oldScores.win_now_floor >= 1 && oldScores.win_now_floor < 20,
    `got ${oldScores.win_now_floor}`,
  );
  // Truly outside the QB age band (age 39+) returns 0.
  const ancientQb = mkPlayer({
    id: "ancientqb",
    position: "QB",
    age: 41,
    years_exp: 19,
    value: 40,
  });
  check(
    "Age 41 QB (past curve) scores 0 on win_now_floor",
    scorePlayerPerLane(ancientQb, ctx).win_now_floor === 0,
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

  // QB Stable should only contribute in SF
  const qb = mkPlayer({
    id: "qb",
    position: "QB",
    age: 28,
    years_exp: 6,
    value: 80,
  });
  check(
    "qb_stable scores 0 in 1QB format",
    scorePlayerPerLane(qb, nonSf).qb_stable === 0,
  );
  check(
    "qb_stable scores high in SF format",
    scorePlayerPerLane(qb, sf).qb_stable >= 70,
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
  // Mixed-tier WRs: one WR1.5 + one WR2 + one WR3. Sum lands in the
  // CLOSE band (100-140). Uniformity check fails (min 27 < 45) but
  // uniformity only blocks IN, not CLOSE.
  //   value 70: 50 + (70-50)*0.5 = 60
  //   value 50: 50
  //   value 45: 0.6 * 45 = 27
  //   sum = 137 (CLOSE; in band 100-140)
  const valueMap = new Map<string, PlayerValueRecord>([
    ["w1", { value: 70, overall_rank: 12 }],
    ["w2", { value: 50, overall_rank: 30 }],
    ["w3", { value: 45, overall_rank: 50 }],
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
    "WR Stable: 3 WRs in mixed tiers, sum 100-140 -> state=close",
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
    "QB Stable: IN (2 elite QBs + 3 stash in SF)",
    get("qb_stable").state === "in",
    `state=${get("qb_stable").state} agg=${get("qb_stable").aggregate_score}`,
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
  // Trade Capital re-calibrated 2026-05-12 against 58-roster cohort
  // (IN at 190, was 440). Founder's roster sums to 344, comfortably
  // top quartile across the cohort. State now IN, but on a calibrated
  // threshold rather than a sample-of-1 fit.
  check(
    "Trade Capital: IN (top-quartile across cohort under calibrated threshold)",
    get("trade_capital").state === "in",
    `state=${get("trade_capital").state} agg=${get("trade_capital").aggregate_score}`,
  );
  // Win-Now Floor shifted to IN with position-aware age curves: QBs
  // 29-30 (Lamar, Mahomes) now score at full peak-band weight instead
  // of 0.85x, which lifts the sum by ~25 points. The honest read is
  // the math says IN. The prior CLOSE was an artifact of the flat
  // age curve underpricing veteran QBs.
  check(
    "Win-Now Floor: IN (position-aware QB curve corrects prior under-pricing)",
    get("win_now_floor").state === "in",
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
  // Position-aware balanced bands (audit B.3) include more of the
  // roster than the prior flat 23-27 cap. The founder actually HAS
  // 5 prime-age value-40+ producers: Chase (WR 26), Lamar (QB 29),
  // Mahomes (QB 30), McConkey (WR 23), Andrews (TE 30). The earlier
  // "barbell" mental model under-counted the elite-vet prime band.
  check(
    "Balanced: IN (position-aware bands credit elite prime-age vets)",
    get("balanced").state === "in",
    `state=${get("balanced").state} agg=${get("balanced").aggregate_score}`,
  );

  // Derived lanes
  check(
    "Sustained Contender: IN (win-now + future + archetype anchor all met)",
    get("sustained_contender").state === "in",
    `state=${get("sustained_contender").state} agg=${get("sustained_contender").aggregate_score}`,
  );
  check(
    "Sustained Contender is flagged as derived",
    get("sustained_contender").is_derived === true,
  );
  // Zero-RB derived: rb_bellcow=not_in + wr_stable state determines.
  // Founder's WR room (Chase + McConkey + thin) doesn't clear WR
  // Stable IN; should land NOT_IN or CLOSE on Zero-RB.
  check(
    "Zero-RB: NOT_IN (WR Stable not strong enough to call it a deliberate strategy)",
    get("zero_rb").state !== "in",
    `state=${get("zero_rb").state}`,
  );
}

// 9. Position-aware age curves correct prior position-blind pricing
{
  console.log("── 9. position-aware age curves ──");
  const ctx = snap();
  const qb29 = mkPlayer({
    id: "qb29",
    position: "QB",
    age: 29,
    years_exp: 8,
    value: 75,
  });
  const rb29 = mkPlayer({
    id: "rb29",
    position: "RB",
    age: 29,
    years_exp: 8,
    value: 75,
  });
  const wr30 = mkPlayer({
    id: "wr30",
    position: "WR",
    age: 30,
    years_exp: 8,
    value: 75,
  });
  const qbScore = scorePlayerPerLane(qb29, ctx).win_now_floor;
  const rbScore = scorePlayerPerLane(rb29, ctx).win_now_floor;
  const wrScore = scorePlayerPerLane(wr30, ctx).win_now_floor;
  // Same value, different positions. QB at 29 is in peak band (26-33);
  // RB at 29 is in cliff (0.5x); WR at 30 is at edge (0.85x).
  check(
    "QB age 29 contributes 50%+ MORE than RB age 29 at same value",
    qbScore >= rbScore * 1.5,
    `QB=${qbScore} RB=${rbScore}`,
  );
  check(
    "WR age 30 contributes more than RB age 29 at same value",
    wrScore > rbScore,
    `WR=${wrScore} RB=${rbScore}`,
  );
  // Age 23 WR not rookie, value 60. WR band 23 = 0.85x.
  // Age 28 WR not rookie, value 60. WR band 24-29 = 1.0x.
  const wr23 = mkPlayer({
    id: "wr23",
    position: "WR",
    age: 23,
    years_exp: 1,
    value: 60,
  });
  const wr28 = mkPlayer({
    id: "wr28",
    position: "WR",
    age: 28,
    years_exp: 6,
    value: 60,
  });
  const s23 = scorePlayerPerLane(wr23, ctx).win_now_floor;
  const s28 = scorePlayerPerLane(wr28, ctx).win_now_floor;
  check(
    "WR age 28 (peak band) scores higher than WR age 23 (year-1) at same value",
    s28 > s23,
    `28=${s28} 23=${s23}`,
  );
  // Age 28 WR also contributes to balanced (the prior bug excluded
  // age 28 across positions, creating a 50-point cliff inside WR
  // prime).
  const balanced28 = scorePlayerPerLane(wr28, ctx).balanced;
  check(
    "WR age 28 contributes to balanced (audit B.3 fix)",
    balanced28 > 0,
    `balanced=${balanced28}`,
  );
}

// 10. Format-size scaling
{
  console.log("── 10. format-size scaling ──");
  // 12-team SF baseline: factor 1.0
  const sf12 = snap({
    format: "superflex",
    total_teams: 12,
  });
  // 10-team 1QB with 8 starters: factor (10/12) * (8/9) ≈ 0.74
  const team10 = snap({
    format: "1qb",
    scoring: ["PPR"],
    total_teams: 10,
    starter_slots: {
      hard: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
      flex: 2,
      superflex: 0,
      rec_flex: 0,
      bench: 8,
    },
  });

  // Build a synthetic roster that lands at aggregate 380 on win-now-floor.
  // Under 12-team SF (threshold 480) -> CLOSE.
  // Under 10-team 1QB (threshold ~355) -> IN.
  const playerIds = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const lookup = (id: string): PlayerMeta => ({
    name: id,
    position: "WR",
    team: "X",
    age: 26,
    years_exp: 5,
    is_rookie: false,
    search_rank: 30,
  });
  // 9 WRs each at value 47 (post-curve: (47-10)*1.176 = 43.5; round 44).
  // Sum top-9 ≈ 396.
  const valueMap = new Map<string, PlayerValueRecord>();
  for (const id of playerIds) {
    valueMap.set(id, { value: 47, overall_rank: 30 });
  }

  const m12 = aggregateRosterIdentity({
    playerIds,
    playerLookup: lookup,
    playerValueMap: valueMap,
    snap: sf12,
  });
  const m10 = aggregateRosterIdentity({
    playerIds,
    playerLookup: lookup,
    playerValueMap: valueMap,
    snap: team10,
  });

  const wnf12 = m12.find((m) => m.lane_id === "win_now_floor")!;
  const wnf10 = m10.find((m) => m.lane_id === "win_now_floor")!;

  // Format-size scaling is DISABLED as of 2026-05-12 calibration:
  // with only 1 of 5 cohort leagues at 10 teams, we lack statistical
  // power to validate the scale factor. Thresholds are identical
  // across formats until the cohort gains more 10-team data. These
  // assertions document the current state; flip them when scaling
  // is re-enabled.
  check(
    "format scaling disabled: same threshold across league sizes",
    wnf12.in_threshold === wnf10.in_threshold,
    `12-team=${wnf12.in_threshold} 10-team=${wnf10.in_threshold}`,
  );
  check(
    "same roster shape classifies identically regardless of league size (scaling off)",
    wnf12.state === wnf10.state,
    `12-team=${wnf12.state} 10-team=${wnf10.state}`,
  );
}

// 11. WR Stable uniformity guard (audit B.8)
{
  console.log("── 11. WR Stable uniformity guard ──");
  const ctx = snap({ format: "1qb", scoring: ["PPR"] });
  // Anchor-plus-fillers: one WR1 at 100, two fillers at 40 each.
  // Sum = 100 + 40 + 40 = 180 (passes sum threshold) but min is 40
  // (fails min-45 uniformity). Should NOT classify as IN.
  const valueMap = new Map<string, PlayerValueRecord>([
    ["anchor", { value: 95, overall_rank: 1 }],
    ["filler1", { value: 40, overall_rank: 60 }],
    ["filler2", { value: 40, overall_rank: 61 }],
  ]);
  const lookup = (id: string): PlayerMeta => ({
    name: id,
    position: "WR",
    team: "X",
    age: 26,
    years_exp: 5,
    is_rookie: false,
    search_rank: id === "anchor" ? 1 : 60,
  });
  const memberships = aggregateRosterIdentity({
    playerIds: ["anchor", "filler1", "filler2"],
    playerLookup: lookup,
    playerValueMap: valueMap,
    snap: ctx,
  });
  const wrStable = memberships.find((m) => m.lane_id === "wr_stable")!;
  check(
    "Anchor + 2 fillers does NOT classify as WR Stable IN (uniformity guard)",
    wrStable.state !== "in",
    `state=${wrStable.state} agg=${wrStable.aggregate_score}`,
  );
}

// 12. Trade Capital eligibility restriction
{
  console.log("── 12. Trade Capital eligibility ──");
  const ctx = snap();
  // Young non-rookie (age 23, year-2): should NOT count toward trade
  // capital (excluded so it doesn't double-count Future Stock).
  const youngVet = mkPlayer({
    id: "young",
    position: "WR",
    age: 23,
    years_exp: 1,
    is_rookie: false,
    value: 60,
  });
  check(
    "Young non-rookie (age 23) excluded from trade_capital (overlap fix)",
    scorePlayerPerLane(youngVet, ctx).trade_capital === 0,
  );
  // Mature vet (age 26): full trade_capital contribution.
  const matureVet = mkPlayer({
    id: "mature",
    position: "WR",
    age: 26,
    years_exp: 4,
    is_rookie: false,
    value: 60,
  });
  check(
    "Mature vet (age 26) contributes to trade_capital",
    scorePlayerPerLane(matureVet, ctx).trade_capital > 0,
  );
  // Scarce-pos rookie (TE in TE-premium) at value 50+: exception
  // applies; tradeable.
  const scarceRookie = mkPlayer({
    id: "scarce_rookie",
    position: "TE",
    age: 21,
    years_exp: 0,
    is_rookie: true,
    value: 55,
  });
  check(
    "Scarce-pos rookie TE in TE-premium (value 50+) DOES count in trade_capital",
    scorePlayerPerLane(scarceRookie, ctx).trade_capital > 0,
  );
}

// 13. Derived lane: Sustained Contender + Zero-RB shape checks
{
  console.log("── 13. derived lane composition ──");
  const ctx = snap({ format: "1qb", scoring: ["PPR"] });
  // Empty roster: every base lane NOT_IN. Sustained Contender NOT_IN.
  const empty = aggregateRosterIdentity({
    playerIds: [],
    playerLookup: () => null,
    playerValueMap: new Map(),
    snap: ctx,
  });
  const sc = empty.find((m) => m.lane_id === "sustained_contender")!;
  const zr = empty.find((m) => m.lane_id === "zero_rb")!;
  check(
    "Sustained Contender NOT_IN on empty roster",
    sc.state === "not_in",
  );
  check(
    "Zero-RB NOT_IN on empty roster (no rb_bellcow=not_in WITHOUT a wr stable)",
    zr.state === "not_in",
  );
  check(
    "Sustained Contender is_derived flag set",
    sc.is_derived === true,
  );
  check(
    "Zero-RB axis = composite",
    zr.axis === "composite",
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
    "qb_stable excluded in 1QB format",
    !ids.has("qb_stable"),
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

// 14. Distribution regression: archetype rosters that were NOT used to
// calibrate thresholds. Locks the shape so threshold drift breaks the
// test before it ships. Per assumption audit F.1: a threshold tuned
// to one example has zero degrees of cross-validation freedom; these
// rosters are the out-of-sample sanity check.
{
  console.log("── 14. archetype-cohort regression fixtures ──");

  // Shared helper: build the lookup + value map from a roster spec
  // and run aggregateRosterIdentity.
  type RosterSpec = {
    label: string;
    snapOverrides?: Partial<LeagueSnapshot>;
    players: Array<{
      id: string;
      name: string;
      position: "QB" | "RB" | "WR" | "TE";
      team: string;
      age: number;
      years_exp: number;
      is_rookie?: boolean;
      search_rank: number;
      value: number;
    }>;
  };

  function scoreRoster(spec: RosterSpec) {
    const ctx = snap(spec.snapOverrides ?? {});
    const meta: Record<string, PlayerMeta> = {};
    const values = new Map<string, PlayerValueRecord>();
    for (const p of spec.players) {
      meta[p.id] = {
        name: p.name,
        position: p.position,
        team: p.team,
        age: p.age,
        years_exp: p.years_exp,
        is_rookie: p.is_rookie ?? false,
        search_rank: p.search_rank,
      };
      values.set(p.id, { value: p.value, overall_rank: null });
    }
    return aggregateRosterIdentity({
      playerIds: spec.players.map((p) => p.id),
      playerLookup: (id) => meta[id] ?? null,
      playerValueMap: values,
      snap: ctx,
    });
  }

  // ── Archetype A: Loaded Contender. Three elite vets at peak ages
  //    across QB/RB/WR/TE; a bellcow RB anchors; a WR1 anchors. SF +
  //    TE-premium. Should read IN on Win-Now Floor + Balanced + RB
  //    Bellcow + WR Anchor + QB Stable + TE-Premium Lock + Trade
  //    Capital + Sustained Contender.
  const loadedContender: RosterSpec = {
    label: "loaded contender",
    players: [
      // Two elite QBs at peak (SF)
      { id: "lc_qb1", name: "Burrow", position: "QB", team: "CIN", age: 29, years_exp: 8, search_rank: 5, value: 90 },
      { id: "lc_qb2", name: "Allen", position: "QB", team: "BUF", age: 30, years_exp: 9, search_rank: 7, value: 85 },
      // Bellcow RB peak-age
      { id: "lc_rb1", name: "Bijan", position: "RB", team: "ATL", age: 24, years_exp: 4, search_rank: 3, value: 92 },
      { id: "lc_rb2", name: "Achane", position: "RB", team: "MIA", age: 25, years_exp: 4, search_rank: 18, value: 70 },
      // WR1 anchor + WR2 + WR3
      { id: "lc_wr1", name: "Chase", position: "WR", team: "CIN", age: 26, years_exp: 5, search_rank: 1, value: 95 },
      { id: "lc_wr2", name: "Lamb", position: "WR", team: "DAL", age: 27, years_exp: 6, search_rank: 4, value: 88 },
      { id: "lc_wr3", name: "DK", position: "WR", team: "SEA", age: 28, years_exp: 7, search_rank: 14, value: 70 },
      // Elite TE + TE2 (TE-premium)
      { id: "lc_te1", name: "Bowers", position: "TE", team: "LV", age: 23, years_exp: 2, search_rank: 12, value: 82 },
      { id: "lc_te2", name: "LaPorta", position: "TE", team: "DET", age: 25, years_exp: 3, search_rank: 25, value: 65 },
      // Future Stock depth: a couple of year-1/year-2 WRs at value
      // that pass the future_stock threshold. Without these, the
      // composite Sustained Contender lane stays CLOSE because
      // future_stock has nothing. A real "sustained" contender
      // carries both elite vets AND ascending youth.
      { id: "lc_rb3", name: "Rookie RB stash", position: "RB", team: "RB3", age: 22, years_exp: 0, is_rookie: true, search_rank: 95, value: 45 },
      { id: "lc_wr4", name: "Year-2 WR", position: "WR", team: "W4", age: 23, years_exp: 1, search_rank: 45, value: 55 },
      { id: "lc_wr5", name: "Rookie WR stash", position: "WR", team: "W5", age: 22, years_exp: 0, is_rookie: true, search_rank: 85, value: 40 },
    ],
  };
  const lcMem = scoreRoster(loadedContender);
  const lcGet = (id: LaneId) =>
    lcMem.find((m) => m.lane_id === id) as LaneMembership;
  check(
    "Loaded Contender: WR Anchor IN",
    lcGet("wr_anchor").state === "in",
    `state=${lcGet("wr_anchor").state} agg=${lcGet("wr_anchor").aggregate_score}`,
  );
  check(
    "Loaded Contender: RB Bellcow IN",
    lcGet("rb_bellcow").state === "in",
    `state=${lcGet("rb_bellcow").state} agg=${lcGet("rb_bellcow").aggregate_score}`,
  );
  check(
    "Loaded Contender: Win-Now Floor IN",
    lcGet("win_now_floor").state === "in",
    `state=${lcGet("win_now_floor").state} agg=${lcGet("win_now_floor").aggregate_score}`,
  );
  check(
    "Loaded Contender: Sustained Contender IN",
    lcGet("sustained_contender").state === "in",
    `state=${lcGet("sustained_contender").state}`,
  );
  check(
    "Loaded Contender: Zero-RB NOT_IN (has a bellcow, so not zero-RB)",
    lcGet("zero_rb").state === "not_in",
    `state=${lcGet("zero_rb").state}`,
  );

  // ── Archetype B: Pure Rebuild. Rookies and year-2 assets only,
  //    no proven vets. Should read IN on Future Stock, NOT_IN on
  //    Win-Now Floor / WR Anchor / RB Bellcow / Sustained Contender.
  const pureRebuild: RosterSpec = {
    label: "pure rebuild",
    snapOverrides: { format: "superflex", scoring: ["PPR", "TE-premium"] },
    players: [
      // Rookie QBs
      { id: "pr_qb1", name: "Rookie QB1", position: "QB", team: "X", age: 22, years_exp: 0, is_rookie: true, search_rank: 60, value: 35 },
      { id: "pr_qb2", name: "Rookie QB2", position: "QB", team: "Y", age: 23, years_exp: 0, is_rookie: true, search_rank: 80, value: 28 },
      // Rookie / year-2 RBs
      { id: "pr_rb1", name: "Rookie RB1", position: "RB", team: "A", age: 22, years_exp: 0, is_rookie: true, search_rank: 50, value: 40 },
      { id: "pr_rb2", name: "Rookie RB2", position: "RB", team: "B", age: 22, years_exp: 0, is_rookie: true, search_rank: 100, value: 25 },
      // Rookie / year-2 WRs
      { id: "pr_wr1", name: "Rookie WR1", position: "WR", team: "C", age: 22, years_exp: 0, is_rookie: true, search_rank: 30, value: 45 },
      { id: "pr_wr2", name: "Rookie WR2", position: "WR", team: "D", age: 22, years_exp: 0, is_rookie: true, search_rank: 70, value: 35 },
      { id: "pr_wr3", name: "Year2 WR", position: "WR", team: "E", age: 23, years_exp: 1, is_rookie: false, search_rank: 90, value: 30 },
      // Rookie TE
      { id: "pr_te1", name: "Rookie TE1", position: "TE", team: "F", age: 22, years_exp: 0, is_rookie: true, search_rank: 110, value: 35 },
    ],
  };
  const prMem = scoreRoster(pureRebuild);
  const prGet = (id: LaneId) =>
    prMem.find((m) => m.lane_id === id) as LaneMembership;
  check(
    "Pure Rebuild: Future Stock IN",
    prGet("future_stock").state === "in",
    `state=${prGet("future_stock").state} agg=${prGet("future_stock").aggregate_score}`,
  );
  check(
    "Pure Rebuild: Win-Now Floor NOT_IN (no proven vets)",
    prGet("win_now_floor").state !== "in",
    `state=${prGet("win_now_floor").state} agg=${prGet("win_now_floor").aggregate_score}`,
  );
  check(
    "Pure Rebuild: RB Bellcow NOT_IN",
    prGet("rb_bellcow").state === "not_in",
    `state=${prGet("rb_bellcow").state}`,
  );
  check(
    "Pure Rebuild: WR Anchor NOT_IN (no value-70+ WR)",
    prGet("wr_anchor").state === "not_in",
    `state=${prGet("wr_anchor").state}`,
  );
  check(
    "Pure Rebuild: Sustained Contender NOT_IN",
    prGet("sustained_contender").state === "not_in",
    `state=${prGet("sustained_contender").state}`,
  );

  // ── Archetype C: Zero-RB Build. Heavy WR + TE depth, NO real RB.
  //    Should read IN on WR Stable + WR Anchor and the composite
  //    Zero-RB lane. RB Bellcow NOT_IN by design.
  const zeroRb: RosterSpec = {
    label: "zero-rb",
    snapOverrides: { format: "1qb", scoring: ["PPR"] },
    players: [
      { id: "zr_qb1", name: "Vet QB", position: "QB", team: "Q", age: 28, years_exp: 7, search_rank: 12, value: 70 },
      // Token RBs only (no bellcow)
      { id: "zr_rb1", name: "Depth RB1", position: "RB", team: "R1", age: 25, years_exp: 4, search_rank: 70, value: 35 },
      { id: "zr_rb2", name: "Rookie RB", position: "RB", team: "R2", age: 22, years_exp: 0, is_rookie: true, search_rank: 110, value: 25 },
      // Heavy WR depth (the build)
      { id: "zr_wr1", name: "WR1 elite", position: "WR", team: "W1", age: 26, years_exp: 5, search_rank: 2, value: 90 },
      { id: "zr_wr2", name: "WR2 solid", position: "WR", team: "W2", age: 27, years_exp: 6, search_rank: 8, value: 75 },
      { id: "zr_wr3", name: "WR3 solid", position: "WR", team: "W3", age: 25, years_exp: 4, search_rank: 18, value: 65 },
      { id: "zr_wr4", name: "WR4 depth", position: "WR", team: "W4", age: 26, years_exp: 5, search_rank: 40, value: 50 },
      // Solid TE
      { id: "zr_te1", name: "TE1 solid", position: "TE", team: "T", age: 27, years_exp: 6, search_rank: 20, value: 60 },
    ],
  };
  const zrMem = scoreRoster(zeroRb);
  const zrGet = (id: LaneId) =>
    zrMem.find((m) => m.lane_id === id) as LaneMembership;
  check(
    "Zero-RB Build: RB Bellcow NOT_IN (no workhorse by design)",
    zrGet("rb_bellcow").state === "not_in",
    `state=${zrGet("rb_bellcow").state}`,
  );
  check(
    "Zero-RB Build: WR Stable IN",
    zrGet("wr_stable").state === "in",
    `state=${zrGet("wr_stable").state} agg=${zrGet("wr_stable").aggregate_score}`,
  );
  check(
    "Zero-RB Build: Zero-RB composite IN",
    zrGet("zero_rb").state === "in",
    `state=${zrGet("zero_rb").state} agg=${zrGet("zero_rb").aggregate_score}`,
  );
}

console.log(`\n${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
