import type { Archetype } from "../schema";

const rbBellcow: Archetype = {
  id: "rb-bellcow-anchor",
  name: "RB Bellcow",
  category: "RB Strategy",
  tagline:
    "Anchor on a true workhorse RB1, build everything else around the certainty.",
  horizon: 30,

  the_gamble: {
    statement:
      "A top-12 dynasty RB on a healthy offense produces 25%+ of your weekly fantasy points. With that locked, you can punt depth at RB and over-invest at WR/TE.",
    base_likelihood: 0.55,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement: "Workhorse RBs hit the cliff fast. One torn ACL ends your window.",
      base_likelihood: 0.4,
      likelihood_modifiers: [],
    },
    {
      statement:
        "Without depth, a Wk6 injury collapses your starting lineup completely.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    {
      kind: "user_owns_top_n_at_position",
      position: "RB",
      min: 1,
      rank_threshold: 12,
      weight: 1.0,
    },
    { kind: "user_owns_top_n_at_position", position: "RB", min: 4, weight: 0.5 },
  ],

  required_moves: [
    {
      description:
        "Lock a 2nd starter-grade RB before Wk1, even if it costs an extra WR or pick",
      by_when: "this-draft",
      priority: "critical",
      completion_check: { kind: "min_position_count", position: "RB", min: 5 },
    },
    {
      description: "Carry a viable handcuff for the bellcow on your bench",
      by_when: "this-week",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: { kind: "anchor_injury", position: "RB", duration_weeks_min: 4 },
      branches: [
        {
          archetype_id: "rb-committee",
          why: "Without the bellcow, build a committee around volume rather than chasing another RB1.",
        },
      ],
    },
  ],

  exemplar_profiles: ["1+ top-12 RB", "4+ rostered RBs"],
};

const rbCommittee: Archetype = {
  id: "rb-committee",
  name: "RB Committee",
  category: "RB Strategy",
  tagline:
    "No anchor at RB. Stack mid-tier touches and play matchups week to week.",
  horizon: 10,

  the_gamble: {
    statement:
      "Three RB2-tier players with weekly volume produce more total points than one RB1 plus dead bench, with built-in injury insurance.",
    base_likelihood: 0.45,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement:
        "Matchup play requires constant lineup attention. Miss a slate, lose the week.",
      base_likelihood: 0.4,
      likelihood_modifiers: [],
    },
    {
      statement:
        "When everyone has a Wk5 bye or split, your committee leaves your starting RB slot empty.",
      base_likelihood: 0.3,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_owns_top_n_at_position", position: "RB", min: 5, weight: 1.0 },
    {
      kind: "user_owns_top_n_at_position",
      position: "RB",
      max: 0,
      rank_threshold: 12,
      weight: 0.5,
    },
  ],

  required_moves: [
    {
      description:
        "Identify and rotate the highest-volume option each week; do not auto-start the same RB2",
      by_when: "this-week",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: { kind: "league_market_shift", signal: "RB scarcity", direction: "up" },
      branches: [
        {
          archetype_id: "rb-bellcow-anchor",
          why: "If a true bellcow becomes available at value, consolidate the committee for the upgrade.",
        },
      ],
    },
  ],

  exemplar_profiles: ["5+ RBs, no top-12"],
};

// Multiple-anchor RB build: the team owns 2+ top-24 RBs. This is the
// "Stars at RB" / "Robust RB" pattern dynasty pros (Levitan, Bloom)
// describe as the most stable build in the format. Distinct from
// Bellcow (one anchor + depth) and Committee (no anchor, 5+ bodies).
// Without this archetype the classifier was forced into Committee or
// Bellcow for users with 3-4 top-12 RBs, which produced visibly wrong
// taglines like "No anchor at RB" for a roster of Gibbs + Taylor +
// Barkley + Henry.
const rbRobust: Archetype = {
  id: "rb-robust",
  name: "Robust RB",
  category: "RB Strategy",
  tagline:
    "Multiple anchor RBs. The position is solved; trade RB depth for needs elsewhere.",
  horizon: 40,

  the_gamble: {
    statement:
      "Owning 2+ top-24 RBs in dynasty stabilizes weekly scoring and immunizes you from the position's injury cliff. Surplus RBs are tradeable for WR/TE/QB upgrades or future capital.",
    base_likelihood: 0.65,
    likelihood_modifiers: [],
  },

  the_risks: [
    {
      statement:
        "RB age curve is the steepest in fantasy. A 28-year-old anchor today is depreciated capital next year.",
      base_likelihood: 0.4,
      likelihood_modifiers: [],
    },
    {
      statement:
        "Holding too many RBs locks value in a thin trade market; the surplus must actually move to realize the upgrade.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    // 2+ top-24 RBs is the floor for this archetype.
    {
      kind: "user_owns_top_n_at_position",
      position: "RB",
      min: 2,
      rank_threshold: 24,
      weight: 1.0,
    },
    // 3+ top-12 RBs is the extreme version (the Final Countdown user case).
    {
      kind: "user_owns_top_n_at_position",
      position: "RB",
      min: 3,
      rank_threshold: 12,
      weight: 0.5,
    },
  ],

  required_moves: [
    {
      description:
        "Identify your most-tradeable RB and shop them for a starter at your weakest position. Stop carrying surplus.",
      by_when: "this-week",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: { kind: "anchor_injury", position: "RB", duration_weeks_min: 4 },
      branches: [
        {
          archetype_id: "rb-bellcow-anchor",
          why: "If one anchor goes down, the build collapses to a single-anchor profile.",
        },
      ],
    },
  ],

  exemplar_profiles: ["2+ top-24 RBs", "3+ top-12 RBs (extreme)"],
};

const rbZeroRBRecovery: Archetype = {
  id: "rb-zero-recovery",
  name: "Zero RB Recovery",
  category: "RB Strategy",
  tagline:
    "You punted RB in the draft. Now you mine breakouts off waivers and weather the variance.",
  horizon: 0,

  the_gamble: {
    statement:
      "Roughly 4-6 startable RBs emerge from waivers each season. Owning the WR/TE depth to survive the first 4 weeks lets you scoop them and equalize.",
    base_likelihood: 0.4,
    likelihood_modifiers: [
      {
        kind: "weeks_into_season",
        max: 4,
        delta: -0.15,
        rationale: "Pre-Wk5 the breakout pool hasn't formed; gamble pays later",
      },
    ],
  },

  the_risks: [
    {
      statement: "No breakouts hit your roster. You're starting Mike Boone in Wk10.",
      base_likelihood: 0.5,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_position_count", position: "RB", max: 3, weight: 1.0 },
    { kind: "user_position_count", position: "WR", min: 6, weight: 0.5 },
  ],

  required_moves: [
    {
      description:
        "FAAB plan: hold 60%+ of budget for the first 6 weeks of waivers",
      by_when: "wk:1-6",
      priority: "critical",
    },
  ],

  pivots: [],

  exemplar_profiles: ["≤3 RBs, 6+ WRs"],
};

export const RB_ARCHETYPES: Archetype[] = [
  rbRobust,
  rbBellcow,
  rbCommittee,
  rbZeroRBRecovery,
];
