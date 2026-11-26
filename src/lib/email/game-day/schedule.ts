/**
 * NFL kickoff times for one week, from the nflverse schedule
 * (github.com/nflverse/nfldata, data/games.csv, CC-BY-4.0). Sleeper's
 * public API has no schedule endpoint, and lineup locks are per player at
 * his game's kickoff, so the Sunday lineup panel needs kickoffs to say
 * which swaps are still open and when each lineup locks.
 *
 * games.csv `gametime` is US Eastern. Central is always one hour behind
 * Eastern (both observe daylight saving), so the CT label is ET minus one
 * hour and the instant uses the Central offset from deadline.ts.
 */

import { ctOffset } from "@/lib/email/trade-desk/deadline";

export const NFLVERSE_GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

/** nflverse team codes that differ from Sleeper's. */
const TO_SLEEPER: Record<string, string> = { LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR" };
export const sleeperTeam = (code: string) => TO_SLEEPER[code] ?? code;

export interface Kickoff {
  at: Date;
  /** "12:00 PM" in Central time. */
  label: string;
  /** "Sun", "Thu", "Mon". */
  day: string;
  opponent: string;
}

export interface WeekSchedule {
  season: string;
  week: number;
  /** Sleeper team code -> kickoff. A team absent from the map is on bye. */
  byTeam: Map<string, Kickoff>;
}

function ctLabel(hourEt: number, minute: number): string {
  const h24 = (hourEt + 23) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** Parse games.csv text into one regular-season week. Rows that fail to parse are skipped. */
export function parseNflSchedule(csv: string, season: string, week: number): WeekSchedule {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = lines[0]?.split(",") ?? [];
  const col = (n: string) => head.indexOf(n);
  const ix = {
    season: col("season"), type: col("game_type"), week: col("week"), day: col("gameday"),
    weekday: col("weekday"), time: col("gametime"), away: col("away_team"), home: col("home_team"),
  };
  const byTeam = new Map<string, Kickoff>();
  if (Object.values(ix).some((i) => i < 0)) return { season, week, byTeam };
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f[ix.season] !== season || f[ix.type] !== "REG" || Number(f[ix.week]) !== week) continue;
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f[ix.day] ?? "");
    const t = /^(\d{1,2}):(\d{2})$/.exec(f[ix.time] ?? "");
    if (!d || !t) continue;
    const midnight = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])));
    const etOffset = ctOffset(midnight) + 1;
    const at = new Date(midnight.getTime() + ((Number(t[1]) - etOffset) * 60 + Number(t[2])) * 60_000);
    const day = (f[ix.weekday] ?? "").slice(0, 3);
    const away = sleeperTeam(f[ix.away]);
    const home = sleeperTeam(f[ix.home]);
    const label = ctLabel(Number(t[1]), Number(t[2]));
    byTeam.set(away, { at, label, day, opponent: home });
    byTeam.set(home, { at, label, day, opponent: away });
  }
  return { season, week, byTeam };
}

/** Fetch one week of kickoffs. Null when the source is down or has no games for the week. */
export async function fetchNflSchedule(season: string, week: number): Promise<WeekSchedule | null> {
  try {
    const res = await fetch(NFLVERSE_GAMES_URL, { next: { revalidate: 3600 } } as RequestInit);
    if (!res.ok) return null;
    const s = parseNflSchedule(await res.text(), season, week);
    return s.byTeam.size > 0 ? s : null;
  } catch (err) {
    console.error("[game-day:schedule]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
    return null;
  }
}
