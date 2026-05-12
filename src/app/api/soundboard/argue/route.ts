/**
 * Submit an argument against a specific dial.
 *
 * Captures: dial_id, predefined dissent shape, optional free-text
 * comment, and a context blob (league, decision card output, full
 * dial state). Stored to mixer_feedback for founder review.
 *
 * Anonymous submissions allowed (user_id null). Authed submissions
 * tagged to the user so we can notify them when the argument drives a
 * calibration update.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { createClient } from "@/lib/supabase/server";
import {
  DIAL_SPECS,
  FEEDBACK_SHAPES,
  type DialId,
  type FeedbackShape,
} from "@/lib/soundboard/types";

export const runtime = "nodejs";

const knownDialIds = new Set<DialId>(DIAL_SPECS.map((s) => s.id));

const CONTEXT_MAX_KEYS = 32;
const CONTEXT_MAX_SERIALIZED_BYTES = 8192;

const bodySchema = z.object({
  dial_id: z.string().refine((v): v is DialId => knownDialIds.has(v as DialId), {
    message: "unknown_dial_id",
  }),
  shape: z.enum(FEEDBACK_SHAPES),
  comment: z.string().max(2000).optional(),
  context: z
    .record(z.string(), z.unknown())
    .default({})
    .refine((c) => Object.keys(c).length <= CONTEXT_MAX_KEYS, {
      message: "context_too_many_keys",
    })
    .refine(
      (c) => JSON.stringify(c).length <= CONTEXT_MAX_SERIALIZED_BYTES,
      { message: "context_too_large" },
    ),
});

export async function POST(req: Request) {
  const rate = await checkRateLimit("soundboard-submit", clientIpFrom(req));
  if (!rate.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.message },
      { status: 400 },
    );
  }
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("mixer_feedback").insert({
      user_id: auth.user?.id ?? null,
      dial_id: parsed.data.dial_id,
      shape: parsed.data.shape as FeedbackShape,
      comment: parsed.data.comment ?? null,
      context: parsed.data.context,
    });
    if (error) {
      // Most likely the migration hasn't been applied yet. Fail soft
      // for the client (banner-level feedback UX should still feel
      // "submitted") but log loudly.
      console.error("[soundboard:argue:insert]", error);
      return NextResponse.json(
        { ok: false, queued: false, error: error.code ?? "insert_failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[soundboard:argue]", err);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}
