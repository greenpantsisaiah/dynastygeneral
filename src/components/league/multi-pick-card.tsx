/**
 * Multi-pick draft rollout card. Renders the projected chain of user
 * picks, each with primary recommendation + alternates + confidence.
 *
 * Pro feature. Free users see an upsell variant pointing to /pricing.
 * The forecast is server-side and cheap (no LLM call); the upsell is a
 * UI-tier choice, not a cost-control choice.
 */

import Link from "next/link";
import type { MultiPickPlan } from "@/lib/strategy/multi-pick/types";

export function MultiPickCard({
  plan,
  isPro,
  pickCount,
}: {
  plan: MultiPickPlan | null;
  isPro: boolean;
  pickCount: number;
}) {
  // Always-visible upsell for free users when there's enough schedule
  // to justify a rollout. Free users never see the projected names;
  // the screenshot-style preview below is intentionally generic.
  if (!isPro) {
    if (pickCount < 2) return null;
    return (
      <section className="mt-8 rounded-lg border-2 border-accent/40 bg-accent/5 px-5 py-5">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          Multi-pick rollout · Pro
        </div>
        <h2 className="mt-1 text-xl font-semibold text-foreground">
          See your full draft, not just your next pick.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The Pro rollout projects your next {pickCount} picks under a pool-
          depletion model. Primary pick at each slot, two alternates if the
          board sniped you, and a thread that connects them.
        </p>
        <Link
          href="/pricing"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Start 14-day Pro trial →
        </Link>
      </section>
    );
  }

  if (!plan || plan.picks.length === 0) return null;

  return (
    <section className="mt-8 rounded-lg border-2 border-accent/60 bg-accent/5 px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Multi-pick rollout · {plan.picks.length} picks
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            Your draft, projected
          </h2>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          50-trial Monte Carlo · stochastic opponents
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {plan.picks.map((p, i) => (
          <PickRow key={p.pick_no} entry={p} index={i} />
        ))}
      </div>

      {plan.thread && (
        <div className="mt-5 rounded-md border border-border-soft bg-surface-2 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            The thread
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground">
            {plan.thread}
          </p>
        </div>
      )}

      {plan.position_summary.length > 0 && (
        <div className="mt-3 flex flex-wrap items-baseline gap-2 text-xs text-muted">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            Plan adds
          </span>
          {plan.position_summary.map((p) => (
            <span
              key={p.position}
              className="rounded-full border border-border-soft bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-foreground"
            >
              {p.count}× {p.position}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

const CONF_TONE: Record<
  "high" | "medium" | "directional",
  { label: string; color: string }
> = {
  high: { label: "High", color: "text-success" },
  medium: { label: "Medium", color: "text-accent" },
  directional: { label: "Directional", color: "text-muted-2" },
};

function PickRow({
  entry,
  index,
}: {
  entry: MultiPickPlan["picks"][number];
  index: number;
}) {
  const tone = CONF_TONE[entry.confidence];
  return (
    <div className="grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-3 rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-sm">
      <div>
        <div className="font-mono text-[11px] text-accent">
          {entry.pick_label}
        </div>
        {index > 0 && (
          <div className="font-mono text-[10px] text-muted-2">
            +{entry.picks_until}
          </div>
        )}
      </div>
      <div>
        <div className="text-foreground">
          <span className="font-semibold">{entry.primary.name}</span>
          <span className="text-muted-2">
            {" "}
            · {entry.primary.position}
            {entry.primary.team ? `-${entry.primary.team}` : ""}
            {entry.primary.age != null ? `, age ${entry.primary.age}` : ""}
          </span>
        </div>
        <div className="text-[11px] text-muted">{entry.primary.reason}</div>
        {entry.alternates.length > 0 && (
          <div className="mt-1 text-[11px] text-muted-2">
            <span className="font-mono uppercase tracking-[0.14em]">alts</span>
            {": "}
            {entry.alternates
              .map((a) => `${a.name} (${a.position}${a.age != null ? ` ${a.age}` : ""})`)
              .join(", ")}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          conf
        </div>
        <div
          className={`font-mono text-[11px] uppercase tracking-[0.14em] ${tone.color}`}
        >
          {tone.label}
        </div>
      </div>
    </div>
  );
}
