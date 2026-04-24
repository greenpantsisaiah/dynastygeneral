/**
 * GET    /api/leagues/[leagueId]/path-commitment?season=2026
 *        Returns active commitment + recent chronicle, or empty.
 *
 * POST   /api/leagues/[leagueId]/path-commitment
 *        body: { season, archetype_id, archetype_name,
 *                committed_at_pick_no, viability, state }
 *        Creates a new commitment. Anonymous returns 401 (the
 *        sign-in conversion moment). Refuses if active commitment
 *        already exists; client should DELETE first.
 *
 * DELETE /api/leagues/[leagueId]/path-commitment
 *        body: { commitment_id }
 *        Marks the commitment abandoned. Doesn't delete (preserves
 *        history for future cross-league/multi-year insight).
 *
 * Auth required for POST/DELETE. GET returns empty for anonymous.
 *
 * No tier gating: free signed-in users get path commitments. The
 * Pro perk is cross-device sync, which the user gets automatically
 * because the data is server-side. Future Pro perks: longer
 * chronicle history, cross-league insight, exportable timeline.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser } from "@/lib/auth/session";
import { isValidLeagueId } from "@/lib/sleeper/validate";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  abandonCommitment,
  createCommitment,
  getActiveCommitment,
} from "@/lib/strategy/path-commitment/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATES = ["open", "narrowing", "closing", "closed"] as const;

const postSchema = z.object({
  season: z.string().min(4).max(8),
  archetype_id: z.string().min(1).max(64),
  archetype_name: z.string().min(1).max(80),
  committed_at_pick_no: z.number().int().min(1).max(500).nullable().optional(),
  viability: z.number().int().min(0).max(100),
  state: z.enum(VALID_STATES),
});

const deleteSchema = z.object({
  commitment_id: z.string().uuid(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json({ active: null });
  }
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ active: null });
  }
  const url = new URL(req.url);
  const season = url.searchParams.get("season")?.trim();
  if (!season) {
    return NextResponse.json(
      { ok: false, error: "missing_season" },
      { status: 400 },
    );
  }
  const active = await getActiveCommitment(user.id, leagueId, season);
  return NextResponse.json({ active });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_league_id" },
      { status: 400 },
    );
  }
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
        message: "Sign in to commit a path. Your chronicle follows you across the season.",
        action: "sign_in",
        login_url: "/login",
      },
      { status: 401 },
    );
  }
  const rate = await checkRateLimit("account-action", `user:${user.id}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }
  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }
  const result = await createCommitment(user.id, {
    league_id: leagueId,
    season: parsed.data.season,
    archetype_id: parsed.data.archetype_id,
    archetype_name: parsed.data.archetype_name,
    committed_at_pick_no: parsed.data.committed_at_pick_no ?? null,
    viability: parsed.data.viability,
    state: parsed.data.state,
  });
  if (!result.ok) {
    const status = result.error === "active_commitment_exists" ? 409 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, commitment: result.commitment });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_league_id" },
      { status: 400 },
    );
  }
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "auth_required" },
      { status: 401 },
    );
  }
  const rate = await checkRateLimit("account-action", `user:${user.id}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }
  const json = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }
  const result = await abandonCommitment(user.id, parsed.data.commitment_id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "abandon_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
