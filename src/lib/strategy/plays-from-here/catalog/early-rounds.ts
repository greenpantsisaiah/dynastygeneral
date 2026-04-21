import type { PlayFromHere } from "../types";

/**
 * Early-round plays. Pick 1.1-1.12 across superflex + 1QB. Round 2
 * rollover plays included. Authored as a starter set; expand
 * pick-by-pick as we observe what users actually need.
 */

export const EARLY_ROUND_PLAYS: PlayFromHere[] = [
  // ── Superflex 1.1-1.3 ────────────────────────────────────────────
  {
    id: "sflex-r1-early-qb-anchor",
    title: "Take the QB1 anchor",
    move: "Take a top-3 dynasty QB",
    rationale:
      "Superflex makes elite QBs the most leverageable dynasty asset. A top-3 QB on a young, mobile profile holds value 4-5 years and creates trade leverage every offseason.",
    delta: { win_now: 18, future_value: 12 },
    chance_pays_off: 0.78,
    counter_signals: [
      {
        watch_for: "2+ teams visibly running QB cartel by Round 4",
        if_it_fires: "your top-1 QB premium gets undercut. flip QB2 early Wk2-3 before market saturates",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      pick_in_round_in: [1, 2, 3],
      round_in: [1],
    },
    roster_requirements: [{ position: "QB", max: 0 }],
    exemplar_targets: ["Josh Allen / Jayden Daniels / Lamar Jackson tier"],
  },
  {
    id: "sflex-r1-early-trade-back",
    title: "Trade back for two top-12 assets",
    move: "Trade 1.1-1.3 for a 1.03-1.05 + late 1st or early 2nd",
    rationale:
      "The dropoff from QB1 to QB2 in superflex is small enough that a savvy trade-back nets you two top-12 dynasty assets instead of one. Early-startup trade markets are the most generous of the year.",
    delta: { win_now: 8, future_value: 25 },
    chance_pays_off: 0.65,
    counter_signals: [
      {
        watch_for: "no buyer responds within 30 minutes of opening offers",
        if_it_fires: "the room values their top picks. pivot to taking the QB anchor before clock pressure hits",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      pick_in_round_in: [1, 2, 3],
      round_in: [1],
    },
    exemplar_targets: ["1.04 + 2.01 type return"],
  },
  {
    id: "sflex-r1-early-young-wr-defer-qb",
    title: "Take young WR1, defer QB to Rd 2",
    move: "Take a 22-and-under WR1 prospect; plan QB grab at your 2.x",
    rationale:
      "WR longevity is the longest in dynasty. A young WR1 at 1.1-1.3 is a 6-8 year asset. The QB you'd grab here is reachable at 2.10-2.12 if 4 of the next 8 picks aren't QBs.",
    delta: { win_now: 5, future_value: 22 },
    chance_pays_off: 0.55,
    counter_signals: [
      {
        watch_for: "QB run starts within next 6 picks (3+ QBs gone)",
        if_it_fires: "the QB you wanted at 2.x will be gone. burn capital trading up or accept QB3-tier",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      pick_in_round_in: [1, 2, 3],
      round_in: [1],
    },
    exemplar_targets: ["Marvin Harrison Jr. / Malik Nabers / Drake London tier"],
  },

  // ── Superflex 1.4-1.8 (mid 1st) ──────────────────────────────────
  {
    id: "sflex-r1-mid-qb-or-best-skill",
    title: "Take QB if there or pivot to best-available skill player",
    move: "Grab the next-tier QB if available; otherwise take the highest-floor skill player",
    rationale:
      "Mid-1st in superflex is decision territory. If a top-6 QB slips, it's almost always the right pick. If not, a proven WR1 or 22-year-old RB is the safer next-tier play.",
    delta: { win_now: 12, future_value: 14 },
    chance_pays_off: 0.7,
    counter_signals: [
      {
        watch_for: "your declared archetype points elsewhere",
        if_it_fires: "if locked QB Cartel and no QB available, trade back rather than take a non-QB you'll regret",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      pick_in_round_in: [4, 5, 6, 7, 8],
      round_in: [1],
    },
  },

  // ── Superflex 1.9-1.12 (back end) ────────────────────────────────
  {
    id: "sflex-r1-late-double-skill-bridge-qb",
    title: "Snake double-up on skill, bridge QB later",
    move: "Take the best WR/RB at 1.x and 2.x, plan a streaming-tier QB at 5.x-7.x",
    rationale:
      "Back-of-snake superflex is brutal for QB1 access. Better to anchor with a young WR + ascending RB, then take a high-volume mid-tier QB later when value lines up.",
    delta: { win_now: 10, future_value: 18 },
    chance_pays_off: 0.6,
    counter_signals: [
      {
        watch_for: "QB streaming pool dries up. only QB18+ available by Rd 5",
        if_it_fires: "your floor at QB collapses. package skill depth for QB2 in-season Wk1-3",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      pick_in_round_in: [9, 10, 11, 12],
      round_in: [1],
    },
  },

  // ── 1QB 1.1-1.3 ──────────────────────────────────────────────────
  {
    id: "1qb-r1-early-elite-wr",
    title: "Take the elite young WR1",
    move: "Take a 22-and-under WR1 prospect",
    rationale:
      "1QB top picks belong to WRs. Position has the longest dynasty shelf life and the most predictable scoring floor. Elite young WRs are the closest thing to risk-free assets.",
    delta: { win_now: 14, future_value: 22 },
    chance_pays_off: 0.78,
    counter_signals: [
      {
        watch_for: "no WR clearly above the next-tier RB",
        if_it_fires: "consider Bijan-tier RB instead. but only if you're committed to 2-3 year title window",
      },
    ],
    applies_when: {
      formats: ["1qb"],
      pick_in_round_in: [1, 2, 3],
      round_in: [1],
    },
    exemplar_targets: ["Ja'Marr Chase / Marvin Harrison Jr. tier"],
  },
  {
    id: "1qb-r1-early-bijan-tier-rb",
    title: "Take the elite young RB",
    move: "Take a 22-and-under RB1 prospect with a 3-down workload",
    rationale:
      "Generational RB1s aren't always available. when they are at 1.1-1.3, the win-now ceiling justifies the age-curve cost. Only if you're playing a 2-3 year title window.",
    delta: { win_now: 20, future_value: 8 },
    chance_pays_off: 0.62,
    counter_signals: [
      {
        watch_for: "any usage uncertainty (RBBC reports, free-agent target)",
        if_it_fires: "hard pivot to WR. RB1 thesis dies on any volume question",
      },
    ],
    applies_when: {
      formats: ["1qb"],
      pick_in_round_in: [1, 2, 3],
      round_in: [1],
    },
    exemplar_targets: ["Bijan Robinson / Jahmyr Gibbs tier"],
  },

  // ── 1QB 1.9-1.12 ─────────────────────────────────────────────────
  {
    id: "1qb-r1-late-stockpile-wr",
    title: "Stockpile WR depth, attack RB later",
    move: "Take a top-12 WR; pair with WR/RB at 2.x",
    rationale:
      "1QB back-of-snake is best spent on WR depth. you can build a WR3 starter group from picks 1.9-3.x and attack the proven RB tier in Rounds 4-5 when it usually slips.",
    delta: { win_now: 8, future_value: 14 },
    chance_pays_off: 0.62,
    counter_signals: [
      {
        watch_for: "early RB run (4+ RBs in Rd 1)",
        if_it_fires: "starter-quality RBs gone by 3.x. package WR3 + 2027 pick for RB1 in-season",
      },
    ],
    applies_when: {
      formats: ["1qb"],
      pick_in_round_in: [9, 10, 11, 12],
      round_in: [1],
    },
  },

  // ── Round 2 rollover plays (apply to first picks of Rd 2) ─────────
  {
    id: "sflex-r2-early-qb-anchor-grab",
    title: "Grab your QB anchor now",
    move: "Take the next-tier QB before Round 2 wraps",
    rationale:
      "Mid-round 2 in superflex is the last cheap window for a starter-tier QB. After this, you're either trading premium or streaming.",
    delta: { win_now: 14, future_value: 10 },
    chance_pays_off: 0.72,
    counter_signals: [
      {
        watch_for: "you already have a top-6 QB",
        if_it_fires: "stockpiling here invites Cartel risk. pivot to scarce skill position instead",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      round_in: [2],
      pick_in_round_in: [1, 2, 3, 4, 5, 6],
    },
    roster_requirements: [{ position: "QB", max: 0 }],
  },
  {
    id: "sflex-r2-late-snake-double-no-qb",
    title: "Snake-reverse double-tap (need QB2)",
    move: "Pair a QB anchor at 2.x with a young WR/RB at 3.x",
    rationale:
      "Slot 1-3 in superflex hits 2.10-2.12 + 3.1-3.3 back-to-back. With no QB on roster yet, the back-to-back picks should secure your QB room first. Round 3 still has solid skill value.",
    delta: { win_now: 12, future_value: 14 },
    chance_pays_off: 0.7,
    counter_signals: [
      {
        watch_for: "QB run during the snake reverse. 2-3 QBs in 6 picks",
        if_it_fires: "the QB pool dries up before you pick. take both skill players and stream QB",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      round_in: [2],
      pick_in_round_in: [10, 11, 12],
    },
    roster_requirements: [{ position: "QB", max: 0 }],
  },
  {
    id: "sflex-r2-late-snake-double-with-qb",
    title: "Snake-reverse double-tap (build around your QB1)",
    move: "Stack two starter-tier skill positions at 2.x + 3.x",
    rationale:
      "With your QB1 anchor locked, the back-to-back picks at 2.x + 3.x should attack the scarcest skill positions left. WR2 + RB1 or two WR1-tier prospects are the highest-EV pairings. RB tier breaks fast after this.",
    delta: { win_now: 14, future_value: 18 },
    chance_pays_off: 0.74,
    counter_signals: [
      {
        watch_for: "RB run between picks. 3+ RBs in next 6",
        if_it_fires: "starter-tier RBs gone. pivot both picks to WR depth, attack RB at 4.x via trade",
      },
      {
        watch_for: "TE-premium scoring + an elite TE slips",
        if_it_fires: "consider one of the picks as the elite-TE grab. TE-premium amplifies that scarcity",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      round_in: [2],
      pick_in_round_in: [10, 11, 12],
    },
    roster_requirements: [{ position: "QB", min: 1 }],
    exemplar_targets: [
      "WR2-tier (Drake London / Brian Thomas Jr. profile)",
      "RB1-tier (Bijan / Gibbs profile if available)",
      "TE1 if TE-premium",
    ],
  },
  {
    id: "1qb-r2-late-snake-double",
    title: "Snake-reverse double-tap (skill stack)",
    move: "Stack two skill positions back-to-back at 2.x + 3.x",
    rationale:
      "1QB back-to-snake is best deployed on two starter-tier skill positions. WR2 + WR3 or WR2 + RB1 are the highest-EV pairings.",
    delta: { win_now: 12, future_value: 14 },
    chance_pays_off: 0.68,
    counter_signals: [
      {
        watch_for: "TE run starts before you pick (2+ elite TEs gone)",
        if_it_fires: "TE-premium leagues only. pivot one of the picks to the last elite TE if scoring rewards it",
      },
    ],
    applies_when: {
      formats: ["1qb"],
      round_in: [2],
      pick_in_round_in: [10, 11, 12],
    },
  },

  // ── Round 3-5 plays ──────────────────────────────────────────────
  {
    id: "sflex-r3-lock-qb2",
    title: "Lock your QB2 now",
    move: "Take a high-rushing-floor QB2",
    rationale:
      "Rounds 3-4 in superflex are the last cheap window for a startable QB2. Rushing-floor QBs hold value best. they survive offensive coaching changes and weekly bye coverage matters in superflex.",
    delta: { win_now: 12, future_value: 10 },
    chance_pays_off: 0.7,
    counter_signals: [
      {
        watch_for: "no QB ranked top-18 still on the board",
        if_it_fires: "punt QB here entirely. take the best skill player available, stream from waivers Wk1",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      round_in: [3, 4, 5],
    },
    roster_requirements: [{ position: "QB", max: 1 }],
  },
  {
    id: "sflex-r3-pivot-scarce-skill",
    title: "Pivot to scarce skill. your QB room is set",
    move: "Take the best player at the scarcest skill position (RB, then TE if TE-premium)",
    rationale:
      "With 2+ QBs on roster, your superflex anchor is built. Rounds 3-5 are now about positional advantage. and RB tier breaks hardest in this window. TE-premium scoring tightens this further.",
    delta: { win_now: 11, future_value: 12 },
    chance_pays_off: 0.68,
    counter_signals: [
      {
        watch_for: "RB run already happened. only RBBC types left",
        if_it_fires: "pivot to TE-premium TE or stack another WR. your RB plan needs a Wk1-3 in-season trade",
      },
    ],
    applies_when: {
      formats: ["superflex"],
      round_in: [3, 4, 5],
    },
    roster_requirements: [{ position: "QB", min: 2 }],
  },
  {
    id: "1qb-r3-rb-hunt",
    title: "Hunt for proven RB starter tier",
    move: "Take the next-tier RB1 before the position cliffs",
    rationale:
      "1QB rounds 3-5 are the last reliable window for a starter-quality RB. RB age curves are brutal. proven Wk1-17 production at 23-25 years old is the sweet spot.",
    delta: { win_now: 12, future_value: 8 },
    chance_pays_off: 0.6,
    counter_signals: [
      {
        watch_for: "RB run already happened. only RBBC types left",
        if_it_fires: "punt RB here, target post-draft trade for an underrated RB1 in Wk2-3",
      },
    ],
    applies_when: {
      formats: ["1qb"],
      round_in: [3, 4, 5],
    },
  },

  // ── Catch-all: always at least one play during active draft ──────
  // The title/move/rationale here are templates. The enrichment step
  // resolves them to "Take Trey Benson (RB-ARI, age 23)" using the
  // user's roster needs + the live available-player pool.
  {
    id: "general-bpa-scarce-position",
    title: "Take the best available at your thinnest position",
    move: "Resolved at draft time based on your roster + pool",
    rationale:
      "When no specific archetype play applies, taking the best available player at your thinnest scoring position is the highest-expected-value default. Watch position-tier breaks more than ADP.",
    delta: { win_now: 6, future_value: 6 },
    chance_pays_off: 0.55,
    counter_signals: [
      {
        watch_for: "your declared archetype points elsewhere",
        if_it_fires: "stay aligned with the declared strategy. take the 2nd-best at your strategic position instead",
      },
    ],
    applies_when: {
      // No format/slot/round restrictions. fires whenever the draft is live
      total_picks_made_min: 0,
    },
    context_resolution: { kind: "user_top_need", n_players: 2 },
  },
];
