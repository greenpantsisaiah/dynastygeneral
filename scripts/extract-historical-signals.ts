/**
 * Historical signal extractor batch driver. Per VALIDATION_PLAN
 * section 4 (temporal blinding) and DATA_ACQUISITION_PLAN section 5:
 * the signals our model uses (RB role tier, scheme tag, HC background,
 * compounding-news count, etc.) didn't exist as machine-readable data
 * in 2022-2024. The founder can't hand-code three historical seasons
 * solo. So this script invokes the historical-signal-extractor agent
 * (spec at .claude/agents/historical-signal-extractor.md) via the
 * Anthropic API with web_search enabled, with strict vintage
 * blinding, and writes results to historical_signal_codes.
 *
 * Smoke-tested 2026-05-05 on Najee Harris 2022: 4/4 signals coded
 * correctly with vintage discipline holding. Three prompt
 * improvements applied to the spec; full batch run hasn't happened
 * yet.
 *
 * Run:
 *   # Dry-run (default; lists targets, calls no API):
 *   npx tsx --tsconfig tsconfig.json scripts/extract-historical-signals.ts \
 *     --year 2022 --limit 5
 *
 *   # Execute (uses ANTHROPIC_API_KEY, COSTS MONEY):
 *   npx tsx --tsconfig tsconfig.json scripts/extract-historical-signals.ts \
 *     --year 2022 --limit 5 --execute
 *
 * Cost estimate per extraction: ~$0.17 (Sonnet 4.6 input/output +
 * 5-10 web search calls at $10/1000). 200 RBs * 3 seasons = ~$100
 * for the full batch. Always start with --limit 5 and review results
 * before scaling up.
 *
 * Idempotency: writes are skipped when historical_signal_codes
 * already has a row for (player_id, prediction_year, signal_name).
 * Re-runs only fill gaps.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolvePlayers } from "../src/lib/players/cache";

const RB_SIGNALS = [
  "rb_role_tier",
  "rb_traded_offseason_flag",
  "rb_role_at_new_team_projected",
  "compounding_news_count",
] as const;
type RbSignalName = (typeof RB_SIGNALS)[number];

const codedSignalSchema = z.object({
  value: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .describe("Coded value, or null if confidence too low"),
  confidence: z.enum(["high", "medium", "low"]),
  source_urls: z.array(z.string()).default([]),
  source_paragraphs: z.array(z.string()).default([]),
  coding_rationale: z.string(),
});

const extractionResponseSchema = z.object({
  rb_role_tier: codedSignalSchema,
  rb_traded_offseason_flag: codedSignalSchema,
  rb_role_at_new_team_projected: codedSignalSchema,
  compounding_news_count: codedSignalSchema,
  extraction_metadata: z
    .object({
      prediction_year_cutoff: z.string().optional(),
      sources_reviewed: z.number().optional(),
      sources_excluded_post_cutoff: z.number().optional(),
      sources_used: z.number().optional(),
    })
    .optional(),
});

function parseArgs(argv: readonly string[]): {
  year: number;
  limit: number;
  execute: boolean;
  positionRankMax: number;
} {
  const args = new Map<string, string>();
  let execute = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") execute = true;
    else if (a.startsWith("--") && i + 1 < argv.length) {
      args.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  return {
    year: Number(args.get("year") ?? "2022"),
    limit: Number(args.get("limit") ?? "5"),
    execute,
    positionRankMax: Number(args.get("position-rank-max") ?? "64"),
  };
}

const PRE_DRAFT_CUTOFF: Record<number, string> = {
  2022: "2022-08-15",
  2023: "2023-08-15",
  2024: "2024-08-15",
};

type Target = {
  player_id: string;
  player_name: string;
  position: string;
  position_rank: number;
};

async function pickTargets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supa: any,
  year: number,
  positionRankMax: number,
  limit: number,
): Promise<Target[]> {
  // Use the KTC snapshot closest to the year's pre-draft cutoff to
  // pick the top-N RBs at that point in time. Vintage-aligned: we're
  // coding for what we'd predict at draft date, so the universe is
  // top-N as of that date.
  const cutoff = PRE_DRAFT_CUTOFF[year];
  if (!cutoff) throw new Error(`No pre-draft cutoff configured for ${year}`);

  // Find the snapshot date within 60 days BEFORE cutoff with the most
  // SF rows. Bias toward dates closest to cutoff but accept earlier
  // ones if they have more coverage.
  const { data: snapshots } = await supa
    .from("historical_market_values")
    .select("snapshot_date")
    .eq("source", "ktc")
    .eq("format", "sf")
    .gte("snapshot_date", `${year}-06-01`)
    .lte("snapshot_date", cutoff)
    .order("snapshot_date", { ascending: false })
    .limit(50000);
  const dateCounts = new Map<string, number>();
  for (const r of snapshots ?? []) {
    const d = (r as { snapshot_date: string }).snapshot_date;
    dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1);
  }
  let bestDate: string | null = null;
  let bestCount = 0;
  for (const [d, c] of dateCounts.entries()) {
    if (c > bestCount) {
      bestDate = d;
      bestCount = c;
    }
  }

  // Fallback: if KTC has no summer-preseason snapshot for the year
  // (e.g., 2023 where Wayback didn't preserve summer captures), pick
  // the universe from FP ECR historical_consensus_rankings for the
  // same year. The signal codes are vintage-bound to the prediction
  // year via the agent prompt's PRE-DRAFT CUTOFF; universe-selection
  // source is just a convenience.
  let topRBs: Array<{
    player_id: string;
    position: string;
    position_rank: number;
    overall_rank: number | null;
  }> = [];

  if (bestDate) {
    console.log(
      `[extract] using KTC snapshot ${bestDate} (${bestCount} rows) for ${year} top-N`,
    );
    const topRBsRes = await supa
      .from("historical_market_values")
      .select("player_id, position, position_rank, overall_rank")
      .eq("source", "ktc")
      .eq("format", "sf")
      .eq("snapshot_date", bestDate)
      .eq("position", "RB")
      .lte("position_rank", positionRankMax)
      .order("position_rank", { ascending: true })
      .limit(limit);
    topRBs = (topRBsRes.data ?? []) as typeof topRBs;
  } else {
    console.log(
      `[extract] no KTC summer snapshot for ${year}; falling back to FP ECR for universe selection`,
    );
    const fpRes = await supa
      .from("historical_consensus_rankings")
      .select("player_id, position, position_rank, rank")
      .eq("source", "fantasypros_ecr")
      .eq("format", "sf")
      .eq("snapshot_date", cutoff)
      .eq("position", "RB")
      .lte("position_rank", positionRankMax)
      .order("position_rank", { ascending: true })
      .limit(limit);
    const rows = (fpRes.data ?? []) as Array<{
      player_id: string;
      position: string;
      position_rank: number;
      rank: number;
    }>;
    if (rows.length === 0) {
      throw new Error(
        `No KTC or FP ECR universe found for ${year} (looked at ${cutoff})`,
      );
    }
    topRBs = rows.map((r) => ({
      player_id: r.player_id,
      position: r.position,
      position_rank: r.position_rank,
      overall_rank: r.rank,
    }));
  }

  const ids = topRBs.map((r) => r.player_id);
  const playerMap = await resolvePlayers(ids);
  const targets: Target[] = [];
  for (const r of topRBs) {
    const p = playerMap.get(r.player_id);
    if (!p) continue;
    const fullName =
      `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
      p.full_name ||
      r.player_id;
    targets.push({
      player_id: r.player_id,
      player_name: fullName,
      position: r.position,
      position_rank: r.position_rank,
    });
  }
  return targets;
}

async function alreadyCoded(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supa: any,
  player_id: string,
  year: number,
  signal_name: string,
): Promise<boolean> {
  const { count } = await supa
    .from("historical_signal_codes")
    .select("*", { count: "exact", head: true })
    .eq("player_id", player_id)
    .eq("prediction_year", year)
    .eq("signal_name", signal_name);
  return (count ?? 0) > 0;
}

function loadAgentSpec(): string {
  // Project root is two levels up from web/scripts/.
  const path = resolve(
    process.cwd(),
    "..",
    ".claude",
    "agents",
    "historical-signal-extractor.md",
  );
  return readFileSync(path, "utf8");
}

async function extractOne(
  client: Anthropic,
  agentSpec: string,
  target: Target,
  year: number,
): Promise<z.infer<typeof extractionResponseSchema> | null> {
  const cutoff = PRE_DRAFT_CUTOFF[year];
  const userMessage = `TARGET: player=${target.player_name} (player_id=${target.player_id})
PREDICTION_YEAR: ${year}
PRE-DRAFT CUTOFF: ${cutoff}
SIGNALS_REQUESTED: ${RB_SIGNALS.join(", ")}

Use web_search to find dated primary sources from ${year} that pre-date ${cutoff}. Then call the emit_signal_codes tool with the structured output.

Critical: do NOT use any source dated after ${cutoff}. Cite source URLs WITH publication dates.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: agentSpec,
    tools: [
      // Anthropic web search tool (server-side execution)
      // Tool spec ref: docs.anthropic.com/.../web-search-tool
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { type: "web_search_20250305", name: "web_search", max_uses: 8 } as any,
      {
        name: "emit_signal_codes",
        description:
          "Emit the coded signal values for the target. One field per requested signal, each with value/confidence/source_urls/source_paragraphs/coding_rationale.",
        input_schema: {
          type: "object",
          properties: {
            rb_role_tier: { type: "object" },
            rb_traded_offseason_flag: { type: "object" },
            rb_role_at_new_team_projected: { type: "object" },
            compounding_news_count: { type: "object" },
            extraction_metadata: { type: "object" },
          },
          required: [...RB_SIGNALS],
        },
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: userMessage }],
  });

  // The model may iterate web_search calls before emitting. We loop
  // until we see emit_signal_codes or hit a stop.
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];
  let lastResponse = response;
  for (let iter = 0; iter < 12; iter++) {
    const toolUses = lastResponse.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const emitCall = toolUses.find((t) => t.name === "emit_signal_codes");
    if (emitCall) {
      const parsed = extractionResponseSchema.safeParse(emitCall.input);
      return parsed.success ? parsed.data : null;
    }
    if (lastResponse.stop_reason === "end_turn") return null;
    // Append assistant response and let API auto-execute web_search
    // (server-side tool). For server-side tools we don't need to
    // submit tool_results manually; the API loops internally and we
    // get the final assistant turn after web search resolves.
    if (lastResponse.stop_reason !== "tool_use") return null;

    messages.push({ role: "assistant", content: lastResponse.content });
    // For server-side web_search there's nothing to inject; advance
    // by sending the same message stack and asking to continue.
    lastResponse = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: agentSpec,
      tools: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { type: "web_search_20250305", name: "web_search", max_uses: 8 } as any,
        {
          name: "emit_signal_codes",
          description: "Emit coded signals.",
          input_schema: {
            type: "object",
            properties: {
              rb_role_tier: { type: "object" },
              rb_traded_offseason_flag: { type: "object" },
              rb_role_at_new_team_projected: { type: "object" },
              compounding_news_count: { type: "object" },
              extraction_metadata: { type: "object" },
            },
            required: [...RB_SIGNALS],
          },
        },
      ],
      tool_choice: { type: "auto" },
      messages,
    });
  }
  return null;
}

async function writeRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supa: any,
  target: Target,
  year: number,
  data: z.infer<typeof extractionResponseSchema>,
): Promise<void> {
  const cutoff = PRE_DRAFT_CUTOFF[year];
  const rows: Array<{
    player_id: string;
    prediction_year: number;
    signal_name: string;
    signal_value: unknown;
    confidence: string;
    coded_with_knowledge_through: string;
    source_urls: string[];
    source_paragraphs: string[];
    rationale: string;
    coded_by: string;
  }> = [];
  for (const sigName of RB_SIGNALS) {
    const sig = data[sigName];
    rows.push({
      player_id: target.player_id,
      prediction_year: year,
      signal_name: sigName,
      signal_value: { value: sig.value },
      confidence: sig.confidence,
      coded_with_knowledge_through: cutoff,
      source_urls: sig.source_urls ?? [],
      source_paragraphs: sig.source_paragraphs ?? [],
      rationale: sig.coding_rationale,
      coded_by: "agent:historical-signal-extractor:v1",
    });
  }
  // Cast around generated-types: 0010_validation.sql tables are not yet
  // in the Supabase typegen output, so the typed client treats inserts
  // as `never`. Same workaround used by the KTC ingest script.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supa as any)
    .from("historical_signal_codes")
    .insert(rows);
  if (error) {
    console.error(
      `[extract] insert error for ${target.player_name} ${year}:`,
      error.message,
    );
  }
}

async function main(): Promise<void> {
  const { year, limit, execute, positionRankMax } = parseArgs(
    process.argv.slice(2),
  );
  const mode = execute ? "EXECUTE" : "dry-run";
  console.log(
    `[extract] year=${year} limit=${limit} position_rank_max=${positionRankMax} mode=${mode}`,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase env vars");
  }
  const supa = createClient(supabaseUrl, serviceKey);

  const targets = await pickTargets(supa, year, positionRankMax, limit);
  console.log(`[extract] picked ${targets.length} targets:`);
  for (const t of targets) {
    console.log(`  RB${t.position_rank} ${t.player_name} (${t.player_id})`);
  }

  if (!execute) {
    console.log(
      `[extract] dry-run complete. Re-run with --execute to call the API.`,
    );
    console.log(
      `[extract] estimated cost: ~$${(targets.length * 0.17).toFixed(2)} (Sonnet 4.6 + web search at ~$0.17/extraction)`,
    );
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing for --execute");
  const client = new Anthropic({ apiKey });
  const agentSpec = loadAgentSpec();

  let extracted = 0;
  let skipped = 0;
  let failed = 0;
  for (const t of targets) {
    // Idempotency: skip if any signal already coded for this (player, year).
    if (await alreadyCoded(supa, t.player_id, year, "rb_role_tier")) {
      console.log(
        `[extract] SKIP ${t.player_name} ${year} (already coded)`,
      );
      skipped++;
      continue;
    }
    console.log(`[extract] coding ${t.player_name} ${year}...`);
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let success = false;
    while (attempts < MAX_ATTEMPTS && !success) {
      attempts++;
      try {
        const data = await extractOne(client, agentSpec, t, year);
        if (!data) {
          console.warn(`[extract] no valid output for ${t.player_name}`);
          failed++;
          break;
        }
        await writeRows(supa, t, year, data);
        extracted++;
        console.log(
          `[extract] done ${t.player_name}: role=${JSON.stringify(data.rb_role_tier.value)} traded=${data.rb_traded_offseason_flag.value} compNews=${data.compounding_news_count.value}`,
        );
        success = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit =
          msg.includes("rate_limit") || msg.includes("429");
        if (isRateLimit && attempts < MAX_ATTEMPTS) {
          const sleepSec = 60 * attempts;
          console.warn(
            `[extract] rate limit on ${t.player_name} (attempt ${attempts}); sleeping ${sleepSec}s and retrying...`,
          );
          await new Promise((r) => setTimeout(r, sleepSec * 1000));
        } else {
          console.error(
            `[extract] error on ${t.player_name} (attempt ${attempts}):`,
            msg.slice(0, 300),
          );
          if (attempts >= MAX_ATTEMPTS) {
            failed++;
          }
        }
      }
    }
  }

  console.log(
    `[extract] DONE. extracted=${extracted} skipped=${skipped} failed=${failed}`,
  );
}

main().catch((err) => {
  console.error("[extract] fatal:", err);
  process.exit(1);
});
