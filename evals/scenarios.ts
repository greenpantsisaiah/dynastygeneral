import type { DecisionContext } from "@/lib/engine/context";
import {
  icemanContext,
  midseasonQbHoardContext,
  sparseContext,
} from "./synthetic-context";

export type PickScenario = {
  id: string;
  source: "iceman" | "chatgpt";
  kind: "pick";
  label: string;
  context: DecisionContext;
  current_pick: string;
  available_players: string[];
  notes?: string;
};

export type TradeIncomingScenario = {
  id: string;
  source: "iceman" | "chatgpt";
  kind: "trade_incoming";
  label: string;
  context: DecisionContext;
  you_send: string[];
  you_receive: string[];
  other_manager?: string;
  notes?: string;
};

export type TradeOutboundScenario = {
  id: string;
  source: "iceman" | "chatgpt";
  kind: "trade_outbound";
  label: string;
  context: DecisionContext;
  target: { kind: "player" | "manager"; name: string };
  willingToMove?: string[];
  notes?: string;
};

export type StrategyScenario = {
  id: string;
  source: "iceman" | "chatgpt";
  kind: "strategy";
  label: string;
  context: DecisionContext;
};

export type Scenario =
  | PickScenario
  | TradeIncomingScenario
  | TradeOutboundScenario
  | StrategyScenario;

export const scenarios: Scenario[] = [
  // ── Iceman: Pick under pressure (Example 3, Metcalf/Harvey at 7.4) ───
  {
    id: "iceman_pick_metcalf_harvey",
    source: "iceman",
    kind: "pick",
    label: "Pick 7.4: Metcalf vs Harvey vs ADP",
    context: icemanContext(),
    current_pick: "7.4",
    available_players: [
      "DK Metcalf (WR, PIT, age 28) ADP 102",
      "RJ Harvey (RB, DEN, age 24) ADP 82.8",
      "Javonte Williams (RB, DAL, age 26) ADP 70.7",
      "Derrick Henry (RB, BAL, age 32) ADP 68",
      "D'Andre Swift (RB, CHI, age 26)",
      "Xavier Worthy (WR, KC, age 21)",
    ],
    notes:
      "65/35 win-now/future. Two elite QBs to trade (Herbert, Hurts). Next pick is 8.9.",
  },

  // ── Iceman: Declining a "fair" trade under pressure (Example 4) ──────
  {
    id: "iceman_trade_decline_bradyh20",
    source: "iceman",
    kind: "trade_incoming",
    label: "Trade-back offer from BradyH20 at 7.4",
    context: icemanContext(),
    you_send: ["2026 Pick 7.4"],
    you_receive: ["2026 Pick 10.12", "2027 2nd round pick"],
    other_manager: "BradyH20 (qb_banker)",
    notes:
      "Live draft, 4 hours on clock. I'm 65/35 win-now/future. Javonte, Harvey, Henry still on the board. Next pick is 8.9.",
  },

  // ── Iceman: QB hoarding question (Example 5) ─────────────────────────
  {
    id: "iceman_strategy_qb_hoard",
    source: "iceman",
    kind: "strategy",
    label: "Should I stash another QB like Mayfield/Goff?",
    context: midseasonQbHoardContext(),
  },

  // ── Iceman: Full league structural synthesis (Example 7) ─────────────
  {
    id: "iceman_strategy_full_synthesis",
    source: "iceman",
    kind: "strategy",
    label: "Characterize league dynamics + my open/closed strategies",
    context: icemanContext(),
  },

  // ── Iceman: Attack a desperation team (implied in Example 7) ─────────
  {
    id: "iceman_trade_outbound_maccheese",
    source: "iceman",
    kind: "trade_outbound",
    label: "Attack MacCheese13: zero QBs, loaded WR room",
    context: icemanContext(),
    target: { kind: "manager", name: "MacCheese13" },
    willingToMove: ["Jalen Hurts (QB, PHI)", "2027 2nd"],
    notes:
      "MacCheese13 has 0 QBs through 6 picks. I want to target Malik Nabers.",
  },

  // ── ChatGPT reference: Scenario 2, extracting EV on a trade ──────────
  {
    id: "chatgpt_trade_incoming_moving_down",
    source: "chatgpt",
    kind: "trade_incoming",
    label: "Move down multiple rounds for mid picks",
    context: icemanContext(),
    you_send: ["2026 Pick 5.9"],
    you_receive: ["2026 Pick 7.9", "2026 Pick 9.2", "2026 Pick 11.4"],
    notes: "I want to always extract EV.",
  },

  // ── ChatGPT reference: Scenario 3, rank top 3, up in 3 picks ─────────
  {
    id: "chatgpt_pick_rank_top_three",
    source: "chatgpt",
    kind: "pick",
    label: "Rank my top 3 options, up in 3 picks",
    context: icemanContext(),
    current_pick: "8.4 (up in 3)",
    available_players: [
      "Kaleb Johnson (RB, PIT, rookie)",
      "Travis Etienne (RB, JAX, age 26)",
      "Jerry Jeudy (WR, CLE, age 26)",
      "Dalton Kincaid (TE, BUF, age 25)",
      "Tucker Kraft (TE, GB, age 24)",
    ],
    notes: "Want a ranked list, not hedging.",
  },

  // ── ChatGPT reference: Scenario 1, early draft philosophy ────────────
  {
    id: "chatgpt_strategy_philosophy",
    source: "chatgpt",
    kind: "strategy",
    label: "Do I always aim for first season win?",
    context: sparseContext(),
  },
];
