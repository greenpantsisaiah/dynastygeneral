import { runStructured, type RunResult } from "./anthropic";
import { assembleContext, renderContextForPrompt } from "./context";
import {
  pickOutputJsonSchema,
  pickOutputSchema,
  strategyClarifyOutputJsonSchema,
  strategyClarifyOutputSchema,
  tradeIncomingOutputJsonSchema,
  tradeIncomingOutputSchema,
  tradeOutboundOutputJsonSchema,
  tradeOutboundOutputSchema,
  type PickOutput,
  type StrategyClarifyOutput,
  type StrategyState,
  type TradeIncomingOutput,
  type TradeOutboundOutput,
} from "./schemas";

function declaredLine(declared?: StrategyState | null): string {
  if (!declared || declared === "undetermined") return "";
  return `**Declared strategy: ${declared}** (locked by user; treat this as the source of truth and override inferred if they disagree)\n`;
}

/**
 * Decision entry points. Each function assembles context, builds a tight
 * user message, and asks the engine to invoke the matching tool.
 */

// ── Pick ──────────────────────────────────────────────────────────────────

export type PickDecisionInput = {
  leagueId: string;
  sleeperUsername?: string | null;
  currentPick: string; // "5.9" or "pick 57"; user-provided
  availablePlayers: string[]; // user-pasted names
  notes?: string | null;
  declaredStrategy?: StrategyState | null;
};

export async function runPickDecision(
  input: PickDecisionInput,
): Promise<RunResult<PickOutput>> {
  const ctx = await assembleContext({
    leagueId: input.leagueId,
    sleeperUsername: input.sleeperUsername ?? null,
  });

  const userMessage = [
    `# Decision: Pick`,
    ``,
    declaredLine(input.declaredStrategy),
    `I'm on the clock at **${input.currentPick}**.`,
    ``,
    `## Available players (I've typed what I can see)`,
    ...input.availablePlayers.map((p) => `- ${p}`),
    ``,
    input.notes ? `## Notes\n${input.notes}\n` : "",
    `## Context`,
    renderContextForPrompt(ctx),
    ``,
    `Make a decisive recommendation. Invoke the \`pick_decision\` tool with the structured result. Name the opportunity cost explicitly. No prose outside the tool call.`,
  ]
    .filter(Boolean)
    .join("\n");

  return runStructured({
    toolName: "pick_decision",
    toolDescription:
      "Emit a structured pick recommendation for the current slot, grounded in the provided league/roster/strategy context.",
    inputJsonSchema: pickOutputJsonSchema as unknown as Record<string, unknown>,
    outputSchema: pickOutputSchema,
    userMessage,
    model: "sonnet",
    maxTokens: 1200,
    temperature: 0.35,
  });
}

// ── Trade: incoming ───────────────────────────────────────────────────────

export type TradeIncomingInput = {
  leagueId: string;
  sleeperUsername?: string | null;
  offer: {
    you_send: string[];
    you_receive: string[];
    other_manager?: string | null;
  };
  notes?: string | null;
  declaredStrategy?: StrategyState | null;
};

export async function runTradeIncoming(
  input: TradeIncomingInput,
): Promise<RunResult<TradeIncomingOutput>> {
  const ctx = await assembleContext({
    leagueId: input.leagueId,
    sleeperUsername: input.sleeperUsername ?? null,
  });

  const userMessage = [
    `# Decision: Incoming trade`,
    ``,
    declaredLine(input.declaredStrategy),
    `## Offer`,
    `**I send:** ${input.offer.you_send.join(", ")}`,
    `**I receive:** ${input.offer.you_receive.join(", ")}`,
    input.offer.other_manager ? `**From:** ${input.offer.other_manager}` : "",
    ``,
    input.notes ? `## Notes\n${input.notes}\n` : "",
    `## Context`,
    renderContextForPrompt(ctx),
    ``,
    `Decide accept / counter / decline / wait. Invoke the \`trade_incoming_decision\` tool. Every output must include a walk-away floor and an explicit opportunity cost. If counter, include a copy-ready message.`,
  ]
    .filter(Boolean)
    .join("\n");

  return runStructured({
    toolName: "trade_incoming_decision",
    toolDescription:
      "Emit a structured decision for an incoming trade offer, including walk-away floor and negotiation message when appropriate.",
    inputJsonSchema: tradeIncomingOutputJsonSchema as unknown as Record<
      string,
      unknown
    >,
    outputSchema: tradeIncomingOutputSchema,
    userMessage,
    model: "sonnet",
    maxTokens: 1500,
    temperature: 0.35,
  });
}

