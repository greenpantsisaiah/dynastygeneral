/**
 * Plays sync API.
 *
 *   POST /api/plays   Upsert commitments and/or dismissals, restore
 *                     previously dismissed keys. One endpoint covers
 *                     single mutations (commit, abandon, dismiss,
 *                     restore) AND the upload-on-signin batch (push
 *                     localStorage rows up in one shot).
 *
 * Auth-required. RLS at the table level enforces user ownership; this
 * route adds shape validation, rate limiting, and a hard cap on batch
 * size so a compromised account can't trigger a giant upsert loop.
 *
 * Reads happen server-side at hub render (see storage-server.ts +
 * leagues/[leagueId]/page.tsx) so no GET endpoint is needed today.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser } from "@/lib/auth/session";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { isValidLeagueId } from "@/lib/sleeper/validate";
import {
  deleteDismissal,
  upsertCommitment,
  upsertDismissal,
} from "@/lib/plays/storage-server";

export const runtime = "nodejs";

const LEAGUE_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;
const BATCH_MAX = 50;

const ARCHETYPE = z.enum([
  "qb_wr_stack",
  "anchor_handcuff",
  "bridge_qb",
  "qb_hoard",
  "lane_path",
]);

const playerRefSchema = z.object({
  player_id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  position: z.enum(["QB", "RB", "WR", "TE", "K", "DST"]),
  team: z.string().max(8).nullable(),
  ktc_value: z.number().nullable().optional(),
  survival: z
    .object({
      pct: z.number(),
      ci_low: z.number(),
      ci_high: z.number(),
      to_pick_no: z.number(),
      urgency: z.enum(["act_now", "this_round", "two_round_cushion", "no_rush"]),
    })
    .nullable()
    .optional(),
});

const commitmentSchema = z.object({
  commitment_id: z.string().min(1).max(64),
  archetype: ARCHETYPE,
  play_name: z.string().min(1).max(128),
  league_id: z.string().regex(LEAGUE_ID_RE),
  primary_player: playerRefSchema,
  followthrough_targets: z.array(playerRefSchema).max(20),
  followthrough_description: z.string().max(2000).default(""),
  committed_at_pick_no: z.number().int().nonnegative(),
  lapses_after_pick_no: z.number().int().nonnegative(),
  committed_at: z.string(),
  status: z.enum(["active", "executed", "lapsed", "abandoned"]),
  executed_with: playerRefSchema.optional(),
  executed_at_pick_no: z.number().int().nonnegative().optional(),
});

const dismissalSchema = z.object({
  key: z.string().min(1).max(96),
  archetype: ARCHETYPE,
  play_name: z.string().min(1).max(128),
  dismissed_at: z.string(),
});

const bodySchema = z.object({
  league_id: z.string().regex(LEAGUE_ID_RE),
  commitments: z.array(commitmentSchema).max(BATCH_MAX).optional(),
  dismissals: z.array(dismissalSchema).max(BATCH_MAX).optional(),
  restore_keys: z.array(z.string().min(1).max(96)).max(BATCH_MAX).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const ip = clientIpFrom(req);
  const rate = await checkRateLimit("plays", ip);
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    parsed = bodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        detail: err instanceof Error ? err.message : "parse error",
      },
      { status: 400 },
    );
  }

  if (!isValidLeagueId(parsed.league_id)) {
    return NextResponse.json({ error: "invalid_league_id" }, { status: 400 });
  }

  // A row's embedded league_id must match the request-level league_id.
  // This is the cross-league prevention check: a compromised client
  // can't slip a foreign-league row into the batch.
  for (const c of parsed.commitments ?? []) {
    if (c.league_id !== parsed.league_id) {
      return NextResponse.json(
        { error: "league_id_mismatch" },
        { status: 400 },
      );
    }
  }

  let commitmentsPersisted = 0;
  for (const c of parsed.commitments ?? []) {
    const res = await upsertCommitment({ userId: user.id, commitment: c });
    if (res.ok) commitmentsPersisted += 1;
  }

  let dismissalsPersisted = 0;
  for (const d of parsed.dismissals ?? []) {
    const res = await upsertDismissal({
      userId: user.id,
      leagueId: parsed.league_id,
      dismissal: d,
    });
    if (res.ok) dismissalsPersisted += 1;
  }

  let restored = 0;
  for (const key of parsed.restore_keys ?? []) {
    const res = await deleteDismissal({
      userId: user.id,
      leagueId: parsed.league_id,
      key,
    });
    if (res.ok) restored += 1;
  }

  return NextResponse.json({
    ok: true,
    commitments_persisted: commitmentsPersisted,
    dismissals_persisted: dismissalsPersisted,
    restored,
  });
}
