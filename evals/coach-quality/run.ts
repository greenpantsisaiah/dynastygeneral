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
 *     --username <sleeper username> [--leagues id1,id2] [--primary id] \
 *     [--limit 10] [--only dir-01,trd-02] [--max-cost 20] [--dry-run]
 *
 * --dry-run builds every Coach context and filled question, prints the
 * plan and a token estimate, and makes NO model calls.
 *
 * Questions come from docs/team/coach-quality/test-set.jsonl. Results go
 * to docs/team/coach-quality/runs/<run-id>.jsonl (resumable) and
 * runs/<run-id>.md (report with 5 spot-check judge calls), and a summary
 * row is appended to docs/team/coach-quality/scores.md.
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
  type SliceSummary,
} from "./judge";
import {
  loadTestSet,
  phraseChecks,
  PORTFOLIO_FIXTURE,
  ROTATE_FIXTURE,
  TEST_SET_PATH,
  type TestQuestion,
} from "./testset";

// ── args ──────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const USERNAME = arg("username");
const LEAGUE_FILTER = arg("leagues")?.split(",").filter(Boolean);
const PRIMARY = arg("primary");
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const ONLY = arg("only")?.split(",").filter(Boolean);
// Default cap matches docs/team/ledger/spend.md ($20 per eval run until measured).
const MAX_COST = Number(arg("max-cost") ?? 20);
const DRY = flag("dry-run");
// Per .claude/agents/coach-quality.md the baseline is the SAME model as
// Coach with no product context, so the score isolates what the product
// context adds. Pass --baseline-model claude-opus-5-5 to compare against
// the best general chatbot instead.
const BASELINE_MODEL = arg("baseline-model") ?? COACH_MODEL;
const JUDGE_MODEL = arg("judge-model") ?? "claude-opus-5-5";
const CONCURRENCY = Number(arg("concurrency") ?? 3);
const RUN_ID = arg("run-id") ?? new Date().toISOString().slice(0, 10);
const RUNS_DIR = join("docs", "team", "coach-quality", "runs");
const SCORES_PATH = join("docs", "team", "coach-quality", "scores.md");
const OUT = join("evals", "coach-quality", "out", RUN_ID); // scratch: plan.json

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
  slice: string;
  source: TestQuestion["source"];
  must_include: string[];
  must_not: string[];
  category: string;
  leagueId: string;
  username: string;
  question: string;
  crossLeague: boolean;
  opponentsMentioned: string[];
};

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
  const testSet = loadTestSet(arg("test-set") ?? TEST_SET_PATH);
  const needsUserLeagues = testSet.some((q) => q.league_fixture.startsWith(ROTATE_FIXTURE));
  if (needsUserLeagues && !USERNAME) {
    console.error("The test set has user-leagues questions: pass --username <sleeper username>.");
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
  const primary = leagues.find((l) => l.leagueId === PRIMARY) ?? leagues[0];
  let li = 0;
  for (const q of testSet) {
    if (ONLY && !ONLY.includes(q.id)) continue;
    const portfolio = q.league_fixture === PORTFOLIO_FIXTURE;
    const rotate = q.league_fixture === ROTATE_FIXTURE;
    // Rotating questions spread across the user's leagues so the set covers
    // every league; portfolio questions are asked inside the primary league.
    const lg = portfolio ? primary : rotate ? leagues[li++ % Math.max(1, leagues.length)] : undefined;
    if ((portfolio || rotate) && !lg) continue;
    const ph = lg ? placeholdersFor(lg, leagues) : {};
    plan.push({
      id: q.id,
      slice: portfolio ? `${q.source}_portfolio` : q.source,
      source: q.source,
      must_include: q.must_include,
      must_not: q.must_not,
      category: q.category ?? "uncategorized",
      leagueId: lg ? lg.leagueId : q.league_fixture,
      username: q.username ?? USERNAME ?? "",
      question: fillQuestion(q.question, ph),
      crossLeague: portfolio,
      opponentsMentioned: (q.mentions_opponents ?? []).map((k) => ph[k]).filter(Boolean),
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
      console.error(`  fixed-league question skipped: ${it.leagueId}: ${(e as Error).message}`);
    }
  }

  writeFileSync(join(OUT, "plan.json"), JSON.stringify(items, null, 2));
  console.log(`\n${items.length} questions planned -> ${OUT}/plan.json`);
  if (DRY) {
    for (const it of items) console.log(`  [${it.id}] (${stateByLeague.get(it.leagueId)?.name}) ${it.question}`);
    const ctxChars = [...stateByLeague.values()].map((l) => JSON.stringify(l.state).length);
    const avgTok = Math.round(ctxChars.reduce((a, b) => a + b, 0) / Math.max(1, ctxChars.length) / 3.5);
    console.log(`\n~${avgTok} tokens of <current_state> per league (rough chars/3.5).`);
    // Measured on the first baseline (2026-11-22): $0.52 to $1.55 per
    // question, mean $1.09 (web search turns on both sides plus the Opus
    // judge dominate). The token-only formula underestimated by about 3x.
    console.log(`Rough cost: ~$${(items.length * 1.1).toFixed(0)} at the measured ~$1.10 per question (range $0.50 to $1.60).`);
    return;
  }

  // Resume: skip ids already graded in this run dir.
  mkdirSync(RUNS_DIR, { recursive: true });
  const resultsPath = join(RUNS_DIR, `${RUN_ID}.jsonl`);
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
    if (!promptHash) promptHash = createHash("sha256").update(turn.system).digest("hex").slice(0, 10);
    const row = {
      id: it.id,
      slice: it.slice,
      source: it.source,
      category: it.category,
      league: lg.name,
      question: it.question,
      coach_answer: coach.text,
      baseline_answer: baseline.text,
      coach_ms: coach.ms,
      coach_prod_timeout: coach.prod_timeout,
      coach_input_tokens: coach.input_tokens,
      coach_was_a: coachWasA,
      // Deterministic phrase checks from the test set's must_include / must_not.
      coach_phrase_checks: phraseChecks(coach.text, it),
      baseline_phrase_checks: phraseChecks(baseline.text, it),
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

  // Small worker pool. The cap reserves room for questions already in
  // flight (at the running average cost per question, $1.00 until one
  // finishes), so a run stops at or under --max-cost instead of
  // overrunning by the in-flight answers (the first baseline overran $2.95).
  const queue = [...todo];
  let inFlight = 0;
  let finished = 0;
  let finishedCost = 0;
  const perQuestion = () => (finished ? finishedCost / finished : 1);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        if (spent + (inFlight + 1) * perQuestion() > MAX_COST) break;
        const it = queue.shift()!;
        const before = spent;
        inFlight++;
        try {
          await runOne(it);
        } catch (e) {
          const err = e as Error;
          console.error(`  [${it.id}] failed: ${err.message}\n${err.stack}`);
        } finally {
          inFlight--;
          finished++;
          finishedCost += spent - before;
        }
      }
    }),
  );
  if (queue.length) {
    console.error(`\nStopped early: $${spent.toFixed(2)} spent, ${queue.length} questions left to stay under --max-cost ${MAX_COST}.`);
  }

  writeReport(resultsPath, true);
}

