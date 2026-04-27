"use client";

/**
 * Soundboard panel. Composes:
 *   - one SoundboardDial per spec in DIAL_SPECS
 *   - the SuggestForm at the bottom
 *
 * Reads the initial JudgmentProfile from props (server-rendered);
 * tracks local state for the slider/select interactions plus the
 * per-dial "Why?" notes, and POSTs to /api/soundboard/profile on save.
 * Optimistic UX: dial moves are instant; save is explicit so we don't
 * spam the API on every drag.
 *
 * Argue is parked: dissent on a dial-baseline weight is only coherent
 * once engine wiring exists. Today the dial movement IS the user's
 * position; the inline "Why?" captures their reasoning.
 */

import { useState } from "react";
import { SoundboardDial } from "./dial";
import { SuggestForm } from "./suggest-form";
import {
  DIAL_SPECS,
  type DialId,
  type JudgmentProfile,
} from "@/lib/soundboard/types";

export function SoundboardPanel({
  initialProfile,
}: {
  initialProfile: JudgmentProfile;
}) {
  const [dials, setDials] = useState(initialProfile.dials);
  const [notes, setNotes] = useState<Partial<Record<DialId, string>>>(
    initialProfile.notes ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(
    initialProfile.last_edited_at,
  );
  const [error, setError] = useState<string | null>(null);

  function setDialValue(id: DialId, value: number | string) {
    setDials((prev) => ({ ...prev, [id]: value }));
  }

  function setDialNote(id: DialId, value: string) {
    setNotes((prev) => ({ ...prev, [id]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    // Strip empty notes before posting; only meaningful WHYs go to DB.
    const cleanNotes: Record<string, string> = {};
    for (const [k, v] of Object.entries(notes)) {
      const trimmed = (v ?? "").trim();
      if (trimmed) cleanNotes[k] = trimmed;
    }
    try {
      const res = await fetch("/api/soundboard/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dials, notes: cleanNotes }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "Save failed");
        return;
      }
      const data = (await res.json()) as { profile: JudgmentProfile };
      setSavedAt(data.profile.last_edited_at);
    } catch (err) {
      console.error("[soundboard:save]", err);
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        {DIAL_SPECS.map((spec) => (
          <SoundboardDial
            key={spec.id}
            spec={spec}
            value={dials[spec.id] ?? spec.default}
            note={notes[spec.id] ?? ""}
            onChange={(v) => setDialValue(spec.id, v)}
            onNoteChange={(v) => setDialNote(spec.id, v)}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-strong bg-surface px-5 py-3">
        <div className="text-xs text-muted">
          {savedAt
            ? `Saved ${new Date(savedAt).toLocaleString()}`
            : "Defaults active. Move a dial to start shaping the engine."}
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </div>

      <div className="mt-8">
        <SuggestForm />
      </div>
    </>
  );
}
