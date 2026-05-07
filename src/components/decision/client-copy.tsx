"use client";

import { useState } from "react";

type Variant = "hover-overlay" | "prominent";

export function ClientCopy({
  text,
  variant = "hover-overlay",
  label = "Copy",
}: {
  text: string;
  variant?: Variant;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // noop: feature is graceful
    }
  }

  if (variant === "prominent") {
    return (
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-7 items-center rounded-sm border border-border-strong bg-background px-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground transition hover:border-accent/60 hover:text-accent"
      >
        {copied ? "Copied" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="absolute right-2 top-2 rounded-sm border border-border-soft bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 opacity-0 transition hover:border-accent/60 hover:text-accent group-hover:opacity-100"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
