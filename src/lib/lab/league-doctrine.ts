/**
 * Per-league doctrine override storage + resolution.
 *
 * Phase 2.4 of the doctrine integration. A user's global doctrine
 * lives in judgment_profiles (one row per user). A user with
 * multiple dynasty leagues can opt into per-league overrides: the
 * Win-Now Maxer veterans team plays differently from the Patient
 * Contender rookie team. Overrides cascade onto the global doctrine
 * at read time; any dial unset on the league row falls through to
 * global.
 *
 * Schema: migration 0013_league_doctrines.sql.
 * Resolution: resolveEffectiveDials() below; called by every surface
 * that needs the user's effective doctrine for a specific league.
 */

import { createClient } from "@/lib/supabase/server";
import {
  DIAL_SPECS,
  defaultProfile,
  type DialId,
  type DialValue,
  type JudgmentProfile,
} from "./dial-types";

export type LeagueDoctrineRow = {
  user_id: string;
  league_id: string;
  /** Sparse: only dials the user explicitly overrode for this league. */
  dials: Partial<Record<DialId, DialValue>>;
  notes: Partial<Record<DialId, string>>;
  /** Non-null means the user opted into per-league tuning for this league. */
  enabled_at: string | null;
  last_edited_at: string;
};

const VALID_DIAL_IDS = new Set<DialId>(DIAL_SPECS.map((s) => s.id));

function sanitizeDialMap(
  raw: unknown,
): Partial<Record<DialId, DialValue>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<DialId, DialValue>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_DIAL_IDS.has(k as DialId)) continue;
    if (
      typeof v === "number" ||
      typeof v === "string" ||
      Array.isArray(v)
    ) {
      out[k as DialId] = v as DialValue;
    }
  }
  return out;
}

function sanitizeNoteMap(raw: unknown): Partial<Record<DialId, string>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<DialId, string>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_DIAL_IDS.has(k as DialId)) continue;
    if (typeof v === "string" && v.trim()) out[k as DialId] = v;
  }
  return out;
}

/**
 * Read the user's per-league doctrine row. Returns null when no row
 * exists (user has never opted into per-league tuning for this
 * league). Caller should fall back to the global JudgmentProfile.
 */
export async function readLeagueDoctrine(
  userId: string,
  leagueId: string,
): Promise<LeagueDoctrineRow | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("league_doctrines")
      .select("user_id, league_id, dials, notes, enabled_at, last_edited_at")
      .eq("user_id", userId)
      .eq("league_id", leagueId)
      .maybeSingle();
    if (!data) return null;
    return {
      user_id: data.user_id as string,
      league_id: data.league_id as string,
      dials: sanitizeDialMap(data.dials),
      notes: sanitizeNoteMap(data.notes),
      enabled_at: (data.enabled_at as string | null) ?? null,
      last_edited_at: (data.last_edited_at as string) ?? new Date().toISOString(),
    };
  } catch (err) {
    console.error("[league-doctrine:read]", err);
    return null;
  }
}

/**
 * Upsert per-league doctrine overrides. When `enabled` is true and the
 * row didn't exist, sets enabled_at to now. When enabled is false,
 * sets enabled_at to null (user disabled per-league tuning).
 */
export async function writeLeagueDoctrine(args: {
  userId: string;
  leagueId: string;
  dials?: Partial<Record<DialId, DialValue>>;
  notes?: Partial<Record<DialId, string>>;
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const cleanDials = args.dials ? sanitizeDialMap(args.dials) : {};
    const cleanNotes = args.notes ? sanitizeNoteMap(args.notes) : {};
    const now = new Date().toISOString();
    const { error } = await supabase.from("league_doctrines").upsert(
      {
        user_id: args.userId,
        league_id: args.leagueId,
        dials: cleanDials,
        notes: cleanNotes,
        enabled_at: args.enabled ? now : null,
        last_edited_at: now,
      },
      { onConflict: "user_id,league_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    console.error("[league-doctrine:write]", err);
    return { ok: false, error: "write_failed" };
  }
}

/**
 * Resolve the user's effective dials for a specific league context.
 * When the per-league override is enabled, overlay its dials onto the
 * global profile; any dial unset on the league row falls through to
 * global. When not enabled, returns the global dials unchanged.
 *
 * This is the canonical resolver. Every surface that wants "the
 * user's doctrine for this league" goes through here.
 */
export function resolveEffectiveDials(
  global: JudgmentProfile["dials"],
  override: LeagueDoctrineRow | null,
): JudgmentProfile["dials"] {
  if (!override || !override.enabled_at) return global;
  const result = { ...global };
  for (const [k, v] of Object.entries(override.dials)) {
    if (v == null) continue;
    result[k as DialId] = v as DialValue;
  }
  return result;
}

/**
 * Convenience: load global + per-league rows and return effective
 * dials in one call. Used by every server-side surface that needs
 * the user's effective doctrine for a specific league.
 */
export async function loadEffectiveDials(args: {
  userId: string | null;
  leagueId: string;
  globalProfile: JudgmentProfile | null;
}): Promise<{
  effective: JudgmentProfile["dials"];
  override: LeagueDoctrineRow | null;
}> {
  const base = args.globalProfile?.dials ?? defaultProfile().dials;
  if (!args.userId) return { effective: base, override: null };
  const override = await readLeagueDoctrine(args.userId, args.leagueId);
  return {
    effective: resolveEffectiveDials(base, override),
    override,
  };
}
