/**
 * Multi-position tier map for active drafts. Shows the tier shape of
 * each position (RB / WR / TE / QB) so the user can compare scarcity
 * across positions at a glance.
 *
 * The framework: tier-based drafting + Value Over Next Available (VONA).
 * Scarcity is the load-bearing decision signal; this surface makes it
 * legible. See src/lib/engine/evaluation/tiers.ts for the math.
 *
 * Server component (no client interactivity yet). Tooltips carry the
 * extra context.
 */

import {
  classifyTierScarcity,
  type TierMetadata,
} from "@/lib/engine/evaluation/tiers";
import type {
  TierMap as TierMapData,
  TierMapPositionData,
} from "@/lib/engine/evaluation/tier-map";

export function TierMap({ data }: { data: TierMapData }) {
  if (data.positions.every((p) => p.total_players === 0)) {
    return null;
  }

  return (
    <section className="rounded-md border border-border-soft bg-surface px-4 py-4">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Tier map · available pool
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-2">
            Tiers from the engine&apos;s variance-band overlap. A
            scarce or critical tier means the cliff to the next group
            is steep. Last player in tier = grab-now signal.
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          {new Date(data.generated_at).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.positions.map((p) => (
          <PositionTierColumn key={p.position} data={p} />
        ))}
      </div>
    </section>
  );
}

function PositionTierColumn({ data }: { data: TierMapPositionData }) {
  if (data.total_players === 0) {
    return (
      <div className="rounded-md border border-border-soft bg-surface-2 px-3 py-2">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
          {data.position}
        </div>
        <div className="mt-1 text-xs text-muted-2">No data</div>
      </div>
    );
  }

  // Lead with the headline: which tier is currently most actionable?
  // Critical tier (≤1 left) = grab-now. Scarce tier (≤3) = act soon.
  const headline = pickHeadline(data.tiers);

  return (
    <div className="rounded-md border border-border-soft bg-surface-2 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
          {data.position}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          {data.total_players} avail
        </span>
      </div>

      {headline && (
        <div
          className={`mt-1.5 rounded-sm border px-2 py-1 text-[11px] ${
            headline.tone === "critical"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-accent/40 bg-accent/10 text-accent"
          }`}
          title={headline.fullText}
        >
          {headline.text}
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {data.tiers.slice(0, 4).map((t) => (
          <TierRow key={t.tier} tier={t} positionPlayers={data.top_tier_players} />
        ))}
        {data.tiers.length > 4 && (
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
            + {data.tiers.length - 4} deeper tiers
          </div>
        )}
      </div>
    </div>
  );
}

function TierRow({
  tier,
  positionPlayers,
}: {
  tier: TierMetadata;
  positionPlayers: TierMapPositionData["top_tier_players"];
}) {
  const scarcity = classifyTierScarcity(tier.count);
  const tierPlayerNames = positionPlayers
    .filter((p) => p.tier === tier.tier)
    .map((p) => p.name)
    .slice(0, 6);
  const tone =
    scarcity === "critical"
      ? "text-danger"
      : scarcity === "scarce"
        ? "text-accent"
        : "text-muted-2";

  // Visual bar: width proportional to tier size, capped at 100% so
  // a 24-player tier doesn't blow the column out.
  const barWidth = Math.min(100, (tier.count / 12) * 100);

  return (
    <div
      className="text-[11px]"
      title={
        tierPlayerNames.length > 0
          ? `Tier ${tier.tier} (${tier.count} players, range ${tier.rangeLo.toFixed(0)}-${tier.rangeHi.toFixed(0)}): ${tierPlayerNames.join(", ")}${tier.count > 6 ? ", ..." : ""}`
          : `Tier ${tier.tier}: ${tier.count} players, range ${tier.rangeLo.toFixed(0)}-${tier.rangeHi.toFixed(0)}.`
      }
    >
      <div className="flex items-baseline justify-between gap-2 font-mono">
        <span className={tone}>
          T{tier.tier} · {tier.count}
        </span>
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-2">
          {scarcity}
        </span>
      </div>
      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-background">
        <div
          className={`h-full rounded-full ${
            scarcity === "critical"
              ? "bg-danger/80"
              : scarcity === "scarce"
                ? "bg-accent/70"
                : scarcity === "moderate"
                  ? "bg-foreground/40"
                  : "bg-muted/30"
          }`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function pickHeadline(
  tiers: readonly TierMetadata[],
): { text: string; fullText: string; tone: "critical" | "scarce" } | null {
  // Find the highest tier with critical or scarce status. That's the
  // tier the user should act on.
  for (const t of tiers) {
    const s = classifyTierScarcity(t.count);
    if (s === "critical") {
      return {
        text: `T${t.tier} critical: ${t.count} left`,
        fullText: `Tier ${t.tier} only has ${t.count} player(s) remaining. Cliff to T${t.tier + 1} below.`,
        tone: "critical",
      };
    }
    if (s === "scarce") {
      return {
        text: `T${t.tier} scarce: ${t.count} left`,
        fullText: `Tier ${t.tier} has only ${t.count} players. Act before the cliff.`,
        tone: "scarce",
      };
    }
  }
  return null;
}
