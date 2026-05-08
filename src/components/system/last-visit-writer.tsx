"use client";

/**
 * Client-side last-visit fingerprint writer.
 *
 * The hub server component computes the current snapshot's fingerprint
 * (standing_call_id, total_picks_made, ev_bank_total, my_roster_size,
 * plan_player_ids) and passes it as props. After mount, this component
 * POSTs the fingerprint to /api/last-visit which sets the cookie.
 *
 * Why client-side: server components in Next.js cannot mutate cookies
 * during render. A route handler is required. This component fires the
 * write once per render, fire-and-forget.
 *
 * Visual: invisible. Returns null. The Bridge surface (redesigned)
 * reads the cookie server-side on the next render and renders the
 * "Since [time]: ..." digest line + plan-disruption acknowledgment.
 */

import { useEffect, useRef } from "react";
import type { LastVisitFingerprint } from "@/lib/last-visit/cookie";

export function LastVisitWriter({
  leagueId,
  fingerprint,
}: {
  leagueId: string;
  fingerprint: LastVisitFingerprint;
}) {
  // Fingerprint payload changes on every render because of `ts`.
  // Use a ref to fire only once per mount + per content-change.
  const lastWrittenSig = useRef<string | null>(null);

  useEffect(() => {
    const sig = JSON.stringify({
      leagueId,
      total: fingerprint.total_picks_made,
      sc: fingerprint.standing_call_id,
      ev: fingerprint.ev_bank_total,
      ms: fingerprint.my_roster_size,
      plan: fingerprint.plan_player_ids?.join(",") ?? "",
    });
    if (lastWrittenSig.current === sig) return;
    lastWrittenSig.current = sig;

    const controller = new AbortController();
    fetch("/api/last-visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league_id: leagueId, fingerprint }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget. Rate limit / network errors are non-blocking.
    });
    return () => controller.abort();
  }, [
    leagueId,
    fingerprint,
  ]);

  return null;
}
