/**
 * Phase B historical signal corpus (MODEL_LIVE_PLAN, sig-history): extract
 * the per-team coaching + scheme signals for PAST NFL seasons (2021-2024),
 * one row per (team, season), so the WR/QB/TE rubric backtests can join
 * the scheme fields they read.
 *
 * This is the per-season twin of extract-team-coaching-scheme.ts (which
 * codes the single current 2026 snapshot). The B#1 lesson baked in: a
 * current-season snapshot cannot validate a historical backtest. Each
 * season is coded AS OF THE START of that season, so the codings reflect
 * state known at preseason of the decision year (the temporal-blinding
 * requirement, VALIDATION_PLAN.md section 4).
 *
 * The 9 manual columns per (team, season), same enums as the 2026 script:
 *   - scheme_tag, oc_id, oc_tenure_yrs, oc_first_year_with_team_flag,
 *     hc_id, hc_first_time_flag, hc_tenure_yrs, hc_background_tag,
 *     staff_novelty_composite
 *
 * The derived game-script columns (pass_rate_neutral, scheme_pace,
 * personnel_12_rate) are NOT coded here; they come from
 * derive-team-metrics.ts run per season, and ingest-team-signals-history.ts
 * merges them in (using the PRIOR season's rates as the preseason-known
 * proxy; see that script's header).
 *
 * Source discipline (unchanged from the 2026 script): Claude Sonnet 4.6 +
 * web_search, dated primary sources, founder reviews the JSON before any
 * DB write.
 *
 *   # Dry-run (default; lists targets, calls no API):
 *   npx tsx --tsconfig tsconfig.json scripts/extract-team-coaching-scheme-history.ts
 *
 *   # Execute one season subset first (recommended smoke test):
 *   npx tsx --tsconfig tsconfig.json scripts/extract-team-coaching-scheme-history.ts \
 *     --execute --seasons 2024 --teams BUF,KC,SF \
 *     --out data/team-coaching-scheme-history.json
 *
 *   # Full historical batch (2021-2024, all 32 teams):
 *   npx tsx --tsconfig tsconfig.json scripts/extract-team-coaching-scheme-history.ts \
 *     --execute --seasons 2021,2022,2023,2024 \
 *     --out data/team-coaching-scheme-history.json
 *
 * Idempotency: writes are incremental per (team, season). If --out already
 * contains a row for a (team, season), it is skipped. Delete a row to force
 * re-extraction.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
loadEnv({ path: resolve(process.cwd(), ".env.local") });

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  HC_BACKGROUND_TAGS,
  NFL_TEAMS,
  SCHEME_TAGS,
  type NflTeam,
} from "../src/lib/signals/schema";

const DEFAULT_SEASONS = [2021, 2022, 2023, 2024];
const MODEL = "claude-sonnet-4-6";
const MAX_WEB_SEARCH_USES = 10;
const MAX_TOKENS = 4500;
const MAX_TURNS = 16;

const TEAM_FULL_NAMES: Record<NflTeam, string> = {
  ARI: "Arizona Cardinals",
  ATL: "Atlanta Falcons",
  BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills",
  CAR: "Carolina Panthers",
  CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  DAL: "Dallas Cowboys",
  DEN: "Denver Broncos",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs",
  LAC: "Los Angeles Chargers",
  LAR: "Los Angeles Rams",
  LV: "Las Vegas Raiders",
  MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings",
  NE: "New England Patriots",
  NO: "New Orleans Saints",
  NYG: "New York Giants",
  NYJ: "New York Jets",
  PHI: "Philadelphia Eagles",
  PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks",
  SF: "San Francisco 49ers",
  TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans",
  WAS: "Washington Commanders",
};

const codedField = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.enum(["high", "medium", "low"]),
  rationale: z.string().min(1),
});

const teamRowSchema = z.object({
  scheme_tag: codedField,
  hc_id: codedField,
  hc_first_time_flag: codedField,
  hc_tenure_yrs: codedField,
  hc_background_tag: codedField,
  oc_id: codedField,
  oc_tenure_yrs: codedField,
  oc_first_year_with_team_flag: codedField,
  staff_novelty_composite: codedField,
  source_urls: z.array(z.string()).default([]),
  source_paragraphs: z.array(z.string()).default([]),
  extraction_notes: z.string().optional(),
});
type TeamRowExtraction = z.infer<typeof teamRowSchema>;

type ExtractedRow = { extracted_at: string; season: number } & TeamRowExtraction;

type OutputDoc = {
  schema: "team-coaching-scheme-history-v1";
  seasons: number[];
  generated_at: string;
  model: string;
  // keyed "TEAM:SEASON" (e.g. "BUF:2023")
  rows: Record<string, ExtractedRow>;
};

function rowKey(team: NflTeam, season: number): string {
  return `${team}:${season}`;
}

function parseArgs(argv: readonly string[]): {
  execute: boolean;
  outPath: string;
  teams: NflTeam[] | null;
  seasons: number[];
  force: boolean;
} {
  const args = new Map<string, string>();
  let execute = false;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") execute = true;
    else if (a === "--force") force = true;
    else if (a.startsWith("--") && i + 1 < argv.length) {
      args.set(a.slice(2), argv[i + 1]);
      i++;
    }
  }
  const outPath = args.get("out") ?? "data/team-coaching-scheme-history.json";
  let teams: NflTeam[] | null = null;
  const teamsArg = args.get("teams");
  if (teamsArg) {
    teams = teamsArg.split(",").map((t) => t.trim().toUpperCase() as NflTeam);
    for (const t of teams) {
      if (!(NFL_TEAMS as readonly string[]).includes(t)) {
        throw new Error(`Unknown team code: ${t}`);
      }
    }
  }
  let seasons = DEFAULT_SEASONS;
  const seasonsArg = args.get("seasons");
  if (seasonsArg) {
    seasons = seasonsArg.split(",").map((s) => {
      const n = Number(s.trim());
      if (!Number.isInteger(n) || n < 2000 || n > 2100)
        throw new Error(`Invalid season: ${s}`);
      return n;
    });
  }
  return { execute, outPath, teams, seasons, force };
}

function loadExisting(outPath: string, seasons: number[]): OutputDoc {
  if (existsSync(outPath)) {
    try {
      const parsed = JSON.parse(readFileSync(outPath, "utf8")) as OutputDoc;
      if (parsed.rows && typeof parsed.rows === "object") return parsed;
    } catch (err) {
      console.warn(
        `[extract-history] could not parse existing ${outPath}: ${err instanceof Error ? err.message : String(err)}; starting fresh`,
      );
    }
  }
  return {
    schema: "team-coaching-scheme-history-v1",
    seasons,
    generated_at: new Date().toISOString(),
    model: MODEL,
    rows: {},
  };
}

function persist(outPath: string, doc: OutputDoc): void {
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

function systemPrompt(season: number): string {
  return `You are coding the ${season} NFL season coaching + scheme signals for ONE NFL team at a time. Each team gets ONE row of structured data for the ${season} season into our team_signals_history table.

CRITICAL: code the staff and scheme AS THEY WERE AT THE START OF THE ${season} SEASON (i.e., entering Week 1 of ${season}). Do NOT use later-season firings or interim replacements; use who held the role entering ${season}. This is a HISTORICAL coding for a temporal-blinded backtest, so do not let knowledge of how the ${season} season turned out change the preseason codings.

Use web_search to find PRIMARY DATED SOURCES from Pro-Football-Reference coordinator history, ESPN, NFL.com, The Athletic, or major beat writers, dated to the ${season} offseason / preseason (roughly January-September ${season}). Pro-Football-Reference team-season pages list the HC and coordinators for that exact year and are the most reliable.

Coding rules:

1. scheme_tag enum (pick ONE; "other" only when truly atypical):
   - "shanahan": Kyle Shanahan / Sean McVay / Mike McDaniel coaching tree, outside-zone wide-zone heavy, play-action off boot
   - "mcvay": specifically the McVay branch (12-personnel heavy, condensed splits, motion-heavy)
   - "reid": Andy Reid west-coast + Chiefs tree (Eric Bieniemy, Matt Nagy, Doug Pederson coordinators)
   - "air_raid": Mike Leach / Lincoln Riley / Kingsbury tree, spread shotgun pass-first
   - "spread": general spread shotgun, RPO-heavy (Sean Payton lineage when not pure WC)
   - "pro_style": traditional pro-style under-center, balanced run/pass
   - "west_coast": Bill Walsh tree, short-pass heavy, horizontal passing game
   - "erhardt_perkins": Belichick tree, run-first power, no-name-the-route concept system
   - "other": only when no tree clearly applies

2. hc_id / oc_id: lowercase-kebab full name. "Sean McVay" -> "sean-mcvay". If a team had co-OCs or "OC by committee" (HC calls plays with no named OC) entering ${season}, use the HC's slug for oc_id and note in extraction_notes.

3. hc_tenure_yrs / oc_tenure_yrs: integer, AS OF ${season}. The ${season} season counts as YEAR 1 if hired in the ${season} offseason (Jan-Aug ${season}); YEAR 2 if hired before the ${season - 1} season; YEAR 3 if hired before the ${season - 2} season; etc. Do not count interim partial seasons.

4. oc_first_year_with_team_flag: true if the OC was in YEAR 1 with THIS team entering ${season} (regardless of prior OC experience elsewhere). Otherwise false.

5. hc_first_time_flag: true if ${season} was the HC's first time as an NFL head coach EVER as of that season (interim HC stints don't count). Otherwise false.

6. hc_background_tag enum (pick ONE; what the HC did IMMEDIATELY before becoming this team's HC, with first-time-HC preference, or most relevant prior role for retreads):
   - "offensive_coordinator": was an NFL OC immediately before
   - "defensive_coordinator": was an NFL DC immediately before
   - "college": was a college HC or coordinator immediately before
   - "position_coach": was a position coach (e.g., QBs coach) immediately before
   - "other": prior NFL HC seat, broadcasting, retirement gap, etc.

7. staff_novelty_composite: integer 0-3, count of {new HC, new OC, new GM} for the ${season} offseason, where "new" means hired between January ${season} and the start of the ${season} season. Do NOT count promotions of internal coaches who held the same title the prior season.

For each field, supply value + confidence + a one-sentence rationale grounded in your sources. If a field is genuinely uncertain (e.g., "OC by committee" with no clear lead), set value to null and confidence to "low" and explain.

Aggregate source_urls (URLs you actually used, with dates if possible) and source_paragraphs (short verbatim snippets that justify the codings, max 4) at the row level.

When you have enough to code with high confidence, call the emit_team_row tool ONCE with the structured output.`;
}

const EMIT_TOOL = {
  name: "emit_team_row",
  description:
    "Emit the structured 9-field row for the target NFL team and season. Call this once with the full row.",
  input_schema: {
    type: "object",
    properties: {
      scheme_tag: { type: "object" },
      hc_id: { type: "object" },
      hc_first_time_flag: { type: "object" },
      hc_tenure_yrs: { type: "object" },
      hc_background_tag: { type: "object" },
      oc_id: { type: "object" },
      oc_tenure_yrs: { type: "object" },
      oc_first_year_with_team_flag: { type: "object" },
      staff_novelty_composite: { type: "object" },
      source_urls: { type: "array" },
      source_paragraphs: { type: "array" },
      extraction_notes: { type: "string" },
    },
    required: [
      "scheme_tag",
      "hc_id",
      "hc_first_time_flag",
      "hc_tenure_yrs",
      "hc_background_tag",
      "oc_id",
      "oc_tenure_yrs",
      "oc_first_year_with_team_flag",
      "staff_novelty_composite",
      "source_urls",
    ],
  },
} as const;

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: MAX_WEB_SEARCH_USES,
} as const;

async function extractOneTeamSeason(
  client: Anthropic,
  team: NflTeam,
  season: number,
): Promise<TeamRowExtraction | null> {
  const userMessage = `TEAM: ${team} (${TEAM_FULL_NAMES[team]})
SEASON: ${season} NFL season (code the staff entering Week 1 of ${season})

Search Pro-Football-Reference's ${team} ${season} team page and the ${season} offseason coordinator-hire news to find the ${season} head coach, offensive coordinator, GM, scheme identity, and any ${season}-offseason staff changes. Then call emit_team_row with the 9 fields plus your sources.

Allowed scheme_tag values: ${SCHEME_TAGS.join(", ")}.
Allowed hc_background_tag values: ${HC_BACKGROUND_TAGS.join(", ")}.

Get high-confidence on every field if possible. If a field is genuinely unknowable from sources you actually read, null + low confidence is OK and preferable to a guess.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];
  const system = systemPrompt(season);

  let lastResponse = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [WEB_SEARCH_TOOL as any, EMIT_TOOL],
    tool_choice: { type: "auto" },
    messages,
  });

  for (let iter = 0; iter < MAX_TURNS; iter++) {
    const toolUses = lastResponse.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const emitCall = toolUses.find((t) => t.name === "emit_team_row");
    if (emitCall) {
      const parsed = teamRowSchema.safeParse(emitCall.input);
      if (!parsed.success) {
        console.warn(
          `[extract-history] ${team}:${season}: emit_team_row failed zod parse: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400)}`,
        );
        return null;
      }
      return parsed.data;
    }
    if (lastResponse.stop_reason === "end_turn") return null;
    if (lastResponse.stop_reason !== "tool_use") return null;

    messages.push({ role: "assistant", content: lastResponse.content });
    lastResponse = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [WEB_SEARCH_TOOL as any, EMIT_TOOL],
      tool_choice: { type: "auto" },
      messages,
    });
  }
  return null;
}

async function main(): Promise<void> {
  const { execute, outPath, teams, seasons, force } = parseArgs(
    process.argv.slice(2),
  );
  const targetTeams: NflTeam[] = teams ?? [...NFL_TEAMS];
  const pairs: { team: NflTeam; season: number }[] = [];
  for (const season of seasons)
    for (const team of targetTeams) pairs.push({ team, season });

  console.log(
    `[extract-history] seasons=${seasons.join(",")} teams=${targetTeams.length} pairs=${pairs.length} mode=${execute ? "EXECUTE" : "dry-run"} out=${outPath}`,
  );

  const doc = loadExisting(outPath, seasons);
  doc.seasons = seasons;
  doc.generated_at = new Date().toISOString();
  doc.model = MODEL;

  const remaining = pairs.filter(
    (p) => force || !doc.rows[rowKey(p.team, p.season)],
  );
  const already = pairs.length - remaining.length;
  console.log(
    `[extract-history] already coded: ${already} / ${pairs.length}; remaining: ${remaining.length}`,
  );

  if (!execute) {
    const bySeason = new Map<number, NflTeam[]>();
    for (const p of remaining) {
      const arr = bySeason.get(p.season) ?? [];
      arr.push(p.team);
      bySeason.set(p.season, arr);
    }
    console.log(`[extract-history] dry-run; pairs that would be coded:`);
    for (const [season, arr] of [...bySeason.entries()].sort((a, b) => a[0] - b[0]))
      console.log(`  ${season}: ${arr.join(", ") || "(none)"}`);
    console.log(
      `[extract-history] estimated cost on --execute: ~$${(remaining.length * 0.2).toFixed(2)} (Sonnet 4.6 + web_search @ ~$0.20/team-season)`,
    );
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing for --execute");
  const client = new Anthropic({ apiKey });

  let coded = 0;
  let failed = 0;
  for (const { team, season } of remaining) {
    console.log(
      `[extract-history] coding ${team} ${season} (${TEAM_FULL_NAMES[team]})...`,
    );
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let success = false;
    while (attempts < MAX_ATTEMPTS && !success) {
      attempts++;
      try {
        const row = await extractOneTeamSeason(client, team, season);
        if (!row) {
          console.warn(
            `[extract-history] ${team}:${season}: no valid emit_team_row (attempt ${attempts})`,
          );
          if (attempts >= MAX_ATTEMPTS) failed++;
          continue;
        }
        doc.rows[rowKey(team, season)] = {
          extracted_at: new Date().toISOString(),
          season,
          ...row,
        };
        persist(outPath, doc);
        coded++;
        console.log(
          `[extract-history] ${team}:${season} done: scheme=${row.scheme_tag.value} hc=${row.hc_id.value} oc=${row.oc_id.value} novelty=${row.staff_novelty_composite.value}`,
        );
        success = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit = msg.includes("rate_limit") || msg.includes("429");
        if (isRateLimit && attempts < MAX_ATTEMPTS) {
          const sleepSec = 30 * attempts;
          console.warn(
            `[extract-history] rate limit on ${team}:${season} (attempt ${attempts}); sleeping ${sleepSec}s...`,
          );
          await new Promise((r) => setTimeout(r, sleepSec * 1000));
        } else {
          console.error(
            `[extract-history] error on ${team}:${season} (attempt ${attempts}): ${msg.slice(0, 300)}`,
          );
          if (attempts >= MAX_ATTEMPTS) failed++;
        }
      }
    }
  }

  console.log(
    `[extract-history] DONE. coded=${coded} failed=${failed} skipped=${already} out=${outPath}`,
  );
}

main().catch((err) => {
  console.error("[extract-history] fatal:", err);
  process.exit(1);
});
