/**
 * Opponent notes storage. Persists per-(user, league, opponent_roster)
 * notes the user logs about counterparty stated plans, trade intent,
 * trigger conditions, and psychological reads.
 *
 * Per coach trade-creativity Rule 5 + opponent-dossier moat pattern:
 * the user's own quotes from opponents are named-pressure ammunition
 * for trade construction. Today the user pastes them into the Coach
 * prompt as free-form text and they evaporate after the session.
 * This module makes them durable so Coach can reliably ground on them
 * across sessions.
 *
 * Server-only. Client mutations go through POST /api/opponent-notes
 * (added in a follow-up commit).
 */

import { createClient } from "@/lib/supabase/server";

export const OPPONENT_NOTE_KINDS = [
  "stated_plan",
  "trade_intent",
  "trigger_condition",
  "psych_read",
  "other",
] as const;

export type OpponentNoteKind = (typeof OPPONENT_NOTE_KINDS)[number];

export type OpponentNote = {
  id: string;
  user_id: string;
  league_id: string;
  opponent_roster_id: number;
  body: string;
  kind: OpponentNoteKind;
  created_at: string;
  updated_at: string;
};

export const OPPONENT_NOTE_BODY_MAX = 2000;
const PER_LEAGUE_FETCH_LIMIT = 100;

function isOpponentNoteKind(s: string): s is OpponentNoteKind {
  return (OPPONENT_NOTE_KINDS as readonly string[]).includes(s);
}

/**
 * Read all opponent notes for a (user, league) pair, most-recent first.
 * Returns up to PER_LEAGUE_FETCH_LIMIT (100) entries; older notes are
 * pruned by the caller if needed. Caller groups by opponent_roster_id.
 */
export async function readOpponentNotesForLeague(args: {
  userId: string;
  leagueId: string;
}): Promise<OpponentNote[]> {
  const { userId, leagueId } = args;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opponent_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(PER_LEAGUE_FETCH_LIMIT);
  if (error) {
    console.error("[opponent-notes:read]", error.message);
    return [];
  }
  return (data ?? []).map(toOpponentNote);
}

/**
 * Group notes by opponent_roster_id. Each group keeps its most-recent-
 * first ordering. Empty groups are omitted.
 */
export function groupNotesByOpponent(
  notes: OpponentNote[],
): Map<number, OpponentNote[]> {
  const out = new Map<number, OpponentNote[]>();
  for (const n of notes) {
    const list = out.get(n.opponent_roster_id);
    if (list) list.push(n);
    else out.set(n.opponent_roster_id, [n]);
  }
  return out;
}

export async function createOpponentNote(args: {
  userId: string;
  leagueId: string;
  opponentRosterId: number;
  body: string;
  kind: OpponentNoteKind;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = args.body.trim();
  if (!trimmed) return { ok: false, error: "Body required." };
  if (trimmed.length > OPPONENT_NOTE_BODY_MAX) {
    return {
      ok: false,
      error: `Body exceeds ${OPPONENT_NOTE_BODY_MAX} characters.`,
    };
  }
  if (!Number.isInteger(args.opponentRosterId) || args.opponentRosterId <= 0) {
    return { ok: false, error: "Invalid opponent_roster_id." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opponent_notes")
    .insert({
      user_id: args.userId,
      league_id: args.leagueId,
      opponent_roster_id: args.opponentRosterId,
      body: trimmed,
      kind: args.kind,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[opponent-notes:create]", error?.message ?? "no row");
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  return { ok: true, id: data.id };
}

export async function deleteOpponentNote(args: {
  userId: string;
  noteId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opponent_notes")
    .delete()
    .eq("id", args.noteId)
    .eq("user_id", args.userId);
  if (error) {
    console.error("[opponent-notes:delete]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

function toOpponentNote(row: Record<string, unknown>): OpponentNote {
  const kindRaw = String(row.kind ?? "stated_plan");
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    league_id: String(row.league_id),
    opponent_roster_id: Number(row.opponent_roster_id),
    body: String(row.body),
    kind: isOpponentNoteKind(kindRaw) ? kindRaw : "stated_plan",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}
