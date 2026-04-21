/**
 * PlaysFromHere. server-rendered section showing the immediate move
 * menu for the current draft moment. Designed to ALWAYS have content
 * when the draft is live, so the user never sees a dead board.
 *
 * Each play shows: title, move, win-now/future deltas, % chance,
 * counter-signals to watch.
 */

import type { ResolvedPlayFromHere } from "@/lib/strategy/plays-from-here/types";

export function PlaysFromHere({ plays }: { plays: ResolvedPlayFromHere[] }) {
  // Strategic Forks owns the "best dynasty value" surface now (it
  // covers all 4 scoring positions side-by-side). Filter out the
  // catch-all BPA play so we don't render the same recommendation twice.
  const visible = plays.filter((p) => p.id !== "general-bpa-scarce-position");
  if (visible.length === 0) return null;
  return (
    <section className="mt-8">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Plays from here
      </div>
      <div className="mt-1 text-sm text-muted">
        Move-level options for this exact moment. Each shows window deltas, odds,
        and what to watch for.
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {visible.map((p) => (
          <PlayCard key={p.id} play={p} />
        ))}
      </div>
    </section>
  );
}

function PlayCard({ play }: { play: ResolvedPlayFromHere }) {
  const odds = Math.round(play.chance_pays_off * 100);
  const oddsTone =
    odds >= 70 ? "text-success" : odds >= 55 ? "text-foreground" : "text-muted";
  // When context_resolution fired, prefer the resolved versions which
  // name actual players and roster state.
  const title = play.resolved_title ?? play.title;
  const move = play.resolved_move ?? play.move;
  const rationale = play.resolved_rationale ?? play.rationale;
  return (
    <div className="rounded-lg border border-border-strong bg-surface px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <div className="text-right">
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2">
            Pays off
          </div>
          <div className={`font-mono text-lg font-semibold ${oddsTone}`}>
            {odds}%
          </div>
        </div>
      </div>
      <p className="mt-1 text-sm font-medium text-accent">{move}</p>
      <p className="mt-2 text-sm text-muted">{rationale}</p>

      {play.named_targets && play.named_targets.length > 0 && (
        <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            Take one of
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {play.named_targets.map((t) => (
              <li key={t.player_id}>
                <span className="font-semibold text-foreground">
                  {t.name}
                </span>
                <span className="text-muted-2">
                  {" "}
                  · {t.position}
                  {t.team ? `-${t.team}` : ""}
                  {t.age != null ? `, age ${t.age}` : ""}
                </span>
                <div className="text-muted">· {t.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-soft pt-2.5">
        <DeltaPill
          label="Win-now"
          value={play.delta.win_now}
          positiveTone="text-success"
        />
        <DeltaPill
          label="Future"
          value={play.delta.future_value}
          positiveTone="text-accent"
        />
        {!play.named_targets &&
          play.exemplar_targets &&
          play.exemplar_targets.length > 0 && (
            <span className="text-xs text-muted-2">
              Targets: {play.exemplar_targets.join(", ")}
            </span>
          )}
      </div>

      {(() => {
        // Filter out stale catalog signals that reference user state we
        // don't have in this context (e.g. "declared archetype contradicts").
        // Without filtering, these render as cryptic notes the user can't
        // act on. If a signal references "declared/locked archetype" but
        // there's no clear contradiction context, drop it.
        const visible = play.counter_signals.filter((c) => {
          const text = c.watch_for.toLowerCase();
          if (
            text.includes("declared archetype") ||
            text.includes("locked archetype")
          ) {
            // Suppressed: see Strategic forks panel instead.
            return false;
          }
          return true;
        });
        if (visible.length === 0) return null;
        return (
          <div className="mt-3 border-t border-border-soft pt-2.5">
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2">
              Watch for
            </div>
            <ul className="mt-1 space-y-1 text-xs text-muted">
              {visible.map((c, i) => (
                <li key={i}>
                  <span className="text-foreground">{c.watch_for}</span> →{" "}
                  {c.if_it_fires}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}

function DeltaPill({
  label,
  value,
  positiveTone,
}: {
  label: string;
  value: number;
  positiveTone: string;
}) {
  const tone = value > 0 ? positiveTone : value < 0 ? "text-danger" : "text-muted";
  const sign = value > 0 ? "+" : "";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2">
        {label}
      </span>
      <span className={`font-mono text-sm font-semibold ${tone}`}>
        {sign}
        {value}
      </span>
    </div>
  );
}
