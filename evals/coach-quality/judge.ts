/**
 * Coach quality eval: the blind pairwise judge + scoring summary.
 *
 * The judge sees the question, the league ground truth, and two answers
 * labeled A and B in a seeded random order. It never learns which answer
 * is Coach. It scores each answer 1-5 on three axes, picks a winner, and
 * tags the losing answer's failure modes from a fixed taxonomy so loss
 * reasons can be counted across the run.
 */

export const LOSS_REASONS = [
  "hallucinated_fact", // states a player, roster, trade, or number that is false
  "wrong_league_data", // misreads this league's rosters, format, or record
  "ignored_league_context", // generic advice that ignores data it had
  "missing_data_refusal", // says it lacks data, or refuses, where a useful answer was possible
  "stale_or_wrong_nfl_news", // outdated injury, depth chart, or team situation
  "hedging_or_vague", // no clear call, both-sides, "it depends"
  "not_actionable", // no concrete next step, offer, or name
  "weak_strategy", // the call itself is poor dynasty reasoning
  "trade_unrealistic", // offer the other manager would never accept, or bad value math
  "too_long_or_jargon", // buries the answer, internal engine jargon, wall of text
  "ignored_question", // answers a different question
  "cross_league_blind", // cannot see the user's other leagues when the question needs them
  "other",
] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

export const AXES = ["accuracy", "league_data_use", "advisor_quality"] as const;
export type Axis = (typeof AXES)[number];

export type AnswerScores = Record<Axis, number>;

export type JudgeVerdict = {
  scores_a: AnswerScores;
  scores_b: AnswerScores;
  winner: "A" | "B" | "tie";
  loser_reasons: LossReason[];
  rationale: string;
};

const scoreSchema = {
  type: "object",
  additionalProperties: false,
  required: [...AXES],
  properties: Object.fromEntries(
    AXES.map((a) => [a, { type: "integer", enum: [1, 2, 3, 4, 5] }]),
  ),
};

export const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores_a", "scores_b", "winner", "loser_reasons", "rationale"],
  properties: {
    scores_a: scoreSchema,
    scores_b: scoreSchema,
    winner: { type: "string", enum: ["A", "B", "tie"] },
    loser_reasons: {
      type: "array",
      items: { type: "string", enum: [...LOSS_REASONS] },
    },
    rationale: { type: "string" },
  },
} as const;

export const JUDGE_SYSTEM_INTRO = `You are grading answers to a fantasy football (dynasty league) manager's question. You are a senior dynasty analyst and a strict, fair grader.

You get the manager's league data as ground truth, the question, and two anonymous answers, A and B. Grade each answer on three 1-5 scales:

accuracy: Are its factual claims true? Check every claim about who is on which roster, player ages, positions, league format, record, and values against the ground truth. A claim the ground truth contradicts is a hallucination; one confident hallucination caps accuracy at 2. Claims about current NFL news (injuries, depth charts) that you cannot verify from the ground truth or your own knowledge should not be counted as wrong, but a claim you know to be outdated should.
league_data_use: Does it use the specific facts of THIS league (the manager's actual players, named opponents and their rosters, the scoring and roster format, standing) to shape the advice? Generic advice that would fit any league scores 1-2.
advisor_quality: Would a senior advisor give this answer? Decisive, prioritized, concrete (names, offers, next steps), answers the underlying question, states uncertainty specifically instead of hedging, and is no longer than it needs to be.

5 = excellent, 3 = acceptable, 1 = poor. Then pick the better answer overall for this manager (tie only if genuinely equal). For the losing answer, tag every failure mode that applies from the allowed list (empty list on a tie). In rationale, give one or two sentences naming the decisive difference.

Do not favor an answer for length, formatting, or confidence alone. Do not guess which system wrote which answer.`;

export function judgeSystem(groundTruth: string): string {
  return `${JUDGE_SYSTEM_INTRO}\n\n<ground_truth>\n${groundTruth}\n</ground_truth>`;
}

export function judgeUserMessage(args: {
  question: string;
  answerA: string;
  answerB: string;
  crossLeague: boolean;
}): string {
  const note = args.crossLeague
    ? "\nThis question is about the manager's whole portfolio of leagues; the ground truth summarizes each league.\n"
    : "";
  return `${note}<question>\n${args.question}\n</question>\n\n<answer_a>\n${args.answerA}\n</answer_a>\n\n<answer_b>\n${args.answerB}\n</answer_b>`;
}

