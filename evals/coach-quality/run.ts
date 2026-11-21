/**
 * Coach quality eval runner.
 *
 * For each question: (1) the production Coach answer, built by the same
 * buildCoachTurn the /api/coach route uses, with the same model settings;
 * (2) a "plain Claude" answer to the same question with the roster paste a
 * manager would realistically give a general chatbot; (3) a blind pairwise
 * judge that scores both against the league's ground truth.
 *
 * Usage (needs .env.local with ANTHROPIC_API_KEY + Supabase keys, and
 * network access to Sleeper / FantasyCalc):
 *
 *   npx tsx --tsconfig tsconfig.json evals/coach-quality/run.ts \
 *     --username izzydabomb [--leagues id1,id2] [--primary id] \
 *     [--real evals/coach-quality/out/real-questions.jsonl] \
 *     [--limit 10] [--only dir-01,trd-02] [--max-cost 40] [--dry-run]
 *
 * --dry-run builds every Coach context and filled question, prints the
 * plan and a token estimate, and makes NO model calls.
 *
 * Outputs land in evals/coach-quality/out/<run-id>/ (gitignored):
 * results.jsonl (one line per graded question, resumable), summary.json,
 * report.md.
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildCoachTurn,
  COACH_MAX_TOKENS,
  COACH_MODEL,
  COACH_TEMPERATURE,
  COACH_TOOLS,
} from "@/lib/coach/turn";
import { getLeaguesForUser, getNflState, getUserByUsername } from "@/lib/sleeper";
import {
  baselinePaste,
  compactLeagueSummary,
  fillQuestion,
  placeholdersFor,
  type CoachState,
  type LeagueUnderTest,
} from "./fill";
import {
  coachIsA,
  JUDGE_SCHEMA,
  judgeSystem,
  judgeUserMessage,
  parseVerdict,
  summarize,
  unblind,
  type GradedItem,
  type JudgeVerdict,
} from "./judge";
import { QUESTION_BANK } from "./questions";

// ── args ──────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const USERNAME = arg("username");
const LEAGUE_FILTER = arg("leagues")?.split(",").filter(Boolean);
const PRIMARY = arg("primary");
const REAL_FILE = arg("real");
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const ONLY = arg("only")?.split(",").filter(Boolean);
const MAX_COST = Number(arg("max-cost") ?? 40);
const DRY = flag("dry-run");
const BASELINE_MODEL = arg("baseline-model") ?? "claude-opus-5-5";
const JUDGE_MODEL = arg("judge-model") ?? "claude-opus-5-5";
const CONCURRENCY = Number(arg("concurrency") ?? 3);
const RUN_ID = arg("run-id") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const OUT = join("evals", "coach-quality", "out", RUN_ID);

// ── cost accounting ───────────────────────────────────────────────────
// $ per million tokens (input, output). Cache reads 0.1x input, cache
// writes 1.25x input, web search $10 per 1k requests.
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-4-6": [3, 15],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-haiku-5-5": [0.1, 0.5],
};
let spent = 0;
function costOf(model: string, u: Anthropic.Usage): number {
  const [pin, pout] = PRICES[model] ?? [5, 25];
  const c =
    (u.input_tokens * pin +
      (u.cache_read_input_tokens ?? 0) * pin * 0.1 +
      (u.cache_creation_input_tokens ?? 0) * pin * 1.25 +
      u.output_tokens * pout) /
      1e6 +
    (u.server_tool_use?.web_search_requests ?? 0) * 0.01;
  spent += c;
  return c;
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

const client = new Anthropic();

// ── the three calls ───────────────────────────────────────────────────
async function askCoach(system: string, messages: Anthropic.MessageParam[]) {
  // Mirrors the production call in src/app/api/coach/[leagueId]/route.ts
  // (same model, max_tokens, temperature, cached system, tools). The
  // timeout is looser than prod's 50s so slow turns are graded, not lost;
  // a turn that exceeds 50s is flagged as a prod timeout in the results.
  const t0 = Date.now();
  const res = await client.messages.create(
    {
      model: COACH_MODEL,
      max_tokens: COACH_MAX_TOKENS,
      temperature: COACH_TEMPERATURE,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: COACH_TOOLS,
      messages,
    },
    { timeout: 120_000 },
  );
  const ms = Date.now() - t0;
  return {
    text: textOf(res) || "(no response)",
    ms,
    prod_timeout: ms > 50_000,
    stop: res.stop_reason,
    cost: costOf(COACH_MODEL, res.usage),
    input_tokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0),
  };
}

async function askBaseline(question: string, paste: string) {
  // "Plain Claude": no system prompt, the manager's paste + question, web
  // search on (what a chat app gives them).
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `${paste}\n\n${question}` },
  ];
  let cost = 0;
  let res: Anthropic.Message | null = null;
  for (let i = 0; i < 3; i++) {
    res = await client.messages.create(
      {
        model: BASELINE_MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
        messages,
      },
      { timeout: 300_000 },
    );
    cost += costOf(BASELINE_MODEL, res.usage);
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return { text: res ? textOf(res) || "(no response)" : "(no response)", stop: res?.stop_reason, cost };
}

async function judge(groundTruth: string, user: string): Promise<{ verdict: JudgeVerdict | null; cost: number; raw: string }> {
  const res = await client.messages.create(
    {
      model: JUDGE_MODEL,
      max_tokens: 16000,
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: JUDGE_SCHEMA as unknown as Record<string, unknown> },
      },
      // Ground truth is identical across a league's questions: cache it.
      system: [{ type: "text", text: judgeSystem(groundTruth), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    },
    { timeout: 300_000 },
  );
  const cost = costOf(JUDGE_MODEL, res.usage);
  if (res.stop_reason === "refusal") return { verdict: null, cost, raw: "(refusal)" };
  const raw = textOf(res);
  return { verdict: parseVerdict(raw), cost, raw };
}

// ── planning ──────────────────────────────────────────────────────────
type PlanItem = {
  id: string;
  slice: GradedItem["slice"];
  category: string;
  leagueId: string;
  username: string;
  question: string;
  crossLeague: boolean;
  opponentsMentioned: string[];
};

type RealQuestion = { league_id: string; username: string; message: string };

async function loadLeagueState(leagueId: string, username: string): Promise<CoachState> {
  const turn = await buildCoachTurn({
    leagueId,
    username,
    userId: null,
    history: [],
    message: "(context probe)",
    activePlays: [],
    companionBeat: null,
  });
  if (!turn.ok) throw new Error(`league ${leagueId}: ${turn.error}`);
  return turn.contextPayload as CoachState;
}

async function main() {
  if (!USERNAME && !REAL_FILE) {
    console.error("Pass --username <sleeper username> and/or --real <jsonl>.");
    process.exit(1);
  }
  if (!DRY && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (.env.local). Use --dry-run to plan only.");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  // Leagues for the bank: every league this user is in this season.
  const leagues: LeagueUnderTest[] = [];
  if (USERNAME) {
    const nfl = await getNflState();
    const season = arg("season") ?? nfl?.season ?? String(new Date().getFullYear());
    const user = await getUserByUsername(USERNAME);
    if (!user) throw new Error(`Sleeper user not found: ${USERNAME}`);
    let found = await getLeaguesForUser(user.user_id, season);
    if (LEAGUE_FILTER) found = found.filter((l) => LEAGUE_FILTER.includes(l.league_id));
    for (const l of found) {
      try {
        leagues.push({ leagueId: l.league_id, name: l.name, state: await loadLeagueState(l.league_id, USERNAME) });
        console.log(`  league ok: ${l.name} (${l.league_id})`);
      } catch (e) {
        console.error(`  league skipped: ${l.name}: ${(e as Error).message}`);
      }
    }
    if (!leagues.length) throw new Error("No leagues resolved for the bank.");
  }

  const plan: PlanItem[] = [];
  if (leagues.length) {
    const primary = leagues.find((l) => l.leagueId === PRIMARY) ?? leagues[0];
    let li = 0;
    for (const q of QUESTION_BANK) {
      if (ONLY && !ONLY.includes(q.id)) continue;
      // League questions rotate across leagues so the bank covers every
      // league; cross-league questions are asked inside the primary league.
      const lg = q.scope === "cross_league" ? primary : leagues[li++ % leagues.length];
      const ph = placeholdersFor(lg, leagues);
      plan.push({
        id: q.id,
        slice: q.scope === "cross_league" ? "bank_cross_league" : "bank_league",
        category: q.category,
        leagueId: lg.leagueId,
        username: USERNAME!,
        question: fillQuestion(q.text, ph),
        crossLeague: q.scope === "cross_league",
        opponentsMentioned: (q.mentionsOpponents ?? []).map((k) => ph[k]),
      });
    }
  }
  if (REAL_FILE) {
    const lines = readFileSync(REAL_FILE, "utf-8").split("\n").filter(Boolean);
    lines.forEach((line, i) => {
      const r = JSON.parse(line) as RealQuestion;
      if (ONLY && !ONLY.includes(`real-${i + 1}`)) return;
      plan.push({
        id: `real-${i + 1}`,
        slice: "real",
        category: "real",
        leagueId: r.league_id,
        username: r.username,
        question: r.message,
        crossLeague: false,
        opponentsMentioned: [],
      });
    });
  }
  const items = LIMIT ? plan.slice(0, LIMIT) : plan;

  // League states for real questions in leagues not already loaded.
  const stateByLeague = new Map(leagues.map((l) => [l.leagueId, l]));
  for (const it of items) {
    if (stateByLeague.has(it.leagueId)) continue;
    try {
      const state = await loadLeagueState(it.leagueId, it.username);
      stateByLeague.set(it.leagueId, { leagueId: it.leagueId, name: state.league?.name ?? it.leagueId, state });
    } catch (e) {
      console.error(`  real-question league skipped: ${it.leagueId}: ${(e as Error).message}`);
    }
  }

  writeFileSync(join(OUT, "plan.json"), JSON.stringify(items, null, 2));
  console.log(`\n${items.length} questions planned -> ${OUT}/plan.json`);
  if (DRY) {
    for (const it of items) console.log(`  [${it.id}] (${stateByLeague.get(it.leagueId)?.name}) ${it.question}`);
    const ctxChars = [...stateByLeague.values()].map((l) => JSON.stringify(l.state).length);
    const avgTok = Math.round(ctxChars.reduce((a, b) => a + b, 0) / Math.max(1, ctxChars.length) / 3.5);
    console.log(`\n~${avgTok} tokens of <current_state> per league (rough chars/3.5).`);
    console.log(`Rough cost: ~$${((items.length * avgTok * (3 + 4 * 0.25)) / 1e6 + items.length * 0.12).toFixed(0)} (Coach input + cached judge ground truth + answers).`);
    return;
  }

  // Resume: skip ids already graded in this run dir.
  const resultsPath = join(OUT, "results.jsonl");
  const done = new Set<string>();
  if (existsSync(resultsPath)) {
    for (const l of readFileSync(resultsPath, "utf-8").split("\n").filter(Boolean)) {
      done.add((JSON.parse(l) as { id: string }).id);
    }
  }
  const todo = items.filter((i) => !done.has(i.id));

  const allLeagues = [...stateByLeague.values()].filter((l) => leagues.some((x) => x.leagueId === l.leagueId));
  async function runOne(it: PlanItem) {
    if (spent > MAX_COST) return;
    const lg = stateByLeague.get(it.leagueId);
    if (!lg) return;
    const turn = await buildCoachTurn({
      leagueId: it.leagueId,
      username: it.username,
      userId: null,
      history: [],
      message: it.question,
      activePlays: [],
      companionBeat: null,
    });
    if (!turn.ok) {
      console.error(`  [${it.id}] coach context failed: ${turn.error}`);
      return;
    }
    const pasteLeagues = it.crossLeague ? allLeagues : [lg];
    const [coach, baseline] = await Promise.all([
      askCoach(turn.system, turn.messages),
      askBaseline(it.question, baselinePaste({ leagues: pasteLeagues, opponentsMentioned: it.opponentsMentioned })),
    ]);
    const groundTruth = it.crossLeague
      ? allLeagues.map(compactLeagueSummary).join("\n\n") +
        `\n\nFull data for the league this question was asked in (${lg.name}):\n` +
        JSON.stringify(lg.state)
      : // The league state loaded once at startup (same builder Coach
        // uses). Byte-stable across a league's questions, so the judge's
        // cached system prompt is reused.
        JSON.stringify(lg.state);
    const coachWasA = coachIsA(`${RUN_ID}:${it.id}`);
    const j = await judge(
      groundTruth,
      judgeUserMessage({
        question: it.question,
        answerA: coachWasA ? coach.text : baseline.text,
        answerB: coachWasA ? baseline.text : coach.text,
        crossLeague: it.crossLeague,
      }),
    );
    const graded = j.verdict
      ? unblind({ id: it.id, slice: it.slice, category: it.category, verdict: j.verdict, coachWasA })
      : null;
    const row = {
      id: it.id,
      slice: it.slice,
      category: it.category,
      league: lg.name,
      question: it.question,
      coach_answer: coach.text,
      baseline_answer: baseline.text,
      coach_ms: coach.ms,
      coach_prod_timeout: coach.prod_timeout,
      coach_input_tokens: coach.input_tokens,
      coach_was_a: coachWasA,
      verdict: j.verdict,
      judge_raw: j.verdict ? undefined : j.raw,
      graded,
      cost: coach.cost + baseline.cost + j.cost,
    };
    appendFileSync(resultsPath, JSON.stringify(row) + "\n");
    console.log(
      `  [${it.id}] ${graded?.outcome ?? "judge-failed"}  coach ${JSON.stringify(graded?.coach ?? {})}  ($${spent.toFixed(2)} so far)`,
    );
  }

  // Small worker pool.
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const it = queue.shift()!;
        try {
          await runOne(it);
        } catch (e) {
          const err = e as Error;
          console.error(`  [${it.id}] failed: ${err.message}\n${err.stack}`);
        }
      }
    }),
  );
  if (spent > MAX_COST) console.error(`\nStopped early: spend $${spent.toFixed(2)} passed --max-cost ${MAX_COST}.`);

  writeReport(resultsPath);
}

type Row = {
  id: string;
  slice: GradedItem["slice"];
  category: string;
  league: string;
  question: string;
  graded: GradedItem | null;
  verdict: JudgeVerdict | null;
  coach_prod_timeout: boolean;
  cost: number;
};

function writeReport(resultsPath: string) {
  const rows = readFileSync(resultsPath, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
  const graded = rows.map((r) => r.graded).filter((g): g is GradedItem => !!g);
  const slices = {
    all: summarize(graded),
    bank_league: summarize(graded.filter((g) => g.slice === "bank_league")),
    bank_cross_league: summarize(graded.filter((g) => g.slice === "bank_cross_league")),
    real: summarize(graded.filter((g) => g.slice === "real")),
  };
  const byCategory = Object.fromEntries(
    [...new Set(graded.map((g) => g.category))].map((c) => [c, summarize(graded.filter((g) => g.category === c))]),
  );
  const totalCost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const summary = {
    run_id: RUN_ID,
    models: { coach: COACH_MODEL, baseline: BASELINE_MODEL, judge: JUDGE_MODEL },
    graded: graded.length,
    judge_failures: rows.length - graded.length,
    coach_prod_timeouts: rows.filter((r) => r.coach_prod_timeout).length,
    total_cost_usd: Math.round(totalCost * 100) / 100,
    slices,
    by_category: byCategory,
  };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const line = (name: string, s: ReturnType<typeof summarize>) =>
    s.n
      ? `| ${name} | ${s.n} | ${s.coach_wins}-${s.baseline_wins}-${s.ties} | ${pct(s.coach_win_rate)} (${pct(s.coach_win_rate_ci[0])}-${pct(s.coach_win_rate_ci[1])}) | ${s.coach_mean.accuracy} / ${s.baseline_mean.accuracy} | ${s.coach_mean.league_data_use} / ${s.baseline_mean.league_data_use} | ${s.coach_mean.advisor_quality} / ${s.baseline_mean.advisor_quality} |`
      : `| ${name} | 0 | | | | | |`;
  const md = [
    `# Coach quality eval: ${RUN_ID}`,
    "",
    `Coach (${COACH_MODEL}, production prompt) vs plain Claude (${BASELINE_MODEL}, roster paste, web search). Blind pairwise judge: ${JUDGE_MODEL}. Scores 1-5.`,
    "",
    `Graded ${graded.length}, judge failures ${summary.judge_failures}, Coach answers over the 50s prod timeout ${summary.coach_prod_timeouts}. Spend $${summary.total_cost_usd}.`,
    "",
    "| Slice | n | Coach W-L-T | Coach win rate (95% CI) | Accuracy C / B | League data C / B | Advisor C / B |",
    "|---|---|---|---|---|---|---|",
    line("All", slices.all),
    line("Bank, single league", slices.bank_league),
    line("Bank, cross-league", slices.bank_cross_league),
    line("Real Coach questions", slices.real),
    "",
    "## Why Coach loses (tags on Coach's losing answers)",
    "",
    ...slices.all.coach_loss_reasons.map(([r, n]) => `- ${r}: ${n}`),
    "",
    "## Why plain Claude loses",
    "",
    ...slices.all.baseline_loss_reasons.map(([r, n]) => `- ${r}: ${n}`),
    "",
    "## By category",
    "",
    "| Category | n | Coach W-L-T | Coach win rate |",
    "|---|---|---|---|",
    ...Object.entries(byCategory).map(([c, s]) => `| ${c} | ${s.n} | ${s.coach_wins}-${s.baseline_wins}-${s.ties} | ${pct(s.coach_win_rate)} |`),
    "",
    "## Per question",
    "",
    "| id | league | outcome | judge rationale |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.id} | ${r.league} | ${r.graded?.outcome ?? "judge failed"} | ${(r.verdict?.rationale ?? "").replace(/\|/g, "/").replace(/\n/g, " ")} |`),
    "",
  ].join("\n");
  writeFileSync(join(OUT, "report.md"), md);
  console.log(`\nReport: ${join(OUT, "report.md")}`);
}

if (flag("report-only")) {
  writeReport(join(OUT, "results.jsonl"));
} else {
  main().catch((e) => {
    const err = e as Error;
    console.error(err.message, err.stack);
    process.exit(1);
  });
}
