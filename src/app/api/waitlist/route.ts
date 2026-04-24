import { z } from "zod";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  sleeper_username: z.string().max(60).nullish(),
  league_count: z.number().int().min(0).max(200).nullish(),
  focus: z.enum(["drafts", "trades", "both"]).nullish(),
  is_creator: z.boolean().optional().default(false),
  pain_point: z.string().max(2000).nullish(),
});

export async function POST(req: Request) {
  const rate = await checkRateLimit("waitlist", clientIpFrom(req));
  if (!rate.allowed) {
    return Response.json(
      { ok: false, error: "Too many submissions. Wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(Math.ceil(rate.reset_ms / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Submission was unreadable. Refresh and try again." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Check name and email. One of the fields didn't validate.",
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  // If Supabase is configured, persist. Otherwise, accept but log.
  const hasSupabase =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabase) {
    // Never log full payload (PII). Only metadata for debug.
    const emailDomain = payload.email.split("@")[1] ?? "unknown";
    console.info("[waitlist:no-db] received submission", {
      email_domain: emailDomain,
    });
    return Response.json({ ok: true, persisted: false });
  }

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.from("waitlist").insert({
      email: payload.email,
      name: payload.name,
      sleeper_username: payload.sleeper_username ?? null,
      league_count: payload.league_count ?? null,
      focus: payload.focus ?? null,
      is_creator: payload.is_creator,
      pain_point: payload.pain_point ?? null,
      source: "landing",
    });

    if (error) {
      if (error.code === "23505") {
        // unique violation: already on list
        return Response.json({ ok: true, persisted: true, duplicate: true });
      }
      console.error("[waitlist:insert]", error);
      return Response.json(
        { ok: false, error: "Couldn't save your request. Try again in a moment." },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, persisted: true });
  } catch (err) {
    console.error("[waitlist:exception]", err);
    return Response.json(
      { ok: false, error: "Could not save right now." },
      { status: 500 },
    );
  }
}
