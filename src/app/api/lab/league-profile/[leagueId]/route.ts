/**
 * GET   /api/lab/league-profile/[leagueId]    Read the per-league override row
 * POST  /api/lab/league-profile/[leagueId]    Upsert overrides
 * DELETE /api/lab/league-profile/[leagueId]   Disable per-league tuning
 *
 * Per-league doctrine override storage. The user's global doctrine
 * lives at /api/soundboard/profile (path stable; internal naming
 * lab/). Per-league rows cascade onto global at read time via
 * resolveEffectiveDials() in src/lib/lab/league-doctrine.ts.
 *
 * Auth required for every method. Rate-limited via the soundboard
 * bucket (reuses the existing dial-write rate limit since this is
 * structurally the same operation, just scoped to a league).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser } from "@/lib/auth/session";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { isValidLeagueId } from "@/lib/sleeper/validate";
import {
  readLeagueDoctrine,
  writeLeagueDoctrine,
} from "@/lib/lab/league-doctrine";

export const runtime = "nodejs";

const dialValueSchema = z.union([
  z.number(),
  z.string(),
  z.tuple([z.number(), z.number()]),
  z.array(z.string()),
]);

const bodySchema = z.object({
  dials: z.record(z.string(), dialValueSchema).optional(),
  notes: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json({ error: "invalid_league_id" }, { status: 400 });
  }
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const rate = await checkRateLimit("soundboard", clientIpFrom(req));
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const row = await readLeagueDoctrine(user.id, leagueId);
  return NextResponse.json({ override: row });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json({ error: "invalid_league_id" }, { status: 400 });
  }
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const rate = await checkRateLimit("soundboard", clientIpFrom(req));
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const result = await writeLeagueDoctrine({
    userId: user.id,
    leagueId,
    dials: parsed.data.dials as Partial<Record<string, unknown>> as never,
    notes: parsed.data.notes,
    enabled: parsed.data.enabled,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  const row = await readLeagueDoctrine(user.id, leagueId);
  return NextResponse.json({ override: row });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json({ error: "invalid_league_id" }, { status: 400 });
  }
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const rate = await checkRateLimit("soundboard", clientIpFrom(req));
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  // Disable rather than delete so the user's previously-saved
  // override values survive a toggle-off / toggle-on cycle. Setting
  // enabled_at to null makes resolveEffectiveDials() fall through to
  // global; the dials JSON stays for the user to re-enable later.
  const result = await writeLeagueDoctrine({
    userId: user.id,
    leagueId,
    enabled: false,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
