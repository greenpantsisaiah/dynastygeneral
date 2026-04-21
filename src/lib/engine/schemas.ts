import { z } from "zod";

/**
 * Structured-output schemas for the decision engine.
 *
 * Every decision output must include an explicit opportunity cost. Trade
 * outputs must include a walk-away floor. These invariants are enforced by
 * the model via the tool-use schema below and double-checked in evals.
 */

// ── Shared primitives ─────────────────────────────────────────────────────

export const strategyFitSchema = z.enum([
  "on_strategy",
  "drift",
  "unclear",
]);
export type StrategyFit = z.infer<typeof strategyFitSchema>;

export const leverageSchema = z.enum(["none", "moderate", "strong"]);
export type Leverage = z.infer<typeof leverageSchema>;

const confidence = z
  .number()
  .min(0)
  .max(1)
  .describe("Model confidence in the recommendation (0..1).");

const bullets = z
  .array(z.string().min(4))
  .min(2)
  .max(6)
  .describe(
    "2-6 concrete reasoning bullets. No hedging. Each bullet should " +
      "carry specific information, not generic principles.",
  );

// ── Pick decision ─────────────────────────────────────────────────────────

export const pickOutputSchema = z.object({
  recommendation: z
    .string()
    .min(4)
    .describe(
      "One short sentence: take X, trade back for Y, or wait. Lead with the action.",
    ),
  reasoning: bullets,
  strategy_fit: strategyFitSchema,
  drift_note: z
    .string()
    .nullish()
    .describe(
      "If strategy_fit is 'drift', explain the drift in one sentence. Otherwise null.",
    ),
  opportunity_cost: z
    .string()
    .describe(
      "REQUIRED. What the user gives up by following this recommendation. " +
        "Name the next best player/asset/path lost.",
    ),
  alternative: z
    .object({
      path: z.string(),
      when_to_choose: z.string(),
    })
    .nullish()
    .describe(
      "Second-best path if the call is close; null if the recommendation is decisive.",
    ),
  leverage_note: z
    .string()
    .nullish()
    .describe(
      "If runs or scarcity in the room create trade-back/up leverage, note it in one sentence.",
    ),
  confidence,
});
export type PickOutput = z.infer<typeof pickOutputSchema>;

// ── Trade: incoming (decide on an offer) ──────────────────────────────────

export const tradeActionSchema = z.enum([
  "accept",
  "counter",
  "decline",
  "wait",
]);
export type TradeAction = z.infer<typeof tradeActionSchema>;

export const tradeIncomingOutputSchema = z.object({
  action: tradeActionSchema,
  recommendation: z
    .string()
    .min(4)
    .describe("One-line action sentence. Lead with the verb."),
  reasoning: bullets,
  strategy_fit: strategyFitSchema,
  opportunity_cost: z.string(),
  opponent_read: z
    .string()
    .describe(
      "One-sentence read of the other manager's situation, need, and pressure.",
    ),
  leverage: leverageSchema,
  stronger_ask: z
    .string()
    .nullish()
    .describe(
      "If action is 'counter', the specific additional piece to request.",
    ),
  walk_away_floor: z
    .string()
    .describe(
      "REQUIRED. The minimum package below which the user should walk. " +
        "If action is 'accept', this is the floor that justified accepting.",
    ),
  negotiation_message: z
    .string()
    .nullish()
    .describe(
      "Copy-ready Sleeper chat message if sending a counter or decline. " +
        "No emojis. Natural, not corporate. 1-3 sentences.",
    ),
  confidence,
});
export type TradeIncomingOutput = z.infer<typeof tradeIncomingOutputSchema>;

// ── Trade: outbound (attack a target) ─────────────────────────────────────

export const tradePackageTierSchema = z.enum([
  "conservative",
  "fair",
  "aggressive",
]);
export type TradePackageTier = z.infer<typeof tradePackageTierSchema>;

export const tradePackageSchema = z.object({
  tier: tradePackageTierSchema,
  you_send: z.array(z.string()).min(1),
  you_receive: z.array(z.string()).min(1),
  rationale: z.string(),
});

export const tradeOutboundOutputSchema = z.object({
  attack_angle: z
    .string()
    .describe(
      "One sentence naming the specific pain point you're exploiting and why now.",
    ),
  opponent_read: z.string(),
  leverage: leverageSchema,
  packages: z
    .array(tradePackageSchema)
    .min(2)
    .max(3)
    .describe(
      "2-3 tiered packages: conservative (low friction), fair (market), aggressive (leverage play).",
    ),
  opener_message: z
    .string()
    .describe(
      "Copy-ready opening message. Lead with their incentive, not your ask.",
    ),
  walk_away_floor: z.string(),
  opportunity_cost: z.string(),
  confidence,
});
export type TradeOutboundOutput = z.infer<typeof tradeOutboundOutputSchema>;

// ── Strategy clarify ──────────────────────────────────────────────────────

export const strategyStateSchema = z.enum([
  "contender",
  "rebuild",
  "balanced",
  "undetermined",
]);
export type StrategyState = z.infer<typeof strategyStateSchema>;

export const leagueClusterSchema = z.object({
  name: z
    .string()
    .describe(
      "Descriptive cluster name carrying strategic meaning (e.g. 'desperation pool', 'tilted buyers', 'QB bankers', 'non-buyers').",
    ),
  teams: z.array(z.string()).min(1),
  dynamic: z
    .string()
    .describe("One-sentence read of the cluster's shared strategic posture."),
});
export type LeagueCluster = z.infer<typeof leagueClusterSchema>;

