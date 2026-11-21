/**
 * Health + deploy identity for the post-deploy tripwire.
 *
 * Public: `{ ok, commit, env }`, so the tripwire can tell when the new
 * commit is live. With `Authorization: Bearer <HEALTH_TOKEN>` it also
 * returns `server_errors` (this commit's captured server errors over the
 * last `minutes`, default 10, max 60) and, with `?commit=<sha>`, the
 * same count for another commit (the baseline the deploy replaced).
 */

import { NextResponse } from "next/server";
import { deployedCommit, readServerErrors } from "@/lib/ops/error-counter";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const commit = deployedCommit();
  const body: Record<string, unknown> = {
    ok: true,
    commit,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };

  const token = process.env.HEALTH_TOKEN;
  const auth = req.headers.get("authorization");
  if (token && auth === `Bearer ${token}`) {
    const raw = Number.parseInt(url.searchParams.get("minutes") ?? "10", 10);
    const minutes = Number.isFinite(raw) ? Math.min(60, Math.max(1, raw)) : 10;
    const target = url.searchParams.get("commit") || commit;
    body.minutes = minutes;
    body.errors_commit = target;
    body.server_errors = await readServerErrors(target, minutes);
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
