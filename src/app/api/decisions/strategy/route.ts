import { z } from "zod";
import { runStrategyClarify } from "@/lib/engine/decisions";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBudget } from "@/lib/budget";
import { checkProGate } from "@/lib/auth/paywall";

const bodySchema = z.object({
  league_id: z.string().min(1),
  sleeper_username: z.string().min(1).max(60).nullish(),
  declared_strategy: z
    .enum(["contender", "rebuild", "balanced", "undetermined"])
    .nullish(),
});

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await checkProGate();
  if (!gate.ok) return gate.response;

  // Strategy uses Opus (5x cost vs Sonnet) and gets its own bucket so a
  // bot can't burn the full decisions allowance on the most expensive
  // endpoint. Per cost-watcher 2026-04-22: shared bucket = $1,008/day
  // single-IP exposure on this route alone.
  const rate = await checkRateLimit(
    "decisions-strategy",
    clientIpFrom(req),
  );
  if (!rate.allowed) {
    return Response.json(
      {
        ok: false,
        error: `Too many strategy runs. Wait ${Math.ceil(rate.reset_ms / 1000)}s.`,
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
        error: "Check your strategy request. One or more fields didn't validate.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runStrategyClarify({
      leagueId: parsed.data.league_id,
      sleeperUsername: parsed.data.sleeper_username ?? null,
      declaredStrategy: parsed.data.declared_strategy ?? null,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[decisions:strategy]", err);
    return Response.json(
      {
        ok: false,
        error: "Engine didn't return. Retry in a moment.",
      },
      { status: 500 },
    );
  }
}
