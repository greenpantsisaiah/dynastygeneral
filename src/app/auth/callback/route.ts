/**
 * Auth callback. Supabase redirects here with a `code` query param
 * after OAuth (Google) or email confirmation. We exchange it for a
 * session cookie, then redirect into the app.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // Same-origin gate: rejects ?next=https://evil.example phishing.
  const next = safeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=Missing+confirmation+code`, url),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error.message)}`,
        url,
      ),
    );
  }

  await revokeInstantSessions(supabase);
  return NextResponse.redirect(new URL(next, url));
}

/**
 * A landing-form signup gets a session without proving it owns the address
 * (`instant_session` in brief-signup). The first sign-in that does prove it
 * (Google or an emailed link, both land here) signs out every other session
 * and clears the flag, so anyone who typed someone else's address loses the
 * account before its owner puts anything in it. Best-effort, tagged log.
 */
async function revokeInstantSessions(supabase: Awaited<ReturnType<typeof createClient>>): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.user_metadata?.instant_session !== true) return;
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) {
      console.error("[auth-callback:instant-session]", error.message);
      return;
    }
    const { error: clearErr } = await getAdminClient().auth.admin.updateUserById(user.id, {
      user_metadata: { instant_session: false },
    });
    if (clearErr) console.error("[auth-callback:instant-session]", clearErr.message);
  } catch (err) {
    console.error("[auth-callback:instant-session]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
  }
}
