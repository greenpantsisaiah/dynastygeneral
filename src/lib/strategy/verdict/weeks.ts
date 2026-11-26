/**
 * Which regular-season week is the latest one with final scores. The ONE
 * answer the weekly brief and the verdict loader share, so "Week 11 is in"
 * in the header and the weeks the simulator treats as played never
 * disagree (BUILD_SPEC "Week label from one source").
 *
 * Sleeper flips `nfl_state.week` at an unannounced time early in the week
 * (observed: already the next week by Tuesday evening). So:
 * - week `nflWeek` counts as final only when every matchup row has points
 *   AND it is Tuesday or Wednesday in Chicago (after Monday night, before
 *   Thursday kickoff); a Sunday with every team scoring is not final yet.
 * - otherwise the final week is `nflWeek - 1`.
 */

import type { SleeperMatchup } from "@/lib/sleeper/schemas";

const TZ = "America/Chicago";

function chicagoWeekday(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
}

export function lastCompletedWeek(args: {
  nflWeek: number;
  matchupsByWeek: Record<number, SleeperMatchup[] | undefined>;
  now?: Date;
}): number {
  const rows = args.matchupsByWeek[args.nflWeek] ?? [];
  const allScored = rows.length > 0 && rows.every((r) => (r.points ?? 0) > 0);
  const day = chicagoWeekday(args.now ?? new Date());
  if (allScored && (day === "Tue" || day === "Wed")) return args.nflWeek;
  return args.nflWeek - 1;
}
