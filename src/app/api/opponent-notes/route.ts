/**
 * Opponent notes API.
 *
 *   GET  /api/opponent-notes?leagueId=...   Read all for the user
 *   POST /api/opponent-notes                Create one
 *   DELETE /api/opponent-notes?id=...       Delete one (own only)
 *
 * Persists user notes about counterparty stated plans, trade intent,
 * trigger conditions, and psychological reads. Coach reads them via
 * `opponents[].notes` in its context payload. Per opponent-dossier
 * moat pattern: this is the foundation table; the dossier accretes
 * on top of it.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser } from "@/lib/auth/session";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { isValidLeagueId } from "@/lib/sleeper/validate";
import {
  OPPONENT_NOTE_BODY_MAX,
  OPPONENT_NOTE_KINDS,
  createOpponentNote,
  deleteOpponentNote,
  readOpponentNotesForLeague,
} from "@/lib/opponent-notes/storage";

export const runtime = "nodejs";

// Match the canonical Sleeper league_id shape (alphanumeric + `_` + `-`,
// 1-32 chars). Mirrors `isValidLeagueId`. Without this guard, malformed
// strings reach the Coach context payload via opponents[].notes which
// is a prompt-injection surface.
const LEAGUE_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;

const createBodySchema = z.object({
  league_id: z.string().regex(LEAGUE_ID_RE),
  opponent_roster_id: z.number().int().positive(),
  body: z.string().min(1).max(OPPONENT_NOTE_BODY_MAX),
  kind: z.enum(OPPONENT_NOTE_KINDS).default("stated_plan"),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const url = new URL(req.url);
  const leagueId = url.searchParams.get("leagueId");
  if (!leagueId || !isValidLeagueId(leagueId)) {
    return NextResponse.json(
      { error: "leagueId required" },
      { status: 400 },
    );
  }
  const notes = await readOpponentNotesForLeague({
    userId: user.id,
    leagueId,
  });
  return NextResponse.json({ notes });
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const ip = clientIpFrom(req);
  const rate = await checkRateLimit("opponent-notes", ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
  }
  let parsed: z.infer<typeof createBodySchema>;
  try {
    const json = await req.json();
    parsed = createBodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: err instanceof Error ? err.message : "parse error" },
      { status: 400 },
    );
  }
  const result = await createOpponentNote({
    userId: user.id,
    leagueId: parsed.league_id,
    opponentRosterId: parsed.opponent_roster_id,
    body: parsed.body,
    kind: parsed.kind,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const result = await deleteOpponentNote({ userId: user.id, noteId: id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
