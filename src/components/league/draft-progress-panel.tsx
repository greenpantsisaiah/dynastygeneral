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

"use client";

import { useState } from "react";
import type {
  DraftProgress,
  PositionDiagnostic,
  PositionState,
  ProgressMetric,
  ProgressTier,
} from "@/lib/strategy/draft-progress";
import type {
  EvBank,
  EvBankPickEntry,
  LeagueEvBankReadout,
} from "@/lib/strategy/ev-bank";
import { EvTrajectoryChart } from "@/components/league/dashboard/ev-trajectory-chart";

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

export function DraftProgressPanel({
  data,
  leagueBank,
}: {
  data: DraftProgress | null;
  // Optional league EV bank readout. When provided and at least 2
  // rosters have resolved totals, the EV bank section gains a
  // collapsible "compare to your league" expander rendering the
  // leaderboard inline. Per founder feedback 2026-05-08: "showing
  // me mine and then expanding to theirs would be the obvious
  // thing to do."
  leagueBank?: LeagueEvBankReadout | null;
}) {
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
        <EvBankSection bank={data.ev_bank} leagueBank={leagueBank ?? null} />
      )}
    </section>
  );
}

function EvBankSection({
  bank,
  leagueBank,
}: {
  bank: EvBank;
  leagueBank: LeagueEvBankReadout | null;
}) {
  // Bar scale for the per-pick detail view (kept as tap-to-expand).
  const maxAbsDelta = Math.max(
    1,
    ...bank.entries.map((e) => Math.abs(e.ev_delta ?? 0)),
  );
  const [showPerPickBars, setShowPerPickBars] = useState(false);

  return (
    <div>
      {/* Hero: cumulative EV trajectory line chart with confidence
          ribbon. Per founder direction 2026-05-08 PM (538-editor
          pass): "Sexy charts and graphs." Total + CI render in the
          chart header; per-pick detail surfaces on hover. */}
      <EvTrajectoryChart bank={bank} />

      {/* Tap-to-expand per-pick bar detail. The trajectory chart
          shows cumulative; this view shows each pick's contribution
          as a horizontal diverging bar for users who want to read
          pick-by-pick directly. */}
      <div className="px-5 pb-4">
        <button
          type="button"
          onClick={() => setShowPerPickBars((s) => !s)}
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
          aria-expanded={showPerPickBars}
        >
          {showPerPickBars ? "Hide" : "Show"} per-pick bar detail
        </button>
        {showPerPickBars && (
          <>
            <div className="mt-3 space-y-1.5">
              {bank.entries.map((entry) => (
                <EvBankRow key={entry.player_id} entry={entry} maxAbs={maxAbsDelta} />
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-snug text-muted-2">
              EV per pick = (value/100) × (pick − ADP). Range from realistic ADP noise of ±{bank.adp_noise_picks} picks. Sharp locks count negative against the bank by definition.
            </p>
          </>
        )}
      </div>

      {leagueBank && leagueBank.ranked_count >= 2 && (
        <div className="px-5 pb-4">
          <LeagueComparisonExpander leagueBank={leagueBank} />
        </div>
      )}
    </div>
  );
}

function LeagueComparisonExpander({
  leagueBank,
}: {
  leagueBank: LeagueEvBankReadout;
}) {
  const [open, setOpen] = useState(false);
  const ranked = leagueBank.rosters.filter((r) => r.total_ev != null);
  const maxAbs = Math.max(
    1,
    ...ranked.map((r) => Math.abs(r.total_ev ?? 0)),
  );
  const myPctText =
    leagueBank.my_percentile != null
      ? `${Math.round(leagueBank.my_percentile)}th pct`
      : null;
  const myRankText =
    leagueBank.my_rank != null
      ? `rank ${leagueBank.my_rank} of ${leagueBank.ranked_count}`
      : null;
  const leagueAvgText =
    leagueBank.league_avg != null
      ? `league avg ${
          leagueBank.league_avg >= 0
            ? `+${leagueBank.league_avg.toFixed(1)}`
            : leagueBank.league_avg.toFixed(1)
        }`
      : null;
  return (
    <div className="mt-4 border-t border-border-soft pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
        aria-expanded={open}
      >
        <span>
          {open ? "Hide" : "See"} how the league stands
        </span>
        <span className="text-muted-2">
          {[myRankText, myPctText, leagueAvgText].filter(Boolean).join(" · ")}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-1.5">
          {ranked.map((r, i) => {
            const total = r.total_ev ?? 0;
            const widthPct = (Math.abs(total) / maxAbs) * 50;
            const isPositive = total >= 0;
            const barColor = r.is_me
              ? isPositive
                ? "bg-success"
                : "bg-danger"
              : isPositive
                ? "bg-success/40"
                : "bg-danger/40";
            const rangeText =
              r.range_low != null && r.range_high != null
                ? `${
                    r.range_low >= 0
                      ? `+${r.range_low.toFixed(1)}`
                      : r.range_low.toFixed(1)
                  } to ${
                    r.range_high >= 0
                      ? `+${r.range_high.toFixed(1)}`
                      : r.range_high.toFixed(1)
                  }`
                : null;
            return (
              <div
                key={r.roster_id}
                className={`grid grid-cols-[28px_100px_1fr_56px] items-center gap-2 text-[11px] leading-tight ${
                  r.is_me
                    ? "rounded-md bg-accent/5 px-2 py-1 -mx-2"
                    : ""
                }`}
              >
                <span className="font-mono text-[10px] text-muted-2">
                  {i + 1}
                </span>
                <span
                  className={`truncate ${
                    r.is_me ? "text-foreground font-semibold" : "text-foreground"
                  }`}
                >
                  {r.is_me
                    ? "You"
                    : r.owner_name ?? `Roster ${r.roster_id}`}
                </span>
                <div className="relative h-2 rounded-full bg-border-soft/30">
                  <div
                    className="absolute left-1/2 top-0 h-full w-px bg-border-strong"
                    aria-hidden="true"
                  />
                  <div
                    className={`absolute top-0 h-full rounded-full ${barColor}`}
                    style={{
                      width: `${widthPct}%`,
                      [isPositive ? "left" : "right"]: "50%",
                    }}
                  />
                </div>
                <div
                  className={`font-mono text-right ${
                    isPositive ? "text-success" : "text-danger"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {total.toFixed(1)}
                </div>
                {rangeText && (
                  <div className="col-span-4 font-mono text-[9px] text-muted-2 pl-[130px]">
                    range {rangeText}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
