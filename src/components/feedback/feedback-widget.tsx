"use client";

/**
 * Floating feedback widget. Bottom-right pill that opens a small
 * modal: rating (1-5), message, optional email. POSTs to /api/feedback.
 *
 * Designed to be the lowest-friction feedback path: no signup
 * required, anonymous submissions accepted, the only required field
 * is the message itself.
 */

import { useEffect, useState } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

const RATINGS: Array<{ value: number; label: string; tone: string }> = [
  { value: 1, label: "Bad", tone: "border-danger/60 hover:bg-danger/10" },
  { value: 2, label: "Meh", tone: "border-border-strong hover:bg-surface-2" },
  {
    value: 3,
    label: "OK",
    tone: "border-border-strong hover:bg-surface-2",
  },
  { value: 4, label: "Good", tone: "border-success/40 hover:bg-success/5" },
  {
    value: 5,
    label: "Great",
    tone: "border-success/60 hover:bg-success/10",
  },
];

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rating,
          message,
          page_url:
            typeof window !== "undefined" ? window.location.href : null,
          contact_email: email || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setStatus("sent");
      setTimeout(() => {
        setOpen(false);
        // Defer state reset so the success message stays visible during fade-out.
        setTimeout(() => {
          setRating(null);
          setMessage("");
          setEmail("");
          setStatus("idle");
        }, 200);
      }, 900);
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message === "rate_limited"
            ? "You've sent a few in a short window. Wait a minute and try again."
            : "Couldn't send. Try again in a moment."
          : "Couldn't send. Try again in a moment.",
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 inline-flex h-10 items-center gap-2 rounded-full border border-accent/40 bg-background/90 px-4 font-mono text-[11px] uppercase tracking-[0.16em] text-accent shadow-lg backdrop-blur transition hover:bg-accent/10"
        aria-label="Send feedback"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-end bg-black/40 sm:items-center sm:justify-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-lg border border-border-strong bg-background px-5 py-5 sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="feedback-title"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Send feedback
            </div>
            <h2
              id="feedback-title"
              className="mt-1 text-lg font-semibold text-foreground"
            >
              What's working, what isn't?
            </h2>
            <p className="mt-1 text-xs text-muted">
              Goes straight to the founder. Anonymous OK. We read every one.
            </p>

            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                  Rating (optional)
                </div>
                <div className="mt-2 flex gap-1">
                  {RATINGS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() =>
                        setRating(rating === r.value ? null : r.value)
                      }
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                        rating === r.value
                          ? "border-accent bg-accent/15 text-accent"
                          : `${r.tone} text-muted`
                      }`}
                    >
                      {r.value} · {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                  What's on your mind?
                </span>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={4000}
                  placeholder="Tell us what works, what's broken, what's missing..."
                  className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                  Email (optional, only if we should reply)
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none"
                />
              </label>
              {error && (
                <div className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-foreground">
                  {error}
                </div>
              )}
              {status === "sent" && (
                <div className="rounded-md border border-success/50 bg-success/10 px-3 py-2 text-xs text-foreground">
                  Got it. Thanks.
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-4 text-xs font-medium text-foreground transition hover:border-accent/60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === "submitting" || !message.trim()}
                  className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                >
                  {status === "submitting" ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
