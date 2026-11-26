"use client";

import { useState } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; username: string }
  | { kind: "error"; message: string };

/**
 * The one signup on the homepage: email + Sleeper username. Posts to
 * /api/brief-signup, which creates the account and stores the Sleeper
 * identity so the Tuesday brief can find every league. On success the
 * user goes straight to their leagues; there is no confirm click.
 */
export function BriefSignupForm() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const sleeper_username = String(fd.get("sleeper_username") ?? "").trim();
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/brief-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sleeper_username }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        username?: string;
      };
      if (!res.ok || !json.ok) {
        setState({
          kind: "error",
          message: json.error ?? "Signup failed. Retry in a moment.",
        });
        return;
      }
      track({ event: "brief_signup" });
      setState({ kind: "done", username: json.username ?? sleeper_username });
    } catch {
      setState({ kind: "error", message: "Network error. Retry in a moment." });
    }
  }

  if (state.kind === "done") {
    const href = `/connect?platform=sleeper&username=${encodeURIComponent(state.username)}`;
    return (
      <div className="mt-8 max-w-xl rounded-lg border border-accent/40 bg-accent/10 p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          You&apos;re in
        </div>
        <p className="mt-2 text-base text-foreground">
          Your leagues are ready to open now. The brief goes to the address
          on the account on Tuesday mornings during the season.
        </p>
        <Link
          href={href}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Open my leagues →
        </Link>
      </div>
    );
  }

  const submitting = state.kind === "submitting";
  return (
    <form onSubmit={onSubmit} className="mt-6 max-w-xl sm:mt-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="sr-only">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            className={inputCls}
          />
        </label>
        <label>
          <span className="sr-only">Sleeper username</span>
          <input
            name="sleeper_username"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Sleeper username"
            className={inputCls}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
      >
        {submitting ? "Finding your leagues…" : "Start my Tuesday brief"}
      </button>
      {state.kind === "error" && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        Free during the beta · Sleeper read-only · Unsubscribe from any
        email, no login
      </p>
      <p className="mt-2 text-xs text-muted-2">
        By signing up you agree to the{" "}
        <a href="/terms" className="text-accent hover:underline">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-accent hover:underline">
          Privacy Policy
        </a>
        . Rather look first?{" "}
        <Link href="/connect" className="text-accent hover:underline">
          Open the app without an email
        </Link>
        .
      </p>
    </form>
  );
}

// text-base (16px) prevents iOS Safari auto-zoom on focus.
const inputCls =
  "h-12 w-full rounded-md border border-border-strong bg-surface px-4 text-base text-foreground outline-none transition placeholder:text-muted-2 focus:border-accent";
