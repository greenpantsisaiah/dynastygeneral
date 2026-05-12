/**
 * GET    /api/briefings/[leagueId]/pinned    list pinned briefings
 * POST   /api/briefings/[leagueId]/pinned    pin one (full payload)
 * DELETE /api/briefings/[leagueId]/pinned?id=...  unpin one
 *
 * War Room persistence for Pro users. The briefing feed itself stays
 * in localStorage (always-fresh, retention-capped, ephemeral by
 * design). Pinned briefings are the user's curated insights pane;
 * losing them on a browser cache clear or device switch is a real
 * loss, so Pro tier mirrors them server-side.
 *
 * Free + anonymous users see a quiet empty list on GET and a 401 on
 * POST/DELETE. The client falls back to localStorage-only.
 *
 * Schema match: `pinned_briefings` table (migration 0002). The DB
 * unique constraint is (user_id, briefing_id) so pin is upsert-by-id;
 * unpin is a simple delete by briefing_id.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isValidLeagueId } from "@/lib/sleeper/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PINNED = 50; // soft cap; matches feed retention so we never balloon
// Per-row payload ceilings. Per security-auditor 2026-05-12: prior
// z.unknown() with no size cap let a Pro user POST multi-megabyte
// `data` payloads, stored verbatim and re-rendered on GET. Stored XSS
// is not exploitable today (no dangerouslySetInnerHTML in any
// renderer + React's default JSX escaping) but the resource-abuse
// vector is real.
const DATA_MAX_BYTES = 20_480; // 20KB serialized

const pinSchema = z.object({
  briefing_id: z.string().min(1).max(128),
  kind: z.string().min(1).max(32),
  severity: z.string().min(1).max(32),
  headline: z.string().min(1).max(280),
  body: z.string().max(8000).optional().nullable(),
  // Per-kind payload (TierData | QuadrantData | etc). JSON-serializable
  // structure; the renderer is responsible for tolerating shape drift
  // from older pinned rows. NEVER store raw HTML strings here.
  data: z
    .unknown()
    .optional()
    .nullable()
    .refine(
      (v) => v == null || JSON.stringify(v).length <= DATA_MAX_BYTES,
      { message: "data_too_large" },
    ),
});

type PinnedRow = {
  briefing_id: string;
  kind: string;
  severity: string;
  headline: string;
  body: string | null;
  data: unknown;
  pinned_at: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json({ pinned: [] });
  }

  const user = await getOptionalUser();
  if (!user || user.tier !== "pro") {
    return NextResponse.json({ pinned: [] });
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("pinned_briefings")
      .select("briefing_id, kind, severity, headline, body, data, pinned_at")
      .eq("user_id", user.id)
      .eq("league_id", leagueId)
      .order("pinned_at", { ascending: false })
      .limit(MAX_PINNED);
    return NextResponse.json({ pinned: (data ?? []) as PinnedRow[] });
  } catch (err) {
    console.error("[briefings:pinned:get]", err);
    return NextResponse.json({ pinned: [] });
  }
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
      { ok: false, error: "auth_required" },
      { status: 401 },
    );
  }
  if (user.tier !== "pro") {
    // Free users still get localStorage pinning client-side; the
    // server simply won't store. Return 200 so the client doesn't
    // surface an error.
    return NextResponse.json({ ok: true, persisted: false });
  }

  const json = await req.json().catch(() => null);
  const parsed = pinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("pinned_briefings").upsert(
      {
        user_id: user.id,
        league_id: leagueId,
        briefing_id: parsed.data.briefing_id,
        kind: parsed.data.kind,
        severity: parsed.data.severity,
        headline: parsed.data.headline,
        body: parsed.data.body ?? null,
        data: parsed.data.data ?? null,
      },
      { onConflict: "user_id,briefing_id" },
    );
    if (error) {
      console.error("[briefings:pinned:post]", error.message);
      return NextResponse.json(
        { ok: false, error: "persist_failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, persisted: true });
  } catch (err) {
    console.error("[briefings:pinned:post]", err);
    return NextResponse.json(
      { ok: false, error: "persist_failed" },
      { status: 500 },
    );
  }
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
  if (user.tier !== "pro") {
    // Same logic as POST: nothing to delete server-side; client
    // already removed from localStorage. Don't error.
    return NextResponse.json({ ok: true });
  }

  const url = new URL(req.url);
  const briefingId = url.searchParams.get("id");
  if (!briefingId || briefingId.length > 128) {
    return NextResponse.json(
      { ok: false, error: "missing_id" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("pinned_briefings")
      .delete()
      .eq("user_id", user.id)
      .eq("league_id", leagueId)
      .eq("briefing_id", briefingId);
    if (error) {
      console.error("[briefings:pinned:delete]", error.message);
      return NextResponse.json(
        { ok: false, error: "delete_failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[briefings:pinned:delete]", err);
    return NextResponse.json(
      { ok: false, error: "delete_failed" },
      { status: 500 },
    );
  }
}
