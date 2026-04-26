/**
 * JudgmentProfile storage. Two layers:
 *   - cookie mirror (`dg_judgment`) so server-rendered surfaces can
 *     read dial values without a DB round-trip
 *   - Supabase `judgment_profiles` row for cross-device durability
 *
 * Server-only. Client writes go through POST /api/soundboard/profile
 * which updates both layers.
 */

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  DIAL_SPECS,
  defaultProfile,
  type DialId,
  type JudgmentProfile,
} from "./types";

const COOKIE_NAME = "dg_judgment";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 180; // 180 days

function safeParseProfile(raw: string | undefined): JudgmentProfile | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw));
    if (!obj || typeof obj !== "object") return null;
    const dials = (obj.dials ?? {}) as Record<string, number | string>;
    // Sanity: drop any keys that aren't known dial IDs, fill missing
    // ones from defaults. This way an old cookie surviving a dial
    // rename doesn't poison the profile shape.
    const validIds = new Set<DialId>(DIAL_SPECS.map((s) => s.id));
    const merged = defaultProfile();
    for (const [k, v] of Object.entries(dials)) {
      if (validIds.has(k as DialId)) {
        merged.dials[k as DialId] = v;
      }
    }
    merged.last_edited_at =
      typeof obj.last_edited_at === "string" ? obj.last_edited_at : null;
    return merged;
  } catch {
    return null;
  }
}

/**
 * Read the current user's profile. Cookie is checked first (no DB
 * round-trip on the hot path); falls through to Supabase for signed-in
 * users when the cookie is absent. Returns the default profile when
 * neither layer has a value.
 */
export async function readProfileServer(): Promise<JudgmentProfile> {
  const store = await cookies();
  const fromCookie = safeParseProfile(store.get(COOKIE_NAME)?.value);
  if (fromCookie) return fromCookie;
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return defaultProfile();
    const { data } = await supabase
      .from("judgment_profiles")
      .select("dials, last_edited_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!data) return defaultProfile();
    const merged = defaultProfile();
    const incoming = (data.dials as Record<string, number | string>) ?? {};
    const validIds = new Set<DialId>(DIAL_SPECS.map((s) => s.id));
    for (const [k, v] of Object.entries(incoming)) {
      if (validIds.has(k as DialId)) {
        merged.dials[k as DialId] = v;
      }
    }
    merged.last_edited_at =
      (data.last_edited_at as string | null) ?? null;
    return merged;
  } catch (err) {
    console.error("[soundboard:read]", err);
    return defaultProfile();
  }
}

/**
 * Persist a profile to BOTH cookie and Supabase row (when signed in).
 * Cookie is always written so anonymous users still get persistence
 * across server-rendered surfaces.
 */
export async function writeProfileServer(
  profile: JudgmentProfile,
): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encodeURIComponent(JSON.stringify(profile)), {
    maxAge: COOKIE_MAX_AGE_S,
    path: "/",
    sameSite: "lax",
  });
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    await supabase.from("judgment_profiles").upsert({
      user_id: auth.user.id,
      dials: profile.dials,
      last_edited_at: profile.last_edited_at,
    });
  } catch (err) {
    console.error("[soundboard:write]", err);
  }
}
