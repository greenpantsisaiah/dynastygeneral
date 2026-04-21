"use client";

import { useState } from "react";
import { PickResult } from "@/components/decision/result-card";
import type { PickOutput } from "@/lib/engine/schemas";
import { readDeclared } from "@/lib/strategy/declared";

type ApiResponse =
  | {
      ok: true;
      output: PickOutput;
      mode: "live" | "stub";
      latencyMs: number;
      tokens?: {
        input: number;
        output: number;
        cache_read?: number;
        cache_creation?: number;
      };
    }
  | { ok: false; error: string };

export function PickForm({
  leagueId,
  sleeperUsername,
  defaultCurrentPick = "",
  defaultPlayers = [],
}: {
  leagueId: string;
  sleeperUsername?: string;
  defaultCurrentPick?: string;
  defaultPlayers?: string[];
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const hasPrefill = defaultPlayers.length > 0;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const fd = new FormData(e.currentTarget);
    const players = String(fd.get("players") ?? "")
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      league_id: leagueId,
      sleeper_username: sleeperUsername || null,
      current_pick: String(fd.get("current_pick") ?? "").trim(),
      available_players: players,
      notes: String(fd.get("notes") ?? "").trim() || null,
      declared_strategy: readDeclared(leagueId),
    };

    try {
      const res = await fetch("/api/decisions/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse;
      setResult(json);
    } catch (err) {
      setResult({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Engine didn't respond. Retry in a moment.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-10 space-y-8">
      <form onSubmit={onSubmit} className="grid gap-4">
        <Field
          label={
            defaultCurrentPick
              ? `Current pick (pre-filled: ${defaultCurrentPick})`
              : "Current pick (e.g. 5.9 or 57)"
          }
        >
          <input
            name="current_pick"
            required
            defaultValue={defaultCurrentPick}
            placeholder="5.9"
            className={inputCls}
          />
        </Field>
        <Field
          label={
            hasPrefill
              ? `Available players (${defaultPlayers.length} pre-filled from live draft; edit as needed)`
              : "Available players (one per line or comma-separated)"
          }
        >
          <textarea
            name="players"
            required
            rows={hasPrefill ? 12 : 6}
            defaultValue={hasPrefill ? defaultPlayers.join("\n") : ""}
            placeholder="Jordan Addison&#10;DK Metcalf&#10;RJ Harvey&#10;Derrick Henry"
            className={`${inputCls} resize-y font-mono text-sm`}
          />
        </Field>
        <Field label="Context (optional: constraints, trade-back interest, anything else)">
          <textarea
            name="notes"
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </Field>
        <div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Reading the board…" : "Get recommendation"}
          </button>
        </div>
      </form>

      {result?.ok && (
        <div>
          <PickResult result={result.output} mode={result.mode} />
          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            {result.mode === "live"
              ? `Live · ${result.latencyMs}ms${
                  result.tokens
                    ? ` · ${result.tokens.input}→${result.tokens.output} tokens${
                        result.tokens.cache_read
                          ? ` · cache ${result.tokens.cache_read}`
                          : ""
                      }`
                    : ""
                }`
              : `Dev stub · no API key (${result.latencyMs}ms)`}
          </div>
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-foreground">
          {result.error}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

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
