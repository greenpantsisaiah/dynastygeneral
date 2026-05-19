import { z } from "zod";
import {
  nflStateSchema,
  sleeperBracketEntrySchema,
  sleeperDraftPickSchema,
  sleeperDraftSchema,
  sleeperLeagueSchema,
  sleeperLeagueUserSchema,
  sleeperMatchupSchema,
  sleeperRosterSchema,
  sleeperTradedPickSchema,
  sleeperTransactionSchema,
  sleeperUserSchema,
  type NflState,
  type SleeperBracketEntry,
  type SleeperDraft,
  type SleeperDraftPick,
  type SleeperLeague,
  type SleeperLeagueUser,
  type SleeperMatchup,
  type SleeperRoster,
  type SleeperTradedPick,
  type SleeperTransaction,
  type SleeperUser,
} from "./schemas";

const BASE = "https://api.sleeper.app/v1";

type FetchOptions = {
  revalidate?: number;
  /**
   * When true, bypass Next.js fetch cache entirely. Required for live-
   * draft endpoints where 30-60s of staleness can produce 10+ picks of
   * lag during rapid runs (autopick bursts, multiple users picking at
   * once). The cache hides Sleeper's actual freshness from the page.
   */
  noStore?: boolean;
  signal?: AbortSignal;
};

// Default outbound timeout. Sleeper occasionally hangs; without this a
// stuck connection ties up the Vercel function until maxDuration. Per
// SECURITY.md "Standards · External-data routes" the project default is
// 15 seconds. Callers can override by passing their own AbortSignal.
const DEFAULT_TIMEOUT_MS = 15_000;

async function sleeperGet<T>(
  path: string,
  schema: z.ZodType<T>,
  options: FetchOptions = {},
): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      signal: options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      ...(options.noStore
        ? { cache: "no-store" as const }
        : { next: { revalidate: options.revalidate ?? 300 } }),
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    // Treat aborts (timeouts) like a 404 / null result so callers don't
    // crash the request. Real outages should be observable in logs.
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[sleeper] ${path} timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      return null;
    }
    throw err;
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Sleeper ${path} failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  if (!text || text === "null") return null;

  const json = JSON.parse(text);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Sleeper ${path} response did not match schema: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export async function getNflState(): Promise<NflState | null> {
  return sleeperGet("/state/nfl", nflStateSchema, { revalidate: 600 });
}

export async function getUserByUsername(
  username: string,
): Promise<SleeperUser | null> {
  const clean = username.trim().replace(/^@/, "");
  if (!clean) return null;
  return sleeperGet(
    `/user/${encodeURIComponent(clean)}`,
    sleeperUserSchema,
    { revalidate: 300 },
  );
}

export async function getLeaguesForUser(
  userId: string,
  season: string,
): Promise<SleeperLeague[]> {
  const data = await sleeperGet(
    `/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`,
    z.array(sleeperLeagueSchema),
    { revalidate: 120 },
  );
  return data ?? [];
}

export async function getLeague(
  leagueId: string,
): Promise<SleeperLeague | null> {
  return sleeperGet(
    `/league/${encodeURIComponent(leagueId)}`,
    sleeperLeagueSchema,
    { revalidate: 300 },
  );
}

export async function getRosters(leagueId: string): Promise<SleeperRoster[]> {
  // Rosters update with each pick during a draft (player_ids, position
  // counts). Stale rosters mean the user's "is_me" position counts lag
  // their actual picks. Always fresh.
  const data = await sleeperGet(
    `/league/${encodeURIComponent(leagueId)}/rosters`,
    z.array(sleeperRosterSchema),
    { noStore: true },
  );
  return data ?? [];
}

export async function getLeagueUsers(
  leagueId: string,
): Promise<SleeperLeagueUser[]> {
  const data = await sleeperGet(
    `/league/${encodeURIComponent(leagueId)}/users`,
    z.array(sleeperLeagueUserSchema),
    { revalidate: 300 },
  );
  return data ?? [];
}

export async function getMatchups(
  leagueId: string,
  week: number,
): Promise<SleeperMatchup[]> {
  const data = await sleeperGet(
    `/league/${encodeURIComponent(leagueId)}/matchups/${week}`,
    z.array(sleeperMatchupSchema),
    { revalidate: 60 },
  );
  return data ?? [];
}

