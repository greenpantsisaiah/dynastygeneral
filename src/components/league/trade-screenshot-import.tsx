"use client";

/**
 * Trade screenshot import for the incoming-trade form.
 *
 * The user drops, pastes, or picks a Sleeper trade screenshot (league
 * chat trade card or the trade offer screen). The server reads it and
 * matches every asset to the league's rosters; this component shows the
 * read for a quick confirm-and-edit before anything is evaluated:
 *
 *   - each asset with what the screenshot printed and what it matched
 *   - "Which player?" choices for look-alike names (two "B. Robinson"s)
 *   - a one-tap side swap when the sides are uncertain
 *
 * Confirming fills the existing token inputs (still editable) and can
 * run the evaluation straight away. Typing a trade by hand still works.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PaywallModal,
  readPaywallReason,
  type PaywallReason,
} from "@/components/billing/paywall-modal";

type Choice = {
  player_id: string;
  label: string;
  detail: string;
  owner_roster_id: number | null;
};

type Asset = {
  kind: "player" | "pick";
  label: string;
  read_as: string;
  confidence: "exact" | "likely" | "ambiguous" | "unmatched";
  player_id: string | null;
  detail: string | null;
  owner_roster_id: number | null;
  alternatives: Choice[];
};

type ReadResponse =
  | {
      ok: true;
      engine_mode: "live" | "stub";
      format: string;
      league_name: string | null;
      you_send: Asset[];
      you_receive: Asset[];
      other_manager: string | null;
      side_confidence: "high" | "low";
      side_reason: string;
      warnings: string[];
    }
  | { ok: false; error: string };

export type ScreenshotTrade = {
  you_send: string[];
  you_receive: string[];
  other_manager: string | null;
};

const MAX_EDGE = 2000;

/** Downscale to a JPEG so phone screenshots stay well under upload limits. */
async function toUploadable(file: Blob): Promise<{ base64: string; mediaType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the image.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}

