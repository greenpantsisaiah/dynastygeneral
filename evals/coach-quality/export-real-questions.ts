/**
 * Export real Coach questions from production chat_history so the quality
 * eval can replay them. READ-ONLY: selects user-role messages, joins the
 * asker's saved Sleeper username, and writes JSONL to the gitignored out/
 * folder (these are real user messages; they never get committed).
 *
 *   npx tsx --tsconfig tsconfig.json evals/coach-quality/export-real-questions.ts \
 *     [--since 2026-09-01] [--max 60]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).
 * Drops one-word / greeting messages and exact duplicates, and keeps at
 * most --max questions, newest first.
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });
dotenv({ path: ".env" });

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAdminClient } from "@/lib/supabase/admin";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const since = arg("since") ?? "2000-01-01";
  const max = Number(arg("max") ?? 60);
  const sb = getAdminClient();

  const { data: rows, error } = await sb
    .from("chat_history")
    .select("user_id, league_id, content, created_at")
    .eq("role", "user")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`chat_history read failed: ${error.message}`);

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  const { data: profiles, error: pErr } = await sb
    .from("profiles")
    .select("id, sleeper_username")
    .in("id", userIds);
  if (pErr) throw new Error(`profiles read failed: ${pErr.message}`);
  const usernameOf = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.sleeper_username as string | null) ?? null]),
  );

  const seen = new Set<string>();
  const out: Array<{ league_id: string; username: string; message: string; created_at: string }> = [];
  let noUsername = 0;
  for (const r of rows ?? []) {
    const message = String(r.content ?? "").trim();
    const key = message.toLowerCase();
    if (message.length < 15 || message.split(/\s+/).length < 4 || seen.has(key)) continue;
    const username = usernameOf.get(r.user_id as string);
    if (!username) {
      noUsername++;
      continue;
    }
    seen.add(key);
    out.push({ league_id: r.league_id as string, username, message, created_at: r.created_at as string });
    if (out.length >= max) break;
  }

  const dir = join("evals", "coach-quality", "out");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "real-questions.jsonl");
  writeFileSync(path, out.map((o) => JSON.stringify(o)).join("\n") + "\n");
  console.log(
    `${rows?.length ?? 0} user messages read; kept ${out.length} (skipped ${noUsername} with no saved Sleeper username) -> ${path}`,
  );
}

main().catch((e) => {
  const err = e as Error;
  console.error(err.message, err.stack);
  process.exit(1);
});
