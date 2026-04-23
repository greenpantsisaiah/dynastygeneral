import type { Archetype } from "../schema";

const tePremiumAnchor: Archetype = {
  id: "te-premium-anchor",
  name: "TE Premium Anchor",
  category: "TE Strategy",
  tagline:
    "In TE-premium scoring, owning a top-6 TE is a structural cheat code most managers don't price in.",
  horizon: 25,

  the_gamble: {
    statement:
      "TE-premium adds 0.5+ PPR for TE catches. A top-6 TE in this format is worth a top-12 WR in standard. Anchor here and the position becomes a moat.",
    base_likelihood: 0.6,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement: "Elite TEs are old. Kelce-tier production is 2-3 year window, not 5.",
      base_likelihood: 0.4,
      likelihood_modifiers: [],
    },
    {
      statement:
        "TE injury rate is brutal. One game-week loss craters your scoring edge.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "league_scoring", includes: "TE-premium", weight: 1.0 },
    {
      kind: "user_owns_top_n_at_position",
      position: "TE",
      min: 1,
      rank_threshold: 6,
      weight: 1.0,
    },
  ],

  required_moves: [
    {
      description:
        "Acquire a viable handcuff TE (TE15-25 range) to soften bye/injury weeks",
      by_when: "this-draft",
      priority: "high",
      completion_check: { kind: "min_position_count", position: "TE", min: 2 },
    },
  ],

  pivots: [
    {
      trigger: { kind: "anchor_injury", position: "TE", duration_weeks_min: 4 },
      branches: [
        {
          archetype_id: "te-tandem",
          why: "Without the anchor, pair two TE2s and play the matchup until the anchor returns.",
        },
      ],
    },
  ],

  exemplar_profiles: ["TE-premium league with 1+ top-6 TE"],
};

const teTandem: Archetype = {
  id: "te-tandem",
  name: "TE Tandem",
  category: "TE Strategy",
  tagline:
    "No elite TE. Roster two TE2s and rotate based on matchup, opponent defense, and floor.",
  horizon: 5,

  the_gamble: {
    statement:
      "Two TE2s with predictable usage produce a stable 8-12 point floor without needing the elite tier. You free up a roster spot and asset value for WR or RB.",
    base_likelihood: 0.4,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement:
        "Neither TE breaks out. You leave 4-5 PPG on the table relative to a top-12 starter.",
      base_likelihood: 0.5,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_position_count", position: "TE", min: 2, weight: 1.0 },
    {
      kind: "user_owns_top_n_at_position",
      position: "TE",
      max: 0,
      rank_threshold: 6,
      weight: 0.5,
    },
  ],

  required_moves: [
    {
      description: "Compare opponent defenses vs TE weekly, not just snap counts",
      by_when: "this-week",
      priority: "medium",
    },
  ],

  pivots: [],

  exemplar_profiles: ["2+ TEs, none top-6"],
};

const teStreamer: Archetype = {
  id: "te-streamer",
  name: "TE Streamer",
  category: "TE Strategy",
  tagline:
    "In standard scoring, the position barely matters. Stream the cheapest viable starter and put resources into WR/RB.",
  horizon: 5,

  the_gamble: {
    statement:
      "Outside TE-premium, the difference between TE10 and TE20 is 1-2 PPG. Spending nothing here and overweighting WR/RB returns more total points.",
    base_likelihood: 0.45,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement:
        "An outlier TE breaks out. You traded the strategic ceiling for the floor.",
      base_likelihood: 0.3,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_position_count", position: "TE", max: 1, weight: 1.0 },
    { kind: "league_scoring", includes: ["PPR", "half-PPR", "standard"], weight: 0.4 },
  ],

  required_moves: [
    {
      description: "Hold a TE waiver wire watchlist; never roster more than 2",
      by_when: "this-week",
      priority: "low",
    },
  ],

  pivots: [],

  exemplar_profiles: ["≤1 TE in non-TE-premium scoring"],
};

export const TE_ARCHETYPES: Archetype[] = [tePremiumAnchor, teTandem, teStreamer];
