/**
 * POST /api/feedback
 *
 * In-app feedback collection. Free for anyone (no auth required) so
 * the friction-to-submit is zero. Authenticated requests get attached
 * to the user via service-role insert; anonymous requests submit with
 * user_id=null.
 *
 * Tight rate limit (5/min per IP) so a bot can't flood the table.
 * Cap message length at 4000 chars per the migration's CHECK
 * constraint.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { getOptionalUser } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5).nullable().optional(),
  message: z.string().min(1).max(4000),
  // Restrict to http/https URLs only. Default Zod .url() accepts
  // javascript: and data: schemes, which would become a stored-XSS
  // landmine the moment any admin UI renders this as a clickable link.
  // Per security-auditor 2026-04-23 MEDIUM.
  page_url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "page_url must be http(s)",
    })
    .optional()
    .nullable(),
  contact_email: z
    .string()
    .email()
    .max(254)
    .optional()
    .nullable(),
});

export async function POST(req: Request) {
  const rate = await checkRateLimit("feedback", clientIpFrom(req));
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(rate.reset_ms / 1000)) },
      },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  // Best-effort user attribution. Anonymous OK; authenticated requests
  // get their user_id attached. We use the admin client so anonymous
  // inserts work despite the RLS policy requiring auth.uid() = user_id.
  //
  // Honor the empty contact_email: if a signed-in user leaves email
  // blank they expect "anonymous" (relative to follow-up). The user_id
  // link is sufficient for us to identify them via the auth admin
  // panel; we do NOT silently fall back to user.email.
  // Per security-auditor 2026-04-23 MEDIUM.
  const user = await getOptionalUser();
  try {
    const admin = getAdminClient();
    await admin.from("feedback").insert({
      user_id: user?.id ?? null,
      rating: parsed.data.rating ?? null,
      message: parsed.data.message,
      page_url: parsed.data.page_url ?? null,
      contact_email: parsed.data.contact_email ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[feedback]", err);
    return NextResponse.json(
      { ok: false, error: "persist_failed" },
      { status: 500 },
    );
  }
}
