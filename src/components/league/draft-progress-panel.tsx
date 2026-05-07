/**
 * Draft Progress Panel. "How you're doing" scorecard at the top of
 * the league hub.
 *
 * Redesign 2026-05-08 (post forum-question research): the prior layout
 * led with three abstract metric cards that reported state but did
 * not answer the questions dynasty drafters actually ask mid-draft.
 * The new layout leads with a position-by-position diagnostic
 * (QB/RB/WR/TE strong/ok/thin/empty + best player + one-line read),
 * then surfaces situational callouts: position run watch, thin
 * alerts, and a condensed secondary row for league rank + pick
 * sharpness.
 */

import type {
  DraftProgress,
  PositionDiagnostic,
  PositionState,
  ProgressMetric,
  ProgressTier,
} from "@/lib/strategy/draft-progress";
import type { EvBank, EvBankPickEntry } from "@/lib/strategy/ev-bank";

const TIER_BANNER_BORDER: Record<ProgressTier, string> = {
  strong: "border-success/60",
  solid: "border-border-strong",
  mixed: "border-warning/60",
  off_track: "border-danger/60",
};

const TIER_BANNER_TEXT: Record<ProgressTier, string> = {
  strong: "text-success",
  solid: "text-accent",
  mixed: "text-warning",
  off_track: "text-danger",
};

const POSITION_BORDER: Record<PositionState, string> = {
  strong: "border-success/60 bg-success/5",
  ok: "border-border-strong bg-surface",
  thin: "border-warning/60 bg-warning/5",
  empty: "border-danger/60 bg-danger/5",
};

const POSITION_VALUE_COLOR: Record<PositionState, string> = {
  strong: "text-success",
  ok: "text-foreground",
  thin: "text-warning",
  empty: "text-danger",
};

const POSITION_BADGE: Record<PositionState, { label: string; color: string }> = {
  strong: { label: "STRONG", color: "text-success" },
  ok: { label: "OK", color: "text-foreground" },
  thin: { label: "THIN", color: "text-warning" },
  empty: { label: "EMPTY", color: "text-danger" },
};

const METRIC_BORDER: Record<ProgressTier, string> = {
  strong: "border-success/60 bg-success/5",
  solid: "border-border-strong bg-surface",
  mixed: "border-warning/60 bg-warning/5",
  off_track: "border-danger/60 bg-danger/5",
};

const METRIC_VALUE_COLOR: Record<ProgressTier, string> = {
  strong: "text-success",
  solid: "text-foreground",
  mixed: "text-warning",
  off_track: "text-danger",
};

