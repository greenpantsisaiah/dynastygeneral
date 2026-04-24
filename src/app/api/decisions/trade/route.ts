import { z } from "zod";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBudget } from "@/lib/budget";
import { checkProGate } from "@/lib/auth/paywall";
import {
  runTradeIncoming,
  runTradeOutbound,
} from "@/lib/engine/decisions";

const strategyEnum = z
  .enum(["contender", "rebuild", "balanced", "undetermined"])
  .nullish();

const incomingSchema = z.object({
  mode: z.literal("incoming"),
  league_id: z.string().min(1),
  sleeper_username: z.string().min(1).max(60).nullish(),
  you_send: z.array(z.string().min(1)).min(1).max(30),
  you_receive: z.array(z.string().min(1)).min(1).max(30),
  other_manager: z.string().max(120).nullish(),
  notes: z.string().max(2000).nullish(),
  declared_strategy: strategyEnum,
});

const outboundSchema = z.object({
  mode: z.literal("outbound"),
  league_id: z.string().min(1),
  sleeper_username: z.string().min(1).max(60).nullish(),
  target_kind: z.enum(["player", "manager"]),
  target_name: z.string().min(1).max(120),
  willing_to_move: z.array(z.string().min(1)).max(30).nullish(),
  notes: z.string().max(2000).nullish(),
  declared_strategy: strategyEnum,
});

const bodySchema = z.discriminatedUnion("mode", [
  incomingSchema,
  outboundSchema,
]);

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
        error: `Too many trade submissions. Wait ${Math.ceil(rate.reset_ms / 1000)}s.`,
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
        error: "Check your trade form. One or more fields didn't validate.",
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.mode === "incoming") {
      const { mode: engineMode, ...rest } = await runTradeIncoming({
        leagueId: parsed.data.league_id,
        sleeperUsername: parsed.data.sleeper_username ?? null,
        declaredStrategy: parsed.data.declared_strategy ?? null,
        offer: {
          you_send: parsed.data.you_send,
          you_receive: parsed.data.you_receive,
          other_manager: parsed.data.other_manager ?? null,
        },
        notes: parsed.data.notes ?? null,
      });
      return Response.json({
        ok: true,
        mode: "incoming",
        engine_mode: engineMode,
        ...rest,
      });
    }
    const { mode: engineMode, ...rest } = await runTradeOutbound({
      leagueId: parsed.data.league_id,
      sleeperUsername: parsed.data.sleeper_username ?? null,
      declaredStrategy: parsed.data.declared_strategy ?? null,
      target: {
        kind: parsed.data.target_kind,
        name: parsed.data.target_name,
      },
      willingToMove: parsed.data.willing_to_move ?? undefined,
      notes: parsed.data.notes ?? null,
    });
    return Response.json({
      ok: true,
      mode: "outbound",
      engine_mode: engineMode,
      ...rest,
    });
  } catch (err) {
    console.error("[decisions:trade]", err);
    return Response.json(
      {
        ok: false,
        error: "Engine didn't return. Retry in a moment.",
      },
      { status: 500 },
    );
  }
}
