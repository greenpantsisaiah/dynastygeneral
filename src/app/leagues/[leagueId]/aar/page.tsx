import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
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
import { readProfileServer } from "@/lib/soundboard/storage";
import { getSeasonStats } from "@/lib/players/season-stats";
import {
  getProjections,
  pickAdpFromVariants,
} from "@/lib/players/projections";
import { resolvePlayers } from "@/lib/players/cache";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AarReport } from "@/components/league/aar-report";
import type { AarPick, AarServerData } from "@/components/league/aar-report";

export const metadata: Metadata = {
  title: "After-Action Report",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string }>;
};

export default async function AarPage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const { username = "" } = await searchParams;

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
        <Footer />
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
        <Footer />
      </>
    );
  }

  // Gather user picks + ADP/KTC for each.
  const myPicks = snapshot.draft.picks_made
    .filter((p) => p.roster_id === me.roster_id)
    .sort((a, b) => a.pick_no - b.pick_no);
  const totalTeams = snapshot.rosters.length;

  const playerIds = myPicks.map((p) => p.player_id);
  const playerMap = await resolvePlayers(playerIds);

  const isSuperflex =
    snapshot.format === "superflex" || snapshot.format === "2qb";
  const isPpr = snapshot.scoring.includes("PPR");
  const isHalfPpr = snapshot.scoring.includes("half-PPR");
  const isTePremium = snapshot.scoring.includes("TE-premium");

  const aarPicks: AarPick[] = myPicks.map((p) => {
    const player = playerMap.get(p.player_id);
    const adpEntry = projectionsCache.byPlayerId.get(p.player_id);
    const adpResult = pickAdpFromVariants(adpEntry, {
      isSuperflex,
      isPpr,
      isHalfPpr,
      isTePremium,
      isRookie: player?.years_exp === 0,
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
      adp_delta: adpResult.value != null ? adpResult.value - p.pick_no : null,
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

  const horizonRaw = judgmentProfile?.dials.horizon;
  const declaredHorizon = typeof horizonRaw === "number" ? horizonRaw : 0;

  const serverData: AarServerData = {
    leagueId,
    leagueName: league.name,
    ownerName: me.owner_name ?? sleeperUser?.display_name ?? "you",
    totalTeams,
    picks: aarPicks,
    starter_avg_age: me.starter_avg_age,
    starter_talent_score: me.starter_talent_score,
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
    declared_horizon: declaredHorizon,
    build_label: briefing?.trajectory.build_label ?? "Pre-Draft",
    build_composition: briefing?.trajectory.composition ?? {
      winNow: 0,
      balanced: 0,
      future: 0,
    },
    is_superflex: isSuperflex,
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
            <AarReport data={serverData} />
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
      <Footer />
    </>
  );
}
