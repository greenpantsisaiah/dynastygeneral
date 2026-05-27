/**
 * Client-side plays sync. Wraps the localStorage helpers in
 * plays-storage.ts and fires best-effort POSTs to /api/plays when the
 * caller passes `authedUserId`, so an authed user's commitments +
 * dismissals are mirrored on the server (migration 0017) and survive
 * across browsers / devices.
 *
 * The localStorage layer stays the device-side cache: reads are
 * synchronous and immediate (no network race on render), writes happen
 * locally first, and the server POST is fire-and-forget. The hub also
 * runs `uploadLocalToServer` once on first authed load to push any
 * local-only rows up before the server-merged set becomes canonical.
 *
 * Anonymous users skip the network calls entirely; the localStorage
 * behavior is unchanged for them.
 */

import {
  abandonPlay as abandonPlayLocal,
  commitPlay as commitPlayLocal,
  dismissSuggestion as dismissSuggestionLocal,
  getDismissedSuggestions,
  getPlayCommitments,
  markPlayExecuted as markPlayExecutedLocal,
  restoreSuggestion as restoreSuggestionLocal,
  type DismissedSuggestion,
} from "@/lib/plays-storage";
import type {
  Play,
  PlayCommitment,
  PlayPlayerRef,
} from "@/lib/strategy/plays/types";

type SyncCtx = { leagueId: string; authedUserId: string | null };

function safePost(body: Record<string, unknown>): void {
  void fetch("/api/plays", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // Best-effort; the localStorage write already happened, and the
    // next upload-on-load pass will reconcile.
  });
}

export function commitPlayWithSync(args: {
  ctx: SyncCtx;
  play: Play;
  committedAtPickNo: number;
}): PlayCommitment {
  const { ctx, play, committedAtPickNo } = args;
  const c = commitPlayLocal({
    leagueId: ctx.leagueId,
    play,
    committedAtPickNo,
  });
  if (ctx.authedUserId) {
    safePost({ league_id: ctx.leagueId, commitments: [c] });
  }
  return c;
}

export function abandonPlayWithSync(args: {
  ctx: SyncCtx;
  commitmentId: string;
}): void {
  abandonPlayLocal({ leagueId: args.ctx.leagueId, commitmentId: args.commitmentId });
  if (!args.ctx.authedUserId) return;
  const all = getPlayCommitments(args.ctx.leagueId);
  const updated = all.find((c) => c.commitment_id === args.commitmentId);
  if (updated) safePost({ league_id: args.ctx.leagueId, commitments: [updated] });
}

export function markPlayExecutedWithSync(args: {
  ctx: SyncCtx;
  commitmentId: string;
  executedWith: PlayPlayerRef;
  executedAtPickNo: number;
}): void {
  markPlayExecutedLocal({
    leagueId: args.ctx.leagueId,
    commitmentId: args.commitmentId,
    executedWith: args.executedWith,
    executedAtPickNo: args.executedAtPickNo,
  });
  if (!args.ctx.authedUserId) return;
  const updated = getPlayCommitments(args.ctx.leagueId).find(
    (c) => c.commitment_id === args.commitmentId,
  );
  if (updated) safePost({ league_id: args.ctx.leagueId, commitments: [updated] });
}

export function dismissSuggestionWithSync(args: {
  ctx: SyncCtx;
  play: Play;
}): void {
  dismissSuggestionLocal({ leagueId: args.ctx.leagueId, play: args.play });
  if (!args.ctx.authedUserId) return;
  const all = getDismissedSuggestions(args.ctx.leagueId);
  const d = all.find(
    (x) =>
      x.archetype === args.play.archetype &&
      x.key.endsWith(`:${args.play.primary_player.player_id}`),
  );
  if (d) safePost({ league_id: args.ctx.leagueId, dismissals: [d] });
}

export function restoreSuggestionWithSync(args: {
  ctx: SyncCtx;
  key: string;
}): void {
  restoreSuggestionLocal({ leagueId: args.ctx.leagueId, key: args.key });
  if (args.ctx.authedUserId) {
    safePost({ league_id: args.ctx.leagueId, restore_keys: [args.key] });
  }
}

/**
 * Merge a server-side initial state into local storage on first authed
 * mount. Any local-only commitments / dismissals get pushed up so the
 * server becomes the union; any server rows missing locally are written
 * down so the next render reflects them.
 *
 * Idempotent: running twice for the same user/league converges to the
 * same union without duplicating rows (commitment_id and dismissal_key
 * are stable, so upserts collapse).
 */
export function mergeServerInitialState(args: {
  ctx: SyncCtx;
  serverCommitments: PlayCommitment[];
  serverDismissals: DismissedSuggestion[];
}): void {
  if (typeof window === "undefined") return;
  const { ctx, serverCommitments, serverDismissals } = args;

  // Write server rows down into local first.
  const localCommitments = getPlayCommitments(ctx.leagueId);
  const localById = new Map(localCommitments.map((c) => [c.commitment_id, c]));
  for (const sc of serverCommitments) {
    localById.set(sc.commitment_id, sc);
  }
  try {
    window.localStorage.setItem(
      `dg.plays.${ctx.leagueId}`,
      JSON.stringify(Array.from(localById.values())),
    );
  } catch {
    // Quota exceeded; the next mutation will retry.
  }

  const localDismissals = getDismissedSuggestions(ctx.leagueId);
  const dByKey = new Map(localDismissals.map((d) => [d.key, d]));
  for (const sd of serverDismissals) dByKey.set(sd.key, sd);
  try {
    window.localStorage.setItem(
      `dg.plays.dismissed.${ctx.leagueId}`,
      JSON.stringify(Array.from(dByKey.values())),
    );
  } catch {
    // Quota exceeded; the next mutation will retry.
  }

  if (!ctx.authedUserId) return;

  // Push any local-only rows up. Server upsert is idempotent so
  // re-sending a row the server already has is a no-op.
  const serverIds = new Set(serverCommitments.map((c) => c.commitment_id));
  const toUploadC = localCommitments.filter(
    (c) => !serverIds.has(c.commitment_id),
  );
  const serverKeys = new Set(serverDismissals.map((d) => d.key));
  const toUploadD = localDismissals.filter((d) => !serverKeys.has(d.key));
  if (toUploadC.length === 0 && toUploadD.length === 0) return;
  safePost({
    league_id: ctx.leagueId,
    commitments: toUploadC.length ? toUploadC : undefined,
    dismissals: toUploadD.length ? toUploadD : undefined,
  });
}
