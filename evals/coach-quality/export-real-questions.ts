/**
 * Export one person's real Coach questions from production chat_history so
 * the quality eval can replay them. READ-ONLY against the database.
 *
 * Scoped to a single Sleeper username on purpose: per
 * .claude/agents/coach-quality.md, other users' questions stay out of the
 * test set until the privacy notice is live. Today that is Isaiah's own.
 *
 *   npx tsx --tsconfig tsconfig.json evals/coach-quality/export-real-questions.ts \
 *     --username <sleeper username> [--since 2026-09-01] [--max 60] [--append]
 *
 * Without --append it writes evals/coach-quality/out/real-questions.jsonl
 * (gitignored) for review. With --append it adds the questions to
 * docs/team/coach-quality/test-set.jsonl as source "isaiah", skipping any
 * question text already in the set.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).
 * Drops one-word / greeting messages and exact duplicates, and keeps at
 * most --max questions, newest first.
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAdminClient } from "@/lib/supabase/admin";
import { loadTestSet, TEST_SET_PATH } from "./testset";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const username = arg("username");
  if (!username) throw new Error("Pass --username <sleeper username> (one person's questions only).");
  const since = arg("since") ?? "2000-01-01";
  const max = Number(arg("max") ?? 60);
  const sb = getAdminClient();

  const { data: owners, error: oErr } = await sb
    .from("profiles")
    .select("id")
    .ilike("sleeper_username", username);
  if (oErr) throw new Error(`profiles read failed: ${oErr.message}`);
  const ownerIds = (owners ?? []).map((o) => o.id as string);
  if (!ownerIds.length) throw new Error(`No app profile has sleeper_username ${username}.`);

  const { data: rows, error } = await sb
    .from("chat_history")
    .select("user_id, league_id, content, created_at")
    .eq("role", "user")
    .in("user_id", ownerIds)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`chat_history read failed: ${error.message}`);

  const seen = new Set<string>();
  const out: Array<{ league_id: string; message: string; created_at: string }> = [];
  for (const r of rows ?? []) {
    const message = String(r.content ?? "").trim();
    const key = message.toLowerCase();
    if (message.length < 15 || message.split(/\s+/).length < 4 || seen.has(key)) continue;
    seen.add(key);
    out.push({ league_id: r.league_id as string, message, created_at: r.created_at as string });
    if (out.length >= max) break;
  }

  if (flag("append")) {
    const existing = loadTestSet();
    const known = new Set(existing.map((q) => q.question.trim().toLowerCase()));
    let n = existing.filter((q) => q.source === "isaiah").length;
    const today = new Date().toISOString().slice(0, 10);
    const lines = out
      .filter((o) => !known.has(o.message.toLowerCase()))
      .map((o) =>
        JSON.stringify({
          id: `isaiah-${String(++n).padStart(3, "0")}`,
          source: "isaiah",
          league_fixture: o.league_id,
          username,
          stage: "in_season",
          category: "real",
          question: o.message,
          must_include: [],
          must_not: [],
          added: today,
        }),
      );
    if (lines.length) appendFileSync(TEST_SET_PATH, lines.join("\n") + "\n");
    console.log(`${rows?.length ?? 0} messages read; appended ${lines.length} new questions to ${TEST_SET_PATH}.`);
    return;
  }

  const dir = join("evals", "coach-quality", "out");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "real-questions.jsonl");
  writeFileSync(path, out.map((o) => JSON.stringify(o)).join("\n") + "\n");
  console.log(`${rows?.length ?? 0} messages read; kept ${out.length} -> ${path} (review, then rerun with --append).`);
}

main().catch((e) => {
  const err = e as Error;
  console.error(err.message, err.stack);
  process.exit(1);
});
