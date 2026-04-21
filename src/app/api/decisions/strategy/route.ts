import { z } from "zod";
import { runStrategyClarify } from "@/lib/engine/decisions";

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
        error: `Strategy request needs work: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
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
        error:
          err instanceof Error
            ? err.message
            : "Engine didn't return. Retry in a moment.",
      },
      { status: 500 },
    );
  }
}
