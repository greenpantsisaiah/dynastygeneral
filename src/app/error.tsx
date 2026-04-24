"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center bg-grid px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger">
          Error
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Something went wrong
        </h1>
        <p className="mt-4 text-sm text-muted">
          An unexpected error occurred. Try again or head back home.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-muted-2">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => unstable_retry()}
            className="inline-flex h-10 items-center rounded-md bg-accent px-5 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-foreground transition hover:border-accent/60"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
