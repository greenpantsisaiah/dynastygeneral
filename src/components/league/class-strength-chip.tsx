"use client";

/**
 * Class Strength Chip. Surfaces per-position rookie class strength
 * for the active draft year with explicit provenance + an inline
 * edit affordance so the user can override the FantasyCalc-derived
 * value for their specific league.
 *
 * Per founder direction 2026-05-16: "use data, but TELL the user
 * this is going on. If you're asking me to hand-author, no, but if
 * you're saying the user can hand author at the beginning or early
 * stages of the draft, yes."
 *
 * Source labeling: each position chip carries a "data" or "you" tag
 * so the user knows which numbers are FantasyCalc-derived and which
 * are their own overrides.
 */

import { useState, useTransition } from "react";
import type {
  ClassStrength,
  ClassStrengthPosition,
} from "@/lib/strategy/class-strength/compute";
import { classStrengthTone } from "@/lib/strategy/class-strength/compute";

const POSITIONS: ClassStrengthPosition[] = ["QB", "RB", "WR", "TE"];

const TONE_CLASS: Record<"strong" | "neutral" | "weak", string> = {
  strong: "border-success/60 bg-success/5 text-success",
  neutral: "border-border-soft bg-surface text-foreground",
  weak: "border-warning/60 bg-warning/5 text-warning",
};

export function ClassStrengthChip({
  classStrength,
  leagueId,
  canEdit,
}: {
  classStrength: ClassStrength;
  /** When provided + signed-in, the chip exposes an inline editor. */
  leagueId?: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<
    Partial<Record<ClassStrengthPosition, number>>
  >({});
  const [saving, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function startEdit() {
    setEditing(true);
    setDraft({});
    setFeedback(null);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
    setFeedback(null);
  }

  function resetToData() {
    if (!leagueId) return;
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/lab/league-profile/${encodeURIComponent(leagueId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              enabled: true,
              class_strength: {},
            }),
          },
        );
        if (!res.ok) {
          setFeedback("Reset failed.");
          return;
        }
        setFeedback(
          "Reset to FantasyCalc-derived class strength. Refresh to see updated multipliers.",
        );
        setEditing(false);
      } catch {
        setFeedback("Network error.");
      }
    });
  }

  function save() {
    if (!leagueId) return;
    const payload: Partial<Record<ClassStrengthPosition, number>> = {};
    for (const pos of POSITIONS) {
      const v = draft[pos];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0.25 && v <= 4.0) {
        payload[pos] = Math.round(v * 100) / 100;
      }
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/lab/league-profile/${encodeURIComponent(leagueId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              enabled: true,
              class_strength: payload,
            }),
          },
        );
        if (!res.ok) {
          setFeedback("Save failed.");
          return;
        }
        setFeedback("Saved. Refresh to see updated multipliers.");
        setEditing(false);
      } catch {
        setFeedback("Network error.");
      }
    });
  }

  return (
    <section className="mt-4 rounded-lg border border-border-soft bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Class strength · {classStrength.season}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            relative to class average
          </span>
        </div>
        {canEdit && leagueId && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:text-foreground"
          >
            Edit →
          </button>
        )}
      </div>

      <p className="mt-2 text-sm font-medium leading-snug text-foreground">
        {composeClassStrengthSummary(classStrength)}
      </p>
      <p className="mt-1 text-xs leading-snug text-muted">
        How strong each position's portion of the {classStrength.season}{" "}
        rookie class is, relative to the average of all four positions.
        Stronger position = more depth, more value to find later. Weaker
        position = scarcity bites earlier. Derived from FantasyCalc top-N
        rookie values per position; the path projector uses this to bias
        toward scarce positions.
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {POSITIONS.map((pos) => {
          const multiplier = classStrength.by_position[pos];
          const tone = classStrengthTone(multiplier);
          const source = classStrength.source_by_position[pos];
          return (
            <div
              key={pos}
              className={`rounded-md border px-3 py-2 ${TONE_CLASS[tone]}`}
              title={classStrength.provenance_by_position[pos]}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
                  {pos}
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted-2">
                  {source === "user_override" ? "you" : "data"}
                </span>
              </div>
              {editing ? (
                <input
                  type="number"
                  step="0.05"
                  min="0.25"
                  max="4.0"
                  defaultValue={multiplier.toFixed(2)}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    setDraft((d) => ({ ...d, [pos]: v }));
                  }}
                  className="mt-1 w-full rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-lg font-semibold text-foreground"
                />
              ) : (
                <div className="mt-1 text-lg font-semibold">
                  {multiplier.toFixed(2)}x
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md border border-accent/60 bg-accent/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            Save overrides
          </button>
          <button
            type="button"
            onClick={resetToData}
            disabled={saving}
            className="rounded-md border border-border-soft bg-surface-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-accent disabled:opacity-50"
          >
            Reset to FantasyCalc
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {feedback && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {feedback}
        </p>
      )}

      <div className="mt-3 border-t border-border-soft pt-2">
        <details className="text-xs">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent">
            Where these numbers come from
          </summary>
          <ul className="mt-2 space-y-1 text-[11px] leading-snug text-muted">
            {POSITIONS.map((pos) => (
              <li key={pos}>
                <span className="font-mono text-foreground">{pos}:</span>{" "}
                {classStrength.provenance_by_position[pos]}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

/**
 * One-sentence summary naming strong / weak positions in plain English.
 * Buckets the multipliers and produces text like "Loaded WR class,
 * strong RB; QB and TE classes are thin."
 */
function composeClassStrengthSummary(cs: ClassStrength): string {
  const strong: ClassStrengthPosition[] = [];
  const weak: ClassStrengthPosition[] = [];
  const loaded: ClassStrengthPosition[] = [];
  for (const pos of POSITIONS) {
    const m = cs.by_position[pos];
    if (m >= 1.4) loaded.push(pos);
    else if (m >= 1.1) strong.push(pos);
    else if (m <= 0.7) weak.push(pos);
  }
  const parts: string[] = [];
  if (loaded.length > 0) parts.push(`Loaded ${loaded.join(" / ")} class`);
  if (strong.length > 0) parts.push(`strong ${strong.join(" / ")} class`);
  if (weak.length > 0) parts.push(`thin ${weak.join(" and ")} class`);
  if (parts.length === 0) {
    return `${cs.season} class is balanced across positions; no obvious scarcity to play.`;
  }
  return `${cs.season} class: ${parts.join(", ")}.`;
}
