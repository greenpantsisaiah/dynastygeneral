/**
 * Client error beacon. The app's error boundaries (app/error.tsx,
 * app/global-error.tsx) post here when a page crashes in the browser, so
 * a crash a user sees becomes an incident even though it never reached a
 * server log (docs/team/INCIDENTS.md).
 *
 * Public by necessity (the browser calls it). Abuse limits: body capped at
 * 4 KB, fields truncated, and the incident recorder dedupes and throttles
 * per fingerprint, so a flood writes one incident with a large count.
 */

import { NextResponse } from "next/server";
import { recordIncident } from "@/lib/ops/incidents";

export const dynamic = "force-dynamic";

const MAX_BODY = 4096;

function str(v: unknown, n: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, n) : null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    const text = (await req.text()).slice(0, MAX_BODY);
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const message = str(body.message, 300);
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });
  const path = str(body.path, 200)?.split("?")[0] ?? null;
  // Group by the route shape, not the concrete id, so one broken page is one incident.
  const routeKey = (path ?? "unknown").replace(/\/\d{3,}(?=\/|$)/g, "/[id]");
  await recordIncident({
    source: "client_error",
    key: `${str(body.boundary, 20) ?? "error"}:${routeKey}`,
    message,
    context: { path, digest: str(body.digest, 40), stack: str(body.stack, 300) },
  });
  return NextResponse.json({ ok: true });
}
