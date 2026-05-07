/**
 * Team Identity Panel. The "this is your team" hero card on the
 * league hub. Closes the founder-named gap: characterizing the
 * user's team has been core mission and the product has never
 * nailed it. This panel is the consolidation layer.
 *
 * Structure (top to bottom):
 *   1. Headline narrative (one line)
 *   2. Build archetype + phase
 *   3. Position fingerprint (strongest + weakest)
 *   4. Risk fingerprint (inflection exposure)
 *   5. Forward projection (lineup talent rank + keeper slate)
 *
 * Renders ABOVE the Draft Progress Panel so identity comes before
 * performance.
 */

import type { TeamIdentity } from "@/lib/strategy/team-identity";

export function TeamIdentityPanel({ data }: { data: TeamIdentity | null }) {
  if (!data) return null;
  // Only render when at least the build readout has confidence.
  if (data.build.primary_name === "Forming") return null;

  return (
    <section
      className="mb-6 overflow-hidden rounded-lg border-2 border-accent/60 bg-accent/5"
      aria-label="Team identity"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-soft px-5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Team identity · this is your team
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          v1 prototype
        </span>
      </div>

      {/* Headline */}
      <p className="px-5 py-4 text-base leading-snug text-foreground">
        {data.headline}
      </p>

      {/* Build archetype */}
      <div className="border-t border-border-soft px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Build
          </span>
          {data.build.phase && (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
              {data.build.phase}
            </span>
          )}
        </div>
        <div className="mt-2 text-lg font-semibold text-foreground">
          {data.build.secondary_name
            ? `${data.build.primary_name} + ${data.build.secondary_name}`
            : data.build.primary_name}
        </div>
        {data.build.description && (
          <p className="mt-1 text-xs leading-snug text-muted">
            {data.build.description}
          </p>
        )}
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          {Math.round(data.build.primary_confidence * 100)}% archetype fit
        </div>
      </div>

      {/* Position fingerprint */}
      {(data.position_room.strongest || data.position_room.weakest) && (
        <div className="grid gap-3 border-t border-border-soft px-5 py-4 sm:grid-cols-2">
          {data.position_room.strongest && (
            <div className="rounded-md border border-success/40 bg-success/5 px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
                Strongest room
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {data.position_room.strongest.position} · rank{" "}
                {data.position_room.strongest.rank}/
                {data.position_room.strongest.total}
              </div>
              {data.position_room.strongest.anchors.length > 0 && (
                <div className="mt-1 text-xs text-muted">
                  {data.position_room.strongest.anchors.join(" + ")}
                </div>
              )}
            </div>
          )}
          {data.position_room.weakest && (
            <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
                Address next
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {data.position_room.weakest.position} · rank{" "}
                {data.position_room.weakest.rank}/
                {data.position_room.weakest.total}
              </div>
              <div className="mt-1 text-xs text-muted">
                {data.position_room.weakest.count}/
                {data.position_room.weakest.required} starters at{" "}
                {data.position_room.weakest.position}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Risk fingerprint */}
      <div className="border-t border-border-soft px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Variance read
          </span>
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.16em] ${
              data.risk.tier === "low"
                ? "text-success"
                : data.risk.tier === "moderate"
                  ? "text-warning"
                  : "text-danger"
            }`}
          >
            {data.risk.tier} variance
          </span>
        </div>
        <p className="mt-2 text-sm text-foreground leading-snug">
          {data.risk.summary}
        </p>
        {data.risk.named_players.length > 0 && (
          <p className="mt-1 text-xs text-muted leading-snug">
            Carrying inflection windows: {data.risk.named_players.join(", ")}.
          </p>
        )}
      </div>

      {/* Forward projection */}
      <div className="border-t border-border-soft px-5 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Forward projection
          </span>
        </div>
        <div className="mt-2 text-sm text-foreground">
          Starting lineup talent rank{" "}
          <strong>
            {data.forward.lineup_talent_rank}/{data.forward.total_teams}
          </strong>{" "}
          (
          {Math.round(data.forward.lineup_talent_value)} value points across
          starters).
        </div>
        {data.forward.keeper_slate && data.forward.keeper_slate.length > 0 && (
          <div className="mt-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
              Likely {data.forward.max_keepers}-keeper slate
            </div>
            <ul className="mt-1 space-y-0.5 text-xs text-foreground">
              {data.forward.keeper_slate.map((p) => (
                <li key={p.player_id}>
                  · <span className="font-semibold">{p.player_name}</span>{" "}
                  <span className="text-muted">(value {p.value})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
