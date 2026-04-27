"use client";

/**
 * Master strip below the dial grid. Live doctrine readout: build,
 * stance, voice. The "screenshot" line of the soundboard.
 */

import { type Doctrine } from "@/lib/soundboard/doctrine";

export function DoctrineStrip({
  doctrine,
  totalDials,
  lastEdited,
}: {
  doctrine: Doctrine;
  totalDials: number;
  lastEdited: string | null;
}) {
  const calibratedRatio = `${doctrine.calibrated_count} of ${totalDials} calibrated`;
  const since = lastEdited ? formatRelative(lastEdited) : "never saved";
  const isUntouched = doctrine.calibrated_count === 0;

  return (
    <div className="rounded-lg border border-accent/30 bg-gradient-to-br from-[rgb(28,22,12)] to-[rgb(15,13,10)] px-5 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
        Doctrine
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xl font-semibold text-foreground">
        <span>{doctrine.build}</span>
        <span className="text-muted-2">·</span>
        <span>{doctrine.stance}</span>
        <span className="text-muted-2">·</span>
        <span>{doctrine.voice}</span>
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        {isUntouched
          ? "All defaults · move a dial to start shaping the engine"
          : `${calibratedRatio} · last move ${since}`}
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
