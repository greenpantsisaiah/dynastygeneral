import type { DecisionContext } from "@/lib/engine/context";
import type { TeamProfile, LeagueProfile } from "@/lib/engine/opponent";

/**
 * Synthesized decision context fixtures for evals. These replace live Sleeper
 * data so we can exercise the engine pipeline deterministically against
 * scenarios derived from the Iceman corpus and ChatGPT reference file.
 *
 * The shape is exactly what assembleContext() returns so the same renderer
 * feeds the model.
 */

function team(p: {
  roster_id: number;
  owner: string;
  record?: [number, number, number?];
  rank?: number;
  counts?: Partial<TeamProfile["counts"]>;
  quality?: Partial<TeamProfile["starter_quality"]>;
  headline?: string[];
  strengths?: string[];
  pain?: string[];
  label?: TeamProfile["label"];
  avgAge?: number;
  ages?: Partial<TeamProfile["age_buckets"]>;
}): TeamProfile {
  const record = p.record ?? [0, 0, 0];
  return {
    roster_id: p.roster_id,
    owner_name: p.owner,
    record: { wins: record[0], losses: record[1], ties: record[2] ?? 0, fpts: 0 },
    standing_rank: p.rank ?? null,
    counts: {
      QB: p.counts?.QB ?? 2,
      RB: p.counts?.RB ?? 4,
      WR: p.counts?.WR ?? 5,
      TE: p.counts?.TE ?? 1,
      other: p.counts?.other ?? 0,
    },
    starter_quality: {
      QB: p.quality?.QB ?? "solid",
      RB: p.quality?.RB ?? "solid",
      WR: p.quality?.WR ?? "solid",
      TE: p.quality?.TE ?? "solid",
    },
    age_buckets: {
      young: p.ages?.young ?? 3,
      peak: p.ages?.peak ?? 6,
      aging: p.ages?.aging ?? 3,
      old: p.ages?.old ?? 1,
    },
    avg_age: p.avgAge ?? 26,
    headline_players: p.headline ?? [],
    strengths: p.strengths ?? [],
    pain_points: p.pain ?? [],
    label: p.label ?? "balanced",
  };
}

/**
 * The Iceman league: 12-team 2QB Superflex, 30-round startup draft,
 * full PPR + 0.5/TE-rec, 6-point pass TDs. User is izzydabomb with
 * QB stack (Burrow, Herbert, Hurts), MHJ, Odunze, Jacobs, Javonte.
 */
