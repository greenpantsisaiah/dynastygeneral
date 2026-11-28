/**
 * Auth callback. Supabase redirects here with a `code` query param
 * after OAuth (Google) or email confirmation. We exchange it for a
 * session cookie, then redirect into the app.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";

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

  return NextResponse.redirect(new URL(next, url));
}
