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

import { AskCoachButton } from "./ask-coach-button";
import type {
  Decision,
  DecisionRule,
  DecisionTopCandidate,
} from "@/lib/strategy/decision-synthesis/types";
import type { PickDensityKind } from "@/lib/strategy/league-state/snapshot";
import type { BuildTrajectory } from "@/lib/engine/build-trajectory";

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
}: {
  decision: Decision;
  trajectory?: BuildTrajectory;
  horizonDial?: number;
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
                  . Constraint softened to honor your lean.
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

      {/* THE LANES (post-Phase D iteration 2026-04-27).
          Three timeline lanes side-by-side, each containing the top
          2-3 picks that advance that direction. Replaces the prior
          TOP 3 OPTIONS + TOP BY LANE pair (which surfaced the same
          candidates twice with slightly different framings).

          No global "MY LEAN" badge: the engine's rule cascade still
          produces an internal lean for things like trade-off framing
          and Coach context, but the UI doesn't claim "the answer."
          Each lane has its own PRIMARY (top within that lane). The
          user picks the lane that matches the direction they want.

          Visual emphasis: when Soundboard Horizon is moved to ±40+
          OR the user's pick trajectory leans strongly, that lane
          gets a thicker border + glow. Otherwise all three lanes
          render at equal weight.

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

          // Determine which lane (if any) gets visual emphasis. Two
          // signals can promote a lane: Soundboard Horizon dial set
          // strongly, OR pick trajectory clearly leaning.
          let emphasisLane: "win-now" | "balanced" | "future" | null = null;
          if (horizonActive) {
            emphasisLane = horizonDial! > 0 ? "future" : "win-now";
          } else if (trajectory && trajectory.pick_count >= 3) {
            if (trajectory.build_label.includes("Future")) {
              emphasisLane = "future";
            } else if (trajectory.build_label.includes("Win-Now")) {
              emphasisLane = "win-now";
            }
          }

          return (
            <div className="mt-4">
              <div className="flex items-baseline justify-between">
                <div
                  className={`font-mono text-xs uppercase tracking-[0.16em] ${tone.accent}`}
                >
                  Lanes · pick your direction
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                  {emphasisLane
                    ? `Emphasis: ${emphasisLane === "win-now" ? "Win-Now" : emphasisLane === "future" ? "Future" : "Balanced"}`
                    : "Equal weight"}
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
                                    {isPrimary && (
                                      <span className={`${headerColor}`}>
                                        Primary
                                      </span>
                                    )}
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
            Counter-view · the case against this lean
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

const RULE_SHORT: Record<DecisionRule, string> = {
  fill_starter_urgent: "Starter · urgent",
  fill_starter: "Starter",
  push_path: "Push path",
  window_direction: "Window",
  earned_value: "Earned value",
  position_steal: "Steal",
  future_stash: "Future stash",
};

function CandidateCard({
  candidate,
  tone,
}: {
  candidate: DecisionTopCandidate;
  tone: { border: string; bg: string; accent: string };
}) {
  const c = candidate;
  // Survival label rephrased 2026-04-27: prior "Probably gone by next
  // pick · 15%" was ambiguous: users read "15% chance gone" when the
  // engine meant "15% chance survives." "Survival: 15%" with the
  // class-specific qualifier removes that ambiguity.
  const survivalLabel =
    c.availability_next_pick === "likely_here"
      ? "Survival likely"
      : c.availability_next_pick === "coin_flip"
        ? "Survival coin flip"
        : c.availability_next_pick === "probably_gone"
          ? "Survival unlikely"
          : null;
  const survivalTone =
    c.availability_next_pick === "probably_gone"
      ? "text-danger"
      : c.availability_next_pick === "coin_flip"
        ? "text-warning"
        : "text-muted-2";
  return (
    <div
      className={`flex flex-col rounded-md border px-3 py-2.5 ${
        c.is_lean
          ? `${tone.border} ${tone.bg}`
          : "border-border-soft bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
            c.is_lean ? tone.accent : "text-muted-2"
          }`}
        >
          {c.is_lean ? "My lean" : RULE_SHORT[c.rule]}
        </span>
        <span className="flex items-baseline gap-2 font-mono text-[10px] text-muted-2">
          {c.value != null && (
            <span title="KTC-equivalent dynasty value, FantasyCalc-sourced and normalized 0-100. Higher = more valuable.">
              VAL {c.value}
            </span>
          )}
          {c.ktc_overall_rank != null && (
            <span title="KTC overall dynasty rank (lower = better). Crowdsourced expertise from FantasyCalc; the dynasty-pro signal we trust more than ADP for futures.">
              KTC #{c.ktc_overall_rank}
            </span>
          )}
          {c.adp != null && (
            <span title="Dynasty ADP from Sleeper's projections data, format-aware. May differ 10-20 picks from Sleeper's live draft-room display, which is computed differently. We trust KTC more for dynasty value.">
              ADP {Math.round(c.adp)}
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 text-sm font-semibold text-foreground">
        {c.name}
        {c.is_rookie && (
          <span
            className="ml-1.5 rounded-sm border border-accent/60 bg-accent/10 px-1 py-0 font-mono text-[9px] uppercase tracking-[0.14em] text-accent"
            title="Incoming rookie. Pre-NFL-draft value is speculative pending landing spot."
          >
            Rookie
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        <span>
          {c.position}
          {c.team ? `-${c.team}` : ""}
          {c.age != null ? ` · age ${c.age}` : ""}
        </span>
        <span
          className={`rounded-sm border px-1.5 py-0 text-[9px] ${
            c.timeline_lane === "future"
              ? "border-success/50 bg-success/10 text-success"
              : c.timeline_lane === "win-now"
                ? "border-warning/50 bg-warning/10 text-warning"
                : "border-border-soft bg-surface-2 text-muted-2"
          }`}
          title={
            c.timeline_lane === "future"
              ? "Future lane: rookie or age <= 23. Long-term build asset."
              : c.timeline_lane === "win-now"
                ? "Win-now lane: age >= 28. Immediate-impact starter."
                : "Balanced lane: age 24-27. Productive across both windows."
          }
        >
          {c.timeline_lane === "future"
            ? "Future"
            : c.timeline_lane === "win-now"
              ? "Win-Now"
              : "Balanced"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-foreground leading-snug">
        {c.primary_reason}
      </p>
      {(survivalLabel || c.constraint_note || c.opponent_signal?.note) && (
        <div className="mt-2 flex flex-col gap-1">
          {/* Survival sparkline + label. The bar fill width matches
              the approximate survival probability so the user can
              scan likelihood at a glance instead of reading the
              text. Color matches the availability class. */}
          {survivalLabel && c.survival_pct != null && (
            <div className="flex items-center gap-2">
              <div className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-border-soft">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full ${
                    c.availability_next_pick === "probably_gone"
                      ? "bg-danger/80"
                      : c.availability_next_pick === "coin_flip"
                        ? "bg-warning/80"
                        : "bg-success/80"
                  }`}
                  style={{ width: `${c.survival_pct}%` }}
                />
              </div>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.14em] ${survivalTone}`}
              >
                {survivalLabel} · {c.survival_pct}%
              </span>
            </div>
          )}
          {c.opponent_signal?.note && (
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                c.opponent_signal.direction === "amplifies"
                  ? "text-danger"
                  : "text-success"
              }`}
            >
              {c.opponent_signal.direction === "amplifies" ? "↓ " : "↑ "}
              {c.opponent_signal.note}
            </span>
          )}
          {c.constraint_note && (
            <span className="text-accent normal-case tracking-normal text-[11px]">
              ⚠ {c.constraint_note}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

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
