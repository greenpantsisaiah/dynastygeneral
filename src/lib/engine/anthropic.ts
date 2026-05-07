import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./system-prompt";
import { recordSpend } from "@/lib/budget";

/**
 * Anthropic decision-engine wrapper.
 *
 * Behavior:
 * - Uses tool_use for structured output. The tool's input_schema is the
 *   output contract. The model must call the tool with valid fields.
 * - Caches the system prompt (ephemeral) to cut TTFT on repeat calls.
 * - If ANTHROPIC_API_KEY is missing, returns a clearly-flagged dev stub
 *   so the UI and evals can be exercised without burning credits.
 *
 * Model defaults:
 *   pick / trade          → claude-sonnet-4-6  (fast, sharp, cheap)
 *   strategy clarify      → claude-opus-4-7   (deeper structural synthesis)
 */

export type EngineModel = "sonnet" | "opus";

const MODEL_IDS: Record<EngineModel, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

export type RunOptions<TSchema extends z.ZodTypeAny> = {
  toolName: string;
  toolDescription: string;
  inputJsonSchema: Record<string, unknown>;
  outputSchema: TSchema;
  userMessage: string;
  model?: EngineModel;
  maxTokens?: number;
  temperature?: number;
};

export type RunResult<T> = {
  output: T;
  mode: "live" | "stub";
  latencyMs: number;
  tokens?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_creation?: number;
  };
};

let clientSingleton: Anthropic | null = null;

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!clientSingleton) {
    clientSingleton = new Anthropic({ apiKey: key });
  }
  return clientSingleton;
}

export async function runStructured<TSchema extends z.ZodTypeAny>(
  opts: RunOptions<TSchema>,
): Promise<RunResult<z.infer<TSchema>>> {
  const client = getClient();
  const started = Date.now();

  if (!client) {
    return {
      output: stubFor(opts) as z.infer<TSchema>,
      mode: "stub",
      latencyMs: Date.now() - started,
    };
  }

  const chosenModel = opts.model ?? "sonnet";
  const model = MODEL_IDS[chosenModel];

  // Opus 4.7 deprecates the temperature param. Omit it there; keep for Sonnet.
  const temperatureParams =
    chosenModel === "opus"
      ? {}
      : { temperature: opts.temperature ?? 0.4 };

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: opts.userMessage },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1500,
      ...temperatureParams,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription,
          input_schema: opts.inputJsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.toolName },
      messages,
    });

    // Best-effort spend tracking. Record EVERY attempt, including the
    // first one when schema validation fails and we retry. Per
    // dynasty-cost-watcher 2026-04-25 CRITICAL: prior code only
    // recorded inside the `if (parsed.success)` branch, so a failed-
    // first-attempt-then-successful-retry under-reported spend by
    // ~50%. Budget cap was tracking against a fictional total.
    recordSpend({
      model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }).catch(() => {});

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      throw new Error(
        `Engine response did not invoke tool "${opts.toolName}".`,
      );
    }

    const parsed = opts.outputSchema.safeParse(toolUse.input);
    if (parsed.success) {
      return {
        output: parsed.data,
        mode: "live",
        latencyMs: Date.now() - started,
        tokens: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cache_read: response.usage.cache_read_input_tokens ?? undefined,
          cache_creation:
            response.usage.cache_creation_input_tokens ?? undefined,
        },
      };
    }

    if (attempt === 1) {
      throw new Error(
        `Engine tool output failed schema validation after retry: ${parsed.error.message}`,
      );
    }

    // One retry: feed the model its own output + the validation error and
    // ask it to re-emit the tool call with corrected fields.
    messages.push({
      role: "assistant",
      content: response.content,
    });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: `Tool input failed validation: ${parsed.error.message}. Re-emit the tool call with only allowed enum values and required fields populated.`,
        },
      ],
    });
  }

  throw new Error("unreachable");
}

// ── Dev-mode stubs ────────────────────────────────────────────────────────

