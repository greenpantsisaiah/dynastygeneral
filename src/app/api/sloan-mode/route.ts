/**
 * POST /api/sloan-mode
 *
 * Toggles the Sloan-mode cookie. Body: { mode: "on" | "off" }.
 * Public (no auth required); the cookie is per-browser and not
 * tied to a user identity. Light rate-limit to prevent flapping.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildSloanCookie } from "@/lib/sloan-mode/cookie";

export const runtime = "nodejs";

const bodySchema = z.object({
  mode: z.enum(["on", "off"]),
});

export async function POST(req: Request): Promise<NextResponse> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    parsed = bodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: err instanceof Error ? err.message : "parse error" },
      { status: 400 },
    );
  }
  const { name, value, options } = buildSloanCookie(parsed.mode);
  const res = NextResponse.json({ ok: true, mode: parsed.mode });
  res.cookies.set(name, value, options);
  return res;
}
