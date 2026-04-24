"use client";

/**
 * Path-competition card. For each viable archetype the user is leaning
 * toward, surface the top 3 opponents most likely competing for the
 * path's primary position + posture.
 *
 * Per cross-panel decision framework (2026-04-24): the previous
 * single-path version froze on first commit and went stale when the
 * user explored other leans. Now follows the live ranked-archetype
 * set (top viable paths by viability, committed path pinned to top
 * if any), which matches how real managers actually shop pre-commit.
 *
 * Free tier: names + structural reason ("already 2 RBs", "same
 * posture"). Each row has an "Ask Coach about [name]" button that
 * dispatches the existing `coach:seed` window event, pre-filling
 * the Coach input with a per-opponent question.
 */

import type {
  PathCompetition,
  SamePathThreats,
} from "@/lib/strategy/same-path-threats/build";

function seedCoachIntel(opponentName: string, archetypeName: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("coach:seed", {
      detail: {
        prompt: `Give me intel on ${opponentName}'s roster. They're a same-path threat to my ${archetypeName} build. What's their next likely move and how do I stay ahead?`,
      },
    }),
  );
}

const TIER_TONE = {
  primary: { border: "border-danger/60", chip: "text-danger", label: "PRIMARY THREAT" },
  watch: { border: "border-warning/60", chip: "text-warning", label: "WATCH" },
  potential: { border: "border-border-strong", chip: "text-muted-2", label: "POTENTIAL" },
} as const;

function ThreatRow({
  threat,
  archetypeName,
}: {
  threat: SamePathThreats["threats"][number];
  archetypeName: string;
}) {
  const tone = TIER_TONE[threat.tier];
  return (
    <div
      className={`rounded-md border ${tone.border} bg-surface-2 px-4 py-3`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone.chip}`}
          >
            {tone.label}
          </span>
          <span className="text-base font-semibold text-foreground">
            {threat.owner_name}
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-2">
          {threat.score}/100
        </span>
      </div>
      {threat.reasons.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
          {threat.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => seedCoachIntel(threat.owner_name, archetypeName)}
        className="mt-2 inline-flex h-7 items-center rounded-md border border-border-strong bg-background px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition hover:border-accent/60 hover:text-accent"
        title={`Ask Coach for deeper intel on ${threat.owner_name}`}
      >
        Ask Coach about {threat.owner_name} →
      </button>
    </div>
  );
}

/**
 * Multi-path renderer. When buildPathCompetition returns a single
 * dominant path, this still works (just renders one section). When it
 * returns 2-3 viable paths, each gets its own labeled group so the
 * user sees competition per-path instead of a stale "chasing TE
 * Streamer?" header on a path they've moved on from.
 */
export function SamePathThreatsCard({
  competition,
}: {
  competition: PathCompetition;
}) {
  if (competition.paths.length === 0) return null;
  const isMulti = competition.paths.length > 1;
  const totalThreats = competition.paths.reduce(
    (sum, p) => sum + p.threats.length,
    0,
  );

  return (
    <section className="mt-8 rounded-lg border-2 border-border-strong bg-surface px-5 py-5">
      <header>
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          Path competition · {totalThreats} threat{totalThreats === 1 ? "" : "s"}
          {isMulti ? ` across ${competition.paths.length} paths` : ""}
        </div>
        <h2 className="mt-1 text-xl font-semibold text-foreground">
          {isMulti
            ? "Who's chasing each of your viable paths?"
            : `Who else is chasing ${competition.paths[0].archetype_name}?`}
        </h2>
        <p className="mt-1 text-xs text-muted">
          {isMulti
            ? "Opponents grouped per archetype. They'll compete for the same players + tier on whichever path you commit to."
            : "Opponents whose roster shape or posture overlaps with your path. They'll likely compete for the same players + tier."}
        </p>
      </header>

      <div className="mt-4 space-y-5">
        {competition.paths.map((pathThreats) => (
          <div key={pathThreats.archetype_id}>
            {isMulti && (
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                  On {pathThreats.archetype_name}
                </div>
                <span className="font-mono text-[10px] text-muted-2">
                  {pathThreats.threats.length} threat
                  {pathThreats.threats.length === 1 ? "" : "s"}
                </span>
              </div>
            )}
            <div className="space-y-2">
              {pathThreats.threats.map((t) => (
                <ThreatRow
                  key={`${pathThreats.archetype_id}:${t.roster_id}`}
                  threat={t}
                  archetypeName={pathThreats.archetype_name}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
