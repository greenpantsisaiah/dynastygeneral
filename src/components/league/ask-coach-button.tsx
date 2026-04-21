"use client";

/**
 * Tiny client button that seeds a prompt into the coach panel via the
 * global `coach:seed` event. Extracted to its own file so it can be
 * dropped inside server components (Strategic Forks, Characterizations)
 * without forcing the whole component tree to "use client" and without
 * triggering serialization errors when server props contain functions.
 */

import { seedCoachPrompt } from "./coach-chat";

export function AskCoachButton({ prompt }: { prompt: string }) {
  return (
    <button
      type="button"
      onClick={() => seedCoachPrompt(prompt)}
      className="mt-3 self-start font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 transition hover:text-accent"
    >
      Ask coach →
    </button>
  );
}
