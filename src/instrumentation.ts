/**
 * Next.js instrumentation hook.
 *
 * 1. Counts server errors per deployed commit so the post-deploy tripwire
 *    can detect an error spike and revert (DEPLOYMENT.md "Post-deploy
 *    tripwire").
 * 2. Records every server error and every tagged console.error (the
 *    codebase's silent-catch convention) in the incident log, which the
 *    hourly incident watch turns into fix tickets
 *    (docs/team/INCIDENTS.md).
 */

import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installConsoleErrorCapture } = await import("@/lib/ops/incidents");
  installConsoleErrorCapture();
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Framework control flow (notFound, redirect) surfaces as digests that
  // start with NEXT_. Those are not failures.
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) return;
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { recordServerError } = await import("@/lib/ops/error-counter");
  const { recordIncident } = await import("@/lib/ops/incidents");
  const e = err as Error;
  await Promise.all([
    recordServerError(),
    recordIncident({
      source: "server_error",
      key: context?.routePath ?? "unknown-route",
      message: e?.message ?? String(err),
      context: {
        path: request?.path?.split("?")[0] ?? null,
        route_type: context?.routeType ?? null,
        digest: typeof digest === "string" ? digest : null,
        stack: e?.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : null,
      },
    }),
  ]);
};
