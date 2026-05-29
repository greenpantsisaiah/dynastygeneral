/**
 * Phase B #1 (MODEL_LIVE_PLAN, sig-scheme32): extract the 32-row team
 * coaching + scheme manual table for the current (2026) NFL season.
 *
 * The 9 manual columns this script codes:
 *   - scheme_tag (enum: shanahan / mcvay / reid / air_raid / spread /
 *     pro_style / west_coast / erhardt_perkins / other)
 *   - oc_id (text; lowercase-kebab name slug)
 *   - oc_tenure_yrs (int; current 2026 season counts as year 1 if hired
 *     this offseason, year 2 if hired before the 2025 season, etc.)
 *   - oc_first_year_with_team_flag (boolean; true if 2026 is the OC's
 *     first season with this team)
 *   - hc_id (text; lowercase-kebab name slug)
 *   - hc_first_time_flag (boolean; true if this is the HC's first time
 *     as an NFL HC ever)
 *   - hc_tenure_yrs (int; current 2026 season counts as year 1 if hired
 *     this offseason, etc.)
 *   - hc_background_tag (enum: offensive_coordinator /
 *     defensive_coordinator / college / position_coach / other; what
 *     the HC was doing immediately before they became this team's HC,
 *     or the highest-relevance prior role if hired off another HC seat)
 *   - staff_novelty_composite (0-3: count of {new HC, new OC, new GM}
 *     this offseason; integer)
 *
 * The other team_signals columns (oc_first_year_with_team_flag aside,
 * which is part of this batch) are either derived (pass_rate_neutral,
 * scheme_pace, personnel_12_rate; see scripts/derive-team-metrics.ts)
 * or out of scope for this PR (PFF OL grades are paid; rookie_ol_*
 * columns ship via the OL track).
 *
 * Source discipline. Each team's row uses Claude Sonnet 4.6 with the
 * Anthropic web_search server-side tool to find a small set of dated
 * primary sources: the team's official site, ESPN / NFL.com staff page,
 * the Pro-Football-Reference coordinator history, and recent 2026-
 * offseason news. The agent emits a single tool call with the 9 fields
 * plus a source_urls list and confidence per field. Founder reviews
 * the JSON output before any DB write happens.
 *
 *   # Dry-run (default; lists targets, calls no API):
 *   npx tsx --tsconfig tsconfig.json scripts/extract-team-coaching-scheme.ts
 *
 *   # Execute (uses ANTHROPIC_API_KEY, costs ~$5-7 for all 32 teams):
 *   npx tsx --tsconfig tsconfig.json scripts/extract-team-coaching-scheme.ts \
 *     --execute --out data/team-coaching-scheme-2026.json
 *
 *   # Subset for smoke-testing first (recommended before full batch):
 *   npx tsx --tsconfig tsconfig.json scripts/extract-team-coaching-scheme.ts \
 *     --execute --teams BUF,KC,SF --out data/team-coaching-scheme-2026.json
 *
 * Idempotency: writes are incremental. If --out already contains a row
 * for a team, that team is skipped (re-run only fills gaps). Delete a
 * row from the JSON to force re-extraction.
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

const PREDICTION_YEAR = 2026;
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

type OutputDoc = {
  prediction_year: number;
  generated_at: string;
  model: string;
  teams: Partial<Record<NflTeam, { extracted_at: string } & TeamRowExtraction>>;
};

function parseArgs(argv: readonly string[]): {
  execute: boolean;
  outPath: string;
  teams: NflTeam[] | null;
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
  const outPath = args.get("out") ?? "data/team-coaching-scheme-2026.json";
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
  return { execute, outPath, teams, force };
}

function loadExisting(outPath: string): OutputDoc {
  if (existsSync(outPath)) {
    try {
      const parsed = JSON.parse(readFileSync(outPath, "utf8")) as OutputDoc;
      if (parsed.teams && typeof parsed.teams === "object") return parsed;
    } catch (err) {
      console.warn(
        `[extract-team] could not parse existing ${outPath}: ${err instanceof Error ? err.message : String(err)}; starting fresh`,
      );
    }
  }
  return {
    prediction_year: PREDICTION_YEAR,
    generated_at: new Date().toISOString(),
    model: MODEL,
    teams: {},
  };
}

function persist(outPath: string, doc: OutputDoc): void {
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

const SYSTEM_PROMPT = `You are coding the 2026 NFL season coaching + scheme signals for ONE NFL team at a time. Each team gets ONE row of structured data into our team_signals table.

Use web_search to find PRIMARY DATED SOURCES from the team's official site, ESPN, NFL.com, Pro-Football-Reference, The Athletic, or major beat writers. Prefer sources that explicitly state the 2026 season staff. Coordinator firings/hirings from the 2026 offseason (January-May 2026) are the most relevant; older sources are useful for tenure math.

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

2. hc_id / oc_id: lowercase-kebab full name. "Sean McVay" -> "sean-mcvay". "Kellen Moore" -> "kellen-moore". If a team has co-OCs or "OC by committee" (HC calls plays with no named OC), use the HC's slug for oc_id and note in extraction_notes.

3. hc_tenure_yrs / oc_tenure_yrs: integer. The 2026 season counts as YEAR 1 if hired in the 2026 offseason (Jan-Aug 2026); YEAR 2 if hired before the 2025 season; YEAR 3 if hired before the 2024 season; etc. Do not count interim partial seasons.

4. oc_first_year_with_team_flag: true if the OC is in YEAR 1 with THIS team (regardless of prior OC experience elsewhere). Otherwise false.

5. hc_first_time_flag: true if this is the HC's first time as an NFL head coach EVER (interim HC stints don't count). Otherwise false.

6. hc_background_tag enum (pick ONE; what the HC did IMMEDIATELY before becoming this team's HC, with first-time-HC preference, or most relevant prior role for retreads):
   - "offensive_coordinator": was an NFL OC immediately before
   - "defensive_coordinator": was an NFL DC immediately before
   - "college": was a college HC or coordinator immediately before
   - "position_coach": was a position coach (e.g., QBs coach) immediately before
   - "other": prior NFL HC seat, broadcasting, retirement gap, etc.

7. staff_novelty_composite: integer 0-3, count of {new HC this offseason, new OC this offseason, new GM this offseason} where "new" means hired between January 2026 and August 2026 (the 2026 offseason). Do NOT count promotions of internal coaches who held the same title last season.

For each field, supply value + confidence + a one-sentence rationale grounded in your sources. If a field is genuinely uncertain (e.g., "OC by committee" with no clear lead), set value to null and confidence to "low" and explain.

Aggregate source_urls (list of URLs you actually used, with dates if possible) and source_paragraphs (short verbatim snippets that justify the codings, max 4) at the row level.

When you have enough to code with high confidence, call the emit_team_row tool ONCE with the structured output.`;

const EMIT_TOOL = {
  name: "emit_team_row",
  description:
    "Emit the structured 9-field row for the target NFL team. Call this once with the full row.",
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

async function extractOneTeam(
  client: Anthropic,
  team: NflTeam,
): Promise<TeamRowExtraction | null> {
  const userMessage = `TEAM: ${team} (${TEAM_FULL_NAMES[team]})
PREDICTION_YEAR: ${PREDICTION_YEAR} NFL season (regular season starts September ${PREDICTION_YEAR})

Search for the team's CURRENT 2026 head coach, offensive coordinator, GM, scheme identity, and any 2026-offseason staff changes (hires between January 2026 and today). Then call emit_team_row with the 9 fields plus your sources.

Allowed scheme_tag values: ${SCHEME_TAGS.join(", ")}.
Allowed hc_background_tag values: ${HC_BACKGROUND_TAGS.join(", ")}.

Get high-confidence on every field if possible. If a field is genuinely unknowable (e.g., a coach you cannot identify by name from sources you actually read), null + low confidence is OK and preferable to a guess.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let lastResponse = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
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
          `[extract-team] ${team}: emit_team_row failed zod parse: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400)}`,
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
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [WEB_SEARCH_TOOL as any, EMIT_TOOL],
      tool_choice: { type: "auto" },
      messages,
    });
  }
  return null;
}

async function main(): Promise<void> {
  const { execute, outPath, teams, force } = parseArgs(process.argv.slice(2));
  const targets: NflTeam[] = teams ?? [...NFL_TEAMS];
  console.log(
    `[extract-team] year=${PREDICTION_YEAR} mode=${execute ? "EXECUTE" : "dry-run"} teams=${targets.length} out=${outPath}`,
  );

  const doc = loadExisting(outPath);
  doc.prediction_year = PREDICTION_YEAR;
  doc.generated_at = new Date().toISOString();
  doc.model = MODEL;

  const remaining = targets.filter((t) => force || !doc.teams[t]);
  const alreadyExtracted = targets.length - remaining.length;
  console.log(
    `[extract-team] already extracted: ${alreadyExtracted} / ${targets.length}; remaining: ${remaining.length}`,
  );

  if (!execute) {
    console.log(
      `[extract-team] dry-run; targets that would be extracted:\n  ${remaining.join(", ") || "(none)"}`,
    );
    console.log(
      `[extract-team] estimated cost on --execute: ~$${(remaining.length * 0.2).toFixed(2)} (Sonnet 4.6 + web_search @ ~$0.20/team)`,
    );
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing for --execute");
  const client = new Anthropic({ apiKey });

  let extracted = 0;
  let failed = 0;
  for (const team of remaining) {
    console.log(`[extract-team] coding ${team} (${TEAM_FULL_NAMES[team]})...`);
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let success = false;
    while (attempts < MAX_ATTEMPTS && !success) {
      attempts++;
      try {
        const row = await extractOneTeam(client, team);
        if (!row) {
          console.warn(
            `[extract-team] ${team}: no valid emit_team_row (attempt ${attempts})`,
          );
          if (attempts >= MAX_ATTEMPTS) failed++;
          continue;
        }
        doc.teams[team] = { extracted_at: new Date().toISOString(), ...row };
        persist(outPath, doc);
        extracted++;
        console.log(
          `[extract-team] ${team} done: scheme=${row.scheme_tag.value} hc=${row.hc_id.value} oc=${row.oc_id.value} novelty=${row.staff_novelty_composite.value}`,
        );
        success = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit =
          msg.includes("rate_limit") || msg.includes("429");
        if (isRateLimit && attempts < MAX_ATTEMPTS) {
          const sleepSec = 30 * attempts;
          console.warn(
            `[extract-team] rate limit on ${team} (attempt ${attempts}); sleeping ${sleepSec}s and retrying...`,
          );
          await new Promise((r) => setTimeout(r, sleepSec * 1000));
        } else {
          console.error(
            `[extract-team] error on ${team} (attempt ${attempts}): ${msg.slice(0, 300)}`,
          );
          if (attempts >= MAX_ATTEMPTS) failed++;
        }
      }
    }
  }

  console.log(
    `[extract-team] DONE. extracted=${extracted} failed=${failed} skipped=${alreadyExtracted} out=${outPath}`,
  );
}

main().catch((err) => {
  console.error("[extract-team] fatal:", err);
  process.exit(1);
});
