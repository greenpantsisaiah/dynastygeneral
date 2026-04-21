import type { Archetype } from "../schema";

/**
 * QB-focused archetypes. Stage A starter set: 3 entries.
 *
 * Pivot graph is closed within the Stage A catalog (no dangling
 * references). New cross-category references (wr-*, macro-*) point at
 * IDs that exist in the sibling catalog files.
 */

const qbCartelAnchor: Archetype = {
  id: "qb-cartel-anchor",
  name: "QB Cartel",
  category: "Positional Leverage",
  tagline: "Corner the QB market. Force scarcity. Sell into panic windows.",
  horizon: 65,

  the_gamble: {
    statement:
      "Owning 3+ startable QBs in a 1QB or Superflex league creates an in-season trade market on your terms. When other teams hit a bye-week or injury crisis, you set the price.",
    base_likelihood: 0.55,
    likelihood_modifiers: [
      {
        kind: "league_position_scarcity_after_round",
        position: "QB",
        round: 2,
        threshold_teams_without: 6,
        delta: 0.2,
        rationale:
          "{{n}}/{{total}} teams still QB-less after Rd 2. scarcity will bite by Wk4-6",
      },
      {
        kind: "league_format_match",
        format: "superflex",
        delta: 0.1,
        rationale: "Superflex doubles QB demand. premium tier holds value",
      },
      {
        kind: "opposing_archetype_overlap",
        archetype_id: "qb-cartel-anchor",
        min_overlap: 2,
        delta: -0.18,
        rationale:
          "{{n}} other teams hoarding QBs. the cartel breaks down when supply piles up",
      },
    ],
  },

  the_risks: [
    {
      statement:
        "Buyers don't materialize. you carry 3+ QBs and starve another room.",
      base_likelihood: 0.3,
      likelihood_modifiers: [
        {
          kind: "opposing_position_depth_avg",
          position: "QB",
          above_threshold: 1.5,
          delta: 0.2,
          rationale:
            "League avg ≥1.5 QBs/roster. most teams already covered, fewer buyers",
        },
        {
          kind: "league_format_match",
          format: "superflex",
          delta: -0.15,
          rationale: "Superflex demand keeps buyers in the market longer",
        },
      ],
    },
    {
      statement:
        "Telegraphs you as a forced seller. bidders lowball every offer.",
      base_likelihood: 0.25,
      likelihood_modifiers: [
        {
          kind: "user_owns_top_n_at_position",
          position: "QB",
          n: 4,
          delta: 0.4,
          rationale:
            "4+ QBs flips leverage against you. market reads desperation",
        },
      ],
    },
  ],

  fit_signals: [
    { kind: "user_owns_top_n_at_position", position: "QB", min: 2, weight: 1.0 },
    {
      kind: "league_format",
      format: ["1qb", "superflex"],
      weight: 0.5,
    },
  ],

  opening_signals: [
    {
      kind: "league_position_scarcity_after_round",
      position: "QB",
      round: 2,
      threshold_teams_without: 5,
      label: "QB hole opening in front of you",
    },
  ],

  required_moves: [
    {
      description: "Acquire 3rd startable QB before Wk4 if not drafted",
      by_when: "wk:4",
      priority: "critical",
      completion_check: { kind: "min_position_count", position: "QB", min: 3 },
    },
    {
      description: "Don't sell into the first offer. create a market first",
      by_when: "wk:6-9",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: {
        kind: "opposing_archetype_overlap",
        archetype_id: "qb-cartel-anchor",
        min: 2,
      },
      branches: [
        {
          archetype_id: "qb-late-streamer",
          why: "Cartel's saturated. Sell QB3 now while scarcity premium still holds, redeploy the capital.",
        },
        {
          archetype_id: "wr-anchor-and-volume",
          why: "Pivot capital to the WR room where the league is running light.",
        },
      ],
    },
    {
      trigger: {
        kind: "anchor_injury",
        position: "QB",
        duration_weeks_min: 4,
      },
      branches: [
        {
          archetype_id: "qb-volume-replacement",
          why: "Promote QB3 to starter. Target a streaming-tier QB on waivers to backfill.",
        },
      ],
    },
  ],

  plays: [
    {
      id: "qb-cartel-create-scarcity-vibe",
      intent: "market-make",
      channel: "all-chat",
      target_kind: "all-league",
      tone: "casual",
      template:
        "Anyone else's QB room looking thin heading into the {{bye_cluster}}? Mine's surprisingly deep. might be willing to help out.",
      read_their_response: [
        {
          if_they_say: "yeah I'm hurting at QB",
          it_likely_means: "QB-needy and urgency rising",
          recommended_action:
            "DM with opening offer pegged 15-20% above market value",
        },
        {
          if_they_say: "silence from {{known_qb_light_team}}",
          it_likely_means: "playing it cool but probably desperate",
          recommended_action:
            "wait 48h, then DM that team directly with a softer fishing line",
        },
      ],
      best_when: [
        { kind: "weeks_into_season", min: 4, max: 7 },
        { kind: "approaching_byes", positions: ["QB"] },
      ],
      risks: [
        "If the league reads it as desperation-signaling, the market won't materialize",
        "Salesy tone may grate in casual leagues",
      ],
      exclusivity: "burns-rapport",
      min_league_tone: "casual",
    },
    {
      id: "qb-cartel-fish-targeted",
      intent: "probe",
      channel: "dm",
      target_kind: "specific-opponent",
      tone: "fishing",
      template:
        "Hey, you set at QB this year? I might have one I'd move for the right piece.",
      read_their_response: [
        {
          if_they_say: "I could use depth",
          it_likely_means: "soft buyer. they'll engage but won't pay premium yet",
          recommended_action:
            "respond vaguely about pricing, wait until they ask for a name",
        },
        {
          if_they_say: "all good thanks",
          it_likely_means:
            "either truly set or playing it cool. log and revisit at bye",
          recommended_action:
            "no follow-up; check back at their QB1's bye week",
        },
      ],
      best_when: [{ kind: "weeks_into_season", min: 3, max: 8 }],
      risks: ["Telegraphs that you're holding QB depth"],
      exclusivity: "single-use",
    },
  ],

  counter_archetypes: ["qb-late-streamer", "wr-stockpiler"],
  exemplar_profiles: [
    "Top-12 QB anchor x2",
    "Mid-tier QB3 with rushing floor (e.g. dual-threat type)",
  ],
};

