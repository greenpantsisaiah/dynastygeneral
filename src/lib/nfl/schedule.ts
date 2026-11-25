/**
 * This NFL week's games (kickoff time + live state) keyed by Sleeper team
 * abbreviation. Sleeper's public API has no schedule, so this reads ESPN's
 * public scoreboard JSON. Server-only; unofficial endpoint, so the parse is
 * per-entry and a failure returns an empty map (callers then send nothing,
 * which is the safe direction for alerts).
 */

import type { GameState, TeamGame } from "@/lib/lineup/out-starters";

const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

/** ESPN abbreviations that differ from Sleeper's. */
const ESPN_TO_SLEEPER: Record<string, string> = { WSH: "WAS" };

function toState(raw: unknown): GameState | null {
  return raw === "pre" || raw === "in" || raw === "post" ? raw : null;
}

/** Pure parse of an ESPN scoreboard payload. Exported for tests. */
export function parseScoreboard(payload: unknown): Map<string, TeamGame> {
  const out = new Map<string, TeamGame>();
  const events = (payload as { events?: unknown[] } | null)?.events;
  if (!Array.isArray(events)) return out;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    try {
      const e = ev as {
        date?: string;
        status?: { type?: { state?: string } };
        competitions?: Array<{ date?: string; competitors?: Array<{ team?: { abbreviation?: string } }> }>;
      };
      const comp = e.competitions?.[0];
      const kickoff = comp?.date ?? e.date;
      const state = toState(e.status?.type?.state);
      if (!kickoff || !state || Number.isNaN(Date.parse(kickoff))) continue;
      for (const c of comp?.competitors ?? []) {
        const abbr = c.team?.abbreviation?.toUpperCase();
        if (!abbr) continue;
        out.set(ESPN_TO_SLEEPER[abbr] ?? abbr, { kickoff: new Date(kickoff).toISOString(), state });
      }
    } catch (err) {
      console.error("[nfl:schedule:event]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
    }
  }
  return out;
}

/** Games for a regular-season week. Empty map on any failure. */
export async function getWeekGames(season: string, week: number): Promise<Map<string, TeamGame>> {
  const q = new URLSearchParams({ seasontype: "2", week: String(week), dates: season });
  try {
    const res = await fetch(`${ESPN_SCOREBOARD}?${q.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      console.error("[nfl:schedule]", res.status);
      return new Map();
    }
    return parseScoreboard(await res.json());
  } catch (err) {
    console.error("[nfl:schedule]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
    return new Map();
  }
}
