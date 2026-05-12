/**
 * Create a shared trade verdict. POST-only; logged-in users only.
 *
 * Receives the existing trade verdict output (the same payload the
 * client just rendered) plus light context (mode, league_id,
 * team_display, confidence). Persists it server-side, mints a short
 * code, returns the public URL.
 *
 * We deliberately do NOT re-run the engine here. The user has
 * already paid for and received a verdict; sharing must be free of
 * additional LLM cost. The output payload IS the share artifact.
 */

import { z } from "zod";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { getOptionalUser } from "@/lib/auth/session";
import {
  createSharedVerdict,
  publicVerdictUrl,
  type SharedVerdictMode,
} from "@/lib/share/trade-verdict-share";

const LEAGUE_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;
// Per-row payload ceilings. Per security-auditor 2026-05-12: prior
// z.record(...).unknown() left output + input fully unbounded. Stored
// XSS is not exploitable today (no dangerouslySetInnerHTML in any
// verdict renderer) but a Pro user could otherwise POST multi-megabyte
// payloads stored verbatim and re-rendered on /t/[code]. Real
// verdicts run well under 50KB.
const OUTPUT_MAX_BYTES = 65_536; // 64KB
const INPUT_MAX_BYTES = 32_768; // 32KB

// Minimal schema. We accept the engine's output payload as opaque
// JSON to stay forward-compatible: if the engine output schema
// evolves, the share endpoint doesn't need a redeploy. The viewing
// page renders whatever was saved.
const bodySchema = z.object({
  mode: z.enum(["incoming", "outbound"]),
  league_id: z.string().regex(LEAGUE_ID_RE).nullish(),
  output: z
    .record(z.string(), z.unknown())
    .refine((v) => JSON.stringify(v).length <= OUTPUT_MAX_BYTES, {
      message: "output_too_large",
    }),
  input: z
    .record(z.string(), z.unknown())
    .nullish()
    .refine(
      (v) => v == null || JSON.stringify(v).length <= INPUT_MAX_BYTES,
      { message: "input_too_large" },
    ),
  team_display: z.string().max(120).nullish(),
  confidence_pct: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullish(),
});

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: Request) {
  const user = await getOptionalUser();
  if (!user) {
    return Response.json(
      { ok: false, error: "Sign in to share a verdict." },
      { status: 401 },
    );
  }

  const rate = await checkRateLimit(
    "verdict-share-create",
    clientIpFrom(req),
  );
  if (!rate.allowed) {
    return Response.json(
      {
        ok: false,
        error: `Too many shares. Wait ${Math.ceil(rate.reset_ms / 1000)}s.`,
      },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(rate.reset_ms / 1000)) },
      },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Request body wasn't readable." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Verdict payload failed validation." },
      { status: 400 },
    );
  }

  try {
    const { short_code } = await createSharedVerdict({
      userId: user.id,
      leagueId: parsed.data.league_id ?? null,
      mode: parsed.data.mode as SharedVerdictMode,
      output: parsed.data.output as never,
      input: parsed.data.input ?? null,
      teamDisplay: parsed.data.team_display ?? null,
      confidencePct: parsed.data.confidence_pct ?? null,
    });

    return Response.json({
      ok: true,
      short_code,
      url: publicVerdictUrl(short_code),
    });
  } catch (err) {
    console.error("[shared-verdicts:create]", err);
    return Response.json(
      { ok: false, error: "Couldn't save the share. Try again in a moment." },
      { status: 500 },
    );
  }
}
