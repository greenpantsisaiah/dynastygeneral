/**
 * Snake-draft slot math, with optional reversal-round support.
 *
 * Sleeper's "reversal round" (commonly 3rd-round reversal, "3RR") flips
 * the snake direction starting at a given round. Round R-1 ends in
 * reverse; round R also goes reverse (the "double reverse" handing the
 * first slot two consecutive picks across the boundary). From round R
 * onward, the snake parity is inverted relative to a vanilla snake.
 *
 * Without this helper, callers that do `round % 2 === 1 ? ... : ...`
 * silently mis-map slots in 3RR leagues, which produces wrong "picks
 * until you" math and wrong on-clock predictions.
 *
 * Reference: a 12-team 3RR draft has slot 8 picking pick 29 in round 3
 * (reverse), not pick 32 (which is what vanilla snake would say).
 */

export type DraftKind = "snake" | "linear" | string | null | undefined;

export type SnakeOpts = {
  type?: DraftKind;
  reversalRound?: number | null;
};

function isForwardRound(
  round: number,
  reversalRound?: number | null,
): boolean {
  const normallyForward = round % 2 === 1;
  if (
    reversalRound != null &&
    reversalRound >= 2 &&
    round >= reversalRound
  ) {
    return !normallyForward;
  }
  return normallyForward;
}

export function slotForPickNo(
  pickNo: number,
  totalTeams: number,
  opts: SnakeOpts = {},
): { round: number; slot: number } {
  const round = Math.ceil(pickNo / totalTeams);
  const within = ((pickNo - 1) % totalTeams) + 1;
  if (opts.type === "linear") return { round, slot: within };
  const slot = isForwardRound(round, opts.reversalRound)
    ? within
    : totalTeams - within + 1;
  return { round, slot };
}

export function pickNoForSlot(
  slot: number,
  round: number,
  totalTeams: number,
  opts: SnakeOpts = {},
): number {
  const offset = (round - 1) * totalTeams;
  if (opts.type === "linear") return offset + slot;
  const within = isForwardRound(round, opts.reversalRound)
    ? slot
    : totalTeams - slot + 1;
  return offset + within;
}
