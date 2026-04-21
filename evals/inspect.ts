/**
 * Dump a single scenario's full structured output, for human review of
 * tone, depth, and iceman-pattern adherence beyond the mechanical checks.
 *
 *   npx tsx evals/inspect.ts iceman_trade_decline_bradyh20
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { runStructured } from "@/lib/engine/anthropic";
import { renderContextForPrompt } from "@/lib/engine/context";
import {
  pickOutputJsonSchema,
  pickOutputSchema,
  strategyClarifyOutputJsonSchema,
  strategyClarifyOutputSchema,
  tradeIncomingOutputJsonSchema,
  tradeIncomingOutputSchema,
  tradeOutboundOutputJsonSchema,
  tradeOutboundOutputSchema,
} from "@/lib/engine/schemas";
import { scenarios } from "./scenarios";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx evals/inspect.ts <scenario_id>");
    process.exit(1);
  }
  const s = scenarios.find((x) => x.id === id);
  if (!s) {
    console.error(`No scenario with id: ${id}`);
    console.error("Available:", scenarios.map((x) => x.id).join(", "));
    process.exit(1);
  }

  let output: unknown;
  switch (s.kind) {
    case "pick": {
      const msg = [
        `# Decision: Pick`,
        `I'm on the clock at **${s.current_pick}**.`,
        ``,
        `## Available players`,
        ...s.available_players.map((p) => `- ${p}`),
        ``,
        s.notes ? `## Notes\n${s.notes}\n` : "",
        `## Context`,
        renderContextForPrompt(s.context),
        ``,
        `Invoke the \`pick_decision\` tool.`,
      ]
        .filter(Boolean)
        .join("\n");
      output = (
        await runStructured({
          toolName: "pick_decision",
          toolDescription: "Emit a structured pick recommendation.",
          inputJsonSchema: pickOutputJsonSchema as unknown as Record<string, unknown>,
          outputSchema: pickOutputSchema,
          userMessage: msg,
          model: "sonnet",
          maxTokens: 1200,
        })
      ).output;
      break;
    }
    case "trade_incoming": {
      const msg = [
        `# Decision: Incoming trade`,
        `**I send:** ${s.you_send.join(", ")}`,
        `**I receive:** ${s.you_receive.join(", ")}`,
        s.other_manager ? `**From:** ${s.other_manager}` : "",
        s.notes ? `## Notes\n${s.notes}\n` : "",
        `## Context`,
        renderContextForPrompt(s.context),
        ``,
        `Invoke the \`trade_incoming_decision\` tool.`,
      ]
        .filter(Boolean)
        .join("\n");
      output = (
        await runStructured({
          toolName: "trade_incoming_decision",
          toolDescription: "Emit a structured decision for an incoming trade.",
          inputJsonSchema: tradeIncomingOutputJsonSchema as unknown as Record<
            string,
            unknown
          >,
          outputSchema: tradeIncomingOutputSchema,
          userMessage: msg,
          model: "sonnet",
          maxTokens: 1500,
        })
      ).output;
      break;
    }
    case "trade_outbound": {
      const msg = [
        `# Decision: Outbound trade`,
        `I'm targeting ${s.target.kind} **${s.target.name}**.`,
        s.willingToMove ? `I'm open to moving: ${s.willingToMove.join(", ")}` : "",
        s.notes ? `## Notes\n${s.notes}\n` : "",
        `## Context`,
        renderContextForPrompt(s.context),
        ``,
        `Invoke the \`trade_outbound_decision\` tool.`,
      ]
        .filter(Boolean)
        .join("\n");
      output = (
        await runStructured({
          toolName: "trade_outbound_decision",
          toolDescription: "Emit a structured outbound trade attack.",
          inputJsonSchema: tradeOutboundOutputJsonSchema as unknown as Record<
            string,
            unknown
          >,
          outputSchema: tradeOutboundOutputSchema,
          userMessage: msg,
          model: "sonnet",
          maxTokens: 1800,
        })
      ).output;
      break;
    }
    case "strategy": {
      const msg = [
        `# Decision: Strategy clarify`,
        `What am I actually building?`,
        ``,
        `## Context`,
        renderContextForPrompt(s.context),
        ``,
        `Invoke the \`strategy_clarify\` tool.`,
      ].join("\n");
      output = (
        await runStructured({
          toolName: "strategy_clarify",
          toolDescription: "Emit a structured strategy assessment.",
          inputJsonSchema: strategyClarifyOutputJsonSchema as unknown as Record<
            string,
            unknown
          >,
          outputSchema: strategyClarifyOutputSchema,
          userMessage: msg,
          model: "opus",
          maxTokens: 2000,
        })
      ).output;
      break;
    }
  }

  console.log(`\n── Scenario: ${s.id} ──`);
  console.log(s.label);
  console.log();
  console.log(JSON.stringify(output, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
