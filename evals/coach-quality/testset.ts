/**
 * Coach quality eval: the test set loader.
 *
 * The test set lives in docs/team/coach-quality/test-set.jsonl (schema in
 * .claude/agents/coach-quality.md), one question per line. This harness
 * adds a few optional fields on top of that schema:
 *
 * - league_fixture: a Sleeper league id, or "user-leagues" (rotate across
 *   every league of --username), or "user-leagues:portfolio" (a question
 *   about the user's whole set of leagues; asked inside the primary league
 *   because Coach is per-league today, and scored as its own slice).
 * - category: topic bucket for the report.
 * - mentions_opponents: which opponent placeholders the question names, so
 *   the baseline paste includes those rosters.
 *
 * Placeholders in {braces} fill per league from the Coach context (fill.ts).
 */

import { readFileSync } from "node:fs";

export const TEST_SET_PATH = "docs/team/coach-quality/test-set.jsonl";

export type TestQuestion = {
  id: string;
  source: "isaiah" | "user" | "synthetic";
  league_fixture: string;
  stage: "in_season" | "draft" | "offseason";
  question: string;
  must_include: string[];
  must_not: string[];
  added: string;
  category?: string;
  mentions_opponents?: Array<"opp_a" | "opp_b">;
  /** Sleeper username for a fixed-league question (defaults to --username). */
  username?: string;
};

export const PORTFOLIO_FIXTURE = "user-leagues:portfolio";
export const ROTATE_FIXTURE = "user-leagues";

export function parseTestSet(text: string): TestQuestion[] {
  const out: TestQuestion[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const q = JSON.parse(line) as TestQuestion;
    if (!q.id || !q.question || !q.league_fixture) {
      throw new Error(`test-set line ${i + 1}: id, question, and league_fixture are required`);
    }
    if (seen.has(q.id)) throw new Error(`test-set line ${i + 1}: duplicate id ${q.id}`);
    seen.add(q.id);
    out.push({ ...q, must_include: q.must_include ?? [], must_not: q.must_not ?? [] });
  });
  return out;
}

export function loadTestSet(path = TEST_SET_PATH): TestQuestion[] {
  return parseTestSet(readFileSync(path, "utf-8"));
}

/** Deterministic phrase checks from the test set (case-insensitive). */
export function phraseChecks(
  answer: string,
  q: Pick<TestQuestion, "must_include" | "must_not">,
) {
  const a = answer.toLowerCase();
  return {
    missing: q.must_include.filter((p) => !a.includes(p.toLowerCase())),
    banned_hits: q.must_not.filter((p) => a.includes(p.toLowerCase())),
  };
}
