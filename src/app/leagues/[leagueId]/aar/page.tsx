import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getUserByUsername,
} from "@/lib/sleeper";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import { buildLeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { computeWindows } from "@/lib/strategy/windows/compute";
import { computeLeagueOutlook } from "@/lib/strategy/league-outlook/compute";
import { buildLeagueBriefing } from "@/lib/engine/briefing";
import { readProfileServer } from "@/lib/lab/profile-storage";
import { deriveDoctrine, formatDoctrineLine } from "@/lib/lab/doctrine";
import { getSeasonStats } from "@/lib/players/season-stats";
import {
  getProjections,
  pickAdpFromVariants,
} from "@/lib/players/projections";
import { resolvePlayers, __dumpAllPlayers, humanize } from "@/lib/players/cache";
import { scoringValueByIds } from "@/lib/players/value-mode";
import {
  aggregateRosterIdentity,
  identityMoves,
  type IdentityMove,
  type LaneMembership,
  type PlayerMeta as LanePlayerMeta,
} from "@/lib/strategy/lane-identity";
import { buildOpponentTradeHistory } from "@/lib/strategy/opponents/trade-history";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AarReport } from "@/components/league/aar-report";
import type {
  AarPick,
  AarServerData,
  LeagueDossierEntry,
  LeagueMoment,
} from "@/components/league/aar-report";

export const metadata: Metadata = {
  title: "After-Action Report",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string; diagnose?: string }>;
};

