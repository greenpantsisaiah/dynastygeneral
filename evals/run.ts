/**
 * Eval runner.
 *
 * Runs every scenario through the real engine (against a synthesized
 * context: no Sleeper/Supabase required) and scores the output against
 * Iceman-pattern quality checks.
 *
 * Usage:
 *   npx tsx evals/run.ts
 *   npx tsx evals/run.ts --only iceman_pick_metcalf_harvey
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

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
import {
  buildAllowedNames,
  evalPick,
  evalStrategy,
  evalTradeIncoming,
  evalTradeOutbound,
  noUnnamedPlayerDrift,
  summarize,
  type Check,
} from "./criteria";
import { scenarios, type Scenario } from "./scenarios";

type Result = {
  id: string;
  label: string;
  kind: Scenario["kind"];
  checks: Check[];
  mode: "live" | "stub";
  latencyMs: number;
  tokens?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_creation?: number;
  };
  leadLine: string;
  output: unknown;
};

function findScenarios(only?: string): Scenario[] {
  if (!only) return scenarios;
  const hit = scenarios.find((s) => s.id === only);
  if (!hit) throw new Error(`No scenario with id: ${only}`);
  return [hit];
}

async function runOne(s: Scenario): Promise<Result> {
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
        `Invoke the \`pick_decision\` tool. Name the opportunity cost explicitly.`,
      ]
        .filter(Boolean)
        .join("\n");

      const r = await runStructured({
        toolName: "pick_decision",
        toolDescription:
          "Emit a structured pick recommendation for the current slot.",
        inputJsonSchema: pickOutputJsonSchema as unknown as Record<string, unknown>,
        outputSchema: pickOutputSchema,
        userMessage: msg,
        model: "sonnet",
        maxTokens: 1200,
      });
      const allowed = buildAllowedNames(s.context, s.available_players);
      const grounding = noUnnamedPlayerDrift(
        [
          r.output.recommendation,
          ...r.output.reasoning,
          r.output.opportunity_cost,
          r.output.leverage_note ?? "",
          r.output.drift_note ?? "",
          r.output.alternative?.path ?? "",
          r.output.alternative?.when_to_choose ?? "",
        ],
        allowed,
      );
      return {
        id: s.id,
        label: s.label,
        kind: s.kind,
        checks: [...evalPick(r.output), grounding],
        mode: r.mode,
        latencyMs: r.latencyMs,
        tokens: r.tokens,
        leadLine: r.output.recommendation,
        output: r.output,
      };
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
        `Invoke the \`trade_incoming_decision\` tool. Walk-away floor required.`,
      ]
        .filter(Boolean)
        .join("\n");
      const r = await runStructured({
        toolName: "trade_incoming_decision",
        toolDescription:
          "Emit a structured decision for an incoming trade offer.",
        inputJsonSchema: tradeIncomingOutputJsonSchema as unknown as Record<
          string,
          unknown
        >,
        outputSchema: tradeIncomingOutputSchema,
        userMessage: msg,
        model: "sonnet",
        maxTokens: 1500,
      });
      const allowed = buildAllowedNames(s.context, [
        ...s.you_send,
        ...s.you_receive,
        s.other_manager ?? "",
      ]);
      const grounding = noUnnamedPlayerDrift(
        [
          r.output.recommendation,
          ...r.output.reasoning,
          r.output.opportunity_cost,
          r.output.opponent_read,
          r.output.stronger_ask ?? "",
          r.output.walk_away_floor,
          r.output.negotiation_message ?? "",
        ],
        allowed,
      );
      return {
        id: s.id,
        label: s.label,
        kind: s.kind,
        checks: [...evalTradeIncoming(r.output), grounding],
        mode: r.mode,
        latencyMs: r.latencyMs,
        tokens: r.tokens,
        leadLine: r.output.recommendation,
        output: r.output,
      };
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
        `Invoke the \`trade_outbound_decision\` tool. 2-3 tiered packages, opener, walk-away floor.`,
      ]
        .filter(Boolean)
        .join("\n");
      const r = await runStructured({
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
      });
      const allowed = buildAllowedNames(s.context, [
        s.target.name,
        ...(s.willingToMove ?? []),
      ]);
      const grounding = noUnnamedPlayerDrift(
        [
          r.output.attack_angle,
          r.output.opponent_read,
          r.output.opener_message,
          r.output.walk_away_floor,
          r.output.opportunity_cost,
          ...r.output.packages.flatMap((p) => [
            ...p.you_send,
            ...p.you_receive,
            p.rationale,
          ]),
        ],
        allowed,
      );
      return {
        id: s.id,
        label: s.label,
        kind: s.kind,
        checks: [...evalTradeOutbound(r.output), grounding],
        mode: r.mode,
        latencyMs: r.latencyMs,
        tokens: r.tokens,
        leadLine: r.output.attack_angle,
        output: r.output,
      };
    }
    case "strategy": {
      const msg = [
        `# Decision: Strategy clarify`,
        `What am I actually building? Which strategies are open or closed?`,
        ``,
        `## Context`,
        renderContextForPrompt(s.context),
        ``,
        `Invoke the \`strategy_clarify\` tool. Be decisive about closed paths.`,
      ].join("\n");
      const r = await runStructured({
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
      });
      return {
        id: s.id,
        label: s.label,
        kind: s.kind,
        checks: evalStrategy(r.output),
        mode: r.mode,
        latencyMs: r.latencyMs,
        tokens: r.tokens,
        leadLine: `${r.output.state} (${Math.round(r.output.confidence * 100)}%)`,
        output: r.output,
      };
    }
  }
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const toRun = findScenarios(only);

  console.log(`\nDynasty General: scenario eval`);
  console.log(`Running ${toRun.length} scenario(s)\n`);

  const results: Result[] = [];
  for (const s of toRun) {
    process.stdout.write(`[${s.id}] `);
    try {
      const r = await runOne(s);
      results.push(r);
      const sum = summarize(r.checks);
      const tag = sum.failed.length === 0 ? "✓" : "✗";
      const cache = r.tokens?.cache_read
        ? ` cache ${r.tokens.cache_read}`
        : "";
      console.log(
        `${tag} ${sum.passed}/${sum.total}  ${r.mode}  ${r.latencyMs}ms` +
          (r.tokens ? ` ${r.tokens.input}→${r.tokens.output}${cache}` : ""),
      );
      console.log(`    ↳ ${r.leadLine.slice(0, 160)}`);
      for (const f of sum.failed) {
        console.log(`    ✗ ${f.name}${f.reason ? `: ${f.reason}` : ""}`);
      }
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log();
  }

  const total = results.reduce((n, r) => n + r.checks.length, 0);
  const passed = results.reduce(
    (n, r) => n + r.checks.filter((c) => c.pass).length,
    0,
  );
  console.log(`\n── Summary ──`);
  console.log(
    `${passed}/${total} checks passed across ${results.length} scenarios`,
  );
  const failed = results.filter((r) =>
    r.checks.some((c) => !c.pass),
  ).length;
  console.log(`${failed} scenarios had at least one failing check`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
