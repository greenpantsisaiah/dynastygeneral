"use client";

/**
 * Opponent notes panel. Per-opponent textarea + saved-notes list inside
 * the OpponentCharacterizations card. The user types counterparty
 * stated plans, trade intent, trigger conditions, psychological reads;
 * Coach reads them via opponents[].notes in its context.
 *
 * Per founder direction 2026-05-12: this should be envisioned as
 * notes the user types AND system observations harder for a human to
 * detect. Auto-observations live alongside in the existing
 * OpponentCharacterizations reasons; this panel handles the manual
 * note input + persistence.
 *
 * Closes the "counterparty-stated-plans structured field" extension
 * from project_coach_trade_creativity. The storage layer + API +
 * Coach context plumbing all existed already; the UI to write notes
 * is the missing piece.
 */

import { useState, useTransition } from "react";

const NOTE_KINDS = [
  { id: "stated_plan", label: "Said plan" },
  { id: "trade_intent", label: "Trade intent" },
  { id: "trigger_condition", label: "Trigger" },
  { id: "psych_read", label: "Psych read" },
  { id: "other", label: "Other" },
] as const;

export type OpponentNoteItem = {
  id: string;
  body: string;
  kind: (typeof NOTE_KINDS)[number]["id"];
  created_at: string;
};

export type OpponentNotesPanelProps = {
  leagueId: string;
  opponentRosterId: number;
  ownerName: string | null;
  initialNotes: OpponentNoteItem[];
  /**
   * False when the viewer is unauthenticated (no Sleeper session linked
   * to a Supabase user). In that case the panel renders a one-line
   * "sign in to save notes" prompt instead of a form.
   */
  canWrite: boolean;
};

export function OpponentNotesPanel({
  leagueId,
  opponentRosterId,
  ownerName,
  initialNotes,
  canWrite,
}: OpponentNotesPanelProps) {
  const [notes, setNotes] = useState<OpponentNoteItem[]>(initialNotes);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<OpponentNoteItem["kind"]>("stated_plan");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasNotes = notes.length > 0;

  async function submit() {
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Note required.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/opponent-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            league_id: leagueId,
            opponent_roster_id: opponentRosterId,
            body: trimmed,
            kind,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `HTTP ${res.status}`);
          return;
        }
        const j = (await res.json()) as { id: string };
        // Prepend optimistically; reload on next nav for canonical.
        setNotes((prev) => [
          {
            id: j.id,
            body: trimmed,
            kind,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        setBody("");
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  async function remove(noteId: string) {
    startTransition(async () => {
      const res = await fetch(
        `/api/opponent-notes?id=${encodeURIComponent(noteId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    });
  }

  return (
    <div className="mt-3 border-t border-border-soft pt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Notes on {ownerName ?? "this manager"}
          {hasNotes && (
            <span className="ml-1 text-foreground">({notes.length})</span>
          )}
        </span>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:text-foreground transition-colors"
          >
            {open ? "Cancel" : "+ Note"}
          </button>
        ) : (
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
            Sign in to save
          </span>
        )}
      </div>

      {hasNotes && (
        <ul className="mt-2 space-y-1">
          {notes.map((n) => (
            <li
              key={n.id}
              className="flex items-baseline justify-between gap-2 text-[11px] leading-snug"
            >
              <span className="text-foreground">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-2 mr-2">
                  {NOTE_KINDS.find((k) => k.id === n.kind)?.label ?? n.kind}
                </span>
                {n.body}
              </span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  disabled={isPending}
                  className="shrink-0 font-mono text-[10px] text-muted-2 hover:text-danger transition-colors"
                  aria-label="Delete note"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && canWrite && (
        <div className="mt-2 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`"${ownerName ?? "They"} said..." or paste the message they sent you.`}
            className="w-full min-h-[60px] rounded-md border border-border-soft bg-surface px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-2"
            maxLength={2000}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as OpponentNoteItem["kind"])
              }
              className="rounded-md border border-border-soft bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground"
            >
              {NOTE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !body.trim()}
              className="rounded-md border border-accent/60 bg-accent/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {isPending ? "Saving" : "Save note"}
            </button>
            {error && (
              <span className="font-mono text-[10px] text-danger">{error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
