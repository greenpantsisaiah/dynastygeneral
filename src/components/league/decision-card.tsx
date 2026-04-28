/**
 * Decision card. THE primary recommendation surface when the user is
 * within 5 picks of their turn. Integrates starter holes, path drift,
 * scarcity math, pick density, and next-picks plan into one call.
 *
 * Server component. Composes synthesizeDecision() output from the
 * league page. Embeds AskCoachButton (client) so the user can escalate
 * the call to conversation without losing context.
 *
 * Visual hierarchy:
 *   - Header: pick label + countdown + density badge
 *   - TAKE: named player + primary reason
 *   - WHY: 2-3 supporting bullets
 *   - TRADEOFF: gains + losses
 *   - SCARCITY callout (when present)
 *   - NEXT PICKS PLAN
 *   - EMERGENCY TRADE UP banner (when scarcity is extreme)
 *   - Ask coach entry
 */

import Link from "next/link";
import { AskCoachButton } from "./ask-coach-button";
import { DecisionContinuity } from "./decision-continuity";
import type {
  Decision,
  DecisionRule,
  DecisionTopCandidate,
} from "@/lib/strategy/decision-synthesis/types";
import type { PickDensityKind } from "@/lib/strategy/league-state/snapshot";
import type { BuildTrajectory } from "@/lib/engine/build-trajectory";

export type RecentPickForContinuity = {
  pick_no: number;
  player_id: string;
  owner_name: string | null;
};

const RULE_LABEL: Record<DecisionRule, string> = {
  fill_starter_urgent: "Fill starter · urgent",
  fill_starter: "Fill starter",
  push_path: "Push path",
  window_direction: "Window direction",
  earned_value: "Earned value",
  position_steal: "Steal · value falling",
  future_stash: "Future stash",
};

const RULE_TONE: Record<
  DecisionRule,
  { border: string; bg: string; accent: string }
> = {
  fill_starter_urgent: {
    // Warning tone, not danger. Per user feedback 2026-04-24: red on
    // the most-common rule washes out the meaning of red. Reserved
    // danger-red for genuine alarm states (constraint violation +
    // best pick still violates, no viable starter at the position).
    border: "border-warning/60",
    bg: "bg-warning/5",
    accent: "text-warning",
  },
  fill_starter: {
    border: "border-accent/60",
    bg: "bg-accent/5",
    accent: "text-accent",
  },
  push_path: {
    border: "border-success/50",
    bg: "bg-success/5",
    accent: "text-success",
  },
  window_direction: {
    border: "border-accent/60",
    bg: "bg-accent/5",
    accent: "text-accent",
  },
  earned_value: {
    border: "border-success/50",
    bg: "bg-success/5",
    accent: "text-success",
  },
  // Steal sits in its own register: not urgent like fill_starter, not
  // path-driven like push_path, not safe like earned_value. Use the
  // accent (orange) tone since it's a value-falling event the user
  // should pay attention to but isn't a starter hole.
  position_steal: {
    border: "border-accent/60",
    bg: "bg-accent/5",
    accent: "text-accent",
  },
  // Future stash fires only when every starter slot is filled. Treat
  // as success-tone (green) because it means the user has finished
  // the immediate-need phase and is now stockpiling upside.
  future_stash: {
    border: "border-success/50",
    bg: "bg-success/5",
    accent: "text-success",
  },
};

const DENSITY_LABEL: Record<PickDensityKind, string> = {
  wraparound: "Wraparound",
  cluster: "Cluster",
  isolated: "Isolated",
  normal: "Normal",
};

const NEXT_PICK_CONF: Record<
  "high" | "medium" | "directional",
  { label: string; color: string }
> = {
  high: { label: "High", color: "text-success" },
  medium: { label: "Medium", color: "text-accent" },
  directional: { label: "Directional", color: "text-muted-2" },
};

const DENSITY_BLURB: Record<PickDensityKind, string> = {
  wraparound: "Back-to-back turn. Take the scarcer asset first.",
  cluster: "Picks coming back soon. Safe to swing or punt.",
  isolated: "Long wait after this. Grab fragile tier now.",
  normal: "",
};

