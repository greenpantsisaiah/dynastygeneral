import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { getUserByUsername } from "@/lib/sleeper";

/**
 * Landing-page signup: email + Sleeper username in one step.
 *
 * Creates the auth account server-side (no password, no confirm click)
 * and writes the verified Sleeper identity onto the profile. The
 * `handle_new_user` trigger (migration 0002) creates the profiles +
 * subscriptions rows, so the weekly brief cron (which reads `profiles`)
 * picks the account up on the next Tuesday with no change to the send.
 * The user can sign in later with Google or a magic link on the same
 * address; there is no password to forget.
 *
 * Safety:
 * - Rate limited per IP (shares the waitlist bucket: 3 per minute).
 * - The Sleeper username is verified against the public API before any
 *   write, so a typo never creates a brief that can't render.
 * - An address that already has an account is left untouched (we never
 *   re-point someone's brief at a different Sleeper user from an
 *   unauthenticated form). The response is the same either way, so the
 *   form does not reveal which addresses have accounts.
 * - Every brief carries a one-click unsubscribe, which covers an address
 *   entered by someone other than its owner.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  sleeper_username: z
    .string()
    .trim()
    .transform((s) => s.replace(/^@/, ""))
    .pipe(z.string().min(2).max(60).regex(/^[a-zA-Z0-9_.-]+$/)),
});

export async function POST(req: Request) {
  const rate = await checkRateLimit("waitlist", clientIpFrom(req));
  if (!rate.allowed) {
    return Response.json(
      { ok: false, error: "Too many signups from this connection. Wait a minute and retry." },
      { status: 429, headers: { "retry-after": String(Math.ceil(rate.reset_ms / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Signup was unreadable. Refresh and retry." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return Response.json(
      {
        ok: false,
        error:
          field === "email"
            ? "Check the email address."
            : "Check the Sleeper username. Letters, numbers, dots, dashes and underscores only.",
      },
      { status: 400 },
    );
  }
  const { email, sleeper_username } = parsed.data;

  let sleeperUser;
  try {
    sleeperUser = await getUserByUsername(sleeper_username);
  } catch (err) {
    console.error("[brief-signup:sleeper]", err instanceof Error ? err.message : err);
    return Response.json(
      { ok: false, error: "Sleeper didn't respond. Retry in a moment." },
      { status: 502 },
    );
  }
  if (!sleeperUser) {
    return Response.json(
      { ok: false, error: `No Sleeper account matches "${sleeper_username}".` },
      { status: 404 },
    );
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch (err) {
    console.error("[brief-signup:config]", err instanceof Error ? err.message : err);
    return Response.json(
      { ok: false, error: "Signups are offline right now. Retry later." },
      { status: 503 },
    );
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    // No confirm click by design (founder decision: lowest-friction start).
    // Marking the address confirmed lets a later Google or magic-link
    // sign-in on the same address land on this account instead of
    // forking a second one.
    email_confirm: true,
    user_metadata: { signup_source: "landing_brief" },
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "";
    const exists =
      createErr?.code === "email_exists" ||
      createErr?.status === 422 ||
      /already (been )?registered|already exists/i.test(msg);
    if (exists) {
      // Existing account: change nothing, answer the same as a new one.
      return Response.json({ ok: true, username: sleeperUser.username ?? sleeper_username });
    }
    console.error("[brief-signup:create]", createErr?.code, msg);
    return Response.json(
      { ok: false, error: "Couldn't create the account. Retry in a moment." },
      { status: 500 },
    );
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      sleeper_user_id: sleeperUser.user_id,
      sleeper_username: sleeperUser.display_name ?? sleeperUser.username ?? sleeper_username,
    })
    .eq("id", created.user.id);
  if (profileErr) {
    // The account exists but the brief can't find leagues without the
    // Sleeper id. Log loudly; the user can still connect from /connect.
    console.error("[brief-signup:profile]", created.user.id, profileErr.message);
  }

  // Welcome brief hook: once src/lib/email/welcome-brief.ts lands (the
  // PR after Trade Desk #133), call `await sendWelcomeBriefIfDue(created.user.id)`
  // here. It is idempotent, never throws, and respects the send guard.
  console.info("[brief-signup:created]", JSON.stringify({ user: created.user.id }));
  return Response.json({ ok: true, username: sleeperUser.username ?? sleeper_username });
}
