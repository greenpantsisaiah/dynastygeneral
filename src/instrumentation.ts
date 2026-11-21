/**
 * Next.js instrumentation hook. Counts server errors per deployed commit
 * so the post-deploy tripwire can detect an error spike and revert.
 * See DEPLOYMENT.md "Post-deploy tripwire".
 */

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err) => {
  // Framework control flow (notFound, redirect) surfaces as digests that
  // start with NEXT_. Those are not failures.
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_")) return;
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { recordServerError } = await import("@/lib/ops/error-counter");
  await recordServerError();
};
