import type { Archetype } from "../schema";

const macroProductiveTank: Archetype = {
  id: "macro-productive-tank",
  name: "Productive Tank",
  category: "Macro Posture",
  tagline:
    "Lose this season on purpose, but build assets that win the next one. Hide intent from the league.",
  horizon: -55,

  the_gamble: {
    statement:
      "By trading aging production for picks and youth now, you compound asset value into a 2-window run starting next year. Done quietly enough, the market doesn't price you down as a 'desperate seller.'",
    base_likelihood: 0.5,
    likelihood_modifiers: [
      {
        kind: "weeks_into_season",
        min: 6,
        delta: 0.1,
        rationale: "Past Wk6, contender desperation peaks. your sellers' market opens",
      },
    ],
  },

  the_risks: [
    {
      statement:
        "Selling too early. you give up production at trough valuations.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
    {
      statement:
        "Youth bets bust at higher rates than vets. your next window doesn't materialize either.",
      base_likelihood: 0.4,
      likelihood_modifiers: [],
    },
    {
      statement:
        "League catches on, marks down everything you offer.",
      base_likelihood: 0.3,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_record", wins_max: 3, games_min: 6, weight: 1.0 },
    { kind: "user_roster_avg_age", max: 26, weight: 0.4 },
  ],

  required_moves: [
    {
      description:
        "Identify 2-3 'sell now' veterans (28+ at WR/RB, 32+ at QB) and quietly shop them",
      by_when: "next-trade-window",
      priority: "critical",
    },
    {
      description:
        "Acquire a 2027 1st before Wk10. the cheapest a future 1st gets all year",
      by_when: "wk:10",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: {
        kind: "league_market_shift",
        signal: "veteran prices climbing",
        direction: "up",
      },
      branches: [
        {
          archetype_id: "macro-aging-core-last-run",
          why: "Vets re-priced upward. If you have any aging core left, consider one last run while the market overpays.",
        },
      ],
    },
  ],

  plays: [
    {
      id: "tank-vet-quiet-shop",
      intent: "setup",
      channel: "dm",
      target_kind: "specific-opponent",
      tone: "professional",
      template:
        "Wanted to throw a name at you. would you have any interest in {{your_aging_vet}}? Helps you for the stretch run.",
      read_their_response: [
        {
          if_they_say: "what would you want",
          it_likely_means: "engaged contender. name a 2027 1st as the ask",
          recommended_action:
            "anchor the price at a future 1st, accept a 2nd + filler if pushed",
        },
        {
          if_they_say: "I'd want some discount, you're rebuilding right",
          it_likely_means:
            "they read your hand. pricing reflects your weakness",
          recommended_action:
            "back away politely, try a different team without the rebuild signal",
        },
      ],
      best_when: [{ kind: "weeks_into_season", min: 4, max: 10 }],
      risks: ["Each ask leaks more about your direction. limit to 2-3 contacts max"],
      exclusivity: "burns-rapport",
    },
    {
      id: "tank-fake-contender-vibe",
      intent: "misdirect",
      channel: "all-chat",
      target_kind: "all-league",
      tone: "needling",
      template:
        "Lineup looks rough this week but I think we're a piece away. Anyone moving a {{position_you_dont_need}}?",
      read_their_response: [
        {
          if_they_say: "I'd consider it",
          it_likely_means: "may help you fake the contender posture for trade leverage",
          recommended_action:
            "engage briefly without pulling the trigger, just to muddy your read",
        },
      ],
      best_when: [{ kind: "weeks_into_season", min: 5, max: 9 }],
      risks: [
        "If you walk away too obviously the league will pattern-match the bluff",
      ],
      exclusivity: "single-use",
      min_league_tone: "competitive",
    },
  ],

  counter_archetypes: ["macro-aging-core-last-run"],
  exemplar_profiles: [
    "Sub-3 wins through 6+ games",
    "Roster avg age <26",
    "1+ future 1sts already in hand",
  ],
};

const macroAgingCoreLastRun: Archetype = {
  id: "macro-aging-core-last-run",
  name: "Aging Core Last Run",
  category: "Macro Posture",
  tagline:
    "Push every chip in for THIS season. The window closes after; consequences are next year's problem.",
  horizon: 90,

  the_gamble: {
    statement:
      "Your roster's win-now value is at peak this year. By trading every pick and youth piece for proven production, you maximize this season's title odds. and accept the rebuild that follows.",
    base_likelihood: 0.45,
    likelihood_modifiers: [
      {
        kind: "weeks_into_season",
        min: 4,
        max: 10,
        delta: 0.15,
        rationale: "Mid-season is peak buy window for win-now teams",
      },
    ],
  },

  the_risks: [
    {
      statement:
        "Star injuries at the wrong moment torpedo the run. and you have no future capital left.",
      base_likelihood: 0.5,
      likelihood_modifiers: [],
    },
    {
      statement:
        "Sellers know you're all-in and price every trade at premium.",
      base_likelihood: 0.45,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_roster_avg_age", min: 28, weight: 1.0 },
    { kind: "user_record", wins_min: 5, weight: 0.6 },
  ],

  required_moves: [
    {
      description:
        "Move 2027+ picks for proven Wk1-17 production. don't hold picks you won't use",
      by_when: "next-trade-window",
      priority: "critical",
    },
    {
      description:
        "Shore up your weakest starting position by Wk6 (no holes by playoffs)",
      by_when: "wk:6",
      priority: "critical",
    },
  ],

  pivots: [
    {
      trigger: {
        kind: "user_record_collapse",
        wins_max: 4,
        games_min: 9,
      },
      branches: [
        {
          archetype_id: "macro-productive-tank",
          why: "Run is over. Salvage what's still tradeable for picks before everyone else realizes you're done.",
          timing_window: "wk:10",
        },
      ],
    },
    {
      trigger: {
        kind: "anchor_injury",
        position: "WR",
        duration_weeks_min: 6,
      },
      branches: [
        {
          archetype_id: "wr-anchor-and-volume",
          why: "Replace the anchor immediately. overpay if needed, the window is THIS year",
        },
      ],
    },
  ],

  plays: [
    {
      id: "aging-core-buy-winnow",
      intent: "negotiate",
      channel: "dm",
      target_kind: "specific-archetype-holder",
      target_archetype: "macro-productive-tank",
      tone: "professional",
      template:
        "Saw you've been moving vets. would {{their_vet}} be available for {{my_2027_1st}} plus filler?",
      read_their_response: [
        {
          if_they_say: "need more than that",
          it_likely_means: "they value future 1sts heavily. bump to a 2026 2nd as sweetener",
          recommended_action: "increase the offer with a current-year 2nd",
        },
        {
          if_they_say: "deal",
          it_likely_means:
            "you may have underpaid. verify the comp on this trade before sending more",
          recommended_action: "send it, and don't second-guess",
        },
      ],
      best_when: [{ kind: "weeks_into_season", min: 4, max: 10 }],
      risks: ["You're publicly identifying as a buyer. future asks will be priced up"],
      exclusivity: "single-use",
    },
  ],

  counter_archetypes: ["macro-productive-tank"],
  exemplar_profiles: [
    "Roster avg age 28+",
    "Top-3 record",
    "0-1 future 1sts (already cashed)",
  ],
};

export const MACRO_ARCHETYPES: Archetype[] = [
  macroProductiveTank,
  macroAgingCoreLastRun,
];
