/**
 * Plays storage. Per-league localStorage for committed plays. Mirrors
 * the watchlist / draft journal / continuity-chip pattern (per memory
 * note "Client-side memory trio").
 *
 * Schema is stable per founder direction: zero server cost initially;
 * server-sync is a Phase 2 decision once usage is validated. The
 * commitment_id is timestamp-based so multiple commitments of the
 * same archetype don't collide.
 */

import type {
  Play,
  PlayArchetype,
  PlayCommitment,
  PlayPlayerRef,
} from "./strategy/plays/types";

const STORAGE_KEY_PREFIX = "dg.plays.";
const DISMISSED_KEY_PREFIX = "dg.plays.dismissed.";

function storageKey(leagueId: string): string {
  return `${STORAGE_KEY_PREFIX}${leagueId}`;
}

function dismissedStorageKey(leagueId: string): string {
  return `${DISMISSED_KEY_PREFIX}${leagueId}`;
}

function safeReadAll(leagueId: string): PlayCommitment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PlayCommitment[];
  } catch {
    return [];
  }
}

function safeWriteAll(leagueId: string, commitments: PlayCommitment[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(leagueId),
      JSON.stringify(commitments),
    );
  } catch {
    // Quota exceeded or storage disabled; silently skip.
  }
}

/** Read all commitments for a league. Empty array if none. */
export function getPlayCommitments(leagueId: string): PlayCommitment[] {
  return safeReadAll(leagueId);
}

/** Read only active commitments (status === "active"). */
export function getActivePlayCommitments(leagueId: string): PlayCommitment[] {
  return safeReadAll(leagueId).filter((c) => c.status === "active");
}

/**
 * Commit to a play. Stores in localStorage and returns the
 * commitment id. The committed_at_pick_no anchors the lapse window:
 * the play lapses after `committed_at_pick_no + picks_window` picks.
 */
export function commitPlay(args: {
  leagueId: string;
  play: Play;
  committedAtPickNo: number;
}): PlayCommitment {
  const { leagueId, play, committedAtPickNo } = args;
  const all = safeReadAll(leagueId);

  // If a commitment of this archetype on this primary player already
  // exists and is active, return that instead of duplicating.
  const existing = all.find(
    (c) =>
      c.archetype === play.archetype &&
      c.primary_player.player_id === play.primary_player.player_id &&
      c.status === "active",
  );
  if (existing) return existing;

  const commitment: PlayCommitment = {
    commitment_id: `${play.archetype}-${Date.now()}`,
    archetype: play.archetype,
    play_name: play.name,
    league_id: leagueId,
    primary_player: play.primary_player,
    followthrough_targets: play.followthrough.target_candidates,
    followthrough_description: play.followthrough.description,
    committed_at_pick_no: committedAtPickNo,
    lapses_after_pick_no:
      committedAtPickNo + play.followthrough.picks_window * 12,
    committed_at: new Date().toISOString(),
    status: "active",
  };
  all.push(commitment);
  safeWriteAll(leagueId, all);
  return commitment;
}

/**
 * Mark a play as executed when the user takes one of its targets.
 * Called by the client when a candidate is committed that matches an
 * active play's follow-through targets.
 */
export function markPlayExecuted(args: {
  leagueId: string;
  commitmentId: string;
  executedWith: PlayPlayerRef;
  executedAtPickNo: number;
}): void {
  const all = safeReadAll(args.leagueId);
  const idx = all.findIndex((c) => c.commitment_id === args.commitmentId);
  if (idx < 0) return;
  all[idx] = {
    ...all[idx],
    status: "executed",
    executed_with: args.executedWith,
    executed_at_pick_no: args.executedAtPickNo,
  };
  safeWriteAll(args.leagueId, all);
}

