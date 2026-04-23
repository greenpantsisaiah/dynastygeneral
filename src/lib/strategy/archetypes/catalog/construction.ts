/**
 * Roster construction archetypes. Capture the *shape* of the build
 * regardless of position: are you young + speculative (Full Rebuild),
 * old + locked in (Locked Contender), or stuck in the middle without a
 * lane (Bridge Year)? These compete with position-driven archetypes so
 * a balanced roster doesn't trivially saturate a single QB or WR path.
 */

import type { Archetype } from "../schema";

const fullRebuild: Archetype = {
  id: "construction-full-rebuild",
  name: "Full Rebuild",
  category: "Roster Construction",
  tagline:
    "Young across the board. You are not chasing this year. You are stacking the next two.",
  horizon: -75,

  the_gamble: {
    statement:
      "By concentrating youth and rookie picks now, you compound asset value into a 2-3 year contention window when the league's current contenders age out.",
    base_likelihood: 0.5,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement:
        "Two-thirds of dynasty rookie picks bust. Your window may never open.",
      base_likelihood: 0.45,
      likelihood_modifiers: [],
    },
    {
      statement:
        "League turnover. By the time your window opens, your competition has rebuilt too.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_roster_avg_age", max: 24, weight: 1.0 },
    {
      kind: "user_owns_top_n_at_position",
      position: "QB",
      max: 0,
      rank_threshold: 12,
      weight: 0.4,
    },
  ],

  required_moves: [
    {
      description:
        "Trade any 28+ vet for picks or a younger asset within the next two weeks",
      by_when: "next-trade-window",
      priority: "critical",
    },
    {
      description:
        "Hold all 1st-round rookie picks; do not trade them for current production",
      by_when: "off-season",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: { kind: "own_strategy_drift", drift_threshold: 0.5 },
      branches: [
        {
          archetype_id: "construction-bridge-year",
          why: "If avg age creeps past 26, the rebuild has stalled; pivot to bridge year and reassess.",
        },
      ],
    },
  ],

  exemplar_profiles: ["Avg age ≤ 24, no top-12 QB"],
};

const lockedContender: Archetype = {
  id: "construction-locked-contender",
  name: "Locked Contender",
  category: "Roster Construction",
  tagline:
    "Top-tier starters at every position. The window is open right now. Spend picks on certainty.",
  horizon: 70,

  the_gamble: {
    statement:
      "With every starter slot filled by a top-12 player at position, your floor wins 9+ games. Trading future picks for proven production this year is +EV.",
    base_likelihood: 0.55,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement:
        "Cliff-aged stars (RB28+, WR30+) collapse mid-year. Your locked window slams shut.",
      base_likelihood: 0.4,
      likelihood_modifiers: [],
    },
    {
      statement:
        "Trading future capital for vets accelerates your next rebuild by 2 years.",
      base_likelihood: 0.5,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    {
      kind: "user_owns_top_n_at_position",
      position: "RB",
      min: 1,
      rank_threshold: 12,
      weight: 0.6,
    },
    {
      kind: "user_owns_top_n_at_position",
      position: "WR",
      min: 2,
      rank_threshold: 24,
      weight: 0.6,
    },
    {
      kind: "user_owns_top_n_at_position",
      position: "QB",
      min: 1,
      rank_threshold: 12,
      weight: 0.6,
    },
    { kind: "user_roster_avg_age", min: 26, max: 29, weight: 0.6 },
  ],

  required_moves: [
    {
      description:
        "Trade your 2027 1st (or further) for a starter-grade vet upgrade if any starter slot has weakness",
      by_when: "next-trade-window",
      priority: "high",
    },
  ],

  pivots: [],

  exemplar_profiles: ["Top-12 at QB+RB, 2+ top-24 WR, avg age 26-29"],
};

const bridgeYear: Archetype = {
  id: "construction-bridge-year",
  name: "Bridge Year",
  category: "Roster Construction",
  tagline:
    "Mix of vets and rookies, no clear direction. Win quietly while resolving the identity.",
  horizon: 0,

  the_gamble: {
    statement:
      "By neither selling vets nor punting picks, you keep both windows open and resolve the identity once you see who breaks out.",
    base_likelihood: 0.4,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement:
        "Bridge years compound: next year you're still in the middle, with worse picks and older vets.",
      base_likelihood: 0.55,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_roster_avg_age", min: 25, max: 27, weight: 1.0 },
    { kind: "user_record", wins_min: 4, wins_max: 8, weight: 0.4 },
  ],

  required_moves: [
    {
      description:
        "Identify by Wk6 which lane you commit to: contender or rebuild. Bridge years that drift become regrets.",
      by_when: "wk:6",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: { kind: "user_record_collapse", wins_max: 3, games_min: 6 },
      branches: [
        {
          archetype_id: "macro-productive-tank",
          why: "If wins collapse, the bridge year ends; commit to selling vets for picks.",
        },
      ],
    },
  ],

  exemplar_profiles: ["Avg age 25-27, mid-pack record"],
};

export const CONSTRUCTION_ARCHETYPES: Archetype[] = [
  fullRebuild,
  lockedContender,
  bridgeYear,
];