export async function getTransactions(
  leagueId: string,
  week: number,
): Promise<SleeperTransaction[]> {
  const data = await sleeperGet(
    `/league/${encodeURIComponent(leagueId)}/transactions/${week}`,
    z.array(sleeperTransactionSchema),
    { revalidate: 60 },
  );
  return data ?? [];
}

export async function getTradedPicks(
  leagueId: string,
): Promise<SleeperTradedPick[]> {
  // Always fresh. Pick trades fire rapidly during active drafts (10-20
  // trades in the first three rounds of a typical dynasty startup);
  // a 5-minute revalidate was leaving users seeing stale pick
  // ownership after their own trades. Mirrors the same noStore pattern
  // getRosters uses for the same reason. Founder report 2026-05-19:
  // "after my trades, when I was refreshing the page a few minutes
  // later it didn't seem to know I even had the picks." The 5-min
  // cache matched the symptom exactly.
  const data = await sleeperGet(
    `/league/${encodeURIComponent(leagueId)}/traded_picks`,
    z.array(sleeperTradedPickSchema),
    { noStore: true },
  );
  return data ?? [];
}

/**
 * Fetches a league's playoff (winners) bracket. The championship is
 * the entry with the largest round number `r` and `p === 1`; its
 * winner roster_id sits in `w`. Returns null when the league has no
 * recorded playoff bracket yet (current season pre-playoffs, or
 * Sleeper just doesn't have it).
 *
 * Cached 1 hour; historical playoff brackets do not change.
 */
export async function getWinnersBracket(
  leagueId: string,
): Promise<SleeperBracketEntry[]> {
  const data = await sleeperGet(
    `/league/${encodeURIComponent(leagueId)}/winners_bracket`,
    z.array(sleeperBracketEntrySchema),
    { revalidate: 3600 },
  );
  return data ?? [];
}

export async function getLeagueDrafts(
  leagueId: string,
): Promise<SleeperDraft[]> {
  const data = await sleeperGet(
    `/league/${encodeURIComponent(leagueId)}/drafts`,
    z.array(sleeperDraftSchema),
    { revalidate: 300 },
  );
  return data ?? [];
}

export async function getDraft(draftId: string): Promise<SleeperDraft | null> {
  // Draft status flips between drafting/paused/complete during live use.
  // Always fetch fresh; cached "drafting" can persist past completion.
  return sleeperGet(
    `/draft/${encodeURIComponent(draftId)}`,
    sleeperDraftSchema,
    { noStore: true },
  );
}

export async function getDraftPicks(
  draftId: string,
): Promise<SleeperDraftPick[]> {
  // Live-draft critical path. Caching here causes the "13 picks away"
  // bug where the snapshot lags reality by half a round.
  //
  // Per-row parse instead of array-level safeParse. One non-conforming
  // row used to throw the whole array, propagate out of resolveDraftState,
  // get caught silently in the page route, and empty every downstream
  // hub panel (the 2026-04-24 Iceman outage). We now drop bad rows,
  // log a small number of warnings, and let the rest of the picks
  // build the snapshot. The schema is also relaxed (round/pick_no
  // nullable), so this loop is the second line of defense.
  const path = `/draft/${encodeURIComponent(draftId)}/picks`;
  const data = await sleeperGet(path, z.array(z.unknown()), {
    noStore: true,
  });
  if (!data) return [];
  const out: SleeperDraftPick[] = [];
  let bad = 0;
  let warned = 0;
  for (const raw of data) {
    const r = sleeperDraftPickSchema.safeParse(raw);
    if (r.success) {
      out.push(r.data);
    } else {
      bad++;
      if (warned < 3) {
        warned++;
        console.warn(
          `[draft-picks:skip] ${path}: ${r.error.issues[0]?.message ?? "unknown"}`,
        );
      }
    }
  }
  if (bad > 0) {
    console.warn(
      `[draft-picks] skipped ${bad} non-conforming row(s) of ${out.length + bad} total`,
    );
  }
  return out;
}

/**
 * Sleeper exposes settings.type as: 0=redraft, 1=keeper, 2=dynasty.
 * Dynasty chains also carry previous_league_id across seasons.
 */
export function isDynastyLeague(league: SleeperLeague): boolean {
  return league.settings?.type === 2;
}
