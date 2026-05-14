"use client";

/**
 * "Argue with this dial" modal. Captures dial_id, predefined dissent
 * shape, optional comment, and any context the parent provides
 * (current league, decision, full dial state).
 */

import { useState } from "react";
import {
  DIAL_SPECS,
  FEEDBACK_SHAPE_LABELS,
  FEEDBACK_SHAPES,
  type FeedbackShape,
} from "@/lib/lab/dial-types";

export function ArgueModal({
  dialId,
  onClose,
  context,
}: {
  dialId: string | null;
  onClose: () => void;
  context: Record<string, unknown>;
}) {
  const [shape, setShape] = useState<FeedbackShape>("weights_too_heavy");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!dialId) return null;
  const spec = DIAL_SPECS.find((s) => s.id === dialId);
  if (!spec) return null;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/soundboard/argue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dial_id: dialId,
          shape,
          comment: comment.trim() || undefined,
          context,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(
          data.error === "insert_failed"
            ? "Submission queue not ready yet (DB migration pending). Your argument is logged in console for now."
            : data.error ?? "Submit failed",
        );
        return;
      }
      setDone(true);
    } catch (err) {
      console.error("[argue:submit]", err);
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border-strong bg-surface px-5 py-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
              Argue with the dial
            </div>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {spec.name}
            </h2>
            <p className="mt-1 text-xs text-muted">{spec.short_blurb}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2 hover:text-foreground"
          >
            Close
          </button>
        </div>

        {done ? (
          <div className="mt-5 rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm">
            Argument logged. We review every one. If your input drives a
            calibration update, you&rsquo;ll get a note.
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-2">
              {FEEDBACK_SHAPES.map((s) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${
                    shape === s
                      ? "border-accent bg-accent/5"
                      : "border-border-soft bg-surface-2 hover:border-accent/60"
                  }`}
                >
                  <input
                    type="radio"
                    name="shape"
                    checked={shape === s}
                    onChange={() => setShape(s)}
                    className="accent-accent"
                  />
                  <span className="text-foreground">
                    {FEEDBACK_SHAPE_LABELS[s]}
                  </span>
                </label>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Specifics? (optional)"
              rows={3}
              className="mt-4 w-full rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />

            {error && (
              <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-foreground">
                {error}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-md border border-border-strong bg-surface-2 px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-2 transition hover:border-accent/60 hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="rounded-md bg-warning px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit argument"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
