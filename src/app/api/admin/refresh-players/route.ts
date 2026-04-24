/**
 * GET  /api/admin/refresh-players  → cache status
 * POST /api/admin/refresh-players  → force refresh from Sleeper
 *
 * Ops endpoint for the NFL Draft window. The players-blob cache is
 * normally on a 60-minute TTL; during the draft (Thursday R1, Friday
 * R2-3, Saturday R4-7) rookies flip from team:null to drafted state
 * faster than that and the founder needs to force a refresh between
 * rounds.
 *
 * Admin-only. Allow-list set via ADMIN_EMAILS env var.
 */

import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/admin";
import {
  forceRefreshPlayers,
  getCacheStatus,
} from "@/lib/players/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }
  return NextResponse.json({
    ok: true,
    cache: getCacheStatus(),
  });
}

export async function POST() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }
  try {
    const result = await forceRefreshPlayers();
    return NextResponse.json({ ok: true, refreshed: result });
  } catch (err) {
    console.error("[admin:refresh-players]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "refresh_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