const qbLateStreamer: Archetype = {
  id: "qb-late-streamer",
  name: "QB Late Streamer",
  category: "QB Strategy",
  tagline: "Spend nothing on QB. Stream matchups. Reinvest the capital at WR/RB.",
  horizon: 35,

  the_gamble: {
    statement:
      "Replacement-level QB production is widely available. By punting QB, you free up draft capital and roster slots for advantage at scoring positions.",
    base_likelihood: 0.5,
    likelihood_modifiers: [
      {
        kind: "league_format_match",
        format: "superflex",
        delta: -0.3,
        rationale: "Superflex makes QB streaming brutal. punting is malpractice",
      },
      {
        kind: "league_position_scarcity_after_round",
        position: "QB",
        round: 5,
        threshold_teams_without: 4,
        delta: 0.15,
        rationale:
          "QBs going late this year. {{n}}/{{total}} still without one means waiver QB1 quality holds up",
      },
    ],
  },

  the_risks: [
    {
      statement:
        "Streaming QB1 in a tight playoff matchup costs you a week and the season.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
    {
      statement:
        "Cartel forms late and you can't buy a QB at any price by Wk8.",
      base_likelihood: 0.25,
      likelihood_modifiers: [
        {
          kind: "opposing_archetype_overlap",
          archetype_id: "qb-cartel-anchor",
          min_overlap: 2,
          delta: 0.3,
          rationale:
            "{{n}} teams running QB Cartel. you're the buyer with no QBs when the price spikes",
        },
      ],
    },
  ],

  fit_signals: [
    { kind: "user_owns_top_n_at_position", position: "QB", max: 1, weight: 1.0 },
    { kind: "league_format", format: "1qb", weight: 0.6 },
  ],

  required_moves: [
    {
      description: "Set waiver priority for QB1 streaming targets each week",
      by_when: "wk:1",
      priority: "high",
    },
    {
      description:
        "Keep one trade chip earmarked as your 'QB insurance'. pull it if streaming collapses",
      by_when: "this-draft",
      priority: "medium",
    },
  ],

  pivots: [
    {
      trigger: {
        kind: "opposing_archetype_overlap",
        archetype_id: "qb-cartel-anchor",
        min: 2,
      },
      branches: [
        {
          archetype_id: "qb-cartel-anchor",
          why: "If the cartel is forming, jump in before the door closes. buy a QB now while one is still gettable.",
          timing_window: "wk:3-5",
        },
      ],
    },
  ],

  plays: [
    {
      id: "late-streamer-fish-cartel",
      intent: "verify-archetype",
      channel: "all-chat",
      target_kind: "all-league",
      tone: "casual",
      template:
        "QB streaming question. anyone been good at picking up the {{matchup_qb}} types off waivers, or is everyone hoarding?",
      read_their_response: [
        {
          if_they_say: "no one's hoarding, plenty available",
          it_likely_means: "no cartel forming. your strategy holds",
          recommended_action: "stay the course",
        },
        {
          if_they_say: "good luck, I grabbed [QB] last week",
          it_likely_means:
            "at least one team is actively stockpiling. check their roster for cartel signs",
          recommended_action:
            "open opponent panel, raise QB Cartel confidence on that team",
        },
      ],
      best_when: [{ kind: "weeks_into_season", min: 2, max: 5 }],
      risks: ["Light tell that you're streaming"],
      exclusivity: "safe-to-repeat",
    },
  ],

  counter_archetypes: ["qb-cartel-anchor"],
  exemplar_profiles: [
    "1 QB ranked QB18-QB28",
    "Roster heavy at WR/RB tier 1 due to QB capital savings",
  ],
};

const qbVolumeReplacement: Archetype = {
  id: "qb-volume-replacement",
  name: "QB Volume Replacement",
  category: "QB Strategy",
  tagline:
    "Anchor went down. Promote depth, claim a streaming-tier starter, ride volume to season end.",
  horizon: 50,

  the_gamble: {
    statement:
      "After a starting-QB injury, the next-best high-volume QB on waivers + your existing depth produces enough points to keep you competitive without overpaying in a panic trade.",
    base_likelihood: 0.45,
    likelihood_modifiers: [
      {
        kind: "user_owns_top_n_at_position",
        position: "QB",
        n: 2,
        delta: 0.2,
        rationale: "You already have a QB2. replacement is depth, not panic",
      },
    ],
  },

  the_risks: [
    {
      statement: "Replacement QB1 isn't startable in playoffs. you bow out at Wk14.",
      base_likelihood: 0.4,
      likelihood_modifiers: [],
    },
    {
      statement:
        "The market knows you're hurt. every QB trade target gets marked up 30%.",
      base_likelihood: 0.35,
      likelihood_modifiers: [],
    },
  ],

  fit_signals: [
    { kind: "user_owns_top_n_at_position", position: "QB", min: 2, weight: 0.5 },
  ],

  required_moves: [
    {
      description:
        "Claim top available QB on waivers immediately. even at FAAB premium",
      by_when: "this-week",
      priority: "critical",
    },
    {
      description: "Quietly ask 2-3 QB-deep teams about depth-piece trades, no urgency in tone",
      by_when: "this-week",
      priority: "high",
    },
  ],

  pivots: [
    {
      trigger: {
        kind: "user_record_collapse",
        wins_max: 3,
        games_min: 8,
      },
      branches: [
        {
          archetype_id: "macro-productive-tank",
          why: "Replacement plan failed. pivot to next-window mode, sell remaining production for picks.",
        },
      ],
    },
  ],

  plays: [
    {
      id: "volume-replacement-quiet-ask",
      intent: "negotiate",
      channel: "dm",
      target_kind: "specific-opponent",
      tone: "professional",
      template:
        "Hey, looking at depth options at QB. Would you consider moving {{their_qb2_or_qb3}} for {{your_offer}}? No rush.",
      read_their_response: [
        {
          if_they_say: "I'd want a starter back",
          it_likely_means: "they read your hand. pricing reflects panic",
          recommended_action:
            "withdraw casually, pivot to a different team or wait 72h",
        },
        {
          if_they_say: "what'd you have in mind",
          it_likely_means:
            "they don't read the urgency. you have leverage to underbid",
          recommended_action: "pitch a fair-side offer, frame as roster cleanup",
        },
      ],
      best_when: [{ kind: "any_time" }],
      risks: ["Phrasing 'no rush' is the tell. drop it if you can"],
      exclusivity: "single-use",
    },
  ],

  counter_archetypes: [],
  exemplar_profiles: ["QB2 promoted to QB1", "Streaming-tier QB1 added off waivers"],
};

export const QB_ARCHETYPES: Archetype[] = [
  qbCartelAnchor,
  qbLateStreamer,
  qbVolumeReplacement,
];