export function icemanContext(): DecisionContext {
  const teams: TeamProfile[] = [
    team({
      roster_id: 1,
      owner: "izzydabomb (you)",
      rank: 4,
      counts: { QB: 3, RB: 2, WR: 2, TE: 0 },
      quality: { QB: "elite", RB: "solid", WR: "elite", TE: "thin" },
      headline: [
        "Joe Burrow (QB, CIN, age 29)",
        "Justin Herbert (QB, LAC, age 27)",
        "Jalen Hurts (QB, PHI, age 27)",
        "Marvin Harrison Jr. (WR, ARI, age 23)",
        "Rome Odunze (WR, CHI, age 23)",
      ],
      strengths: ["QB depth", "WR ceiling", "trade capital"],
      pain: ["no viable TE"],
      label: "qb_banker",
    }),
    team({
      roster_id: 2,
      owner: "BradyH20",
      counts: { QB: 3, RB: 2, WR: 3, TE: 1 },
      quality: { QB: "elite", RB: "solid", WR: "solid", TE: "solid" },
      headline: ["Josh Allen (QB, BUF)", "Bijan Robinson (RB, ATL)"],
      strengths: ["QB depth", "RB depth"],
      pain: [],
      label: "qb_banker",
    }),
    team({
      roster_id: 3,
      owner: "MacCheese13",
      counts: { QB: 0, RB: 2, WR: 4, TE: 1 },
      quality: { QB: "thin", RB: "solid", WR: "elite", TE: "solid" },
      headline: [
        "Ashton Jeanty (RB, LV, age 21)",
        "Malik Nabers (WR, NYG, age 22)",
      ],
      strengths: ["WR depth"],
      pain: ["QB need"],
      label: "desperation",
    }),
    team({
      roster_id: 4,
      owner: "SparkWoods",
      counts: { QB: 2, RB: 3, WR: 3, TE: 1 },
      quality: { QB: "thin", RB: "solid", WR: "solid", TE: "solid" },
      headline: ["Trevor Lawrence (QB, JAX)", "Kyren Williams (RB, LAR)"],
      strengths: [],
      pain: ["QB need"],
      label: "tilted_buyer",
    }),
    team({
      roster_id: 5,
      owner: "derik2330",
      counts: { QB: 0, RB: 3, WR: 4, TE: 1 },
      quality: { QB: "thin", RB: "solid", WR: "solid", TE: "solid" },
      pain: ["QB need"],
      label: "desperation",
    }),
    team({
      roster_id: 6,
      owner: "DoYouBelieve",
      counts: { QB: 1, RB: 3, WR: 3, TE: 1 },
      quality: { QB: "thin", RB: "solid", WR: "solid", TE: "solid" },
      pain: ["QB need"],
      label: "desperation",
    }),
    team({
      roster_id: 7,
      owner: "bourbonband",
      counts: { QB: 2, RB: 3, WR: 3, TE: 1 },
      label: "qb_stable",
    }),
    team({
      roster_id: 8,
      owner: "beligerated",
      counts: { QB: 2, RB: 2, WR: 3, TE: 1 },
      label: "qb_stable",
    }),
    team({
      roster_id: 9,
      owner: "Wurzi19",
      counts: { QB: 2, RB: 3, WR: 3, TE: 1 },
      label: "qb_stable",
    }),
    team({
      roster_id: 10,
      owner: "staysleepy",
      counts: { QB: 2, RB: 2, WR: 3, TE: 1 },
      label: "qb_stable",
    }),
    team({
      roster_id: 11,
      owner: "topspotpro",
      counts: { QB: 2, RB: 3, WR: 2, TE: 1 },
      quality: { QB: "thin" },
      pain: ["QB need"],
      label: "tilted_buyer",
    }),
    team({
      roster_id: 12,
      owner: "Size12UpYour",
      counts: { QB: 2, RB: 0, WR: 4, TE: 1 },
      quality: { QB: "thin", RB: "thin" },
      pain: ["RB thin", "QB need"],
      label: "tilted_buyer",
    }),
  ];

  const profile: LeagueProfile = {
    teams,
    dynamics: {
      trade_counterparties: [3, 4, 5, 6, 11, 12],
      non_buyers: [7, 8, 9, 10],
      tilted_buyers: [4, 11, 12],
    },
  };

  return {
    league: {
      id: "iceman-synth-1",
      name: "The Iceman",
      season: "2026",
      status: "drafting",
      total_rosters: 12,
      roster_positions: [
        "QB", "RB", "RB", "WR", "WR", "TE",
        "FLEX", "FLEX", "FLEX", "SUPER_FLEX",
        ...Array(15).fill("BN"),
        "IR", "IR", "IR", "IR", "IR",
        "TAXI", "TAXI", "TAXI", "TAXI", "TAXI",
      ],
      scoring_highlights: [
        "Full PPR",
        "TE premium +0.5/rec",
        "6-point pass TDs",
      ],
      is_superflex: true,
      format_type: "dynasty",
      format_rules: {
        qb_starters_max: 2,
        rb_starters_max: 5,
        wr_starters_max: 5,
        te_starters_max: 4,
        second_qb_starts: true,
        te_premium: true,
        is_superflex: true,
        flex_eligible: ["RB", "WR", "TE"] as const,
        sf_eligible: ["QB", "RB", "WR", "TE"] as const,
        league_type: "dynasty" as const,
        max_keepers: null,
      },
    },
    nfl: { season: "2026", week: 0, season_type: "pre" },
    me: {
      sleeper_user_id: "synth-izzy",
      username: "izzydabomb",
      display_name: "izzydabomb",
      team_name: "izzydabomb",
      roster_id: 1,
      record: { wins: 0, losses: 0, ties: 0, fpts: 0 },
      standing_rank: 4,
      strategy: {
        state: "balanced",
        confidence: 0.5,
        signals: [
          "65/35 win-now/future weighting declared by user",
          "Three elite QBs create trade capital, not redundancy",
          "Young WR core (MHJ 23, Odunze 23) anchors 4+ year window",
        ],
      },
      roster: [],
      starters: [],
      headline: [
        "Joe Burrow (QB, CIN, age 29)",
        "Justin Herbert (QB, LAC, age 27)",
        "Jalen Hurts (QB, PHI, age 27)",
        "Marvin Harrison Jr. (WR, ARI, age 23)",
        "Rome Odunze (WR, CHI, age 23)",
        "Josh Jacobs (RB, GB, age 27)",
        "Javonte Williams (RB, DAL, age 26)",
      ],
    },
    league_profile: profile,
    traded_picks_summary: "Balanced (no net movement).",
    pricing: {
      scale_note: "Synthetic pricing fixture (no real KTC fetch).",
      fairness_band_pct: 15,
      player_values_present: false,
      player_value_count: 0,
      player_values: {},
      pick_values: [],
      sf_pick_multiplier: 1.2,
    },
    inflections: {},
    league_read: null,
  };
}

