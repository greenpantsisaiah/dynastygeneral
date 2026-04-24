import { z } from "zod";
import { runPickDecision } from "@/lib/engine/decisions";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBudget } from "@/lib/budget";
import { checkProGate } from "@/lib/auth/paywall";

const bodySchema = z.object({
  league_id: z.string().min(1),
  sleeper_username: z.string().min(1).max(60).nullish(),
  current_pick: z.string().min(1).max(40),
  // Pre-fill from a live draft can include the full available pool
  // (200+ in dynasty leagues). 400 ceiling matches our available-pool
  // limit; the LLM trims to relevant tier itself.
  available_players: z.array(z.string().min(1)).min(1).max(400),
  notes: z.string().max(2000).nullish(),
  declared_strategy: z
    .enum(["contender", "rebuild", "balanced", "undetermined"])
    .nullish(),
});

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: Request) {
  const gate = await checkProGate();
  if (!gate.ok) return gate.response;

  const rate = await checkRateLimit("decisions", clientIpFrom(req));
  if (!rate.allowed) {
    return Response.json(
      {
        ok: false,
        error: `Too many pick submissions. Wait ${Math.ceil(rate.reset_ms / 1000)}s.`,
      },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(rate.reset_ms / 1000)) },
      },
    );
  }
  const budget = await checkBudget();
  if (!budget.allowed) {
    return Response.json(
      {
        ok: false,
        error: "Daily analysis capacity reached. Try again tomorrow.",
      },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Request body wasn't readable. Refresh and resend." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Check your pick form. One or more fields didn't validate.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runPickDecision({
      leagueId: parsed.data.league_id,
      sleeperUsername: parsed.data.sleeper_username ?? null,
      declaredStrategy: parsed.data.declared_strategy ?? null,
      currentPick: parsed.data.current_pick,
      availablePlayers: parsed.data.available_players,
      notes: parsed.data.notes ?? null,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    // Log full error server-side; return generic to client. Per
    // SECURITY.md: never include raw err in client responses (leaks
    // internal schema field names and tool architecture).
    console.error("[decisions:pick]", err);
    return Response.json(
      {
        ok: false,
        error: "Engine didn't return. Retry in a moment.",
      },
      { status: 500 },
    );
  }
}