/** Deterministic per-question coin flip (FNV-1a), so reruns keep the order. */
export function coachIsA(seed: string): boolean {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2 === 0;
}

export function parseVerdict(text: string): JudgeVerdict | null {
  try {
    const v = JSON.parse(text) as JudgeVerdict;
    if (!["A", "B", "tie"].includes(v.winner)) return null;
    for (const s of [v.scores_a, v.scores_b]) {
      for (const a of AXES) {
        if (!Number.isInteger(s?.[a]) || s[a] < 1 || s[a] > 5) return null;
      }
    }
    v.loser_reasons = (v.loser_reasons ?? []).filter((r) =>
      (LOSS_REASONS as readonly string[]).includes(r),
    );
    return v;
  } catch {
    return null;
  }
}

/** One graded item, with the A/B mapping undone. */
export type GradedItem = {
  id: string;
  slice: string;
  category: string;
  coach: AnswerScores;
  baseline: AnswerScores;
  outcome: "coach" | "baseline" | "tie";
  /** Reasons tagged against Coach when Coach lost (empty otherwise). */
  coach_loss_reasons: LossReason[];
  /** Reasons tagged against the baseline when it lost. */
  baseline_loss_reasons: LossReason[];
};

export function unblind(args: {
  id: string;
  slice: GradedItem["slice"];
  category: string;
  verdict: JudgeVerdict;
  coachWasA: boolean;
}): GradedItem {
  const { verdict: v, coachWasA } = args;
  const coach = coachWasA ? v.scores_a : v.scores_b;
  const baseline = coachWasA ? v.scores_b : v.scores_a;
  const outcome =
    v.winner === "tie"
      ? "tie"
      : (v.winner === "A") === coachWasA
        ? "coach"
        : "baseline";
  return {
    id: args.id,
    slice: args.slice,
    category: args.category,
    coach,
    baseline,
    outcome,
    coach_loss_reasons: outcome === "baseline" ? v.loser_reasons : [],
    baseline_loss_reasons: outcome === "coach" ? v.loser_reasons : [],
  };
}

export type SliceSummary = {
  n: number;
  coach_wins: number;
  baseline_wins: number;
  ties: number;
  /** Coach win rate counting ties as half. */
  coach_win_rate: number;
  /** 95% Wilson interval on the tie-as-half win rate. */
  coach_win_rate_ci: [number, number];
  coach_mean: AnswerScores;
  baseline_mean: AnswerScores;
  coach_loss_reasons: Array<[LossReason, number]>;
  baseline_loss_reasons: Array<[LossReason, number]>;
};

function wilson(p: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function meanScores(xs: AnswerScores[]): AnswerScores {
  const out = {} as AnswerScores;
  for (const a of AXES) {
    out[a] = xs.length
      ? Math.round((xs.reduce((s, x) => s + x[a], 0) / xs.length) * 100) / 100
      : 0;
  }
  return out;
}

function tally(lists: LossReason[][]): Array<[LossReason, number]> {
  const m = new Map<LossReason, number>();
  for (const l of lists) for (const r of l) m.set(r, (m.get(r) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function summarize(items: GradedItem[]): SliceSummary {
  const n = items.length;
  const coach_wins = items.filter((i) => i.outcome === "coach").length;
  const baseline_wins = items.filter((i) => i.outcome === "baseline").length;
  const ties = n - coach_wins - baseline_wins;
  const rate = n ? (coach_wins + ties / 2) / n : 0;
  return {
    n,
    coach_wins,
    baseline_wins,
    ties,
    coach_win_rate: Math.round(rate * 1000) / 1000,
    coach_win_rate_ci: wilson(rate, n).map(
      (x) => Math.round(x * 1000) / 1000,
    ) as [number, number],
    coach_mean: meanScores(items.map((i) => i.coach)),
    baseline_mean: meanScores(items.map((i) => i.baseline)),
    coach_loss_reasons: tally(items.map((i) => i.coach_loss_reasons)),
    baseline_loss_reasons: tally(items.map((i) => i.baseline_loss_reasons)),
  };
}
