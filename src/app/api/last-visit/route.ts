/**
 * POST /api/last-visit
 *
 * Persist the per-league last-visit fingerprint cookie. Body:
 *   { league_id, fingerprint: LastVisitFingerprint }
 *
 * Public (no auth required); the cookie is per-browser. Light rate
 * limit so a malformed client can't write hundreds of times per
 * minute. Cookie is per-league so a user with multiple leagues
 * sees per-league deltas.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildLastVisitCookie } from "@/lib/last-visit/cookie";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";

const fingerprintSchema = z.object({
  v: z.literal(1),
  ts: z.string(),
  total_picks_made: z.number().int().nonnegative(),
  standing_call_id: z.string().nullable(),
  ev_bank_total: z.number().nullable(),
  my_roster_size: z.number().int().nonnegative(),
  plan_player_ids: z.array(z.string()).max(20).optional(),
});

const bodySchema = z.object({
  league_id: z.string().min(1).max(64),
  fingerprint: fingerprintSchema,
});

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIpFrom(req);
  const rate = await checkRateLimit("last-visit", ip);
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    parsed = bodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: err instanceof Error ? err.message : "parse error" },
      { status: 400 },
    );
  }
  const { name, value, options } = buildLastVisitCookie(
    parsed.league_id,
    parsed.fingerprint,
  );
  const res = NextResponse.json({ ok: true });
  res.cookies.set(name, value, options);
  return res;
}
