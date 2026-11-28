/**
 * Client error beacon. The app's error boundaries (app/error.tsx,
 * app/global-error.tsx) post here when a page crashes in the browser, so
 * a crash a user sees becomes an incident even though it never reached a
 * server log (docs/team/INCIDENTS.md).
 *
 * Public by necessity (the browser calls it). Abuse limits (issue #162):
 * same-origin check, a per-IP rate limit, body capped at 4 KB, fields
 * truncated, route keys collapsed to a bounded shape, and a cap on new
 * client fingerprints per hour (the excess folds into one overflow
 * incident). The recorder then dedupes and throttles per fingerprint, so
 * a flood writes one incident with a large count.
 */

import { NextResponse } from "next/server";
import { admitClientIncident, recordIncident } from "@/lib/ops/incidents";
import { isSameOriginBeacon, routeKeyFor } from "@/lib/ops/client-error-guard";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const MAX_BODY = 4096;

function str(v: unknown, n: number): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, n) : null;
}

export async function POST(req: Request) {
  if (!isSameOriginBeacon(req.headers)) return NextResponse.json({ ok: false }, { status: 403 });
  const rate = await checkRateLimit("client-error", clientIpFrom(req));
  if (!rate.allowed) return NextResponse.json({ ok: false }, { status: 429 });
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
  const routeKey = routeKeyFor(path);
  const boundary = body.boundary === "global" ? "global" : "page";
  const input = await admitClientIncident({
    source: "client_error",
    key: `${boundary}:${routeKey}`,
    message,
    context: { path, digest: str(body.digest, 40), stack: str(body.stack, 300) },
  });
  await recordIncident(input);
  return NextResponse.json({ ok: true });
}