export default async function AarPage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const { username = "", diagnose: diagnoseParam } = await searchParams;
  const diagnose = diagnoseParam === "1";

  // Resolve user identity. Falls through to saved sleeper username
  // for signed-in users; same pattern as the league hub.
  let resolvedUsername = username.trim().replace(/^@/, "");
  let savedSleeperUsername: string | null = null;
  try {
    const authUser = await getOptionalUser();
    if (authUser) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("profiles")
        .select("sleeper_username")
        .eq("user_id", authUser.id)
        .maybeSingle();
      savedSleeperUsername =
        (data?.sleeper_username as string | null) ?? null;
      if (!resolvedUsername && savedSleeperUsername) {
        resolvedUsername = savedSleeperUsername;
      }
    }
  } catch {
    // Auth failure is non-fatal; AAR can still render with URL username.
  }
  const sleeperUser = resolvedUsername
    ? await getUserByUsername(resolvedUsername).catch(() => null)
    : null;

  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  if (!league) notFound();

  const draftState = await resolveDraftState(
    leagueId,
    sleeperUser?.user_id ?? null,
  );

  // AAR is gated on draft completion. Pre-draft / mid-draft show an
  // anticipation view that previews what's coming and shows draft
  // progress, so the URL is meaningful before the draft ends rather
  // than a dead-end "not yet."
  if (!draftState || draftState.status !== "complete") {
    const totalPicks =
      draftState && draftState.total_teams > 0 && draftState.rounds > 0
        ? draftState.total_teams * draftState.rounds
        : null;
    const picksMade = draftState?.picks_so_far?.length ?? 0;
    const progressPct =
      totalPicks && totalPicks > 0
        ? Math.min(100, Math.round((picksMade / totalPicks) * 100))
        : 0;
    const isPreDraft = !draftState || draftState.status === "pre_draft";
    return (
      <>
        <SiteNav />
        <main className="flex-1 bg-background">
          <section className="border-b border-border-soft">
            <div className="mx-auto max-w-3xl px-6 py-16">
              <Ticker label={`After-Action Report · ${league.name}`} />
              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Your After-Action Report is being prepped.
              </h1>
              <p className="mt-3 max-w-prose text-muted">
                The full breakdown unlocks the moment your draft is
                marked complete on Sleeper. Until then, the league
                hub is your live workbench. This page is your
                bookmark for what's coming.
              </p>

              {!isPreDraft && totalPicks && (
                <div className="mt-8 rounded-lg border border-border-soft bg-surface px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                      Draft progress
                    </div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
                      {picksMade} of {totalPicks} picks · {progressPct}%
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {progressPct >= 75 && (
                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-success">
                      Final stretch. Report unlocks soon.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-10">
                <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                  What's coming
                </div>
                <ul className="mt-3 space-y-2 text-sm text-foreground">
                  <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
                    <span className="font-semibold">The verdict.</span>{" "}
                    A relative grade across your league with a tagline
                    naming what kind of team you actually built.
                  </li>
                  <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
                    <span className="font-semibold">
                      Best picks of your draft.
                    </span>{" "}
                    Three calls where you crushed the value the market
                    left on the board.
                  </li>
                  <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
                    <span className="font-semibold">
                      Picks to make pay off.
                    </span>{" "}
                    Three reaches with the trade-window plan to convert
                    them into floor.
                  </li>
                  <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
                    <span className="font-semibold">Pattern read.</span>{" "}
                    The shape of your team. Doctrine vs behavior.
                    Win-now and future ranks vs the league.
                  </li>
                  <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
                    <span className="font-semibold">
                      90-day playbook.
                    </span>{" "}
                    Trade-window strategy from now through week 1, with
                    specific timeline blocks (May rookie sells, June
                    dead zone, July-August camp moves).
                  </li>
                  <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
                    <span className="font-semibold">Full journey.</span>{" "}
                    Every pick you made, tagged against ADP and the
                    engine's standing call at that moment.
                  </li>
                </ul>
              </div>

              <div className="mt-10 rounded-md border border-accent/40 bg-accent/5 px-5 py-4 text-sm">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                  Notify me when the draft ends
                </div>
                <p className="mt-2 text-foreground">
                  Email alerts on draft-complete are coming. The moment
                  your draft is marked complete, you'll get a one-line
                  email with the link to your full report. Until that
                  ships, bookmark this page or check back when you take
                  your last pick.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-muted-2">
                <Link
                  href={`/leagues/${leagueId}`}
                  className="hover:text-accent"
                >
                  ← Back to league hub
                </Link>
                <Link
                  href={`/leagues/${leagueId}/coach`}
                  className="hover:text-accent"
                >
                  Open coach chat →
                </Link>
              </div>
            </div>
          </section>
        </main>
      </>
    );
  }

  // Build snapshot + outlook + doctrine. Same pattern as the hub but
  // distilled to what the AAR needs.
  const prevSeason = String(Number(league.season) - 1);
  const [lastSeasonStats, projectionsCache] = await Promise.all([
    getSeasonStats(prevSeason).catch(() => new Map()),
    getProjections(league.season).catch(() => ({
      byPlayerId: new Map(),
      fetchedAt: 0,
    })),
  ]);

  const snapshot = await buildLeagueSnapshot({
    league,
    rosters,
    users,
    draftState,
    mySleeperUserId: sleeperUser?.user_id ?? null,
    lastSeasonStats,
    projections: projectionsCache.byPlayerId,
  });
  const windows = computeWindows(snapshot);
  const outlook = await computeLeagueOutlook(snapshot);
  const judgmentProfile = await readProfileServer().catch(() => null);
  const briefing = buildLeagueBriefing(snapshot, judgmentProfile);

  const me = snapshot.rosters.find((r) => r.is_me);
  if (!me) {
    // Diagnostic detail surfaces what we know to help the user
    // self-recover. The hub usually carries ?username= forward; if
    // we got here without it AND no saved username is on file, the
    // input below lets them recover in one step.
    const ownerOptions = snapshot.rosters
      .filter((r) => r.owner_name != null)
      .map((r) => r.owner_name as string);
    return (
      <>
        <SiteNav />
        <main className="flex-1 bg-background">
          <section className="border-b border-border-soft">
            <div className="mx-auto max-w-3xl px-6 py-16">
              <Ticker label={`After-Action Report · ${league.name}`} />
              <h1 className="mt-6 text-2xl font-semibold text-foreground">
                We could not identify your roster in this league.
              </h1>
              <p className="mt-3 text-muted">
                The AAR needs to know which roster is yours. Two ways
                to fix this in 10 seconds:
              </p>
              <ol className="mt-4 space-y-2 text-sm text-foreground">
                <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
                  <span className="font-semibold">Add your Sleeper handle to the URL.</span>{" "}
                  Append <code className="rounded bg-surface-2 px-1 font-mono text-[11px]">?username=YOUR_SLEEPER_HANDLE</code>{" "}
                  to this page&rsquo;s URL and reload. That tells the
                  report which manager you are.
                </li>
                <li className="rounded-md border border-border-soft bg-surface px-4 py-3">
                  <span className="font-semibold">Save your handle on your account.</span>{" "}
                  Set it once at{" "}
                  <Link
                    href="/account"
                    className="text-accent hover:underline"
                  >
                    /account
                  </Link>
                  ; the AAR will pick it up automatically next time.
                </li>
              </ol>
              {ownerOptions.length > 0 && (
                <div className="mt-6 rounded-md border border-border-soft bg-surface px-4 py-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                    Managers in this league
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {ownerOptions.map((name) => (
                      <span
                        key={name}
                        className="rounded-sm border border-border-soft bg-surface-2 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-2">
                    Use the Sleeper handle that matches one of these.
                  </p>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/leagues/${leagueId}${
                    resolvedUsername
                      ? `?username=${encodeURIComponent(resolvedUsername)}`
                      : ""
                  }`}
                  className="rounded-md border border-accent/60 bg-accent/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-accent hover:bg-accent/25"
                >
                  Back to league hub →
                </Link>
                <Link
                  href="/account"
                  className="rounded-md border border-border-soft bg-surface px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
                >
                  Account settings →
                </Link>
              </div>
            </div>
          </section>
        </main>
      </>
    );
  }

  // Gather user picks + ADP/KTC for each.
  const myPicks = snapshot.draft.picks_made
    .filter((p) => p.roster_id === me.roster_id)
    .sort((a, b) => a.pick_no - b.pick_no);
  const totalTeams = snapshot.rosters.length;

  // Resolve ALL drafted players (not just the user's) so the
  // league-wide notable-moments section can name every steal and
  // reach across the league. One batch call.
  const allPlayerIds = snapshot.draft.picks_made.map((p) => p.player_id);
  const playerMap = await resolvePlayers(allPlayerIds);

  const isSuperflex =
    snapshot.format === "superflex" || snapshot.format === "2qb";
  const isPpr = snapshot.scoring.includes("PPR");
  const isHalfPpr = snapshot.scoring.includes("half-PPR");
  const isTePremium = snapshot.scoring.includes("TE-premium");

  const aarPicks: AarPick[] = myPicks.map((p) => {
    const player = playerMap.get(p.player_id);
    const adpEntry = projectionsCache.byPlayerId.get(p.player_id);
    // For AAR grading we always want startup-scale ADP (dynasty
    // variants run 1-300 across a 25-round draft) so adp_delta is
    // comparable to pick_no. Bug 2026-04-30: passing isRookie=true
    // pulled adp_rookie which is on a 1-50 scale (rookie-only
    // drafts are 4 rounds). That made every late-round rookie pick
    // log as a massive "reach" of -150+ that wasn't real, tanking
    // the pick_value grade component.
    const adpResult = pickAdpFromVariants(adpEntry, {
      isSuperflex,
      isPpr,
      isHalfPpr,
      isTePremium,
      isRookie: false,
      position: player?.position ?? null,
    });
    const round = Math.ceil(p.pick_no / totalTeams);
    const within = ((p.pick_no - 1) % totalTeams) + 1;
    const combined = [player?.first_name, player?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const playerName = player?.full_name ?? (combined || p.player_id);
    return {
      pick_no: p.pick_no,
      pick_label: `${round}.${within}`,
      round,
      player_id: p.player_id,
      player_name: playerName,
      position: player?.position ?? null,
      team: player?.team ?? null,
      age: player?.age ?? null,
      is_rookie: player?.years_exp === 0,
      adp: adpResult.value,
      // adp_delta uses (pick - adp) so the sign is intuitive:
      //   positive = pick number is LATER than ADP = player fell past
      //   consensus = VALUE pick
      //   negative = pick number is EARLIER than ADP = REACH
      // Bug 2026-04-30: original had (adp - pick) which inverted the
      // sign. The sigmoid pickValue formula and the top/whiff sort
      // logic both expected the natural sign convention; the
      // commentary copy ("fell N picks past consensus") implies the
      // natural convention too. Flipping here propagates the fix
      // cleanly through all consumers.
      adp_delta: adpResult.value != null ? p.pick_no - adpResult.value : null,
    };
  });

  // League-wide ranks for the relative-grade computation. Higher
  // win_now rank = better win-now team. Same for future.
  const teamsByWinNow = [...outlook.teams].sort(
    (a, b) => b.win_now - a.win_now,
  );
  const myWinNowRank =
    teamsByWinNow.findIndex((t) => t.roster_id === me.roster_id) + 1;
  const teamsByFuture = [...outlook.teams].sort(
    (a, b) => b.future - a.future,
  );
  const myFutureRank =
    teamsByFuture.findIndex((t) => t.roster_id === me.roster_id) + 1;

  // League-wide notable moments: biggest steals (player fell furthest
  // past ADP) and biggest swings (taken furthest before ADP) across
  // all 12 managers. Adds emotional payoff: user spots their own
  // name (or a friend's) in the highlights, has content to share
  // with the league.
  const ownerByRosterId = new Map(
    snapshot.rosters.map((r) => [r.roster_id, r]),
  );
  const allMoments: LeagueMoment[] = [];
  for (const pick of snapshot.draft.picks_made) {
    const player = playerMap.get(pick.player_id);
    if (!player) continue;
    const adpEntry = projectionsCache.byPlayerId.get(pick.player_id);
    const adpResult = pickAdpFromVariants(adpEntry, {
      isSuperflex,
      isPpr,
      isHalfPpr,
      isTePremium,
      isRookie: false,
      position: player.position ?? null,
    });
    if (adpResult.value == null) continue;
    const round = Math.ceil(pick.pick_no / totalTeams);
    const within = ((pick.pick_no - 1) % totalTeams) + 1;
    const roster = ownerByRosterId.get(pick.roster_id);
    const playerCombined = [player.first_name, player.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const playerName =
      player.full_name ?? (playerCombined || pick.player_id);
    allMoments.push({
      pick_no: pick.pick_no,
      pick_label: `${round}.${within}`,
      player_name: playerName,
      position: player.position ?? null,
      team: player.team ?? null,
      manager_name: roster?.owner_name ?? null,
      is_me: roster?.is_me ?? false,
      adp: adpResult.value,
      adp_delta: pick.pick_no - adpResult.value,
    });
  }
  // Top 3 steals (biggest positive delta = fell furthest past ADP).
  // Threshold: only count moments with delta >= 15 picks; smaller
  // values are noise from ADP variance, not narrative-worthy.
  const steals = [...allMoments]
    .filter((m) => m.adp_delta >= 15)
    .sort((a, b) => b.adp_delta - a.adp_delta)
    .slice(0, 3);
  // Top 3 swings (biggest negative delta = reached furthest before ADP).
  const swings = [...allMoments]
    .filter((m) => m.adp_delta <= -15)
    .sort((a, b) => a.adp_delta - b.adp_delta)
    .slice(0, 3);

  // Lane identity + moves for the AAR. Mirrors the hub's compute so
  // the post-draft view reads the roster shape in the same vocabulary.
  let aarLaneMemberships: LaneMembership[] = [];
  let aarLaneMoves: IdentityMove[] = [];
  try {
    const valueIds: string[] = [];
    for (const r of snapshot.rosters) {
      for (const id of r.player_ids) valueIds.push(id);
    }
    // Lane identity reads value through the ONE value seam (market in shadow,
    // rubric on flip) so the after-action lane membership reflects the same
    // model the board ranks on. `lane_identity`/`comparators` consume a
    // `Map<id, {value}>`, so wrap the seam's `valueById` scalar.
    const { valueById, valueMap: marketMap } = await scoringValueByIds({
      ids: valueIds,
      isSuperflex,
      isPpr,
      isHalfPpr,
      isTePremium,
    });
    // lane-identity wants { value, overall_rank }: the scoring value through
    // the seam, the market rank from the same fetch.
    const valueMap = new Map<string, { value: number; overall_rank: number | null }>(
      Object.entries(valueById).map(([id, value]) => [
        id,
        { value, overall_rank: marketMap.get(id)?.overall_rank ?? null },
      ]),
    );
    const allPlayers = await __dumpAllPlayers();
    const playerMetaById = new Map<string, LanePlayerMeta>();
    for (const p of allPlayers) {
      const h = humanize(p);
      playerMetaById.set(p.player_id, {
        name: h.name,
        position: h.position,
        team: h.team,
        age: h.age,
        years_exp: h.yearsExp,
        is_rookie: p.years_exp === 0,
        search_rank: p.search_rank ?? 9999,
      });
    }
    const lookup = (id: string) => playerMetaById.get(id) ?? null;
    aarLaneMemberships = aggregateRosterIdentity({
      playerIds: me.player_ids,
      playerLookup: lookup,
      playerValueMap: valueMap,
      snap: snapshot,
    });
    aarLaneMoves = identityMoves({
      memberships: aarLaneMemberships,
      myRosterId: me.roster_id,
      rosters: snapshot.rosters.map((r) => ({
        roster_id: r.roster_id,
        owner_name: r.owner_name,
        player_ids: r.player_ids,
        is_me: r.is_me,
      })),
      playerLookup: lookup,
      playerValueMap: valueMap,
      snap: snapshot,
    });
  } catch (err) {
    console.error("[aar:lane-identity]", err);
  }

  // Per-opponent dossier for the AAR's league-intel block. Same primitives
  // the hub's OpponentCharacterizations uses (outlook scores + trade
  // signature + last 3 picks), recomposed into one card per team so the
  // user has a 90-day trade-planning surface after the draft.
  const teamScoreByRoster = new Map<
    number,
    { win_now: number; future: number }
  >();
  for (const t of outlook.teams) {
    teamScoreByRoster.set(t.roster_id, {
      win_now: t.win_now,
      future: t.future,
    });
  }
  const leagueDossier: LeagueDossierEntry[] = snapshot.rosters
    .map<LeagueDossierEntry>((r) => {
      const scores = teamScoreByRoster.get(r.roster_id);
      const picks = snapshot.draft.picks_made.filter(
        (p) => p.roster_id === r.roster_id,
      );
      const picksCount = picks.length;
      const recent = [...picks]
        .sort((a, b) => b.pick_no - a.pick_no)
        .slice(0, 3)
        .map((p) => {
          const player = playerMap.get(p.player_id);
          const combined = [player?.first_name, player?.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();
          const playerName =
            player?.full_name ?? (combined || p.player_id);
          const round = Math.ceil(p.pick_no / totalTeams);
          const within = ((p.pick_no - 1) % totalTeams) + 1;
          return {
            pick_label: `${round}.${within}`,
            player_name: playerName,
            position: player?.position ?? null,
          };
        });
      const tradeHist = buildOpponentTradeHistory({
        rosterId: r.roster_id,
        tradedPicks: snapshot.draft.traded_picks,
        currentSeason: snapshot.season,
      });
      return {
        roster_id: r.roster_id,
        owner_name: r.owner_name ?? null,
        is_me: r.is_me ?? false,
        picks_count: picksCount,
        win_now_score: scores?.win_now ?? 0,
        future_score: scores?.future ?? 0,
        trade_signature: tradeHist.signature,
        trade_summary: tradeHist.summary,
        picks_sent: tradeHist.picks_sent,
        picks_received: tradeHist.picks_received,
        recent_picks: recent,
      };
    })
    .sort((a, b) => {
      // User's own card first; then by win-now descending so the room
      // reads "I'm here, here's who's ahead of me on win-now."
      if (a.is_me && !b.is_me) return -1;
      if (!a.is_me && b.is_me) return 1;
      return b.win_now_score - a.win_now_score;
    });

  const serverData: AarServerData = {
    leagueId,
    leagueName: league.name,
    ownerName: me.owner_name ?? sleeperUser?.display_name ?? "you",
    totalTeams,
    picks: aarPicks,
    starter_avg_age: me.starter_avg_age,
    win_now_rank: myWinNowRank,
    future_rank: myFutureRank,
    win_now_score: windows.win_now.score,
    future_score: windows.future_value.score,
    league_mean_win_now:
      outlook.teams.reduce((s, t) => s + t.win_now, 0) /
      Math.max(1, outlook.teams.length),
    league_mean_future:
      outlook.teams.reduce((s, t) => s + t.future, 0) /
      Math.max(1, outlook.teams.length),
    build_label: briefing?.trajectory.build_label ?? "Pre-Draft",
    build_composition: briefing?.trajectory.composition ?? {
      winNow: 0,
      balanced: 0,
      future: 0,
    },
    league_steals: steals,
    league_swings: swings,
    lane_memberships: aarLaneMemberships,
    lane_moves: aarLaneMoves,
    league_dossier: leagueDossier,
    doctrine_line: judgmentProfile
      ? formatDoctrineLine(deriveDoctrine(judgmentProfile.dials))
      : null,
  };

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-4xl px-6 py-12">
            <Ticker
              label={`After-Action Report · ${league.name} · ${league.season}`}
            />
            <AarReport data={serverData} diagnose={diagnose} />
            <div className="mt-12 flex flex-wrap items-center gap-4 text-xs text-muted-2">
              <Link
                href={`/leagues/${leagueId}`}
                className="hover:text-accent"
              >
                ← League hub
              </Link>
              <Link
                href={`/leagues/${leagueId}/coach`}
                className="hover:text-accent"
              >
                Open coach chat →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
