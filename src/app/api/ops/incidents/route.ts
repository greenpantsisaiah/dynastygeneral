/**
 * Incident log read for the hourly incident watch
 * (.github/workflows/incident-watch.yml, docs/team/INCIDENTS.md).
 *
 * Requires `Authorization: Bearer <HEALTH_TOKEN>`. Returns incidents seen
 * in the last `hours` (default 24, max 720) and the cron heartbeats.
 */

import { NextResponse } from "next/server";
import { CRON_NAMES, readCronHeartbeats, readIncidents } from "@/lib/ops/incidents";
import { deployedCommit } from "@/lib/ops/error-counter";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = process.env.HEALTH_TOKEN?.trim();
  const auth = req.headers.get("authorization")?.trim();
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const raw = Number.parseInt(url.searchParams.get("hours") ?? "24", 10);
  const hours = Number.isFinite(raw) ? Math.min(720, Math.max(1, raw)) : 24;
  const since = Date.now() - hours * 3_600_000;
  const [incidents, crons] = await Promise.all([readIncidents(since), readCronHeartbeats(CRON_NAMES)]);
  return NextResponse.json(
    {
      ok: true,
      commit: deployedCommit(),
      hours,
      store: incidents === null ? "unavailable" : "upstash",
      incidents: incidents ?? [],
      cron_last_ok: crons ?? {},
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
