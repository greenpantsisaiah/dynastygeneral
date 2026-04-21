import type { Archetype } from "../schema";

const wrAnchorAndVolume: Archetype = {
  id: "wr-anchor-and-volume",
  name: "WR Anchor + Volume",
  category: "WR Strategy",
  tagline:
    "One elite WR plus four high-target volume bets. Win on weekly floor, not ceiling.",
  horizon: 60,

  the_gamble: {
    statement:
      "Your WR1 catches 8+ targets a week. You stack 3-4 mid-tier WRs whose teams pass enough that one always pops. Floor is high every week and one volume bet hits ceiling.",
    base_likelihood: 0.55,
    likelihood_modifiers: [
      {
        kind: "league_format_match",
        format: "1qb",
        delta: 0.05,
        rationale: "1QB leagues amplify WR scoring share",
      },
    ],
  },

  the_risks: [
    {
      statement:
        "WR1 injury collapses the build. no replacement-level option on the roster.",
      base_likelihood: 0.3,
      likelihood_modifiers: [],
    },
    {
      statement:
        "Volume bets on bad offenses (coaching change, QB injury) kill weekly floor.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
    {
      statement: "RB and TE rooms get starved of capital.",
      base_likelihood: 0.45,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    {
      kind: "user_owns_top_n_at_position",
      position: "WR",
      min: 1,
      rank_threshold: 12,
      weight: 1.0,
    },
    { kind: "user_position_count", position: "WR", min: 5, weight: 0.6 },
  ],

  required_moves: [
    {
      description:
        "Acquire second WR1-tier insurance by Wk5 (not just any WR. a top-12-caliber backup)",
      by_when: "wk:5",
      priority: "critical",
    },
    {
      description: "Avoid spending top-3 picks on RB this draft",
      by_when: "this-draft",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: {
        kind: "anchor_injury",
        position: "WR",
        duration_weeks_min: 4,
      },
      branches: [
        {
          archetype_id: "wr-stockpiler",
          why: "Lean into your junior WRs (Year-2 breakout candidates). Cheaper, slower, preserves picks.",
        },
        {
          archetype_id: "macro-aging-core-last-run",
          why: "Trade aggressively for a target-monster (Ladd McConkey archetype) before the market re-prices the position. Push the window now.",
          timing_window: "wk:1-3",
        },
      ],
    },
    {
      trigger: {
        kind: "league_market_shift",
        signal: "WR scarcity",
        direction: "up",
      },
      branches: [
        {
          archetype_id: "wr-stockpiler",
          why: "Sell a WR3 at peak, recoup picks while the market is hot.",
        },
      ],
    },
  ],

  plays: [
    {
      id: "wr-anchor-fish-insurance",
      intent: "probe",
      channel: "dm",
      target_kind: "specific-opponent",
      tone: "casual",
      template:
        "What's your WR depth situation? I might be looking to consolidate at the position.",
      read_their_response: [
        {
          if_they_say: "I've got too many",
          it_likely_means: "soft seller, may take less than fair value",
          recommended_action: "pitch a 2-for-1 consolidating their WR3 + WR5 for your tier-2 piece",
        },
        {
          if_they_say: "tight, what would it take",
          it_likely_means: "they value depth. premium ask incoming",
          recommended_action: "get specific names from them before naming yours",
        },
      ],
      best_when: [{ kind: "weeks_into_season", min: 1, max: 6 }],
      risks: ["Signals you're light at WR depth"],
      exclusivity: "safe-to-repeat",
    },
  ],

  counter_archetypes: ["wr-stockpiler"],
  exemplar_profiles: [
    "Top-12 WR anchor",
    "Year 2-3 high-target slot WR",
    "Ascending WR2 on pass-heavy team",
  ],
};

const wrStockpiler: Archetype = {
  id: "wr-stockpiler",
  name: "WR Stockpiler",
  category: "WR Strategy",
  tagline:
    "Hoard 6+ rosterable WRs. Trade depth for tiering up at scarce positions when market shifts.",
  horizon: 30,

  the_gamble: {
    statement:
      "WRs have the longest dynasty shelf life. Stockpiling 6-8 rosterable WRs creates trade liquidity for whatever the league market suddenly values. RB, TE, or premium picks.",
    base_likelihood: 0.5,
    likelihood_modifiers: [
      {
        kind: "league_position_scarcity_after_round",
        position: "RB",
        round: 4,
        threshold_teams_without: 3,
        delta: 0.15,
        rationale:
          "{{n}}/{{total}} teams light at RB after Rd 4. your WR depth becomes RB currency",
      },
    ],
  },

  the_risks: [
    {
      statement:
        "WR market never tightens. you sit on depth that no one wants to pay for.",
      base_likelihood: 0.3,
      likelihood_modifiers: [],
    },
    {
      statement: "Bench bloat. cuttable WR4-WR8 take roster spots from breakouts.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_position_count", position: "WR", min: 6, weight: 1.0 },
  ],

  required_moves: [
    {
      description:
        "By Wk6, identify 2 trade buckets: WR3-4 'liquidate' tier and WR5-8 'flier' tier",
      by_when: "wk:6",
      priority: "high",
    },
    {
      description: "Track positional scarcity weekly. strike when RB or TE injuries cluster",
      by_when: "next-trade-window",
      priority: "medium",
    },
  ],

  pivots: [
    {
      trigger: {
        kind: "league_market_shift",
        signal: "RB scarcity",
        direction: "up",
      },
      branches: [
        {
          archetype_id: "wr-anchor-and-volume",
          why: "Convert 2 WR3s into one true RB1. consolidate depth into starter quality.",
        },
      ],
    },
    {
      trigger: {
        kind: "user_record_collapse",
        wins_max: 3,
        games_min: 8,
      },
      branches: [
        {
          archetype_id: "macro-productive-tank",
          why: "Sell aging WRs for picks, keep youth, build the next window.",
        },
      ],
    },
  ],

  plays: [
    {
      id: "stockpiler-rb-needy-fish",
      intent: "market-make",
      channel: "all-chat",
      target_kind: "all-league",
      tone: "casual",
      template:
        "Anyone needing RB help? My WR room's deep, willing to swap volume for a workhorse.",
      read_their_response: [
        {
          if_they_say: "I'd listen",
          it_likely_means:
            "RB-needy, willing to consolidate. your depth is the currency",
          recommended_action:
            "DM with a 2-WR-for-1-RB structure, push for their RB1 if their depth is OK",
        },
      ],
      best_when: [{ kind: "weeks_into_season", min: 3, max: 8 }],
      risks: [
        "Confirms publicly you're shopping WRs. buyers may wait you out",
      ],
      exclusivity: "burns-rapport",
    },
  ],

  counter_archetypes: ["wr-anchor-and-volume"],
  exemplar_profiles: [
    "6-8 WRs ranked WR15-WR60",
    "No top-5 WR anchor. value is spread across the room",
  ],
};

export const WR_ARCHETYPES: Archetype[] = [wrAnchorAndVolume, wrStockpiler];