export function TradeScreenshotImport({
  leagueId,
  sleeperUsername,
  onApply,
}: {
  leagueId: string;
  sleeperUsername?: string;
  /** `evaluate` true = fill the form and run the evaluation now. */
  onApply: (trade: ScreenshotTrade, evaluate: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Extract<ReadResponse, { ok: true }> | null>(null);
  const [swapped, setSwapped] = useState(false);
  // Chosen player per ambiguous asset, keyed "send:0" / "receive:2".
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: Blob) => {
      if (!file.type.startsWith("image/")) {
        setError("That file isn't an image. Use a screenshot.");
        return;
      }
      setBusy(true);
      setError(null);
      setRead(null);
      setSwapped(false);
      setChoices({});
      try {
        const img = await toUploadable(file);
        const res = await fetch("/api/decisions/trade/screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            league_id: leagueId,
            sleeper_username: sleeperUsername || null,
            media_type: img.mediaType,
            image_base64: img.base64,
          }),
        });
        const reason = await readPaywallReason(res);
        if (reason) {
          setPaywall({ ...reason, nextPath: window.location.pathname });
          return;
        }
        const body = (await res.json().catch(() => null)) as ReadResponse | null;
        if (!body) {
          setError(`Screenshot reader returned ${res.status} with no detail. Retry.`);
          return;
        }
        if (!body.ok) {
          setError(body.error);
          return;
        }
        setRead(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed. Retry.");
      } finally {
        setBusy(false);
      }
    },
    [leagueId, sleeperUsername],
  );

  // Paste anywhere on the page (desktop: Cmd/Ctrl+V a copied screenshot).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void upload(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  const send = read ? (swapped ? read.you_receive : read.you_send) : [];
  const receive = read ? (swapped ? read.you_send : read.you_receive) : [];
  const sideKey = (side: "send" | "receive", i: number) =>
    `${swapped ? (side === "send" ? "receive" : "send") : side}:${i}`;

  const unresolved = read
    ? [...send.map((a, i) => ({ a, k: sideKey("send", i) })), ...receive.map((a, i) => ({ a, k: sideKey("receive", i) }))]
        .filter(({ a, k }) => a.confidence === "ambiguous" && !choices[k]).length
    : 0;

  function labelsFor(assets: Asset[], side: "send" | "receive"): string[] {
    return assets.map((a, i) => {
      const chosen = choices[sideKey(side, i)];
      if (!chosen) return a.label;
      if (chosen === a.player_id) return a.label;
      return a.alternatives.find((c) => c.player_id === chosen)?.label ?? a.label;
    });
  }

  function apply(evaluate: boolean) {
    if (!read) return;
    onApply(
      {
        you_send: labelsFor(send, "send"),
        you_receive: labelsFor(receive, "receive"),
        other_manager: read.other_manager,
      },
      evaluate,
    );
    setRead(null);
  }

  return (
    <div className="grid gap-3">
      <PaywallModal reason={paywall} onClose={() => setPaywall(null)} />
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && fileRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-5 text-center transition ${
          dragging ? "border-accent bg-accent/10" : "border-border-strong bg-surface hover:border-accent/60"
        } ${busy ? "opacity-60" : ""}`}
      >
        <span className="text-sm font-semibold text-foreground">
          {busy ? "Reading the screenshot…" : "Upload a Sleeper trade screenshot"}
        </span>
        <span className="text-xs text-muted">
          {busy
            ? "Matching names to your league's rosters."
            : "Trade card from league chat or the offer screen. Tap to choose, drop, or paste."}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-foreground">
          {error}
        </div>
      )}

      {read && (
        <div className="rounded-lg border border-accent/40 bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
              Read from screenshot{read.league_name ? ` · ${read.league_name}` : ""}
              {read.engine_mode === "stub" ? " · dev stub" : ""}
            </span>
            <button
              type="button"
              onClick={() => setSwapped((s) => !s)}
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:brightness-110"
            >
              ⇄ Swap sides
            </button>
          </div>
          <p
            className={`mt-2 text-xs ${
              read.side_confidence === "low" && !swapped ? "text-warning" : "text-muted"
            }`}
          >
            {swapped ? "Sides swapped by you." : read.side_reason}
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <SideList
              title="You send"
              assets={send}
              keyFor={(i) => sideKey("send", i)}
              choices={choices}
              onChoose={(k, id) => setChoices((c) => ({ ...c, [k]: id }))}
            />
            <SideList
              title={`You receive${read.other_manager ? ` from ${read.other_manager}` : ""}`}
              assets={receive}
              keyFor={(i) => sideKey("receive", i)}
              choices={choices}
              onChoose={(k, id) => setChoices((c) => ({ ...c, [k]: id }))}
            />
          </div>

          {read.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-warning">
              {read.warnings.map((w, i) => (
                <li key={i}>· {w}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={unresolved > 0}
              onClick={() => apply(true)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
            >
              Looks right. Evaluate
            </button>
            <button
              type="button"
              disabled={unresolved > 0}
              onClick={() => apply(false)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border-strong px-4 text-sm text-foreground transition hover:border-accent disabled:opacity-50"
            >
              Fill the form to edit
            </button>
            {unresolved > 0 && (
              <span className="text-xs text-muted">
                Pick the player for {unresolved} name{unresolved === 1 ? "" : "s"} above.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SideList({
  title,
  assets,
  keyFor,
  choices,
  onChoose,
}: {
  title: string;
  assets: Asset[];
  keyFor: (i: number) => string;
  choices: Record<string, string>;
  onChoose: (key: string, playerId: string) => void;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">{title}</div>
      <ul className="mt-2 space-y-2">
        {assets.map((a, i) => {
          const k = keyFor(i);
          if (a.confidence === "ambiguous" && a.player_id) {
            const options: Choice[] = [
              {
                player_id: a.player_id,
                label: a.label,
                detail: a.detail ?? "",
                owner_roster_id: a.owner_roster_id,
              },
              ...a.alternatives,
            ];
            return (
              <li key={k} className="rounded-md border border-warning/50 bg-warning/5 px-3 py-2">
                <div className="text-xs text-muted">
                  Which player is &ldquo;{a.read_as}&rdquo;?
                </div>
                <div className="mt-1.5 grid gap-1">
                  {options.map((o) => (
                    <label key={o.player_id} className="flex cursor-pointer items-baseline gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name={k}
                        checked={choices[k] === o.player_id}
                        onChange={() => onChoose(k, o.player_id)}
                      />
                      <span className="font-medium">{o.label}</span>
                      <span className="font-mono text-[10px] text-muted-2">
                        {o.detail}
                        {o.owner_roster_id !== null ? " · rostered here" : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </li>
            );
          }
          const tone =
            a.confidence === "exact"
              ? "border-border-strong"
              : "border-warning/50 bg-warning/5";
          return (
            <li key={k} className={`rounded-md border px-3 py-2 ${tone}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{a.label}</span>
                <span className="font-mono text-[10px] text-muted-2">{a.detail}</span>
              </div>
              {a.confidence !== "exact" && (
                <div className="mt-0.5 text-xs text-muted">
                  {a.confidence === "unmatched" ? "Not matched. " : "Best guess. "}
                  Read as &ldquo;{a.read_as}&rdquo;.
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
