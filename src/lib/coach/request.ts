/**
 * Coach request parsing.
 *
 * The user's `message` is the ONLY hard requirement of a Coach turn.
 * Everything else (`history`, `active_plays`, `companion_beat`) is
 * AUXILIARY context the client reads from localStorage and re-sends
 * each turn. localStorage is per-device and can hold older-shape or
 * partially-written entries (a committed play missing a field, a
 * stale message). Those must NEVER fail the whole turn; they degrade
 * to slightly less context.
 *
 * Bug class avoided (founder report 2026-05-24): Coach failed
 * INSTANTLY on mobile only. A single malformed committed play in the
 * phone's localStorage failed strict whole-body validation (z 400)
 * while the desktop's localStorage was clean, so the same question
 * worked on desktop and 400'd on mobile. The whole feature bricked
 * on one bad auxiliary row. The fix parses auxiliary blobs per-entry,
 * dropping the invalid ones and capping counts. Same discipline as
 * the snapshot-cache "parse per-entry so one bad row doesn't poison"
 * invariant (INVARIANTS.md).
 */

import { z } from "zod";

export const coachMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

export const coachActivePlaySchema = z.object({
  archetype: z.string(),
  play_name: z.string(),
  primary_player_name: z.string(),
  primary_player_position: z.string(),
  followthrough_description: z.string(),
  followthrough_target_names: z.array(z.string()),
});

// A companion beat the user clicked "talk it through" on (Principle
// 13). Most often a debate: they took a pick that diverged from the
// standing call. Carries the grounded provenance so Coach engages the
// real decision instead of freelancing.
export const coachCompanionBeatSchema = z.object({
  kind: z.string(),
  headline: z.string(),
  body: z.string().optional(),
  source_signal: z.string(),
  source_detail: z.string(),
  chosen: z.string().optional(),
  alternative: z.string().optional(),
  ev_delta: z.number().optional(),
  thesis: z.string().optional(),
  bet_id: z.string().optional(),
});

export type CoachMessage = z.infer<typeof coachMessageSchema>;
export type CoachActivePlay = z.infer<typeof coachActivePlaySchema>;
export type CoachCompanionBeat = z.infer<typeof coachCompanionBeatSchema>;

// History + active_plays are re-sent every turn; cap both so a runaway
// localStorage can't inflate input cost or blow the payload.
export const COACH_HISTORY_MAX = 40;
export const COACH_ACTIVE_PLAYS_MAX = 10;

export type ParsedCoachRequest = {
  message: string;
  history: CoachMessage[];
  activePlays: CoachActivePlay[];
  companionBeat: CoachCompanionBeat | null;
};

export type CoachParseResult =
  | { ok: true; data: ParsedCoachRequest }
  | { ok: false; error: string };

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Keep only the entries that validate against `schema`, dropping the
 * rest. One bad row never sinks the others.
 */
function parseValidEntries<T>(
  value: unknown,
  schema: z.ZodType<T>,
): T[] {
  const out: T[] = [];
  for (const entry of asArray(value)) {
    const parsed = schema.safeParse(entry);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Parse a Coach POST body. Fails (400) ONLY when the user's message
 * is missing or malformed. Auxiliary context is salvaged per-entry.
 */
export function parseCoachRequest(json: unknown): CoachParseResult {
  const root =
    json && typeof json === "object" ? (json as Record<string, unknown>) : {};

  const message = z.string().min(1).max(4000).safeParse(root.message);
  if (!message.success) {
    return {
      ok: false,
      error: "Your message was empty or too long. Shorten it and resend.",
    };
  }

  // Keep the most recent history; drop malformed rows.
  const history = parseValidEntries(root.history, coachMessageSchema).slice(
    -COACH_HISTORY_MAX,
  );

  // Drop malformed plays; cap the count. A corrupt committed play
  // degrades to "Coach didn't see that play," never a failed turn.
  const activePlays = parseValidEntries(
    root.active_plays,
    coachActivePlaySchema,
  ).slice(0, COACH_ACTIVE_PLAYS_MAX);

  const beat = coachCompanionBeatSchema.safeParse(root.companion_beat);
  const companionBeat = beat.success ? beat.data : null;

  return {
    ok: true,
    data: { message: message.data, history, activePlays, companionBeat },
  };
}
