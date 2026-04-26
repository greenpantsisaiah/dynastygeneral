/**
 * Submit a "I wish you had a dial that..." suggestion.
 *
 * Stored to mixer_suggestions for founder review. Anonymous + authed
 * submissions both allowed.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  proposal: z.string().min(8).max(2000),
  context: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: Request) {
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
    const { error } = await supabase.from("mixer_suggestions").insert({
      user_id: auth.user?.id ?? null,
      proposal: parsed.data.proposal,
      context: parsed.data.context,
    });
    if (error) {
      console.error("[soundboard:suggest:insert]", error);
      return NextResponse.json(
        { ok: false, queued: false, error: error.code ?? "insert_failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[soundboard:suggest]", err);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 },
    );
  }
}