// ── Trade: outbound ───────────────────────────────────────────────────────

export type TradeOutboundInput = {
  leagueId: string;
  sleeperUsername?: string | null;
  target:
    | { kind: "player"; name: string }
    | { kind: "manager"; name: string }
    | { kind: "pick"; name: string };
  willingToMove?: string[];
  notes?: string | null;
  declaredStrategy?: StrategyState | null;
};

export async function runTradeOutbound(
  input: TradeOutboundInput,
): Promise<RunResult<TradeOutboundOutput>> {
  const ctx = await assembleContext({
    leagueId: input.leagueId,
    sleeperUsername: input.sleeperUsername ?? null,
  });

  const targetLabel =
    input.target.kind === "player"
      ? `player **${input.target.name}**`
      : input.target.kind === "manager"
        ? `manager **${input.target.name}**`
        : `the **${input.target.name}** pick (rookie or current draft pick the user wants to acquire from its current owner; price it using the pricing.pick_values block, identify the current owner from snapshot.draft, and frame the angle around that manager's roster needs)`;

  const userMessage = [
    `# Decision: Outbound trade`,
    ``,
    declaredLine(input.declaredStrategy),
    `I'm targeting ${targetLabel}.`,
    input.willingToMove && input.willingToMove.length > 0
      ? `\n**I'm open to moving:** ${input.willingToMove.join(", ")}`
      : "",
    ``,
    input.notes ? `## Notes\n${input.notes}\n` : "",
    `## Context`,
    renderContextForPrompt(ctx),
    ``,
    `Build an attack. Invoke the \`trade_outbound_decision\` tool with 2-3 tiered packages (conservative / fair / aggressive), a copy-ready opener, and a walk-away floor. Lead with the opponent's incentive, not our ask.`,
  ]
    .filter(Boolean)
    .join("\n");

  return runStructured({
    toolName: "trade_outbound_decision",
    toolDescription:
      "Emit a structured outbound trade attack: angle, packages, opener, walk-away floor.",
    inputJsonSchema: tradeOutboundOutputJsonSchema as unknown as Record<
      string,
      unknown
    >,
    outputSchema: tradeOutboundOutputSchema,
    userMessage,
    model: "sonnet",
    maxTokens: 1800,
    temperature: 0.4,
  });
}

// ── Strategy clarify ──────────────────────────────────────────────────────

export type StrategyClarifyInput = {
  leagueId: string;
  sleeperUsername?: string | null;
  declaredStrategy?: StrategyState | null;
};

export async function runStrategyClarify(
  input: StrategyClarifyInput,
): Promise<RunResult<StrategyClarifyOutput>> {
  const ctx = await assembleContext({
    leagueId: input.leagueId,
    sleeperUsername: input.sleeperUsername ?? null,
  });

  const userMessage = [
    `# Decision: Strategy clarify`,
    ``,
    declaredLine(input.declaredStrategy),
    `What am I actually building? Which strategies remain open, and which have closed?`,
    ``,
    `## Context`,
    renderContextForPrompt(ctx),
    ``,
    `Invoke the \`strategy_clarify\` tool. Do not hedge. Be decisive about what's closed so I don't drift into it.`,
  ].join("\n");

  return runStructured({
    toolName: "strategy_clarify",
    toolDescription:
      "Emit a structured strategy assessment with state, signals, strengths, drift risks, next moves, and closed strategies.",
    inputJsonSchema: strategyClarifyOutputJsonSchema as unknown as Record<
      string,
      unknown
    >,
    outputSchema: strategyClarifyOutputSchema,
    userMessage,
    model: "opus", // deeper synthesis benefits from Opus
    maxTokens: 2000,
    temperature: 0.35,
  });
}
