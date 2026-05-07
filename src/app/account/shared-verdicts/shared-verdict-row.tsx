"use client";

import { useState } from "react";
import Link from "next/link";
import { ClientCopy } from "@/components/decision/client-copy";

type Props = {
  shortCode: string;
  publicUrl: string;
  mode: "incoming" | "outbound";
  headline: string;
  confidence: number | null;
  viewCount: number;
  createdAt: string;
  expiresAt: string;
  leagueId: string | null;
};

export function SharedVerdictRow(props: Props) {
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (deleted) return;
    if (!confirm("Delete this shared verdict? The public URL will return 404.")) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/shared-verdicts/${props.shortCode}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Couldn't delete. Try again.");
        return;
      }
      setDeleted(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't delete. Try again.",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) {
    return (
      <li className="rounded-md border border-border-soft bg-surface px-4 py-3 text-xs text-muted-2">
        Deleted. Public URL now returns 404.
      </li>
    );
  }

  const created = new Date(props.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const expires = new Date(props.expiresAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${
              props.mode === "incoming"
                ? "border-accent/60 text-accent"
                : "border-warning/60 text-warning"
            }`}
          >
            {props.mode}
          </span>
          {props.confidence != null && (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
              {props.confidence}% confidence
            </span>
          )}
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          {props.viewCount} {props.viewCount === 1 ? "view" : "views"}
        </span>
      </div>
      <div className="mt-2 text-sm text-foreground leading-snug">
        {props.headline}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link
          href={`/t/${props.shortCode}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
        >
          Open →
        </Link>
        <ClientCopy
          text={props.publicUrl}
          variant="prominent"
          label="Copy URL"
        />
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="inline-flex h-7 items-center rounded-sm border border-border-strong bg-background px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 transition hover:border-danger/60 hover:text-danger disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          Created {created} · Expires {expires}
        </span>
      </div>
      {error && (
        <div className="mt-2 text-xs text-danger">{error}</div>
      )}
    </li>
  );
}
