/**
 * Per-league last-visit snapshot cookie.
 *
 * Per design principle 11 (stable shape, variable content, visible
 * delta): the hub is a workspace returning users live in, not a
 * magazine. The product must surface what changed since the user
 * last looked, in 1.5 seconds, without making them re-read the story.
 *
 * This module persists a small fingerprint of the league state on
 * each hub render, then on the next render diffs the fingerprints to
 * produce a `delta_since_last_visit` digest. Cookie-mirrored so
 * server-rendered surfaces can render the digest without a client
 * round-trip.
 *
 * Per-league key so a user with multiple leagues sees per-league
 * deltas, not a single shared "last visit anywhere."
 */

import { cookies } from "next/headers";

export const LAST_VISIT_COOKIE_PREFIX = "dg_lv_";
const LAST_VISIT_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days; expires gracefully

/**
 * The fingerprint we store. Small enough to fit in a cookie (cookies
 * cap around 4KB; this should stay under 1KB even with 12 rosters).
 *
 * Versioned so a future shape change can ignore old cookies cleanly.
 */
export type LastVisitFingerprint = {
  v: 1;
  ts: string; // ISO timestamp
  // Total picks made across the entire draft (lets us compute "N
  // picks made since you were last here").
  total_picks_made: number;
  // The standing-call player_id from the last render. Lets us flag
  // when the standing call has shifted.
  standing_call_id: string | null;
  // EV bank total at last render. Lets us compute a delta and flag
  // movement.
  ev_bank_total: number | null;
  // The user's roster size at last render. Lets us detect whether
  // the user themselves picked since last visit.
  my_roster_size: number;
  // Player IDs that were in the user's plan at last render
  // (standing call + top_candidates + next_picks_plan targets,
  // deduped, capped at 20). When a plan player gets drafted by
  // another roster between visits, plan-disruption detection
  // surfaces the "they grabbed X" acknowledgment. Optional; older
  // cookies without this field are treated as no-prior-plan.
  plan_player_ids?: string[];
  // Per-lane state at last render. Used to surface lane-state
  // transitions ("Win-Now Floor: CLOSE -> IN since last visit").
  // Map of lane_id -> state. Optional; older cookies without this
  // field are treated as no-prior-state and render no transition
  // markers.
  lane_states?: Record<string, "in" | "close" | "not_in">;
};

function cookieNameFor(leagueId: string): string {
  return `${LAST_VISIT_COOKIE_PREFIX}${leagueId}`;
}

export async function readLastVisit(
  leagueId: string,
): Promise<LastVisitFingerprint | null> {
  try {
    const store = await cookies();
    const raw = store.get(cookieNameFor(leagueId))?.value;
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed?.v === 1) return parsed as LastVisitFingerprint;
  } catch {
    // Malformed cookie; treat as no last visit.
  }
  return null;
}

/**
 * Build the Set-Cookie payload for the next render's fingerprint.
 * The hub server component should compute this from the current
 * snapshot state and set the cookie before rendering.
 */
export function buildLastVisitCookie(
  leagueId: string,
  fingerprint: LastVisitFingerprint,
): {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
  };
} {
  return {
    name: cookieNameFor(leagueId),
    value: encodeURIComponent(JSON.stringify(fingerprint)),
    options: {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LAST_VISIT_MAX_AGE_S,
    },
  };
}
