/**
 * GET /api/coach/[leagueId]/history
 * DELETE /api/coach/[leagueId]/history
 *
 * GET returns the authenticated user's server-side chat history for one
 * league. Pro feature: free users get localStorage-only and don't
 * call this endpoint. Quietly returns an empty list when:
 *   - The user isn't authenticated (anonymous; just use localStorage).
 *   - Supabase isn't configured (dev / misconfigured prod).
 *   - The user has no prior chat in this league.
 *
 * Never errors loud: a missing server history should degrade to
 * localStorage, not break the chat UI.
 *
 * DELETE purges all server-side chat history for the user in this
 * league. Honors the user's explicit ask to forget. Returns 200 even
 * when there was nothing to delete (idempotent). Per security-auditor
 * 2026-04-23 MEDIUM (privacy: chats persist server-side without an
 * opt-out path).
 */

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isValidLeagueId } from "@/lib/sleeper/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY = 30; // matches the client's MAX_HISTORY cap

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json({ messages: [] });
  }

  const user = await getOptionalUser();
  if (!user || user.tier !== "pro") {
    return NextResponse.json({ messages: [] });
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("chat_history")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .eq("league_id", leagueId)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY);

    const messages = (data ?? []).map((row: {
      role: string;
      content: string;
      created_at: string;
    }) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
      ts: new Date(row.created_at).getTime(),
    }));
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[coach:history]", err);
    return NextResponse.json({ messages: [] });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_league_id" },
      { status: 400 },
    );
  }

  // Auth gate: only the row owner can purge their own history. Free
  // users have nothing on the server to delete; treat as no-op success
  // so the UI affordance can be unconditional.
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "auth_required" },
      { status: 401 },
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("chat_history")
      .delete()
      .eq("user_id", user.id)
      .eq("league_id", leagueId);
    if (error) {
      console.error("[coach:history:delete]", error.message);
      return NextResponse.json(
        { ok: false, error: "delete_failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[coach:history:delete]", err);
    return NextResponse.json(
      { ok: false, error: "delete_failed" },
      { status: 500 },
    );
  }
}