/** Manually abandon a play (user no longer pursuing it). */
export function abandonPlay(args: {
  leagueId: string;
  commitmentId: string;
}): void {
  const all = safeReadAll(args.leagueId);
  const idx = all.findIndex((c) => c.commitment_id === args.commitmentId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], status: "abandoned" };
  safeWriteAll(args.leagueId, all);
}

/**
 * Lapse-check: any active play whose window has passed becomes
 * "lapsed." Called on read by client surfaces so stale plays drop
 * out without manual intervention.
 */
export function lapseStaleCommitments(args: {
  leagueId: string;
  currentPickNo: number;
}): void {
  const all = safeReadAll(args.leagueId);
  let dirty = false;
  for (let i = 0; i < all.length; i++) {
    if (
      all[i].status === "active" &&
      args.currentPickNo > all[i].lapses_after_pick_no
    ) {
      all[i] = { ...all[i], status: "lapsed" };
      dirty = true;
    }
  }
  if (dirty) safeWriteAll(args.leagueId, all);
}

/**
 * Match a player against active plays. Returns matched commitments
 * (zero or more) for use in discipline-reminder badging.
 */
export function findActivePlaysAdvancedBy(args: {
  leagueId: string;
  playerId: string;
}): PlayCommitment[] {
  return getActivePlayCommitments(args.leagueId).filter((c) =>
    c.followthrough_targets.some((t) => t.player_id === args.playerId),
  );
}

/**
 * A dismissed suggestion. Stored separately from commitments so the
 * user can clear plays they don't care about without losing them.
 * Forgiveness is the design (founder direction 2026-05-21): one click
 * to dismiss, one click to restore; nothing penalizes a wrong dismiss.
 */
export type DismissedSuggestion = {
  /** `${archetype}:${primary_player_id}`. */
  key: string;
  archetype: PlayArchetype;
  play_name: string;
  dismissed_at: string;
};

/** Stable key matching a suggestion to its dismissal record. */
export function suggestionKey(
  archetype: PlayArchetype,
  primaryPlayerId: string,
): string {
  return `${archetype}:${primaryPlayerId}`;
}

function safeReadDismissed(leagueId: string): DismissedSuggestion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(dismissedStorageKey(leagueId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DismissedSuggestion[];
  } catch {
    return [];
  }
}

function safeWriteDismissed(
  leagueId: string,
  items: DismissedSuggestion[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      dismissedStorageKey(leagueId),
      JSON.stringify(items),
    );
  } catch {
    // Quota exceeded or storage disabled; silently skip.
  }
}

/** Read all dismissed suggestions for a league. */
export function getDismissedSuggestions(
  leagueId: string,
): DismissedSuggestion[] {
  return safeReadDismissed(leagueId);
}

/** Dismiss a suggested play. Idempotent. */
export function dismissSuggestion(args: {
  leagueId: string;
  play: Play;
}): void {
  const { leagueId, play } = args;
  const key = suggestionKey(play.archetype, play.primary_player.player_id);
  const all = safeReadDismissed(leagueId);
  if (all.some((d) => d.key === key)) return;
  all.push({
    key,
    archetype: play.archetype,
    play_name: play.name,
    dismissed_at: new Date().toISOString(),
  });
  safeWriteDismissed(leagueId, all);
}

/** Restore (un-dismiss) a previously dismissed suggestion. */
export function restoreSuggestion(args: {
  leagueId: string;
  key: string;
}): void {
  const { leagueId, key } = args;
  safeWriteDismissed(
    leagueId,
    safeReadDismissed(leagueId).filter((d) => d.key !== key),
  );
}

/**
 * Archetype label for display. Voice A: terse, no fluff.
 */
export function archetypeLabel(archetype: PlayArchetype): string {
  switch (archetype) {
    case "qb_wr_stack":
      return "QB Stack";
    case "anchor_handcuff":
      return "Anchor + Handcuff";
    case "bridge_qb":
      return "Bridge QB";
    case "qb_hoard":
      return "QB Hoard";
    case "lane_path":
      return "Build";
  }
}
