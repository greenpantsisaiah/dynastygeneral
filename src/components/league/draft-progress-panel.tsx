/**
 * Draft Progress Panel. "How you're doing" scorecard at the top of
 * the league hub. Designed for the multi-draft user who returns
 * to a league after a day or two and wants the at-a-glance answer
 * before drilling into the next pick.
 *
 * Per founder ask 2026-05-07: positive emotional ROI when metrics
 * support it, honest when they don't. The model-feedback footer
 * acknowledges that user-following-recommendations + bad-result =
 * model alert, not user problem.
 */

import type { DraftProgress, ProgressMetric, ProgressTier } from "@/lib/strategy/draft-progress";

const TIER_BORDER: Record<ProgressTier, string> = {
  strong: "border-success/60 bg-success/5",
  solid: "border-border-strong bg-surface",
  mixed: "border-warning/60 bg-warning/5",
  off_track: "border-danger/60 bg-danger/5",
};

const TIER_VALUE_COLOR: Record<ProgressTier, string> = {
  strong: "text-success",
  solid: "text-foreground",
  mixed: "text-warning",
  off_track: "text-danger",
};

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
          v1 prototype
        </span>
      </div>

      <p className={`px-5 py-4 text-base leading-snug ${TIER_BANNER_TEXT[data.overall_tier]}`}>
        {data.headline}
      </p>

      <div className="grid gap-3 border-t border-border-soft px-5 py-4 sm:grid-cols-3">
        <MetricCard metric={data.pick_quality} />
        <MetricCard metric={data.league_rank} />
        <MetricCard metric={data.build_coherence} />
      </div>

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
                Watch-outs
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

      <div className="border-t border-border-soft px-5 py-3 text-xs text-muted-2 leading-snug">
        {data.model_alert_triggered ? (
          <span className="text-warning">
            Model alert. You've been following our recommendations and the
            scorecard is off-track. That's a model issue, not your issue.
            We're using this signal to recalibrate.
          </span>
        ) : (
          <span>
            Following our recommendations? If this scorecard ever shows
            off-track while you're staying on the standing call, that's a
            model alert, not your fault.
          </span>
        )}
      </div>
    </section>
  );
}

function MetricCard({ metric }: { metric: ProgressMetric }) {
  return (
    <div
      className={`rounded-md border ${TIER_BORDER[metric.tier]} px-4 py-3`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        {metric.label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${TIER_VALUE_COLOR[metric.tier]}`}>
        {metric.display_value}
      </div>
      <p className="mt-2 text-xs leading-snug text-muted">{metric.sub_line}</p>
    </div>
  );
}
