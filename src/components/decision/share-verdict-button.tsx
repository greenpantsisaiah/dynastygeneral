"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

type ShareMode = "incoming" | "outbound";

type Props = {
  mode: ShareMode;
  leagueId: string | null;
  output: Record<string, unknown>;
  input?: Record<string, unknown> | null;
  confidencePct: number | null;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; url: string }
  | { kind: "needs_auth" }
  | { kind: "rate_limited"; retryAfterSec: number }
  | { kind: "error"; message: string };

export function ShareVerdictButton(props: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onShare() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/shared-verdicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: props.mode,
          league_id: props.leagueId,
          output: props.output,
          input: props.input ?? null,
          team_display: null,
          confidence_pct: props.confidencePct,
        }),
      });

      if (res.status === 401) {
        setState({ kind: "needs_auth" });
        return;
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "60");
        setState({ kind: "rate_limited", retryAfterSec: retryAfter });
        return;
      }

      const json = (await res.json()) as
        | { ok: true; short_code: string; url: string }
        | { ok: false; error: string };

      if (!json.ok) {
        setState({ kind: "error", message: json.error });
        return;
      }

      try {
        await navigator.clipboard.writeText(json.url);
      } catch {
        // clipboard may be unavailable; URL is still in state for display
      }

      track({
        event: "trade_verdict_shared",
        league_id: props.leagueId ?? "",
        mode: props.mode,
      });

      setState({ kind: "ok", url: json.url });
      // Auto-fade the success state after 8s so the button is reusable.
      setTimeout(() => setState({ kind: "idle" }), 8000);
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Couldn't create share link.",
      });
    }
  }

  if (state.kind === "ok") {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
          Link copied
        </span>
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
        >
          Open →
        </a>
        <a
          href="/account/shared-verdicts"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
        >
          Manage →
        </a>
      </div>
    );
  }

  if (state.kind === "needs_auth") {
    return (
      <a
        href="/login"
        className="inline-flex h-7 items-center rounded-sm border border-border-strong bg-background px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground transition hover:border-accent/60 hover:text-accent"
      >
        Sign in to share
      </a>
    );
  }

  if (state.kind === "rate_limited") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        Wait {state.retryAfterSec}s
      </span>
    );
  }

  if (state.kind === "error") {
    return (
      <button
        type="button"
        onClick={onShare}
        className="inline-flex h-7 items-center rounded-sm border border-danger/60 bg-background px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-danger transition hover:border-accent/60 hover:text-accent"
        title={state.message}
      >
        Retry share
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={state.kind === "loading"}
      className="inline-flex h-7 items-center rounded-sm border border-border-strong bg-background px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground transition hover:border-accent/60 hover:text-accent disabled:opacity-60"
    >
      {state.kind === "loading" ? "Saving…" : "Share verdict"}
    </button>
  );
}
