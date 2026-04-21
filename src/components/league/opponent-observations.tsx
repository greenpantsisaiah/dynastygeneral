/**
 * Opponent Observations panel. For each opposing team, names the
 * pattern they're showing ("QB stockpile forming," "Aging-vet bet,"
 * "Vanilla / no clear lane") with concrete evidence. Plus a league
 * aggregate note at the top.
 *
 * Stage A only sees what's in picks_made + roster avg age. When
 * player rankings / ADP / rookie-year data land, each observation
 * can sharpen significantly.
 */

import type {
  OpponentReadout,
  TradeAngle,
  TradeAngleStance,
} from "@/lib/strategy/opponents/observe";

const STANCE_TONE: Record<
  TradeAngleStance,
  { border: string; bg: string; chip: string; label: string }
> = {
  approach: {
    border: "border-success/50",
    bg: "bg-success/5",
    chip: "text-success",
    label: "Approach",
  },
  extract: {
    border: "border-accent/50",
    bg: "bg-accent/5",
    chip: "text-accent",
    label: "Extract",
  },
  avoid: {
    border: "border-danger/50",
    bg: "bg-danger/5",
    chip: "text-danger",
    label: "Avoid",
  },
};

export function OpponentObservations({
  readout,
}: {
  readout: OpponentReadout;
}) {
  if (readout.teams.length === 0 && readout.league.notes.length === 0) {
    return null;
  }
  return (
    <section className="mt-8">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Opponent observations
      </div>
      <div className="mt-1 text-sm text-muted">
        What the room is doing. Evidence-grounded. each observation cites the
        picks that drove it.
      </div>

      {readout.league.notes.length > 0 && (
        <div className="mt-4 rounded-md border border-border-strong bg-surface px-4 py-3">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2">
            League-wide
          </div>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {readout.league.notes.map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
        </div>
      )}

      {readout.teams.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {readout.teams.map((team) => (
            <div
              key={team.roster_id}
              className="rounded-md border border-border-soft bg-surface px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {team.owner_name}
                </span>
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2">
                  {team.picks_count} picks
                </span>
              </div>
              <ul className="mt-2 space-y-3">
                {team.observations.map((obs) => (
                  <li key={obs.id}>
                    <div className="flex items-baseline gap-2 text-sm">
                      <span
                        className={`font-medium ${
                          obs.severity === "notable"
                            ? "text-accent"
                            : "text-muted"
                        }`}
                      >
                        {obs.pattern_name}
                      </span>
                    </div>
                    <ul className="ml-3 mt-0.5 list-disc space-y-0.5 text-xs text-muted">
                      {obs.evidence.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              {team.trade_angles.length > 0 && (
                <div className="mt-4 border-t border-border-soft pt-3">
                  <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
                    Trade angle
                  </div>
                  <ul className="mt-2 space-y-2">
                    {team.trade_angles.map((angle) => (
                      <TradeAngleRow key={angle.id} angle={angle} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TradeAngleRow({ angle }: { angle: TradeAngle }) {
  const tone = STANCE_TONE[angle.stance];
  return (
    <li
      className={`rounded-md border ${tone.border} ${tone.bg} px-3 py-2 text-xs`}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={`font-mono uppercase tracking-[0.14em] ${tone.chip}`}
        >
          {tone.label}
        </span>
        <span className="text-foreground">{angle.headline}</span>
      </div>
      <div className="mt-0.5 text-muted">· {angle.rationale}</div>
    </li>
  );
}