function stubFor<TSchema extends z.ZodTypeAny>(
  opts: RunOptions<TSchema>,
): unknown {
  switch (opts.toolName) {
    case "pick_decision":
      return {
        recommendation: "[DEV STUB] Take the best available WR; trade-back live.",
        reasoning: [
          "[DEV STUB] Strategy inference fits young-WR core.",
          "[DEV STUB] Two teams behind you need WR; mild leverage.",
          "[DEV STUB] RB cliff is 3-4 picks away; WR tier still deep.",
        ],
        strategy_fit: "on_strategy",
        drift_note: null,
        opportunity_cost:
          "[DEV STUB] Passing on the top remaining RB, who likely won't return by your next pick.",
        alternative: {
          path: "[DEV STUB] Trade-back for late-1st + usable WR.",
          when_to_choose:
            "Only if a taker is actively asking. Do not solicit.",
        },
        leverage_note: "[DEV STUB] Live. No ANTHROPIC_API_KEY configured.",
        confidence: 0.5,
      };
    case "trade_incoming_decision":
      return {
        action: "counter",
        recommendation: "[DEV STUB] Counter: ask for a future 2nd.",
        reasoning: [
          "[DEV STUB] Offer is fair on raw value, not on roster fit.",
          "[DEV STUB] Opponent is the trade-up party; they need your slot.",
          "[DEV STUB] Mild timing leverage on their side.",
        ],
        strategy_fit: "unclear",
        opportunity_cost:
          "[DEV STUB] Moving back means losing access to the current RB tier on your next pick.",
        opponent_read: "[DEV STUB] Likely targeting a specific RB on the board.",
        leverage: "moderate",
        stronger_ask: "[DEV STUB] Add a 2027 2nd.",
        counter_offer: {
          you_send: ["[DEV STUB] Mid-tier RB"],
          you_receive: ["[DEV STUB] Their original ask + 2027 2nd"],
          rationale: "[DEV STUB] Adds a future 2nd without breaking the band.",
        },
        walk_away_floor: "[DEV STUB] Decline anything below current offer.",
        negotiation_message:
          "[DEV STUB] Structure's fine. Given the board, I need a 2027 2nd to pull the trigger.",
        confidence: 0.5,
      };
    case "trade_outbound_decision":
      return {
        attack_angle:
          "[DEV STUB] Target the QB-needy team post-Week-1 loss.",
        opponent_read:
          "[DEV STUB] Starting a streamer; pain will spike after one bad game.",
        leverage: "moderate",
        packages: [
          {
            tier: "conservative",
            you_send: ["[DEV STUB] Backup QB"],
            you_receive: ["[DEV STUB] Startable WR3"],
            rationale: "Low friction, opens dialogue.",
          },
          {
            tier: "fair",
            you_send: ["[DEV STUB] Elite QB2"],
            you_receive: ["[DEV STUB] WR1 + late pick"],
            rationale: "Market-value, closes this week.",
          },
          {
            tier: "aggressive",
            you_send: ["[DEV STUB] Elite QB2"],
            you_receive: ["[DEV STUB] WR1 + future 1st"],
            rationale: "Leverage play if they wait one more week.",
          },
        ],
        opener_message:
          "[DEV STUB] Watching your QB situation this week. Think I can help. Interested?",
        walk_away_floor:
          "[DEV STUB] Nothing below a startable WR2 + pick.",
        opportunity_cost:
          "[DEV STUB] Lose the Week 4 bye-week insurance your QB2 provided.",
        confidence: 0.5,
      };
    case "strategy_clarify":
      return {
        state: "balanced",
        signals: [
          "[DEV STUB] Record + waiver position suggest middle.",
          "[DEV STUB] Roster shape mixes young WR with veteran RB.",
          "[DEV STUB] No ANTHROPIC_API_KEY configured; inference is placeholder.",
        ],
        strengths: ["[DEV STUB] QB depth", "[DEV STUB] Young WR core"],
        drift_risks: ["[DEV STUB] Taking another aging RB would tilt win-now."],
        next_moves: [
          "[DEV STUB] Decide on a declared lane before the trade deadline.",
          "[DEV STUB] Use QB surplus to convert to WR1 or 2027 1st.",
        ],
        closed_strategies: [
          "[DEV STUB] Pure rebuild blocked: veterans already on roster.",
        ],
        confidence: 0.4,
      };
    default:
      return {};
  }
}
