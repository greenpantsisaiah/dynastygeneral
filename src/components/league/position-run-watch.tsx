/**
 * Position Run Watch. Surfaces which positions have been disproportionately
 * picked in the recent draft window. Renders during active draft state
 * BEFORE the user has made a pick (the DraftProgressPanel's position-run
 * line is gated behind picks_made_by_user > 0, leaving this intelligence
 * invisible at the user's first-pick moment).
 *
 * Per founder report 2026-05-18 at pick 1.10: "There's been a huge run
 * on WRs already, only two RBs and two QBs gone, so I guess I'd expect
 * that fact to be acknowledged." The data is in draftProgress.position_run
 * AND can be re-computed across the whole draft, not just the last 12
 * picks. This component owns the user-facing surface.
 */

import type { DraftPickRecord } from "@/lib/strategy/league-state/snapshot";

type Position = "QB" | "RB" | "WR" | "TE";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

const POSITION_TONE: Record<Position, string> = {
  QB: "text-success",
  RB: "text-accent",
  WR: "text-foreground",
  TE: "text-warning",
};

export function PositionRunWatch({
  picksMade,
  totalTeams,
  myNextPickNo,
}: {
  picksMade: ReadonlyArray<DraftPickRecord>;
  totalTeams: number;
  /** The user's next pick number. Used to label "before your slot". */
  myNextPickNo: number | null;
}) {
  if (picksMade.length === 0) return null;

  // Two windows. Whole-draft counts give the structural read; recent
  // window (last 1 round) catches active runs.
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of picksMade) {
    if (p.position && POSITIONS.includes(p.position as Position)) {
      counts[p.position as Position]++;
    }
  }
  const recentWindow = picksMade.slice(-totalTeams);
  const recentCounts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of recentWindow) {
    if (p.position && POSITIONS.includes(p.position as Position)) {
      recentCounts[p.position as Position]++;
    }
  }

  // Identify the running position (most recent picks tilted to it) and
  // the depressed position (fewer than expected given a uniform split).
  const total = picksMade.length;
  const recentTotal = recentWindow.length;
  const expectedPerPosition = recentTotal / 4;

  type RunRow = { pos: Position; recent: number; whole: number; delta: number };
  const rows: RunRow[] = POSITIONS.map((pos) => ({
    pos,
    recent: recentCounts[pos],
    whole: counts[pos],
    delta: recentCounts[pos] - expectedPerPosition,
  }));
  rows.sort((a, b) => b.delta - a.delta);
  const runningPos = rows[0];
  const depressedPos = rows[rows.length - 1];

  const isRun = runningPos.recent >= 4 || runningPos.delta >= 1.5;

  return (
    <section className="mt-4 rounded-lg border border-border-soft bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Position run watch
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            {total} pick{total === 1 ? "" : "s"} made
          </span>
        </div>
        {myNextPickNo && (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            your slot · pick {myNextPickNo}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {POSITIONS.map((pos) => {
          const recent = recentCounts[pos];
          const whole = counts[pos];
          const tone = POSITION_TONE[pos];
          const isRunning = pos === runningPos.pos && isRun;
          const isDepressed = pos === depressedPos.pos && !isRun
            ? false
            : pos === depressedPos.pos && isRun;
          return (
            <div
              key={pos}
              className={`rounded-md border px-3 py-2 ${
                isRunning
                  ? "border-warning/60 bg-warning/5"
                  : isDepressed
                    ? "border-success/40 bg-success/5"
                    : "border-border-soft bg-surface-2"
              }`}
            >
              <div
                className={`font-mono text-[10px] uppercase tracking-[0.18em] ${tone}`}
              >
                {pos}
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {whole}
              </div>
              <div className="font-mono text-[9px] text-muted-2">
                {recent} in last {recentTotal}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-snug text-foreground">
        {isRun ? (
          <>
            <span className="text-warning">{runningPos.pos} run.</span>{" "}
            {runningPos.recent} of the last {recentTotal} picks went{" "}
            {runningPos.pos}. Top tier of {runningPos.pos} is depleting
            fast.{" "}
            <span className="text-success">
              {depressedPos.pos} value is sitting later than ADP says it
              should
            </span>{" "}
            because the room ignored it during the run. That's where the
            value gift lives if the engine surfaces a {depressedPos.pos}{" "}
            in your lanes.
          </>
        ) : (
          <>
            No clear position run. Picks are distributed roughly across
            positions; no scarcity pressure to act on the run.
          </>
        )}
      </p>
    </section>
  );
}