/** Midseason synthetic league where the user sits on a surplus QB. */
export function midseasonQbHoardContext(): DecisionContext {
  const base = icemanContext();
  return {
    ...base,
    league: { ...base.league, season: "2026", status: "in_season" },
    nfl: { season: "2026", week: 3, season_type: "regular" },
    me: {
      ...base.me,
      record: { wins: 2, losses: 1, ties: 0, fpts: 412.6 },
      standing_rank: 3,
      strategy: {
        state: "contender",
        confidence: 0.7,
        signals: [
          "2-1 start with top-3 fpts",
          "QB surplus intact (Burrow/Herbert/Hurts)",
          "MacCheese13 still has zero QBs; market about to crack",
        ],
      },
    },
  };
}

/** Generic redraft-adjacent dynasty with little info, for the ChatGPT Scenario 1 query. */
export function sparseContext(): DecisionContext {
  const teams: TeamProfile[] = Array.from({ length: 12 }, (_, i) =>
    team({
      roster_id: i + 1,
      owner: i === 0 ? "you" : `Team ${i + 1}`,
      label: "balanced",
    }),
  );
  return {
    league: {
      id: "sparse-synth",
      name: "Generic Dynasty SF",
      season: "2026",
      status: "drafting",
      total_rosters: 12,
      roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX"],
      scoring_highlights: ["Full PPR"],
      is_superflex: true,
      format_type: "dynasty",
      format_rules: {
        qb_starters_max: 2,
        rb_starters_max: 5,
        wr_starters_max: 5,
        te_starters_max: 4,
        second_qb_starts: true,
        te_premium: true,
        is_superflex: true,
        flex_eligible: ["RB", "WR", "TE"] as const,
        sf_eligible: ["QB", "RB", "WR", "TE"] as const,
        league_type: "dynasty" as const,
        max_keepers: null,
      },
    },
    nfl: null,
    me: {
      sleeper_user_id: null,
      username: null,
      display_name: null,
      team_name: "you",
      roster_id: 1,
      record: null,
      standing_rank: null,
      strategy: {
        state: "undetermined",
        confidence: 0,
        signals: ["Pre-draft: no roster yet"],
      },
      roster: [],
      starters: [],
      headline: [],
    },
    league_profile: { teams, dynamics: { trade_counterparties: [], non_buyers: [], tilted_buyers: [] } },
    traded_picks_summary: "No traded picks recorded.",
    pricing: {
      scale_note: "Synthetic pricing fixture (no real KTC fetch).",
      fairness_band_pct: 15,
      player_values_present: false,
      player_value_count: 0,
      player_values: {},
      pick_values: [],
      sf_pick_multiplier: 1.2,
    },
    inflections: {},
    league_read: null,
  };
}