function buildCoachPrompt(d: Decision): string {
  const name = d.recommendation.name;
  const reason = d.recommendation.primary_reason;
  return `Should I take ${name} at ${d.pick_label}? The product called this because: ${reason}. Tradeoffs vs the runners-up?`;
}

export function DecisionCard({
  decision,
  trajectory,
  horizonDial,
  leagueId,
  recentPicks,
}: {
  decision: Decision;
  trajectory?: BuildTrajectory;
  horizonDial?: number;
  leagueId?: string;
  recentPicks?: RecentPickForContinuity[];
}) {
  const tone = RULE_TONE[decision.recommendation.rule];
  const rec = decision.recommendation;
  const isOnClock = decision.picks_until_me <= 0;
  const density = decision.density;
  const horizonActive =
    typeof horizonDial === "number" && Math.abs(horizonDial) >= 40;

  return (
    <section
      className={`mt-8 rounded-lg border-2 ${tone.border} ${tone.bg} px-5 py-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div
            className={`font-mono text-xs uppercase tracking-[0.18em] ${tone.accent}`}
          >
            Decision
          </div>
          <h2 className="mt-1 text-2xl font-semibold text-foreground">
            {isOnClock
              ? `You're on the clock · ${decision.pick_label}`
              : `${decision.pick_label} · ${decision.picks_until_me} ahead`}
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.16em] ${tone.accent}`}
          >
            {RULE_LABEL[rec.rule]}
          </span>
          {density !== "normal" && (
            <span
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2"
              title={DENSITY_BLURB[density]}
            >
              {DENSITY_LABEL[density]}
            </span>
          )}
        </div>
      </div>

      {horizonActive && (
        <div className="mt-3 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-success">
            Soundboard ·{" "}
          </span>
          <span className="text-foreground">
            Horizon{" "}
            <span className="font-semibold">
              {horizonDial! > 0 ? "+" : ""}
              {horizonDial}
            </span>{" "}
            ·{" "}
            <span className="font-semibold">
              {horizonDial! > 0 ? "Future" : "Win-Now"}
            </span>
            . Constraint softened on opposing-direction candidates.
          </span>
        </div>
      )}

      {trajectory && trajectory.pick_count > 0 && (
        <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            Build ·{" "}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground">
            {trajectory.build_label}
          </span>
          <span className="text-muted">
            {" "}
            · {trajectory.composition.future} future,{" "}
            {trajectory.composition.balanced} balanced,{" "}
            {trajectory.composition.winNow} win-now
          </span>
          {trajectory.recent_lanes.length > 0 && (
            <>
              <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                · Trend ·{" "}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground">
                {trajectory.trend_label}
              </span>
            </>
          )}
        </div>
      )}

      {/* Window frame display rules (Phase D piece 4):
          - Pre-draft (no trajectory yet): show as primary header.
          - Trajectory agrees with window: hide window chip; trajectory
            says it all.
          - Trajectory disagrees with window: deemphasize as "engine
            auto-suggests X, your picks say Y" with conflict framing.
          The constraint penalty still fires on age math regardless;
          this is honest UI of an internal state the user can't change
          today (Phase E will rewire constraint to consume trajectory). */}
      {decision.window_frame.strength !== "none" &&
        (() => {
          const showAsPrimary =
            !trajectory || trajectory.pick_count === 0;
          const trajIsFuture =
            trajectory?.build_label.includes("Future") ?? false;
          const trajIsWinNow =
            trajectory?.build_label.includes("Win-Now") ?? false;
          const winLabel = decision.window_frame.label.toLowerCase();
          const winIsFuture = winLabel.includes("future");
          const winIsWinNow = winLabel.includes("win-now");
          const disagrees =
            (trajIsFuture && winIsWinNow) ||
            (trajIsWinNow && winIsFuture);
          if (!showAsPrimary && !disagrees) return null;
          if (disagrees) {
            return (
              <div className="mt-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  Override ·{" "}
                </span>
                <span className="text-foreground">
                  Engine auto-suggests{" "}
                  <span className="font-semibold">
                    {decision.window_frame.label}
                  </span>
                  ; your picks say{" "}
                  <span className="font-semibold">
                    {trajectory!.build_label}
                  </span>
                  . Constraint softened to honor your direction.
                </span>
              </div>
            );
          }
          return (
            <div className="mt-2 rounded-md border border-border-soft bg-surface px-3 py-2 text-xs">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                Window frame ·{" "}
              </span>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                  decision.window_frame.strength === "heavy"
                    ? "text-accent"
                    : "text-muted-2"
                }`}
              >
                {decision.window_frame.label}
              </span>
              <span className="text-muted">
                {" "}
                · {decision.window_frame.sentence}
              </span>
            </div>
          );
        })()}
      {decision.opponent_between_picks &&
        decision.opponent_between_picks.primary_opponent && (
          <OpponentBetweenPicksBar
            gap={decision.opponent_between_picks}
          />
        )}

      {/* Continuity chip. Acknowledges what changed between the
          user's previous refresh and this one. PIVOT chip fires when
          the prior standing call appears in recentPicks (got drafted).
          HOLD chip fires when the call is the same across at least
          two pick windows. Pure client-side localStorage memory; zero
          network cost. Founder mandate 2026-04-28. */}
      {leagueId && recentPicks && (
        <DecisionContinuity
          leagueId={leagueId}
          currentCall={{
            player_id: rec.player_id,
            player_name: rec.name,
          }}
          currentUserPickNo={decision.pick_no}
          recentPicks={recentPicks}
        />
      )}

      {/* STANDING CALL band (2026-04-27 synthesis-fix).
          Surfaces the engine's #1 pick prominently above the lane
          grid so Decision card, Coach, and Decision Quadrant speak
          the same vocabulary ("standing call"). Earlier iteration
          flattened three lane primaries to equal weight which made
          the card APPEAR to disagree with Coach + Quadrant when in
          fact all three surfaces had the same answer; the card was
          just mute. */}
      <div
        className={`mt-4 rounded-md border-2 ${tone.border} bg-surface-2 px-4 py-3`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${tone.accent}`}>
            Standing call
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
            {RULE_LABEL[rec.rule]}
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <div className="text-xl font-semibold text-foreground">
            {rec.name}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            {rec.position}
            {rec.team ? `-${rec.team}` : ""}
            {rec.age != null ? ` · age ${rec.age}` : ""}
            {rec.adp != null ? ` · ADP ${Math.round(rec.adp)}` : ""}
            {rec.value != null ? ` · VAL ${rec.value}` : ""}
          </div>
        </div>
        <p className="mt-1.5 text-sm text-foreground leading-snug">
          {rec.primary_reason}
        </p>
      </div>

      {/* THE LANES (post-Phase D iteration 2026-04-27).
          Three timeline lanes side-by-side, each containing the top
          2-3 picks that advance that direction. The lane containing
          the standing call gets visual prominence; other lanes are
          alternative directions if the user wants to override.

          Visual emphasis: lane containing the standing call wins
          (so the card and Quadrant agree on the call). Soundboard
          Horizon and trajectory are shown as secondary signals (not
          drivers of emphasis), so when the engine overrides the
          dial (e.g. future_stash fires because all slots are
          filled), the card shows the actual call instead of dial
          direction.

          Golden flag: a candidate whose age <= 24 AND KTC rank top
          of the pool advances BOTH win-now (proven enough to start)
          AND future (young enough to grow). The pick stays in its
          primary lane (computed from age) but gets a "GOLDEN" badge
          so the user sees its cross-lane value. */}
      {decision.quadrant_candidates &&
        decision.quadrant_candidates.length > 0 &&
        (() => {
          const byLane = {
            "win-now": [] as typeof decision.quadrant_candidates,
            balanced: [] as typeof decision.quadrant_candidates,
            future: [] as typeof decision.quadrant_candidates,
          };
          for (const q of decision.quadrant_candidates) {
            byLane[q.timeline_lane].push(q);
          }
          for (const lane of Object.keys(byLane) as Array<
            keyof typeof byLane
          >) {
            byLane[lane].sort(
              (a, b) => (b.confidence_pct ?? 0) - (a.confidence_pct ?? 0),
            );
          }
          const lanes = [
            {
              id: "win-now" as const,
              label: "Win-Now",
              blurb: "Proven, starts now",
              tone: "warning" as const,
            },
            {
              id: "balanced" as const,
              label: "Balanced",
              blurb: "Productive across both windows",
              tone: "neutral" as const,
            },
            {
              id: "future" as const,
              label: "Future",
              blurb: "Young upside, building",
              tone: "success" as const,
            },
          ];
          const anyHits = lanes.some((l) => byLane[l.id].length > 0);
          if (!anyHits) return null;

          // Lane emphasis follows the standing call (not the dial).
          // Per 2026-04-27 synthesis fix: when the engine's call
          // disagreed with the dial direction (e.g. future_stash
          // fires because all slots filled but dial says win-now),
          // the OLD logic emphasized the dial's lane and made the
          // card disagree with itself. New rule: emphasize the lane
          // that contains the standing call. The dial + trajectory
          // are shown as supporting signals so the user knows their
          // declared direction was considered.
          const leanCandidate = decision.quadrant_candidates.find(
            (q) => q.is_lean,
          );
          const emphasisLane: "win-now" | "balanced" | "future" =
            leanCandidate?.timeline_lane ?? "balanced";
          // Detect when the engine overrode the dial so we can be
          // honest about it instead of pretending the dial direction
          // is still in force.
          const dialDirection: "win-now" | "future" | null = horizonActive
            ? horizonDial! > 0
              ? "future"
              : "win-now"
            : null;
          const dialOverridden =
            dialDirection != null && dialDirection !== emphasisLane;

          return (
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div
                  className={`font-mono text-xs uppercase tracking-[0.16em] ${tone.accent}`}
                >
                  Lanes · pick your direction
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                  {dialOverridden
                    ? `Dial: ${dialDirection === "win-now" ? "Win-Now" : "Future"} · softened`
                    : `Call lane: ${emphasisLane === "win-now" ? "Win-Now" : emphasisLane === "future" ? "Future" : "Balanced"}`}
                </span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {lanes.map((l) => {
                  const picks = byLane[l.id].slice(0, 3);
                  const isEmphasized = emphasisLane === l.id;
                  const headerColor =
                    l.tone === "warning"
                      ? "text-warning"
                      : l.tone === "success"
                        ? "text-success"
                        : "text-muted-2";
                  const borderClass = isEmphasized
                    ? l.tone === "warning"
                      ? "border-warning/60 shadow-[inset_0_0_24px_rgba(255,180,80,0.12)]"
                      : l.tone === "success"
                        ? "border-success/60 shadow-[inset_0_0_24px_rgba(80,200,140,0.12)]"
                        : "border-accent/60 shadow-[inset_0_0_24px_rgba(245,165,36,0.10)]"
                    : "border-border-soft";
                  return (
                    <div
                      key={l.id}
                      className={`rounded-md border ${borderClass} bg-surface px-3 py-2.5`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div
                          className={`font-mono text-[10px] uppercase tracking-[0.14em] ${headerColor}`}
                        >
                          {l.label}
                        </div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
                          {l.blurb}
                        </div>
                      </div>
                      {picks.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-2">
                          {emptyLaneCopy(l.id)}
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {picks.map((p, idx) => {
                            const isPrimary = idx === 0;
                            const isGolden = isGoldenPick(p);
                            return (
                              <li
                                key={p.player_id}
                                className={`rounded-sm px-2 py-1.5 ${
                                  isPrimary
                                    ? "bg-surface-2"
                                    : "border-t border-border-soft pt-2"
                                }`}
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="text-sm font-semibold text-foreground">
                                    {p.name}
                                  </div>
                                  <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em]">
                                    {p.is_lean ? (
                                      <span
                                        className={`rounded-sm border ${tone.border} bg-surface-2 px-1.5 py-0 ${tone.accent}`}
                                        title="Engine's #1 pick. Coach + Quadrant agree."
                                      >
                                        Standing call
                                      </span>
                                    ) : isPrimary ? (
                                      <span className={`${headerColor}`}>
                                        Lane primary
                                      </span>
                                    ) : null}
                                    {isGolden && (
                                      <span
                                        className="rounded-sm border border-accent/60 bg-accent/10 px-1.5 py-0 text-accent"
                                        title="Advances both win-now and future. Cross-lane value."
                                      >
                                        Golden
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                                  {p.position}
                                  {p.team ? `-${p.team}` : ""}
                                  {p.age != null ? ` · age ${p.age}` : ""}
                                  {p.adp != null
                                    ? ` · ADP ${Math.round(p.adp)}`
                                    : ""}
                                  {p.value != null
                                    ? ` · VAL ${p.value}`
                                    : ""}
                                </div>
                                {p.availability_next_pick && (
                                  <div
                                    className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                                      p.availability_next_pick === "probably_gone"
                                        ? "text-danger"
                                        : p.availability_next_pick === "coin_flip"
                                          ? "text-warning"
                                          : "text-muted-2"
                                    }`}
                                  >
                                    {p.availability_next_pick === "likely_here"
                                      ? "Survival likely"
                                      : p.availability_next_pick === "coin_flip"
                                        ? "Survival coin flip"
                                        : "Survival unlikely"}
                                    {p.survival_pct != null
                                      ? ` · ${p.survival_pct}%`
                                      : ""}
                                  </div>
                                )}
                                {isPrimary && (
                                  <p className="mt-1.5 text-xs text-foreground leading-snug">
                                    {p.primary_reason}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      {/* Doctrine library entry point. Small affordance pointing the
          user at the Soundboard preset bar, which is the place to
          declare a doctrine if the trajectory + dial reads aren't
          steering hard enough. Inline so it doesn't disrupt the lane
          grid above. Per founder direction 2026-04-27: presets are
          the "library of strategies" users pick to weight lanes. */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-xs">
        <span className="text-muted">
          Want to push the lanes harder one direction?
        </span>
        <Link
          href="/soundboard"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:text-accent/80"
        >
          Open doctrine library →
        </Link>
      </div>

      {decision.why.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
            Why this landscape
          </div>
          <ul className="mt-1 space-y-1 text-sm text-foreground">
            {decision.why.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-2">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.scarcity_callout && (
        <div className="mt-4 rounded-md border border-accent/60 bg-accent/10 px-3 py-2 text-xs text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            Scarcity ·{" "}
          </span>
          {decision.scarcity_callout}
        </div>
      )}

      {decision.counter_view && (
        <div className="mt-4 rounded-md border border-warning/60 bg-warning/10 px-3 py-3 text-xs text-foreground">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
            Counter-view · the case against this call
          </div>
          <div className="mt-1.5 font-medium">
            {decision.counter_view.headline}
          </div>
          <div className="mt-1 text-muted">
            {decision.counter_view.detail}
          </div>
          {decision.counter_view.suggested_player && (
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
              Counter pick · {decision.counter_view.suggested_player}
            </div>
          )}
        </div>
      )}

      {decision.next_picks_plan.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
              Next picks plan
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Confidence falls past pick 2
            </div>
          </div>
          <ul className="mt-1 space-y-2 text-sm">
            {decision.next_picks_plan.map((item) => {
              const conf = NEXT_PICK_CONF[item.confidence];
              return (
                <li
                  key={item.pick_no}
                  className="flex items-baseline gap-2 text-foreground"
                >
                  <span className="font-mono text-xs text-muted-2 w-12 shrink-0">
                    {item.pick_label}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2 w-8 shrink-0">
                    {item.target_position}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
                      <span className="flex-1">
                        <span className="font-medium">
                          {item.target_names.join(" or ")}
                        </span>
                        <span className="text-muted-2"> · {item.reason}</span>
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`font-mono text-[10px] uppercase tracking-[0.14em] ${conf.color}`}
                          title="Confidence: how seriously to read this slot's projection"
                        >
                          {conf.label}
                        </span>
                        {item.density !== "normal" && (
                          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                            {DENSITY_LABEL[item.density]}
                          </span>
                        )}
                      </div>
                    </div>
                    {item.alternates.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-muted-2">
                        <span className="font-mono uppercase tracking-[0.14em]">
                          alts
                        </span>
                        {": "}
                        {item.alternates
                          .map(
                            (a) =>
                              `${a.name}${a.position ? ` (${a.position})` : ""}`,
                          )
                          .join(", ")}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {decision.emergency_trade_up && (
        <div className="mt-4 rounded-md border border-danger/60 bg-danger/10 px-3 py-2 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
            Emergency · trade up ·{" "}
          </span>
          <span className="text-foreground">
            {decision.emergency_trade_up.reasoning}
          </span>
        </div>
      )}

      <AskCoachButton prompt={buildCoachPrompt(decision)} />
    </section>
  );
}

// Cross-lane "Golden" detection. A pick is Golden when it advances
// both Win-Now and Future at once: young enough to grow (age <= 24)
// AND established enough to start now (top-of-pool KTC value or
// rank). Bijan-tier RBs, Garrett Wilson-tier WRs, etc. The pick
// stays in its primary lane (computed from age via classifyLane);
// the Golden flag tells the user the cross-lane truth so they don't
// dismiss a Future pick as "won't help me this year."
function isGoldenPick(p: {
  age: number | null;
  ktc_overall_rank: number | null;
  value: number | null;
}): boolean {
  if (p.age == null || p.age > 24) return false;
  if (p.ktc_overall_rank != null && p.ktc_overall_rank <= 60) return true;
  if (p.value != null && p.value >= 70) return true;
  return false;
}

// Empty-lane copy. Honest about WHY a lane has no qualifying picks.
function emptyLaneCopy(lane: "win-now" | "balanced" | "future"): string {
  switch (lane) {
    case "win-now":
      return "No qualifying win-now picks at this slot. Available pool skews young / unproven.";
    case "balanced":
      return "No mid-age picks at this slot. Pool clusters in either rookies or veterans.";
    case "future":
      return "No qualifying future stash at this slot. Available pool is veteran-heavy.";
  }
}

// CandidateCard component deleted 2026-04-27: dead code from the old
// TOP 3 OPTIONS render that was replaced by the lane grid + standing
// call band. Survival rendering folded into the lane grid candidates
// directly. RULE_SHORT lookup removed with it (no other consumer).

/**
 * Compact "OPPONENT BETWEEN PICKS" bar at the top of the Decision
 * card. Names the gap-filler(s) and surfaces their position needs
 * so the user can see at a glance who's about to pick + what they
 * likely target. Per user 2026-04-25: this is the missing
 * game-theory layer that turns "Moore is at risk" (ADP-based,
 * opponent-blind) into "Moore is safe, opp has 3 WRs already"
 * (opponent-aware).
 */
function OpponentBetweenPicksBar({
  gap,
}: {
  gap: NonNullable<Decision["opponent_between_picks"]>;
}) {
  const primary = gap.primary_opponent;
  if (!primary) return null;
  const positions = ["QB", "RB", "WR", "TE"] as const;
  // Order positions by demand descending so the line reads
  // "likely targets X > Y > Z."
  const ranked = [...positions].sort(
    (a, b) =>
      (primary.position_demand[b] ?? 0) - (primary.position_demand[a] ?? 0),
  );
  const topTarget = ranked[0];
  const counts = positions
    .map((p) => `${primary.position_counts[p] ?? 0} ${p}`)
    .join(" · ");
  const pickCountLabel =
    primary.pick_nos.length > 1
      ? `${primary.pick_nos.length} picks before yours`
      : "1 pick before yours";
  return (
    <div className="mt-3 rounded-md border border-border-soft bg-surface px-3 py-2 text-xs">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        Opponent between picks ·{" "}
        <span className="text-foreground">
          {primary.owner_name ?? `Roster ${primary.roster_id}`}
        </span>{" "}
        · {pickCountLabel}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-muted">
        <span className="font-mono text-[11px]">{counts}</span>
        <span className="text-muted-2">·</span>
        <span>
          likely targets{" "}
          <span className="font-medium text-foreground">{topTarget}</span>{" "}
          first
        </span>
      </div>
    </div>
  );
}
