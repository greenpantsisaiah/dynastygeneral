import { z } from "zod";
import {
  nflStateSchema,
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

async function sleeperGet<T>(
  path: string,
  schema: z.ZodType<T>,
  options: FetchOptions = {},
): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    signal: options.signal,
    ...(options.noStore
      ? { cache: "no-store" as const }
      : { next: { revalidate: options.revalidate ?? 300 } }),
    headers: { Accept: "application/json" },
  });

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
  const data = await sleeperGet(
    `/league/${encodeURIComponent(leagueId)}/traded_picks`,
    z.array(sleeperTradedPickSchema),
    { revalidate: 300 },
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
  const data = await sleeperGet(
    `/draft/${encodeURIComponent(draftId)}/picks`,
    z.array(sleeperDraftPickSchema),
    { noStore: true },
  );
  return data ?? [];
}

/**
 * Sleeper exposes settings.type as: 0=redraft, 1=keeper, 2=dynasty.
 * Dynasty chains also carry previous_league_id across seasons.
 */
export function isDynastyLeague(league: SleeperLeague): boolean {
  return league.settings?.type === 2;
}
