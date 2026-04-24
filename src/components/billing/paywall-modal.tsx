"use client";

/**
 * Paywall modal. Surfaces when a free user hits a Pro feature. Mirrors
 * the structured error shape returned by lib/auth/paywall.ts:
 *   { error: "pro_required", action: "upgrade", pricing_url: "/pricing" }
 *   { error: "unauthorized", action: "sign_in", login_url: "/login" }
 *
 * The modal is intentionally small. The job is to convert; the long-form
 * pitch lives at /pricing. CTA goes either to /pricing or directly to
 * Stripe checkout (if signed in).
 */

import { useEffect } from "react";
import Link from "next/link";

export type PaywallReason =
  | { kind: "pro_required"; pricingUrl?: string; nextPath?: string }
  | { kind: "sign_in"; loginUrl?: string; nextPath?: string };

export function PaywallModal({
  reason,
  onClose,
}: {
  reason: PaywallReason | null;
  onClose: () => void;
}) {
  // Lock body scroll while open + close on Escape.
  useEffect(() => {
    if (!reason) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [reason, onClose]);

  if (!reason) return null;

  // Defense-in-depth: reject any nextPath that isn't a same-origin
  // path. The login route enforces this server-side too (HIGH security
  // finding 2026-04-23) but two layers is project standard.
  const safeNext =
    reason.nextPath &&
    reason.nextPath.startsWith("/") &&
    !reason.nextPath.startsWith("//")
      ? reason.nextPath
      : null;
  const isSignIn = reason.kind === "sign_in";
  const title = isSignIn
    ? "Sign in to use this feature"
    : "Help keep Dynasty Copilot running";
  const body = isSignIn
    ? "Your league data is on the line; we don't let anonymous calls burn through the coach's budget. Sign in with Google or email and you're in."
    : "Hosting and our AI engine cost real money. We\u2019re in beta, so the killer features are open to everyone. If Dynasty Copilot is making your decisions sharper, support us so the lights stay on.";
  const ctaLabel = isSignIn ? "Sign in" : "Support the project";
  const ctaHref = isSignIn
    ? `${reason.loginUrl ?? "/login"}${
        safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""
      }`
    : reason.pricingUrl ?? "/pricing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border-2 border-accent/60 bg-background px-6 py-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="paywall-title"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          {isSignIn ? "Sign in" : "Support Dynasty Copilot"}
        </div>
        <h2
          id="paywall-title"
          className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href={ctaHref}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
          >
            {ctaLabel}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition hover:border-accent/60"
          >
            Maybe later
          </button>
        </div>
        {!isSignIn && (
          <p className="mt-3 text-[11px] text-muted-2">
            14 days free, no card. Cancel anytime in one click. Optional
            during beta; everything's open either way.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Inspects a fetch Response and, if it's a paywall response, parses the
 * structured body and returns a PaywallReason. Returns null otherwise.
 *
 * Use:
 *   const res = await fetch(...);
 *   const reason = await readPaywallReason(res);
 *   if (reason) { setPaywall(reason); return; }
 */
export async function readPaywallReason(
  res: Response,
): Promise<PaywallReason | null> {
  if (res.status !== 401 && res.status !== 402) return null;
  try {
    const body = await res.clone().json();
    if (body?.error === "pro_required") {
      return { kind: "pro_required", pricingUrl: body.pricing_url };
    }
    if (body?.error === "unauthorized") {
      return { kind: "sign_in", loginUrl: body.login_url };
    }
  } catch {
    // Body wasn't JSON; fall through to a generic paywall.
  }
  return res.status === 401
    ? { kind: "sign_in" }
    : { kind: "pro_required" };
}
