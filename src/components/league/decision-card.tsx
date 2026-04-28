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
}: {
  decision: Decision;
  trajectory?: BuildTrajectory;
}) {
  const tone = RULE_TONE[decision.recommendation.rule];
  const rec = decision.recommendation;
  const isOnClock = decision.picks_until_me <= 0;
  const density = decision.density;

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
              <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
                  Conflict ·{" "}
                </span>
                <span className="text-foreground">
                  Engine auto-suggests{" "}
                  <span className="font-semibold">
                    {decision.window_frame.label}
                  </span>
                  ; your picks lean{" "}
                  <span className="font-semibold">
                    {trajectory!.build_label}
                  </span>
                  . Candidates may carry an age-band penalty from the
                  engine&rsquo;s read; your picks override the framing.
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

      {decision.top_candidates.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <div
              className={`font-mono text-xs uppercase tracking-[0.16em] ${tone.accent}`}
            >
              Top {decision.top_candidates.length}
              {decision.top_candidates.length > 1 ? " options" : ""}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Lean: {rec.name}
            </span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {decision.top_candidates.map((c) => (
              <CandidateCard key={c.player_id} candidate={c} tone={tone} />
            ))}
          </div>
        </div>
      )}

      {decision.why.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
            Why this lean
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
