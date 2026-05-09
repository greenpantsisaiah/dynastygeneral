/**
 * /leagues/[id]/team
 *
 * Team-focused activity surface. Per the redesign architecture: the
 * hub became a triage page; this route is the focused home for
 * "your team" content. Per founder feedback 2026-05-08: Windows
 * belongs near the EV bank; full league EV bank with confidence
 * bands lives here; Team Identity + comparator + risk fingerprint
 * are the body.
 *
 * This route mirrors only the data pipeline it needs (snapshot +
 * value map + ages + ranked archetypes + inflections + windows +
 * draft progress + team identity + league EV bank). Decision
 * synthesis, briefings, and trade-related computation are skipped;
 * those belong on /pick or /trade.
 *
 * The data pipeline is somewhat duplicated with the hub's. A
 * `resolveLeagueRender` helper extraction is queued for a follow-up
 * once the route shape stabilizes.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SiteNav } from "@/components/site-nav";
import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getUserByUsername,
  isDynastyLeague,
} from "@/lib/sleeper";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import { buildLeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import { computeWindows } from "@/lib/strategy/windows/compute";
import {
  resolvePlayerValues,
} from "@/lib/players/values";
import { resolvePlayers, humanize } from "@/lib/players/cache";
import { getProjections, pickAdpFromVariants } from "@/lib/players/projections";
import {
  analyzeTeamIdentity,
  type TeamIdentity,
} from "@/lib/strategy/team-identity";
import {
  buildInflectionsFromSnapshot,
  type InflectionContext,
} from "@/lib/engine/inflection";
import {
  analyzeDraftProgress,
  type DraftProgress,
} from "@/lib/strategy/draft-progress";
import {
  analyzeLeagueEvBank,
  type LeagueEvBankReadout,
} from "@/lib/strategy/ev-bank";
import { getAvailableForRequest } from "@/lib/strategy/player-suggestions/enrich";
import { TeamIdentityPanel } from "@/components/league/team-identity-panel";
import { DraftProgressPanel } from "@/components/league/draft-progress-panel";
import { WindowsBar } from "@/components/league/windows-bar";
import { InflectionPanel } from "@/components/league/inflection-panel";
import { LeagueEvBankLeaderboard } from "@/components/league/team/league-ev-bank-leaderboard";

export const metadata: Metadata = {
  title: "Your Team",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string }>;
};

export default async function TeamPage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const { username = "" } = await searchParams;
  const cleaned = username.trim().replace(/^@/, "");

  const back = `/leagues/${leagueId}${
    cleaned ? `?username=${encodeURIComponent(cleaned)}` : ""
  }`;

  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  if (!league) notFound();
  if (!isDynastyLeague(league)) {
    redirect(back);
  }

  const sleeperUser = cleaned ? await getUserByUsername(cleaned) : null;

  const draftState = await resolveDraftState(
    leagueId,
    sleeperUser?.user_id ?? null,
  );
  const snapshot = await buildLeagueSnapshot({
    league,
    rosters,
    users,
    draftState,
    mySleeperUserId: sleeperUser?.user_id ?? null,
  });
  const ranked = rankArchetypes(snapshot);
  const windows = computeWindows(snapshot);

  // Resolve all rostered players for ages + names + value lookups.
  const allRosterIds = new Set<string>();
  for (const r of snapshot.rosters) {
    for (const id of r.player_ids ?? []) allRosterIds.add(id);
  }
  for (const p of snapshot.draft.picks_made) {
    if (p.player_id) allRosterIds.add(p.player_id);
  }
  const playersMap = await resolvePlayers([...allRosterIds]);

  // Resolve FantasyCalc-anchored values across the rostered + drafted
  // pool. Mirrors the hub's resolution.
  const lrValueMap = new Map<
    string,
    { value: number; overall_rank: number | null }
  >();
  try {
    const resolvedValues = await resolvePlayerValues({
      ids: [...allRosterIds],
      isSuperflex:
        snapshot.format === "superflex" || snapshot.format === "2qb",
      isPpr: snapshot.scoring.includes("PPR"),
      isHalfPpr: snapshot.scoring.includes("half-PPR"),
      isTePremium: snapshot.scoring.includes("TE-premium"),
    });
    for (const [id, v] of resolvedValues.entries()) {
      lrValueMap.set(id, {
        value: v.value,
        overall_rank: v.overall_rank ?? null,
      });
    }
  } catch (err) {
    console.error("[team:values]", err);
  }

  const playerNameLookup = (id: string) => {
    const sp = playersMap.get(id);
    if (!sp) return null;
    const human = humanize(sp);
    return { name: human.name, position: human.position };
  };

  const playerAges = new Map<string, number | null>();
  for (const id of allRosterIds) {
    const sp = playersMap.get(id);
    playerAges.set(id, typeof sp?.age === "number" ? sp.age : null);
  }

  // Inflection contexts (player-relevant).
  let inflectionItems: InflectionContext[] = [];
  try {
    inflectionItems = buildInflectionsFromSnapshot({
      snap: snapshot,
      playersMap,
    });
  } catch (err) {
    console.error("[team:inflections]", err);
  }

  // Format-aware ADP lookup.
  const adpFmt = {
    isSuperflex:
      snapshot.format === "superflex" || snapshot.format === "2qb",
    isPpr: snapshot.scoring.includes("PPR"),
    isHalfPpr: snapshot.scoring.includes("half-PPR"),
    isTePremium: snapshot.scoring.includes("TE-premium"),
    isRookie: false,
  };
  let projectionsForAdp:
    | Awaited<ReturnType<typeof getProjections>>
    | null = null;
  try {
    projectionsForAdp = await getProjections(snapshot.season);
  } catch (err) {
    console.error("[team:projections]", err);
  }
  const getAdp = (id: string): number | null => {
    const adpRaw = projectionsForAdp?.byPlayerId.get(id);
    if (!adpRaw) return null;
    const sp = playersMap.get(id);
    const isRookie = sp?.years_exp === 0;
    const { value } = pickAdpFromVariants(adpRaw, {
      ...adpFmt,
      isRookie,
      position: sp?.position ?? null,
    });
    return value;
  };

  // Available pool for thin-tier alerts on Draft Progress.
  let availablePlayers: Awaited<
    ReturnType<typeof getAvailableForRequest>
  > = [];
  try {
    availablePlayers = await getAvailableForRequest(snapshot);
  } catch (err) {
    console.error("[team:available]", err);
  }

  // Team Identity: the hero readout.
  let teamIdentity: TeamIdentity | null = null;
  try {
    teamIdentity = analyzeTeamIdentity({
      snap: snapshot,
      rankedArchetypes: ranked,
      inflections: inflectionItems,
      playerValueMap: lrValueMap,
      playerNameLookup,
      playerAges,
    });
  } catch (err) {
    console.error("[team:identity]", err);
  }

  // Draft Progress: position diagnostic + EV bank + sharp positioning.
  let draftProgress: DraftProgress | null = null;
  try {
    draftProgress = analyzeDraftProgress({
      snap: snapshot,
      playerValueMap: lrValueMap,
      playerNameLookup,
      getAdp,
      availablePool: availablePlayers,
    });
  } catch (err) {
    console.error("[team:draft-progress]", err);
  }

  // League EV bank leaderboard: the relative-position view per
  // founder feedback 2026-05-08.
  let leagueEvBank: LeagueEvBankReadout | null = null;
  try {
    leagueEvBank = analyzeLeagueEvBank({
      snap: snapshot,
      playerValueMap: lrValueMap,
      getAdp,
    });
  } catch (err) {
    console.error("[team:league-ev-bank]", err);
  }

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                Your team
              </div>
              <h1 className="mt-2 text-3xl font-semibold text-foreground">
                {league.name}
              </h1>
              {snapshot.rosters.find((r) => r.is_me)?.owner_name && (
                <p className="mt-1 text-sm text-muted">
                  {snapshot.rosters.find((r) => r.is_me)?.owner_name}
                </p>
              )}
            </div>
            <Link
              href={back}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
            >
              ← Hub
            </Link>
          </div>

          {teamIdentity && <TeamIdentityPanel data={teamIdentity} />}

          {draftProgress && <DraftProgressPanel data={draftProgress} />}

          {windows && sleeperUser && (
            <WindowsBar leagueId={leagueId} windows={windows} />
          )}

          {leagueEvBank && leagueEvBank.ranked_count > 0 && (
            <LeagueEvBankLeaderboard bank={leagueEvBank} />
          )}

          {inflectionItems.length > 0 && (
            <div className="mt-8">
              <InflectionPanel items={inflectionItems} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
