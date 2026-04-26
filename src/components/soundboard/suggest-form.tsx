"use client";

/**
 * Suggest-a-dial form. Free-text proposal that goes to
 * mixer_suggestions. Always-visible at the bottom of the Soundboard.
 */

import { useState } from "react";

export function SuggestForm() {
  const [proposal, setProposal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (proposal.trim().length < 8) {
      setError("Tell me a sentence or two so I can act on it.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/soundboard/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposal: proposal.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(
          data.error === "insert_failed"
            ? "Suggestion queue not ready yet (DB migration pending). Logged in console for now."
            : data.error ?? "Submit failed",
        );
        return;
      }
      setDone(true);
      setProposal("");
    } catch (err) {
      console.error("[suggest:submit]", err);
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Suggest a dial
      </div>
      <p className="mt-1 text-xs text-muted">
        I wish you had a dial that... Add anything you want the engine to
        respect that the current dials don&rsquo;t cover. Goes straight to
        the founder.
      </p>
      {done ? (
        <div className="mt-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm">
          Suggestion logged. Thank you. If we ship a dial that matches your
          ask, you&rsquo;ll get a note.
        </div>
      ) : (
        <>
          <textarea
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            placeholder="A dial that does X for Y reason."
            rows={3}
            className="mt-3 w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          {error && (
            <div className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-foreground">
              {error}
            </div>
          )}
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Send to founder"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
