"use client";

import { useState } from "react";
import {
  TradeIncomingResult,
  TradeOutboundResult,
} from "@/components/decision/result-card";
import type {
  TradeIncomingOutput,
  TradeOutboundOutput,
} from "@/lib/engine/schemas";
import { readDeclared } from "@/lib/strategy/declared";
import { AssetTokenInput } from "@/components/league/asset-token-input";
import {
  PaywallModal,
  readPaywallReason,
  type PaywallReason,
} from "@/components/billing/paywall-modal";

type ApiResponse =
  | {
      ok: true;
      mode: "incoming";
      engine_mode: "live" | "stub";
      output: TradeIncomingOutput;
      latencyMs: number;
      tokens?: { input: number; output: number; cache_read?: number };
    }
  | {
      ok: true;
      mode: "outbound";
      engine_mode: "live" | "stub";
      output: TradeOutboundOutput;
      latencyMs: number;
      tokens?: { input: number; output: number; cache_read?: number };
    }
  | { ok: false; error: string };

type EngineMode = "incoming" | "outbound";

export function TradeForm({
  leagueId,
  sleeperUsername,
  mode,
}: {
  leagueId: string;
  sleeperUsername?: string;
  mode: EngineMode;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const fd = new FormData(e.currentTarget);
    const body =
      mode === "incoming"
        ? buildIncoming(fd, leagueId, sleeperUsername)
        : buildOutbound(fd, leagueId, sleeperUsername);

    if (mode === "incoming") {
      const inc = body as { you_send: string[]; you_receive: string[] };
      if (inc.you_send.length === 0 || inc.you_receive.length === 0) {
        setResult({ ok: false, error: "Add at least one asset to both sides of the trade." });
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/decisions/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const reason = await readPaywallReason(res);
      if (reason) {
        setPaywall({ ...reason, nextPath: window.location.pathname });
        return;
      }
      if (!res.ok) {
        if (res.status === 429) {
          setResult({ ok: false, error: "Too many requests. Wait a moment and try again." });
          return;
        }
        const errBody = await res.json().catch(() => null);
        setResult({ ok: false, error: errBody?.error ?? "Something went wrong. Refresh and try again." });
        return;
      }
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
      <PaywallModal reason={paywall} onClose={() => setPaywall(null)} />
      <form onSubmit={onSubmit} className="grid gap-4">
        {mode === "incoming" ? <IncomingFields /> : <OutboundFields />}
        <div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
          >
            {loading
              ? mode === "incoming"
                ? "Reading the offer…"
                : "Building the attack…"
              : mode === "incoming"
                ? "Evaluate offer"
                : "Build attack"}
          </button>
        </div>
      </form>

      {result?.ok && result.mode === "incoming" && (
        <MetaWrap result={result}>
          <TradeIncomingResult
            result={result.output}
            mode={result.engine_mode}
          />
        </MetaWrap>
      )}
      {result?.ok && result.mode === "outbound" && (
        <MetaWrap result={result}>
          <TradeOutboundResult
            result={result.output}
            mode={result.engine_mode}
          />
        </MetaWrap>
      )}

      {result && !result.ok && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-foreground">
          {result.error}
        </div>
      )}
    </div>
  );
}

function MetaWrap({
  result,
  children,
}: {
  result: {
    latencyMs: number;
    tokens?: { input: number; output: number; cache_read?: number };
  };
  children: React.ReactNode;
}) {
  return (
    <div>
      {children}
      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        {result.latencyMs}ms
        {result.tokens
          ? ` · ${result.tokens.input}→${result.tokens.output} tokens${
              result.tokens.cache_read ? ` · cache ${result.tokens.cache_read}` : ""
            }`
          : ""}
      </div>
    </div>
  );
}

function IncomingFields() {
  return (
    <>
      <Field label="You send">
        <AssetTokenInput
          name="you_send"
          required
          placeholder="Type a player or pick (e.g. Jalen Hurts, 2027 2nd)"
        />
      </Field>
      <Field label="You receive">
        <AssetTokenInput
          name="you_receive"
          required
          placeholder="Type a player or pick (e.g. Malik Nabers, 2026 4th)"
        />
      </Field>
      <Field label="Who's offering (optional: team or manager)">
        <input name="other_manager" className={inputCls} />
      </Field>
      <Field label="Context (optional: urgency, competing offers, history)">
        <textarea name="notes" rows={3} className={`${inputCls} resize-none`} />
      </Field>
    </>
  );
}

function OutboundFields() {
  return (
    <>
      <Field label="Target type">
        <select name="target_kind" defaultValue="player" className={inputCls}>
          <option value="player">Specific player</option>
          <option value="manager">Specific manager / team</option>
        </select>
      </Field>
      <Field label="Target name">
        <input
          name="target_name"
          required
          placeholder="e.g. Malik Nabers, or TeamName"
          className={inputCls}
        />
      </Field>
      <Field label="Willing to move (optional)">
        <AssetTokenInput
          name="willing_to_move"
          placeholder="Type a player or pick (e.g. Jalen Hurts, 2027 1st)"
        />
      </Field>
      <Field label="Context (optional)">
        <textarea name="notes" rows={3} className={`${inputCls} resize-none`} />
      </Field>
    </>
  );
}

function buildIncoming(
  fd: FormData,
  leagueId: string,
  username?: string,
) {
  return {
    mode: "incoming" as const,
    league_id: leagueId,
    sleeper_username: username || null,
    you_send: splitLines(String(fd.get("you_send") ?? "")),
    you_receive: splitLines(String(fd.get("you_receive") ?? "")),
    other_manager: String(fd.get("other_manager") ?? "").trim() || null,
    notes: String(fd.get("notes") ?? "").trim() || null,
    declared_strategy: readDeclared(leagueId),
  };
}

function buildOutbound(
  fd: FormData,
  leagueId: string,
  username?: string,
) {
  const willingRaw = String(fd.get("willing_to_move") ?? "");
  const willing = splitLines(willingRaw);
  return {
    mode: "outbound" as const,
    league_id: leagueId,
    sleeper_username: username || null,
    target_kind: String(fd.get("target_kind") ?? "player") as "player" | "manager",
    target_name: String(fd.get("target_name") ?? "").trim(),
    willing_to_move: willing.length > 0 ? willing : null,
    notes: String(fd.get("notes") ?? "").trim() || null,
    declared_strategy: readDeclared(leagueId),
  };
}

function splitLines(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
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
