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

const RULE_LABEL: Record<DecisionRule, string> = {
  fill_starter_urgent: "Fill starter · urgent",
  fill_starter: "Fill starter",
  push_path: "Push path",
  window_direction: "Window direction",
  earned_value: "Earned value",
};

const RULE_TONE: Record<
  DecisionRule,
  { border: string; bg: string; accent: string }
> = {
  fill_starter_urgent: {
    border: "border-danger/60",
    bg: "bg-danger/5",
    accent: "text-danger",
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
};

const DENSITY_LABEL: Record<PickDensityKind, string> = {
  wraparound: "Wraparound",
  cluster: "Cluster",
  isolated: "Isolated",
  normal: "Normal",
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

export function DecisionCard({ decision }: { decision: Decision }) {
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

      {decision.window_frame.strength !== "none" && (
        <div className="mt-3 rounded-md border border-border-soft bg-surface px-3 py-2 text-xs">
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
          <span className="text-muted"> · {decision.window_frame.sentence}</span>
        </div>
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

      {decision.next_picks_plan.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
            Next picks plan
          </div>
          <ul className="mt-1 space-y-1 text-sm">
            {decision.next_picks_plan.map((item) => (
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
                <span className="flex-1">
                  <span className="font-medium">
                    {item.target_names.join(" or ")}
                  </span>
                  <span className="text-muted-2"> · {item.reason}</span>
                </span>
                {item.density !== "normal" && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                    {DENSITY_LABEL[item.density]}
                  </span>
                )}
              </li>
            ))}
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
};

function CandidateCard({
  candidate,
  tone,
}: {
  candidate: DecisionTopCandidate;
  tone: { border: string; bg: string; accent: string };
}) {
  const c = candidate;
  const survivalLabel =
    c.survives_to_next_pick === true
      ? "Likely here next pick"
      : c.survives_to_next_pick === false
        ? "Probably gone by next pick"
        : null;
  const survivalTone =
    c.survives_to_next_pick === false ? "text-danger" : "text-muted-2";
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
        {c.adp != null && (
          <span className="font-mono text-[10px] text-muted-2">
            ADP {Math.round(c.adp)}
          </span>
        )}
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
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        {c.position}
        {c.team ? `-${c.team}` : ""}
        {c.age != null ? ` · age ${c.age}` : ""}
      </div>
      <p className="mt-1.5 text-xs text-foreground leading-snug">
        {c.primary_reason}
      </p>
      {(survivalLabel || c.constraint_note) && (
        <div className="mt-1.5 flex flex-col gap-0.5 font-mono text-[10px] uppercase tracking-[0.14em]">
          {survivalLabel && (
            <span className={survivalTone}>{survivalLabel}</span>
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
