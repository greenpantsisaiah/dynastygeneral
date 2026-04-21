"use client";

import { useState } from "react";

export function ClientCopy({ text }: { text: string }) {
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

  return (
    <button
      type="button"
      onClick={copy}
      className="absolute right-2 top-2 rounded-sm border border-border-soft bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 opacity-0 transition hover:border-accent/60 hover:text-accent group-hover:opacity-100"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
