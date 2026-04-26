"use client";

/**
 * Soundboard panel. Composes:
 *   - one SoundboardDial per spec in DIAL_SPECS
 *   - the SuggestForm at the bottom
 *   - the ArgueModal that opens when any dial's "Argue" button fires
 *
 * Reads the initial JudgmentProfile from props (server-rendered);
 * tracks local state for the slider/select interactions and POSTs to
 * /api/soundboard/profile on save. Optimistic UX: dial moves are
 * instant; save is explicit so we don't spam the API on every drag.
 */

import { useState } from "react";
import { SoundboardDial } from "./dial";
import { ArgueModal } from "./argue-modal";
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
  const [arguingId, setArguingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(
    initialProfile.last_edited_at,
  );
  const [error, setError] = useState<string | null>(null);

  function setDialValue(id: DialId, value: number | string) {
    setDials((prev) => ({ ...prev, [id]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/soundboard/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dials }),
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
            onChange={(v) => setDialValue(spec.id, v)}
            onArgue={(id) => setArguingId(id)}
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

      <ArgueModal
        dialId={arguingId}
        onClose={() => setArguingId(null)}
        context={{ dial_state: dials }}
      />
    </>
  );
}