export const strategyClarifyOutputSchema = z.object({
  state: strategyStateSchema,
  signals: bullets,
  strengths: z.array(z.string()).min(1).max(5),
  drift_risks: z.array(z.string()).min(0).max(5),
  next_moves: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe(
      "2-4 concrete next strategic moves. Not generic advice; specific to this build.",
    ),
  closed_strategies: z
    .array(z.string())
    .describe(
      "Strategies no longer viable, so the user doesn't drift into them. Empty array if none.",
    ),
  league_clusters: z
    .array(leagueClusterSchema)
    .max(5)
    .nullish()
    .describe(
      "When the league profile has 8+ labeled teams, name 2-3 strategic clusters. Empty/null for sparse contexts.",
    ),
  execution_pivot: z
    .string()
    .nullish()
    .describe(
      "If the strategic frame is set and remaining decisions are tactical, say so here (e.g. 'The winning strategy was set in rounds 1-7; the rest is execution.'). Otherwise null.",
    ),
  confidence,
});
export type StrategyClarifyOutput = z.infer<typeof strategyClarifyOutputSchema>;

// ── JSON Schema versions (for Anthropic tool-use) ─────────────────────────
//
// We hand-write these to have full control over descriptions that the model
// reads. zod→JSON Schema converters drop description fields in some cases.

export const pickOutputJsonSchema = {
  type: "object",
  required: [
    "recommendation",
    "reasoning",
    "strategy_fit",
    "opportunity_cost",
    "confidence",
  ],
  properties: {
    recommendation: {
      type: "string",
      description:
        "One short sentence. Lead with the verb: take X, trade back for Y, wait.",
    },
    reasoning: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string" },
      description:
        "2-6 concrete bullets. No hedging. Name specific players, picks, or mechanisms.",
    },
    strategy_fit: {
      type: "string",
      enum: ["on_strategy", "drift", "unclear"],
    },
    drift_note: {
      type: ["string", "null"],
      description:
        "If strategy_fit is 'drift', one sentence on the specific conflict.",
    },
    opportunity_cost: {
      type: "string",
      description:
        "REQUIRED. The next best player/asset/path given up by following this recommendation.",
    },
    alternative: {
      type: ["object", "null"],
      properties: {
        path: { type: "string" },
        when_to_choose: { type: "string" },
      },
      required: ["path", "when_to_choose"],
    },
    leverage_note: {
      type: ["string", "null"],
      description:
        "If a run or scarcity creates trade-back/up leverage, name it.",
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export const tradeIncomingOutputJsonSchema = {
  type: "object",
  required: [
    "action",
    "recommendation",
    "reasoning",
    "strategy_fit",
    "opportunity_cost",
    "opponent_read",
    "leverage",
    "walk_away_floor",
    "confidence",
  ],
  properties: {
    action: { type: "string", enum: ["accept", "counter", "decline", "wait"] },
    recommendation: { type: "string" },
    reasoning: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string" },
    },
    strategy_fit: {
      type: "string",
      enum: ["on_strategy", "drift", "unclear"],
    },
    opportunity_cost: { type: "string" },
    opponent_read: { type: "string" },
    leverage: { type: "string", enum: ["none", "moderate", "strong"] },
    stronger_ask: { type: ["string", "null"] },
    walk_away_floor: {
      type: "string",
      description:
        "REQUIRED. The minimum package below which the user should walk.",
    },
    negotiation_message: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export const tradeOutboundOutputJsonSchema = {
  type: "object",
  required: [
    "attack_angle",
    "opponent_read",
    "leverage",
    "packages",
    "opener_message",
    "walk_away_floor",
    "opportunity_cost",
    "confidence",
  ],
  properties: {
    attack_angle: { type: "string" },
    opponent_read: { type: "string" },
    leverage: { type: "string", enum: ["none", "moderate", "strong"] },
    packages: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        required: ["tier", "you_send", "you_receive", "rationale"],
        properties: {
          tier: {
            type: "string",
            enum: ["conservative", "fair", "aggressive"],
          },
          you_send: { type: "array", items: { type: "string" } },
          you_receive: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
      },
    },
    opener_message: { type: "string" },
    walk_away_floor: { type: "string" },
    opportunity_cost: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export const strategyClarifyOutputJsonSchema = {
  type: "object",
  required: [
    "state",
    "signals",
    "strengths",
    "next_moves",
    "closed_strategies",
    "confidence",
  ],
  properties: {
    state: {
      type: "string",
      enum: ["contender", "rebuild", "balanced", "undetermined"],
    },
    signals: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: { type: "string" },
    },
    strengths: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
    },
    drift_risks: { type: "array", items: { type: "string" } },
    next_moves: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
    },
    closed_strategies: { type: "array", items: { type: "string" } },
    league_clusters: {
      type: ["array", "null"],
      maxItems: 5,
      items: {
        type: "object",
        required: ["name", "teams", "dynamic"],
        properties: {
          name: {
            type: "string",
            description:
              "Descriptive name with strategic meaning (e.g. 'desperation pool', 'tilted buyers').",
          },
          teams: { type: "array", items: { type: "string" }, minItems: 1 },
          dynamic: { type: "string" },
        },
      },
      description:
        "When the league has 8+ labeled teams, name 2-3 clusters by shared dynamic.",
    },
    execution_pivot: {
      type: ["string", "null"],
      description:
        "If the strategic frame is set and the rest is tactical plumbing, say so.",
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;
