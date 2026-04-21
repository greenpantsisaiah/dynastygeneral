"use client";

import { useState } from "react";
import { StrategyResult } from "@/components/decision/result-card";
import type { StrategyClarifyOutput } from "@/lib/engine/schemas";
import { readDeclared } from "@/lib/strategy/declared";

type ApiResponse =
  | {
      ok: true;
      output: StrategyClarifyOutput;
      mode: "live" | "stub";
      latencyMs: number;
      tokens?: { input: number; output: number; cache_read?: number };
    }
  | { ok: false; error: string };

export function StrategyRunner({
  leagueId,
  sleeperUsername,
}: {
  leagueId: string;
  sleeperUsername?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/decisions/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          league_id: leagueId,
          sleeper_username: sleeperUsername || null,
          declared_strategy: readDeclared(leagueId),
        }),
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
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
      >
        {loading ? "Reading the roster…" : "Run structural read"}
      </button>

      {!sleeperUsername && (
        <div className="rounded-md border border-border-soft bg-surface px-4 py-3 text-xs text-muted">
          Add your Sleeper username from the hub first. Without it, the read
          is league-wide instead of roster-specific.
        </div>
      )}

      {result?.ok && (
        <div>
          <StrategyResult result={result.output} mode={result.mode} />
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
              : `Dev stub (${result.latencyMs}ms)`}
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
