/**
 * PickApproach: now a compact ready-queue banner above Strategic Forks.
 *
 * What this surface used to be: a multi-section panel predicting what
 * each upcoming picker would take, surviving-target estimates, and per-
 * picker confidence theater. None of it changed what the user does.
 *
 * What it is now:
 *   - One-line orientation: "Your pick · 14.9 · 2 ahead"
 *   - Top-suggestions list (your ready queue with named players)
 *   - Watch-for one-liners (the only signals that genuinely shift moves,
 *     e.g. "TE run forming, lock that fork now")
 *   - Forecasts as one-liners ("nobody favored to take RB next 3 picks")
 *
 * Picker prediction tables, surviving-target tables, and confidence
 * percentages are gone. Strategic Forks is the queue surface; Opponent
 * Strategy Profiles (separate panel) is the strategic-intelligence surface.
 */

import type { PickApproach } from "@/lib/strategy/pick-approach/types";

export function PickApproach({ approach }: { approach: PickApproach }) {
  const isWatch = approach.mode === "watch";
  const outer = isWatch
    ? "border-border-strong bg-surface"
    : "border-accent/60 bg-accent/5";
  const headerChip = isWatch ? "text-muted-2" : "text-accent";
  const divider = isWatch ? "border-border-soft" : "border-accent/20";
  const headerLabel = isWatch ? "Draft watch" : "Pick approach";
  const countdownTone = isWatch ? "text-foreground" : "text-accent";

  return (
    <section className={`mt-8 rounded-lg border ${outer} px-5 py-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div
            className={`font-mono text-xs uppercase tracking-[0.18em] ${headerChip}`}
          >
            {headerLabel}
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Your pick: {approach.my_pick_label} ·{" "}
            <span className={countdownTone}>
              {approach.picks_until_me} ahead
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your ready queue below. Strategic forks panel has the full menu
            of options across positions.
          </p>
        </div>
      </div>

      {approach.top_suggestions && approach.top_suggestions.length > 0 && (
        <div className={`mt-5 ${isWatch ? "" : `border-t ${divider} pt-4`}`}>
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
            Your ready queue
          </div>
          <ul className="mt-2 space-y-2 text-sm">
            {approach.top_suggestions.map((s, i) => (
              <li key={s.player_id} className="flex items-baseline gap-3">
                <span
                  className={`font-mono text-xs font-semibold w-6 shrink-0 ${
                    i === 0 ? "text-accent" : "text-muted-2"
                  }`}
                >
                  {i + 1}.
                </span>
                <div className="flex-1">
                  <div className="text-foreground">
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-muted-2">
                      {" "}
                      · {s.position}
                      {s.team ? `-${s.team}` : ""}
                      {s.age != null ? `, age ${s.age}` : ""}
                    </span>
                  </div>
                  <div className="text-xs text-muted">{s.reason}</div>
                </div>
                {s.adp != null && (
                  <span className="font-mono text-[11px] text-muted-2">
                    ADP {Math.round(s.adp)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(approach.forecasts.length > 0 || approach.watch_for.length > 0) && (
        <div className={`mt-5 border-t ${divider} pt-4`}>
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
            Watch for
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground">
            {approach.forecasts.map((f, i) => (
              <li key={`f-${i}`} className="flex gap-2">
                <span className="text-muted-2">·</span>
                <span>{f.text}</span>
              </li>
            ))}
            {approach.watch_for.map((w, i) => (
              <li key={`w-${i}`} className="flex gap-2 text-xs text-muted">
                <span className="text-muted-2">·</span>
                <span>
                  <span className="text-foreground">{w.signal}</span> →{" "}
                  {w.if_it_fires}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
