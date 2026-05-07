/**
 * Shared trade verdict service. Server-only.
 *
 * Creates and retrieves persistent shareable URLs for trade verdicts.
 * The user clicks "Share verdict" on a result card, we save the
 * frozen output payload here, mint a short_code, and return a public
 * URL at /t/{short_code}.
 *
 * Why this exists (per CANONICAL_SOURCES + product memory): KTC owns
 * trade analysis because people screenshot. We make the URL itself
 * the asset. Every share carries a methodology link and the
 * published backtest accuracy, so each shared verdict markets the
 * engine while it answers a single user's question.
 *
 * Privacy posture (founder decision 2026-05-07):
 *   - Logged-in users only can create
 *   - Anyone with the URL can view (anonymous viewing)
 *   - Public render strips user-identifying info (no email, no
 *     sleeper username; team display is shown because it's already
 *     public on Sleeper)
 *   - 365-day expiration (lazy cleanup on access)
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  TradeIncomingOutput,
  TradeOutboundOutput,
} from "@/lib/engine/schemas";

// URL-safe base64-style alphabet (no '+', '/', '=' to avoid URL
// encoding). 64 chars * 8 positions = 2.8e14 codes. Collision prob
// is negligible at any realistic scale; we still retry on conflict.
const SHORT_CODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SHORT_CODE_LEN = 8;
const MAX_INSERT_RETRIES = 5;

function generateShortCode(): string {
  const bytes = randomBytes(SHORT_CODE_LEN);
  let out = "";
  for (let i = 0; i < SHORT_CODE_LEN; i++) {
    out += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
  }
  return out;
}

export type SharedVerdictMode = "incoming" | "outbound";

export type SharedVerdictRecord = {
  short_code: string;
  mode: SharedVerdictMode;
  output: TradeIncomingOutput | TradeOutboundOutput;
  input: Record<string, unknown> | null;
  team_display: string | null;
  confidence: number | null;
  engine_version: string;
  created_at: string;
  expires_at: string;
  view_count: number;
};

export type CreateShareInput = {
  userId: string;
  leagueId: string | null;
  mode: SharedVerdictMode;
  output: TradeIncomingOutput | TradeOutboundOutput;
  input: Record<string, unknown> | null;
  teamDisplay: string | null;
  // Engine confidence on the verdict, 0-100. We snapshot it so the
  // OG card can show "78% confidence" without re-deriving from the
  // payload.
  confidencePct: number | null;
};

/**
 * Create a shared verdict row. Uses the user-context Supabase client
 * (auth.uid() must equal the input userId; RLS enforces this). Returns
 * the short_code on success, throws on failure.
 *
 * Retries on short_code collision up to 5 times. After that, throws.
 */
export async function createSharedVerdict(
  input: CreateShareInput,
): Promise<{ short_code: string }> {
  const supabase = await createClient();

  for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
    const short_code = generateShortCode();
    const { error } = await supabase
      .from("shared_trade_verdicts")
      .insert({
        short_code,
        user_id: input.userId,
        league_id: input.leagueId,
        mode: input.mode,
        output: input.output as unknown as Record<string, unknown>,
        input: input.input,
        team_display: input.teamDisplay,
        confidence: input.confidencePct,
        engine_version: "v0",
      });

    if (!error) return { short_code };

    // 23505 = unique_violation (short_code collision). Retry.
    const errCode = (error as unknown as { code?: string }).code;
    if (errCode === "23505" && attempt < MAX_INSERT_RETRIES - 1) continue;

    throw new Error(`failed to create shared verdict: ${error.message}`);
  }
  throw new Error("failed to create shared verdict: short_code retries exhausted");
}

/**
 * Fetch a shared verdict by short_code. Public read (RLS allows
 * anyone). Returns null if not found OR expired (lazy cleanup).
 *
 * Pure read: does NOT bump view_count. Call recordVerdictView()
 * separately for that side effect, so OG image fetches and other
 * non-engagement reads don't inflate the counter.
 */
export async function fetchSharedVerdict(
  short_code: string,
): Promise<SharedVerdictRecord | null> {
  if (!isValidShortCode(short_code)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shared_trade_verdicts")
    .select(
      "short_code, mode, output, input, team_display, confidence, engine_version, created_at, expires_at, view_count",
    )
    .eq("short_code", short_code)
    .maybeSingle();

  if (error || !data) return null;

  // Lazy expiration: if the row is past expires_at, treat it as not
  // found and delete it via admin (cron-free cleanup). Failing to
  // delete is silent because the read itself returned no record.
  const expiresAt = new Date(data.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    try {
      await getAdminClient()
        .from("shared_trade_verdicts")
        .delete()
        .eq("short_code", short_code);
    } catch {
      // best effort; do not block the user-facing 404
    }
    return null;
  }

  return data as unknown as SharedVerdictRecord;
}

/**
 * Bump view_count for a shared verdict. Side-effect only; safe to
 * call after the page successfully renders. Uses the admin client
 * because the counter column is not writeable by authenticated
 * clients per RLS. Best-effort; failures are silent.
 */
export async function recordVerdictView(short_code: string): Promise<void> {
  if (!isValidShortCode(short_code)) return;
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from("shared_trade_verdicts")
      .select("view_count")
      .eq("short_code", short_code)
      .maybeSingle();
    if (!data) return;
    await admin
      .from("shared_trade_verdicts")
      .update({ view_count: (data.view_count ?? 0) + 1 })
      .eq("short_code", short_code);
  } catch {
    // best effort
  }
}

/**
 * Validate a short_code looks structurally correct before any DB
 * round trip. Cheap pre-flight; the route can return 404 immediately
 * for garbage paths without hitting the DB.
 */
export function isValidShortCode(s: string): boolean {
  if (typeof s !== "string") return false;
  if (s.length !== SHORT_CODE_LEN) return false;
  for (let i = 0; i < s.length; i++) {
    if (SHORT_CODE_ALPHABET.indexOf(s[i]) < 0) return false;
  }
  return true;
}

/**
 * Build the full public URL for a short_code. Uses the canonical
 * production host so the URL is shareable from any context (server
 * action, OG image generator, copy-to-clipboard).
 */
export function publicVerdictUrl(short_code: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://dynastygeneral.app";
  return `${base.replace(/\/$/, "")}/t/${short_code}`;
}