export function DraftProgressPanel({ data }: { data: DraftProgress | null }) {
  if (!data) return null;
  if (data.picks_made_by_user === 0) return null;

  return (
    <section
      className={`mb-6 overflow-hidden rounded-lg border-2 ${TIER_BANNER_BORDER[data.overall_tier]}`}
      aria-label="Draft progress scorecard"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-soft px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.18em] ${TIER_BANNER_TEXT[data.overall_tier]}`}
          >
            How you're doing
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            {data.picks_made_by_user}
            {data.total_picks_for_user > 0 ? ` of ${data.total_picks_for_user}` : ""}{" "}
            picks in
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          v2 prototype
        </span>
      </div>

      <p
        className={`px-5 py-4 text-base leading-snug ${TIER_BANNER_TEXT[data.overall_tier]}`}
      >
        {data.headline}
      </p>

      <div className="border-t border-border-soft px-5 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
          Position diagnostic
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {data.position_diagnostic.map((diag) => (
            <PositionCard key={diag.position} diag={diag} />
          ))}
        </div>
      </div>

      {(data.position_run || data.thin_alerts.length > 0) && (
        <div className="border-t border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
            Watch the board
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-snug text-foreground">
            {data.position_run && (
              <li key="run">
                · {data.position_run.message}
              </li>
            )}
            {data.thin_alerts.map((alert) => (
              <li key={`thin-${alert.position}`}>
                · {alert.message}{" "}
                <span className="text-muted-2">
                  {alert.top_names.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 border-t border-border-soft px-5 py-4 sm:grid-cols-2">
        <MetricCard metric={data.league_rank} />
        <MetricCard metric={data.best_value} />
      </div>

      {data.sharp_positioning.length > 0 && (
        <div className="border-t border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Sharp positioning
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-snug text-foreground">
            {data.sharp_positioning.map((s, i) => (
              <li key={i}>· {s}</li>
            ))}
          </ul>
        </div>
      )}

      {(data.wins.length > 0 || data.watch_outs.length > 0) && (
        <div className="grid gap-3 border-t border-border-soft px-5 py-4 sm:grid-cols-2">
          {data.wins.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
                Wins so far
              </div>
              <ul className="mt-2 space-y-1 text-xs leading-snug text-foreground">
                {data.wins.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </div>
          )}
          {data.watch_outs.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
                Gaps to close
              </div>
              <ul className="mt-2 space-y-1 text-xs leading-snug text-foreground">
                {data.watch_outs.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {data.ev_bank && data.ev_bank.entries.length > 0 && (
        <EvBankSection bank={data.ev_bank} />
      )}
    </section>
  );
}

function EvBankSection({ bank }: { bank: EvBank }) {
  const totalEv = bank.total_ev;
  const totalDisplay =
    totalEv == null
      ? "ungraded"
      : totalEv >= 0
        ? `+${totalEv.toFixed(1)}`
        : totalEv.toFixed(1);
  const totalColor =
    totalEv == null
      ? "text-foreground"
      : totalEv >= 5
        ? "text-success"
        : totalEv >= -5
          ? "text-foreground"
          : totalEv >= -15
            ? "text-warning"
            : "text-danger";

  // Bar scale: max abs ev_delta across entries drives the bar width.
  // Falls back to 1 to avoid divide-by-zero on a single zero-delta entry.
  const maxAbsDelta = Math.max(
    1,
    ...bank.entries.map((e) => Math.abs(e.ev_delta ?? 0)),
  );

  return (
    <div className="border-t border-border-soft px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          EV bank
        </div>
        <div className="flex items-baseline gap-3">
          <span className={`font-mono text-lg font-semibold ${totalColor}`}>
            {totalDisplay}
          </span>
          {bank.range_low != null && bank.range_high != null && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
              range {bank.range_low >= 0 ? "+" : ""}
              {bank.range_low.toFixed(1)} to {bank.range_high >= 0 ? "+" : ""}
              {bank.range_high.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted">{bank.summary}</p>
      <div className="mt-3 space-y-1.5">
        {bank.entries.map((entry) => (
          <EvBankRow key={entry.player_id} entry={entry} maxAbs={maxAbsDelta} />
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-snug text-muted-2">
        EV per pick = (value/100) × (pick minus ADP). Range from realistic ADP noise of ±{bank.adp_noise_picks} picks. Sharp locks (player taken before ADP) count negative against the bank by definition; whether the lock was correct is a scarcity question answered in the Decision card.
      </p>
    </div>
  );
}

function EvBankRow({
  entry,
  maxAbs,
}: {
  entry: EvBankPickEntry;
  maxAbs: number;
}) {
  const delta = entry.ev_delta;
  const isUngraded = delta == null;
  // Bar fills from center outward. Positive = green to right, negative = red to left.
  const barWidthPct = isUngraded ? 0 : (Math.abs(delta!) / maxAbs) * 50;
  const isPositive = !isUngraded && delta! >= 0;
  const barColor = isUngraded
    ? "bg-border-soft"
    : isPositive
      ? "bg-success/70"
      : "bg-danger/70";

  return (
    <div className="grid grid-cols-[44px_1fr_56px_2fr] items-center gap-2 text-[11px] leading-tight">
      <span className="font-mono text-[10px] text-muted-2">{entry.pick_label}</span>
      <span className="truncate text-foreground">
        {entry.player_name}
        {entry.position && (
          <span className="ml-1 text-muted-2">· {entry.position}</span>
        )}
      </span>
      <span
        className={`font-mono text-right ${
          isUngraded
            ? "text-muted-2"
            : isPositive
              ? "text-success"
              : "text-danger"
        }`}
      >
        {isUngraded
          ? "n/a"
          : delta! >= 0
            ? `+${delta!.toFixed(1)}`
            : delta!.toFixed(1)}
      </span>
      <div className="relative h-2 rounded-full bg-border-soft/30">
        <div className="absolute left-1/2 top-0 h-full w-px bg-border-strong" />
        {!isUngraded && (
          <div
            className={`absolute top-0 h-full rounded-full ${barColor}`}
            style={{
              width: `${barWidthPct}%`,
              [isPositive ? "left" : "right"]: "50%",
            }}
          />
        )}
      </div>
    </div>
  );
}

function PositionCard({ diag }: { diag: PositionDiagnostic }) {
  const badge = POSITION_BADGE[diag.state];
  return (
    <div
      className={`rounded-md border ${POSITION_BORDER[diag.state]} px-3 py-2`}
    >
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
          {diag.position}
        </div>
        <div
          className={`font-mono text-[9px] uppercase tracking-[0.16em] ${badge.color}`}
        >
          {badge.label}
        </div>
      </div>
      <div className={`mt-1 text-lg font-semibold ${POSITION_VALUE_COLOR[diag.state]}`}>
        {diag.have} / {diag.need}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">{diag.summary}</p>
    </div>
  );
}

function MetricCard({ metric }: { metric: ProgressMetric }) {
  return (
    <div
      className={`rounded-md border ${METRIC_BORDER[metric.tier]} px-4 py-3`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        {metric.label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${METRIC_VALUE_COLOR[metric.tier]}`}>
        {metric.display_value}
      </div>
      <p className="mt-2 text-xs leading-snug text-muted">{metric.sub_line}</p>
    </div>
  );
}
