"use client";

import { useEffect, useRef, useState } from "react";
import { Ticker } from "@/components/ui/ticker";

type Status = "idle" | "submitting" | "success" | "error";

type CountState =
  | { kind: "idle" }
  | { kind: "loading"; username: string }
  | {
      kind: "found";
      username: string;
      display_name: string | null;
      season: string;
      dynasty: number;
      other: number;
    }
  | { kind: "missing"; username: string }
  | { kind: "error"; username: string; message: string };

export function Waitlist() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<CountState>({ kind: "idle" });
  const [username, setUsername] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced count lookup as the user types
  useEffect(() => {
    const cleaned = username.trim().replace(/^@/, "");
    if (cleaned.length < 2) {
      // Debounce-reset to idle on short/empty input. The setState here
      // is the correct behavior (input < 2 chars → cancel pending lookup)
      // and doesn't cause a cascading render: it's inside an effect
      // already gated on `username` and only writes when the derived
      // condition differs from the current state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount({ kind: "idle" });
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setCount({ kind: "loading", username: cleaned });
      try {
        const res = await fetch(
          `/api/sleeper/count?username=${encodeURIComponent(cleaned)}`,
          { signal: controller.signal },
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          dynasty?: number;
          other?: number;
          season?: string;
          display_name?: string | null;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          if (res.status === 404) {
            setCount({ kind: "missing", username: cleaned });
          } else {
            setCount({
              kind: "error",
              username: cleaned,
              message: json.error ?? "Sleeper didn't respond.",
            });
          }
          return;
        }
        setCount({
          kind: "found",
          username: cleaned,
          display_name: json.display_name ?? null,
          season: json.season ?? "",
          dynasty: json.dynasty ?? 0,
          other: json.other ?? 0,
        });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setCount({
          kind: "error",
          username: cleaned,
          message: "Sleeper didn't respond.",
        });
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const autoCount = count.kind === "found" ? count.dynasty : null;
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      sleeper_username: String(fd.get("sleeper_username") ?? "").trim(),
      league_count: autoCount,
      focus: String(fd.get("focus") ?? "").trim() || null,
      is_creator: fd.get("is_creator") === "on",
      pain_point: String(fd.get("pain_point") ?? "").trim() || null,
    };

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(
          json.error ?? "Couldn't submit your request. Try again in a moment.",
        );
      }
      setStatus("success");
      form.reset();
      setUsername("");
      setCount({ kind: "idle" });
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't submit your request. Try again in a moment.",
      );
    }
  }

  return (
    <section id="waitlist" className="border-b border-border-soft py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <Ticker label="08 · Private beta" />
        <h2 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Private beta for serious dynasty players.
        </h2>
        <p className="mt-6 text-lg text-muted">
          We are previewing with a small group of high-volume players, active
          traders, dynasty creators, and people who will stress-test this in
          real leagues. If that is you, request access.
        </p>

        {status === "success" ? (
          <div className="mt-10 rounded-lg border border-accent/40 bg-accent/10 p-6 text-sm text-foreground">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Requested
            </div>
            <p className="mt-2 text-base">
              You&apos;re on the list. We&apos;re hand-selecting early beta
              users and will reach out directly.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-10 grid gap-4">
            <Grid>
              <Field label="Name">
                <input
                  name="name"
                  required
                  autoComplete="name"
                  className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputCls}
                />
              </Field>
            </Grid>
            <Field label="Sleeper username (we'll detect your leagues)">
              <input
                name="sleeper_username"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. izzydabomb"
                className={inputCls}
              />
              <CountDisplay state={count} />
            </Field>
            <Field label="Are you more active in drafts or trades right now?">
              <select name="focus" className={inputCls} defaultValue="">
                <option value="" disabled>
                  Choose one
                </option>
                <option value="drafts">Drafts</option>
                <option value="trades">Trades</option>
                <option value="both">Both, constantly</option>
              </select>
            </Field>
            <Field label="Biggest dynasty pain point (optional)">
              <textarea
                name="pain_point"
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </Field>
            <label className="flex items-start gap-3 text-sm text-muted">
              <input
                type="checkbox"
                name="is_creator"
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span>
                <span className="text-foreground">
                  I&apos;m a creator, commish, or community leader.
                </span>{" "}
                Fast-track me for creator-tier access and the partner preview.
              </span>
            </label>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-4">
              <button
                type="submit"
                disabled={status === "submitting"}
                className="inline-flex h-12 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60 sm:h-11 sm:w-auto"
              >
                {status === "submitting" ? "Sending…" : "Request access"}
              </button>
              {status === "error" && error && (
                <span className="text-sm text-danger">{error}</span>
              )}
            </div>
            <p className="text-xs text-muted-2">
              By requesting access you agree to our{" "}
              <a href="/privacy" className="text-accent hover:underline">
                Privacy Policy
              </a>{" "}
              and to receive email about beta access. Unsubscribe in any
              reply.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}

function CountDisplay({ state }: { state: CountState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "loading") {
    return (
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        Checking Sleeper…
      </div>
    );
  }
  if (state.kind === "missing") {
    return (
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-danger">
        No Sleeper account matches &ldquo;{state.username}&rdquo;.
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        {state.message}
      </div>
    );
  }
  // found
  return (
    <div className="mt-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
      Identified{state.display_name ? ` · ${state.display_name}` : ""} ·{" "}
      {state.dynasty} dynasty{state.dynasty === 1 ? " league" : " leagues"}
      {state.other > 0 ? ` · ${state.other} other` : ""}
      {state.season ? ` · ${state.season}` : ""}
    </div>
  );
}

// text-base (16px) prevents iOS Safari auto-zoom on focus. Anything
// smaller triggers the zoom-then-back-out dance which feels broken
// on mobile. Desktop visual delta is negligible.
const inputCls =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2.5 text-base text-foreground outline-none transition focus:border-accent";

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        {label}
      </span>
      {children}
    </label>
  );
}