type Row = {
  id: string;
  slice: string;
  category: string;
  league: string;
  question: string;
  coach_answer: string;
  baseline_answer: string;
  graded: GradedItem | null;
  verdict: JudgeVerdict | null;
  coach_was_a: boolean;
  coach_prod_timeout: boolean;
  coach_phrase_checks?: { missing: string[]; banned_hits: string[] };
  cost: number;
};

let promptHash = "";

function writeReport(resultsPath: string, appendScoreRow: boolean) {
  const rows = readFileSync(resultsPath, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
  const graded = rows.map((r) => r.graded).filter((g): g is GradedItem => !!g);
  const sliceNames = [...new Set(graded.map((g) => g.slice))].sort();
  const slices: Record<string, SliceSummary> = { all: summarize(graded) };
  for (const n of sliceNames) slices[n] = summarize(graded.filter((g) => g.slice === n));
  const all = slices.all;
  const byCategory = Object.fromEntries(
    [...new Set(graded.map((g) => g.category))].map((c) => [c, summarize(graded.filter((g) => g.category === c))]),
  );
  const totalCost = Math.round(rows.reduce((sum, r) => sum + (r.cost ?? 0), 0) * 100) / 100;
  const phraseFails = rows.filter(
    (r) => (r.coach_phrase_checks?.banned_hits.length ?? 0) + (r.coach_phrase_checks?.missing.length ?? 0) > 0,
  );

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const line = (name: string, x: SliceSummary) =>
    `| ${name} | ${x.n} | ${x.coach_wins}-${x.baseline_wins}-${x.ties} | ${pct(x.coach_win_rate)} (${pct(x.coach_win_rate_ci[0])}-${pct(x.coach_win_rate_ci[1])}) | ${x.coach_mean.accuracy} / ${x.baseline_mean.accuracy} | ${x.coach_mean.league_data_use} / ${x.baseline_mean.league_data_use} | ${x.coach_mean.advisor_quality} / ${x.baseline_mean.advisor_quality} |`;
  // Five judge calls for Isaiah to spot-check (coach-quality.md step 4):
  // Coach losses first, then the rest, in run order.
  const spot = [
    ...rows.filter((r) => r.graded?.outcome === "baseline"),
    ...rows.filter((r) => r.graded?.outcome !== "baseline"),
  ].slice(0, 5);
  const clip = (t: string) => (t.length > 900 ? `${t.slice(0, 900)} [...]` : t);
  const md = [
    `# Coach quality run ${RUN_ID}`,
    "",
    `Coach (${COACH_MODEL}, production prompt, prompt hash ${promptHash || "n/a"}) vs baseline (${BASELINE_MODEL}, no product context, roster paste, web search). Blind pairwise judge ${JUDGE_MODEL}. Scores 1-5.`,
    "",
    `Graded ${graded.length} of ${rows.length} (judge failures ${rows.length - graded.length}). Coach answers over the 50s prod timeout: ${rows.filter((r) => r.coach_prod_timeout).length}. Coach answers failing a must_include / must_not check: ${phraseFails.length}. Run cost $${totalCost}.`,
    "",
    "| Slice | n | Coach W-L-T | Coach win rate (95% CI) | Accuracy C / B | League data C / B | Advisor C / B |",
    "|---|---|---|---|---|---|---|",
    line("All", all),
    ...sliceNames.map((n) => line(n, slices[n])),
    "",
    "## Why Coach loses (judge tags on Coach's losing answers)",
    "",
    ...(all.coach_loss_reasons.length ? all.coach_loss_reasons.map(([r, n]) => `- ${r}: ${n}`) : ["- none"]),
    "",
    "## Why the baseline loses",
    "",
    ...(all.baseline_loss_reasons.length ? all.baseline_loss_reasons.map(([r, n]) => `- ${r}: ${n}`) : ["- none"]),
    "",
    "## By category",
    "",
    "| Category | n | Coach W-L-T | Coach win rate |",
    "|---|---|---|---|",
    ...Object.entries(byCategory).map(
      ([c, x]) => `| ${c} | ${x.n} | ${x.coach_wins}-${x.baseline_wins}-${x.ties} | ${pct(x.coach_win_rate)} |`,
    ),
    "",
    "## Spot-check these 5 judge calls",
    "",
    ...spot.flatMap((r) => [
      `### ${r.id}: ${r.question}`,
      "",
      `Judge: ${r.graded?.outcome ?? "failed"}. ${r.verdict?.rationale ?? ""}`,
      "",
      `**Coach:** ${clip(r.coach_answer)}`,
      "",
      `**Baseline:** ${clip(r.baseline_answer)}`,
      "",
    ]),
    "## Per question",
    "",
    "| id | league | outcome | judge rationale |",
    "|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.league} | ${r.graded?.outcome ?? "judge failed"} | ${(r.verdict?.rationale ?? "").replace(/\|/g, "/").replace(/\n/g, " ")} |`,
    ),
    "",
  ].join("\n");
  const reportPath = resultsPath.replace(/\.jsonl$/, ".md");
  writeFileSync(reportPath, md);
  console.log(`\nReport: ${reportPath}`);

  if (appendScoreRow && graded.length) {
    const row = `| ${RUN_ID} | ${all.n} | ${all.coach_wins} | ${all.baseline_wins} | ${all.ties} | ${pct(all.coach_win_rate)} (${pct(all.coach_win_rate_ci[0])}-${pct(all.coach_win_rate_ci[1])}) | ${COACH_MODEL} vs ${BASELINE_MODEL} | ${promptHash || "n/a"} | $${totalCost} |`;
    const kept = readFileSync(SCORES_PATH, "utf-8")
      .split("\n")
      .filter((l) => !l.startsWith("No runs yet"));
    // Insert as the last row of the scores table.
    const sep = kept.findIndex((l) => l.startsWith("|---"));
    let end = sep + 1;
    while (end < kept.length && kept[end].startsWith("|")) end++;
    const next = [...kept.slice(0, end), row, ...kept.slice(end)];
    writeFileSync(SCORES_PATH, next.join("\n"));
    console.log(`Score row added to ${SCORES_PATH}`);
  }
}

if (flag("report-only")) {
  writeReport(join(RUNS_DIR, `${RUN_ID}.jsonl`), false);
} else {
  main().catch((e) => {
    const err = e as Error;
    console.error(err.message, err.stack);
    process.exit(1);
  });
}
