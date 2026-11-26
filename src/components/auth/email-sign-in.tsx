"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function EmailSignInForm({ next = "/" }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (err) {
        setError(err.message);
      } else {
        setSuccess("Check your email to confirm your account.");
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(err.message);
      } else {
        router.push(next);
        router.refresh();
      }
    }

    setLoading(false);
  }

  // Passwordless sign-in. Homepage signups (/api/brief-signup) have no
  // password, so a non-Google address needs this to get back in.
  // shouldCreateUser: false keeps account creation on the signup paths.
  async function sendMagicLink() {
    setError(null);
    setSuccess(null);
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (err) {
      setError(magicLinkErrorMessage(err));
    } else {
      setSuccess("Sign-in link sent. Open it on this device.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          Password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          placeholder="At least 6 characters"
          className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
        />
      </label>

      {error && (
        <div className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-success/50 bg-success/10 px-3 py-2 text-xs text-foreground">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
      >
        {loading
          ? "Loading..."
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </button>

      {mode === "signin" && (
        <button
          type="button"
          onClick={sendMagicLink}
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface px-6 text-sm font-medium text-foreground transition hover:border-accent/60 disabled:opacity-50"
        >
          Email me a sign-in link instead
        </button>
      )}

      <p className="text-center text-xs text-muted-2">
        {mode === "signin" ? (
          <>
            No account?{" "}
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); setSuccess(null); }}
              className="text-accent hover:underline"
            >
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); setSuccess(null); }}
              className="text-accent hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}

/**
 * Supabase's raw magic-link errors read as system noise ("For security
 * purposes, you can only request this after 52 seconds."). Map the two
 * a real user hits to plain lines; anything else passes through.
 */
function magicLinkErrorMessage(err: {
  message: string;
  status?: number;
  code?: string;
}): string {
  if (/signups not allowed|not found/i.test(err.message)) {
    return "No account uses that email. Sign up on the homepage.";
  }
  if (
    err.status === 429 ||
    /rate_limit/i.test(err.code ?? "") ||
    /for security purposes|rate limit/i.test(err.message)
  ) {
    return "Link already sent. Check your inbox, or try again in a minute.";
  }
  return err.message;
}
