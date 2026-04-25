import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "League Hub",
  robots: { index: false, follow: false },
};
import { cookies } from "next/headers";
import {
  declaredWindowCookieName,
  parseDeclaredWindowId,
} from "@/lib/strategy/declared-window";

// Live-draft app. Never cache the route segment: a cached SSR response
// can persist a half-round-stale snapshot for minutes, which makes the
// "picks until you" count and Draft Watch unreliable.
export const dynamic = "force-dynamic";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import {
  getLeague,
  getLeagueUsers,
  getLeaguesForUser,
  getNflState,
  getRosters,
  getUserByUsername,
  isDynastyLeague,
  type SleeperLeague,
} from "@/lib/sleeper";
import { resolveDraftState, type DraftStatus } from "@/lib/sleeper/draft-state";
import { buildLeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import { LiveStrategyBoard } from "@/components/league/live-strategy-board";
import { computeWindows, type WindowsResult } from "@/lib/strategy/windows/compute";
import { selectPlaysFromHere } from "@/lib/strategy/plays-from-here/select";
import { enrichPlaysFromHere } from "@/lib/strategy/plays-from-here/enrich";
import type { ResolvedPlayFromHere } from "@/lib/strategy/plays-from-here/types";
import { buildPickApproach } from "@/lib/strategy/pick-approach/predict";
import type { PickApproach as PickApproachData } from "@/lib/strategy/pick-approach/types";
import { synthesizeDecision } from "@/lib/strategy/decision-synthesis/synthesize";
import type { Decision } from "@/lib/strategy/decision-synthesis/types";
import {
  enrichPickApproachWithCandidates,
  enrichRankedWithCandidates,
  getAvailableForRequest,
} from "@/lib/strategy/player-suggestions/enrich";
import { enrichArchetypeWithTargets } from "@/lib/strategy/player-suggestions/play-targets";
import { WindowsBar } from "@/components/league/windows-bar";
import { WindowWeightingPrompt } from "@/components/league/window-weighting-prompt";
import { ContenderOutlookCard } from "@/components/league/contender-outlook-card";
import { computeContenderForecast } from "@/lib/strategy/contender-outlook/forecast";
import { synthesizeContenderOutlook } from "@/lib/strategy/contender-outlook/synthesize";
import type { ContenderOutlook } from "@/lib/strategy/contender-outlook/types";
import { getMyRoster } from "@/lib/strategy/league-state/snapshot";
import { getTier } from "@/lib/auth/session";
import { PlaysFromHere } from "@/components/league/plays-from-here";
import { DecisionCard } from "@/components/league/decision-card";
import { DecisionQuadrant } from "@/components/league/decision-quadrant";
import { StrategicForks } from "@/components/league/strategic-forks";
import { buildOpponentReadout, type OpponentReadout } from "@/lib/strategy/opponents/observe";
import { OpponentCharacterizations } from "@/components/league/opponent-characterizations";
import { buildOpponentCharacterizations } from "@/lib/strategy/opponents/characterize";
import type { OpponentCharacterization } from "@/lib/strategy/opponents/characterize";
import { BriefingFeed } from "@/components/league/briefing-feed";
import { CoachChat } from "@/components/league/coach-chat";
import {
  LeagueSwitcher,
  type LeagueSwitcherItem,
} from "@/components/league/league-switcher";
import { RefreshButton } from "@/components/league/refresh-button";
import { isBetaOpenMode } from "@/lib/billing/beta-mode";
import { isNflDraftWindowActive } from "@/lib/draft-window/active";
import { StrategyLab } from "@/components/league/strategy-lab";
import { buildStrategyLab } from "@/lib/strategy/strategy-lab/build";
import type { StrategyLabState } from "@/lib/strategy/strategy-lab/types";
import {
  getActiveCommitment,
  syncCommitmentAgainstLab,
} from "@/lib/strategy/path-commitment/service";
import type { ActivePathCommitment } from "@/lib/strategy/path-commitment/types";
import { SamePathThreatsCard } from "@/components/league/same-path-threats";
import { buildPathCompetition } from "@/lib/strategy/same-path-threats/build";
import type { PathCompetition } from "@/lib/strategy/same-path-threats/build";
import type { RankedArchetype } from "@/lib/strategy/archetypes/schema";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{
    username?: string;
    season?: string;
    diagnose?: string;
  }>;
};

// Diagnostic capture. When the URL has ?diagnose=1, every silent catch
// in the snapshot pipeline pushes onto this list and the page renders a
// red error block at the top with the actual messages. Lets the user
// (and us) diagnose blank-hub regressions without Vercel log access.
type DiagnosticIssue = { stage: string; message: string; stack?: string };

function captureError(
  bag: DiagnosticIssue[] | null,
  stage: string,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[${stage}]`, message, stack);
  if (bag) bag.push({ stage, message, stack });
}

export default async function LeagueHubPage({
  params,
  searchParams,
}: PageProps) {
  const { leagueId } = await params;
  const {
    username = "",
    season: seasonParam,
    diagnose: diagnoseParam,
  } = await searchParams;
  const diagnose = diagnoseParam === "1";
  const issues: DiagnosticIssue[] | null = diagnose ? [] : null;

  // Declared window (mirror of the client localStorage key) lives in a
  // cookie so the server can apply window constraints to the Decision
  // card at render time. Null when user hasn't declared one yet.
  const cookieStore = await cookies();
  const declaredWindow = parseDeclaredWindowId(
    cookieStore.get(declaredWindowCookieName(leagueId))?.value ?? null,
  );

  const [league, rosters, users, nflState] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
    getNflState(),
  ]);

  if (!league) notFound();

  const cleanedUsername = username.trim().replace(/^@/, "");
  const sleeperUser = cleanedUsername
    ? await getUserByUsername(cleanedUsername)
    : null;

  const myRoster = sleeperUser
    ? rosters.find((r) => r.owner_id === sleeperUser.user_id)
    : undefined;
  const myUser = sleeperUser
    ? users.find((u) => u.user_id === sleeperUser.user_id)
    : undefined;
  const teamName =
    (myUser?.metadata as Record<string, unknown> | null)?.team_name ??
    myUser?.display_name ??
    "Your team";

  const totalRosters = league.total_rosters ?? rosters.length;

  // Pull the user's other leagues for the switcher dropdown. Best-
  // effort: header falls back to a static title if the call fails or
  // the user isn't identified.
  let userLeagues: SleeperLeague[] = [];
  if (sleeperUser) {
    try {
      userLeagues = await getLeaguesForUser(
        sleeperUser.user_id,
        seasonParam ?? league.season,
      );
    } catch (err) {
      console.error("[hub:user-leagues]", err);
    }
  }

  // Draft state: tolerant of failure, banner is supplemental.
  // CRITICAL: if this throws and draftState stays null, the entire
  // `if (draftState)` snapshot pipeline below is skipped, which empties
  // every downstream surface (windows, ranks, opponents, decision,
  // contender). Log the actual error message + stack so the next
  // regression of this class is one log lookup, not 30 minutes of
  // bisecting.
  let draftState: Awaited<ReturnType<typeof resolveDraftState>> | null = null;
  try {
    draftState = await resolveDraftState(leagueId, sleeperUser?.user_id ?? null);
  } catch (err) {
    captureError(issues, "hub:draft-state", err);
  }
  const draftActive =
    draftState?.status === "drafting" || draftState?.status === "paused";

  // Hub data pipeline. Tolerant of failure; UI degrades to empty state
  // if snapshot can't build (e.g. Sleeper outage or player cache fail).
  let rankedArchetypes: RankedArchetype[] = [];
  let windows: WindowsResult | null = null;
  let playsFromHere: ResolvedPlayFromHere[] = [];
  let pickApproach: PickApproachData | null = null;
  let decision: Decision | null = null;
  let opponentReadout: OpponentReadout | null = null;
  let opponentCharacterizations: OpponentCharacterization[] = [];
  let availablePlayers: Awaited<
    ReturnType<typeof getAvailableForRequest>
  > = [];
  let leagueSnapshot:
    | Awaited<ReturnType<typeof buildLeagueSnapshot>>
    | null = null;
  let contenderOutlook: ContenderOutlook | null = null;
  let strategyLab: StrategyLabState | null = null;
  let pathCommitment: ActivePathCommitment | null = null;
  let pathCompetition: PathCompetition | null = null;
  // Player KTC values for the available pool. Powers EV-band tagging
  // on Strategic Forks (bargain / fair / reach) and any future surface
  // that needs cross-position value comparison. Cached server-side
  // (24h FantasyCalc fetch). Best-effort; non-fatal if it fails.
  let playerValuesByIdJson: Record<string, number> = {};

  // Engine integrity backstop. Suite of pure-function checks
  // covering pool completeness, drafted-in-pool, roster identification,
  // position normalization, format detection, cache freshness,
  // starter-reqs drift, availability coherence, and cross-source
  // position. Severe results render an unconditional danger banner;
  // warnings show in ?diagnose=1. Per "100% perfection on expected
  // behavior" directive 2026-04-25 and the LaPorta incident.
  let integrityReport: import("@/lib/players/integrity").IntegrityReport = {
    severity: "ok",
    issues: [],
    severe_count: 0,
    warning_count: 0,
  };

  // Tier check moved earlier in the pipeline so the path-commitment
  // sync (which needs tierState.user) can run inside the snapshot
  // try-block.
  const tierState = await getTier();
  if (draftState) {
    try {
      leagueSnapshot = await buildLeagueSnapshot({
        league,
        rosters,
        users,
        draftState,
        mySleeperUserId: sleeperUser?.user_id ?? null,
      });
      const snapshot = leagueSnapshot;
      rankedArchetypes = rankArchetypes(snapshot);
      windows = computeWindows(snapshot);
      playsFromHere = selectPlaysFromHere(snapshot);
      opponentReadout = buildOpponentReadout(snapshot);
      opponentCharacterizations = await buildOpponentCharacterizations(
        snapshot,
      );

      // Pull available players FIRST so the picker predictor can use
      // pool-depth + tier-crunch signals. Prediction quality depends on
      // knowing what's still on the board, not just on roster shapes.
      try {
        availablePlayers = await getAvailableForRequest(snapshot);
      } catch (err) {
        console.error("[hub:available]", err);
      }

      // Resolve KTC-equivalent values for the user's roster + top 100
      // available. Used by Strategic Forks for EV-band tagging
      // (bargain / fair / reach). Cached 24h server-side via the
      // FantasyCalc resolver; one upstream fetch covers many requests.
      // The same fetched map is the consensus baseline for ranking
      // sanity checks below; one cache, two consumers.
      let valueMap: Awaited<
        ReturnType<typeof import("@/lib/players/values")["resolvePlayerValues"]>
      > | null = null;
      try {
        const valueIds: string[] = [];
        const me = snapshot.rosters.find((r) => r.is_me);
        if (me) for (const id of me.player_ids) valueIds.push(id);
        for (const p of availablePlayers.slice(0, 100)) valueIds.push(p.id);
        const { resolvePlayerValues } = await import(
          "@/lib/players/values"
        );
        valueMap = await resolvePlayerValues({
          ids: valueIds,
          isSuperflex:
            snapshot.format === "superflex" || snapshot.format === "2qb",
          isPpr: snapshot.scoring.includes("PPR"),
          isHalfPpr: snapshot.scoring.includes("half-PPR"),
        });
        const out: Record<string, number> = {};
        for (const [id, v] of valueMap.entries()) out[id] = v.value;
        playerValuesByIdJson = out;
      } catch (err) {
        console.error("[hub:player-values]", err);
      }

      // Ranking sanity check. Validates engine `available` ordering
      // against FantasyCalc's overallRank consensus baseline (24h
      // cached, daily-updated core architecture). Logs severe
      // disagreements; pushes notable+severe into the diagnose bag
      // so ?diagnose=1 surfaces them inline. Per user feedback
      // 2026-04-24: a single seriously mis-ranked elite breaks trust;
      // backstop the rerank cascade with explicit verification.
      // Ordering sanity check stays here. Validates engine `available`
      // ordering against FantasyCalc's overallRank consensus. The
      // unified integrity suite runs LATER (after synthesizeDecision
      // is built so the availability-coherence check can read it).
      if (valueMap && valueMap.size > 0 && availablePlayers.length > 0) {
        try {
          const { runRankingSanityChecks, summarizeSanityIssues } =
            await import("@/lib/players/sanity");
          const sanityIssues = runRankingSanityChecks({
            available: availablePlayers,
            playerValues: valueMap,
          });
          if (sanityIssues.length > 0) {
            const severe = sanityIssues.filter(
              (i) => i.severity === "severe",
            );
            if (severe.length > 0) {
              console.warn(
                "[hub:ranking-sanity]",
                summarizeSanityIssues(sanityIssues),
              );
            }
            if (issues) {
              for (const it of sanityIssues.slice(0, 8)) {
                issues.push({
                  stage: `ranking-sanity:${it.severity}`,
                  message: `${it.name} (${it.position}) is engine #${it.engine_position} but consensus #${it.consensus_rank} (delta ${it.delta >= 0 ? "+" : ""}${it.delta})`,
                });
              }
            }
          }
        } catch (err) {
          captureError(issues, "hub:ranking-sanity", err);
        }
      }

      pickApproach = buildPickApproach(
        snapshot,
        rankedArchetypes,
        availablePlayers,
      );

      // Enrich with named-player candidates. The cached pool feeds four
      // surfaces: paths, picker predictions, the user's top suggestions,
      // and plays-from-here. Best-effort.
      try {
        if (availablePlayers.length > 0) {
          rankedArchetypes = enrichRankedWithCandidates(
            rankedArchetypes,
            availablePlayers,
          );
          if (pickApproach) {
            pickApproach = enrichPickApproachWithCandidates(
              pickApproach,
              availablePlayers,
              snapshot,
              rankedArchetypes,
            );
          }
          playsFromHere = enrichPlaysFromHere(
            playsFromHere,
            snapshot,
            availablePlayers,
          );
        }
      } catch (err) {
        console.error("[hub:player-enrich]", err);
      }

      // Enrich plays with named opponent counterparties from the
      // observation layer. Bridges the static playbook with live
      // counter-intel so "anyone need QB help?" becomes "DM SparkWoods.
      // they're QB-saturated, may sell at a discount."
      if (opponentReadout) {
        rankedArchetypes = rankedArchetypes.map((r) => ({
          ...r,
          targeted_plays: enrichArchetypeWithTargets(
            r.archetype,
            opponentReadout!,
          ),
        }));
      }

      // Strategy Lab. Always-on during draft; flips between prominent
      // (early picks, hero card above WindowsBar) and context (later,
      // compact strip below DecisionCard). Cheap, no LLM call.
      if (draftActive && rankedArchetypes.length > 0) {
        try {
          strategyLab = buildStrategyLab({
            snap: snapshot,
            ranked: rankedArchetypes,
            available: availablePlayers,
            opponentCharacterizations,
          });
        } catch (err) {
          console.error("[hub:strategy-lab]", err);
        }
      }

      // Path commitment + chronicle. Only active for signed-in users.
      // We fetch the active commitment for this user-league-season,
      // then sync it against the live Strategy Lab so the chronicle
      // catches up automatically (no client action needed for the
      // server-recorded events).
      if (tierState.user && strategyLab && strategyLab.paths.length > 0) {
        try {
          const fresh = await getActiveCommitment(
            tierState.user.id,
            leagueId,
            league.season,
          );
          if (fresh) {
            const livePath = strategyLab.paths.find(
              (p) => p.archetype_id === fresh.commitment.archetype_id,
            );
            pathCommitment = await syncCommitmentAgainstLab(
              fresh,
              livePath ?? null,
              snapshot.draft.next_pick_no ?? null,
            );
          }
        } catch (err) {
          console.error("[hub:path-commitment]", err);
        }
      }

      // Path competition. Per cross-panel framework 2026-04-24: track
      // threats across the user's TOP VIABLE PATHS, not just their
      // committed/first-clicked one. Real managers shop pre-commit;
      // single-path view only modeled the post-commit defending state.
      // The committed path (if any) gets sort priority; other viable
      // paths surface alongside until viability gap dominates.
      if (
        opponentCharacterizations.length > 0 &&
        rankedArchetypes.length > 0
      ) {
        try {
          pathCompetition = buildPathCompetition({
            snap: snapshot,
            ranked: rankedArchetypes,
            opponentCharacterizations,
            commitment: pathCommitment,
          });
        } catch (err) {
          console.error("[hub:path-competition]", err);
        }
      }

      // Decision Synthesis. Runs AFTER all enrichments so the
      // ranked archetypes carry top_candidates + phase, available
      // carries ADP + dynasty_rank, and windows carry the weighting.
      // Only fires when draft is actively in progress; otherwise we'd
      // tell users "you're on the clock" months before their rookie
      // draft, with rank-#250+ rookie suggestions pulled from a pool
      // that's only those names because every vet is rostered.
      if (draftActive && windows && availablePlayers.length > 0) {
        try {
          decision = synthesizeDecision({
            snap: snapshot,
            ranked: rankedArchetypes,
            available: availablePlayers,
            windows,
            picks_until_me: pickApproach?.picks_until_me ?? 0,
            declared_window: declaredWindow,
            player_values: playerValuesByIdJson,
          });
        } catch (err) {
          console.error("[hub:decision-synthesis]", err);
        }
      }

      // Engine integrity suite. Runs after `decision` is built so the
      // availability-coherence check can read it. Severe results
      // render an unconditional danger banner; warnings show in
      // ?diagnose=1. See web/src/lib/players/integrity.ts for the
      // full check list.
      if (valueMap) {
        try {
          const { runEngineIntegrityChecks, summarizeIntegrityReport } =
            await import("@/lib/players/integrity");
          const { getCacheStatus } = await import("@/lib/players/cache");
          const cacheStatus = getCacheStatus();
          const fetchedAtMs =
            cacheStatus && cacheStatus.fetched_at
              ? Date.parse(cacheStatus.fetched_at) || null
              : null;
          integrityReport = runEngineIntegrityChecks({
            snap: snapshot,
            available: availablePlayers,
            playerValues: valueMap,
            decision,
            rosterPositionsRaw: league.roster_positions ?? [],
            playersFetchedAt: fetchedAtMs,
          });
          if (integrityReport.severity !== "ok") {
            const logger =
              integrityReport.severity === "severe"
                ? console.error
                : console.warn;
            logger(
              "[hub:integrity]",
              summarizeIntegrityReport(integrityReport),
            );
            if (issues) {
              for (const it of integrityReport.issues.slice(0, 16)) {
                issues.push({
                  stage: `integrity:${it.severity}:${it.kind}`,
                  message: `${it.headline} · ${it.evidence}`,
                });
              }
            }
          }
        } catch (err) {
          captureError(issues, "hub:integrity", err);
        }
      }
    } catch (err) {
      // The whole strategy-rank pipeline (snapshot, ranks, windows,
      // opponents, decision) lives under this try. If it throws, every
      // downstream panel silently empties out and the user sees a near-
      // blank hub. Log the actual message + stack so the regression is
      // diagnosable from production logs (silent catches were the
      // culprit on the 2026-04-24 mid-NFL-draft outage). Diagnostic
      // bag also surfaces it inline when ?diagnose=1.
      captureError(issues, "hub:strategy-rank", err);
    }
  }

  // Contender outlook. Multi-year forecast of where the user's current
  // trajectory lands. Independent of draftActive; the answer to "am I
  // setting up a contender window?" is just as relevant in-season as
  // pre-draft. Best-effort; UI degrades gracefully if it fails.
  if (leagueSnapshot) {
    try {
      const meSnap = getMyRoster(leagueSnapshot);
      const years = await computeContenderForecast(leagueSnapshot, meSnap);
      contenderOutlook = synthesizeContenderOutlook({
        years,
        snap: leagueSnapshot,
        me: meSnap,
      });
    } catch (err) {
      console.error("[hub:contender-outlook]", err);
    }
  }

  // Derive standing if we have my roster + records on all rosters.
  const standing = myRoster ? calcStanding(rosters, myRoster.roster_id) : null;
  const season = seasonParam ?? league.season;

  // Header trade buttons. Trade-incoming and trade-outbound are the
  // workflows the hub doesn't cover inline; they get small header
  // buttons. The coach used to be a third card; now it's the always-
  // visible right column on desktop.
  const tradeIncomingHref = `/leagues/${leagueId}/trade${qs({ username: cleanedUsername, season })}`;
  const tradeOutboundHref = `/leagues/${leagueId}/trade?mode=outbound${qsTail({
    username: cleanedUsername,
    season,
  })}`;
  const onClockHref = `/leagues/${leagueId}/pick${qs({ username: cleanedUsername, season })}`;

  // Lean label for coach context chip. Derive from top-ranked archetype
  // when available, else leave undefined.
  const topLean = rankedArchetypes[0]?.archetype.name ?? null;

  // (tierState declared earlier in pipeline so the path-commitment
  // sync inside the snapshot try-block can use it.)
  // Beta-mode flag opens the killer features to every signed-in user
  // (Coach, Briefings). Per-feature gates become packaging, not safety;
  // the daily Anthropic budget cap is the true cost ceiling. Toggle
  // via BETA_OPEN_MODE env var.
  const betaOpen = isBetaOpenMode();
  const draftLive = isNflDraftWindowActive();

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-12">
          <Ticker
            label={`League · ${league.season}${nflState?.week ? ` · Week ${nflState.week}` : ""}${draftLive ? " · 🔴 NFL Draft live · refresh between picks" : ""}${betaOpen ? " · Beta · everything open" : ""}`}
          />

          {/* Hub header with title + trade buttons */}
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              {sleeperUser && userLeagues.length > 1 ? (
                <LeagueSwitcher
                  current={toSwitcherItem(league)}
                  leagues={userLeagues.map(toSwitcherItem)}
                  username={cleanedUsername}
                  season={season}
                />
              ) : (
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {league.name}
                </h1>
              )}
              <div className="mt-2 text-sm text-muted">
                {String(teamName)}
                {standing && (
                  <>
                    <span className="text-muted-2"> · </span>
                    <span>
                      {standing.rank}/{totalRosters} · {standing.wins}-
                      {standing.losses}
                      {standing.ties ? `-${standing.ties}` : ""}
                    </span>
                  </>
                )}
                {cleanedUsername && (
                  <>
                    <span className="text-muted-2"> · </span>
                    <Link
                      href={`/scout/${encodeURIComponent(cleanedUsername)}${
                        season ? `?season=${season}` : ""
                      }`}
                      className="text-accent hover:underline"
                    >
                      Scout my portfolio →
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Refresh requires auth (per security-audit 2026-04-24
                  HIGH: previous unauth version let any anon force
                  cache busts on any league). Hide for anonymous
                  viewers rather than show a broken button. */}
              {tierState.user && <RefreshButton leagueId={leagueId} />}
              {!cleanedUsername ? (
                <UsernamePrompt leagueId={leagueId} season={season} />
              ) : (
                <>
                  <Link
                    href={tradeIncomingHref}
                    className="rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-foreground transition hover:border-accent/60 hover:text-accent"
                  >
                    Incoming trade
                  </Link>
                  <Link
                    href={tradeOutboundHref}
                    className="rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-foreground transition hover:border-accent/60 hover:text-accent"
                  >
                    Attack a trade
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Diagnostic surface (?diagnose=1). When the user is debugging
              a blank-hub regression we render captured silent-catch
              errors inline so they don't have to chase Vercel logs. Only
              renders when issues exist; harmless on healthy hubs. */}
          {diagnose && issues && (
            <div className="mt-4 rounded-lg border border-danger/60 bg-danger/5 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-danger">
                Diagnose · {issues.length} issue{issues.length === 1 ? "" : "s"} captured
              </div>
              {issues.length === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  No silent catches fired. Snapshot pipeline is healthy;
                  blank state is from a render gate, not a thrown error.
                  Check that windows/decision/etc are gated behind the
                  expected conditions (declared window, draft active,
                  authed user).
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {issues.map((it, i) => (
                    <li
                      key={`${it.stage}-${i}`}
                      className="border-t border-danger/30 pt-2 text-xs text-foreground"
                    >
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
                        {it.stage}
                      </div>
                      <div className="mt-1 break-words">{it.message}</div>
                      {it.stack && (
                        <details className="mt-1 text-[10px] text-muted-2">
                          <summary className="cursor-pointer">stack</summary>
                          <pre className="mt-1 whitespace-pre-wrap font-mono">
                            {it.stack.split("\n").slice(0, 8).join("\n")}
                          </pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Engine integrity banner. Renders ALWAYS (not gated by
              diagnose=1) when the integrity suite finds severe issues.
              The full check list lives in players/integrity.ts and
              covers pool completeness, drafted-in-pool, roster
              identification, position normalization, format
              detection, cache freshness, starter-reqs drift,
              availability coherence, and cross-source position. Better
              to scare the user with a visible alarm than to silently
              mislead. */}
          {integrityReport.severity === "severe" && (
            <section className="mt-6 rounded-md border-2 border-danger/60 bg-danger/10 px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-danger">
                ⚠ Engine integrity issue · {integrityReport.severe_count} severe
                {integrityReport.warning_count > 0
                  ? ` + ${integrityReport.warning_count} warning${integrityReport.warning_count === 1 ? "" : "s"}`
                  : ""}
              </div>
              <p className="mt-1.5 text-sm text-foreground leading-relaxed">
                The engine detected one or more data-correctness issues
                that may make recommendations on this page incomplete
                or wrong. We surface this banner instead of silently
                serving you a partial answer.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {integrityReport.issues
                  .filter((i) => i.severity === "severe")
                  .slice(0, 6)
                  .map((it, idx) => (
                    <li key={`${it.kind}-${idx}`}>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
                        {it.kind.replace(/_/g, " ")}
                      </span>
                      <span className="ml-2 text-foreground">{it.headline}</span>
                    </li>
                  ))}
                {integrityReport.severe_count > 6 && (
                  <li className="text-muted-2">
                    + {integrityReport.severe_count - 6} more severe
                  </li>
                )}
              </ul>
              <p className="mt-2 text-[11px] text-muted-2">
                Append <code className="font-mono">?diagnose=1</code> to
                the URL for full evidence. A server-log alarm fires too,
                so regressions show up in production logs.
              </p>
            </section>
          )}

          {/* Dual-column body. Hub left, coach right. Stacks on <lg. */}
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0">
              {draftActive && draftState && (
                <DraftBanner state={draftState} />
              )}

              {sleeperUser && <WindowWeightingPrompt leagueId={leagueId} />}

              {windows && sleeperUser && (
                <WindowsBar leagueId={leagueId} windows={windows} />
              )}

              {contenderOutlook && (
                <ContenderOutlookCard outlook={contenderOutlook} />
              )}

              {decision && <DecisionCard decision={decision} />}

              {decision && decision.quadrant_candidates.length > 0 && (
                <DecisionQuadrant
                  candidates={decision.quadrant_candidates}
                  pickLabel={decision.pick_label}
                />
              )}

              {draftActive && (
                <>
                  {/* League Pulse banner: the one Strategy-Lab signal
                      worth keeping per user feedback 2026-04-24. Sits
                      directly above Strategic Forks so the room read
                      anchors the fork interpretation. */}
                  {strategyLab?.league_pulse.headline && (
                    <div className="mt-8 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-foreground">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                        League pulse ·
                      </span>{" "}
                      {strategyLab.league_pulse.headline}
                    </div>
                  )}

                  <StrategicForks
                    ranked={rankedArchetypes}
                    available={availablePlayers}
                    snapshot={leagueSnapshot}
                    myPickLabel={pickApproach?.my_pick_label ?? null}
                    playerValuesById={playerValuesByIdJson}
                    currentPickNo={
                      leagueSnapshot?.draft.next_pick_no ?? null
                    }
                    pathCompetition={pathCompetition}
                  />

                  {pickApproach && (
                    <div className="mt-3 text-right text-xs text-muted">
                      Need deeper analysis with custom context for this pick?{" "}
                      <Link
                        href={onClockHref}
                        className="text-accent hover:underline"
                      >
                        Open the on-clock form →
                      </Link>
                    </div>
                  )}
                </>
              )}

              <PlaysFromHere plays={playsFromHere} />

              <LiveStrategyBoard
                leagueId={leagueId}
                ranked={rankedArchetypes}
                isIdentified={!!sleeperUser}
                draftStatus={draftState?.status ?? null}
              />

              {opponentCharacterizations.length > 0 && (
                <OpponentCharacterizations items={opponentCharacterizations} />
              )}

              {/* Path competition lives below opponent characterizations
                  per user feedback 2026-04-24: this is per-opponent
                  intel, naturally a sub-view of the opponent panel
                  rather than a high-priority surface above the picks. */}
              {pathCompetition && (
                <SamePathThreatsCard competition={pathCompetition} />
              )}

              {sleeperUser && (
                <BriefingFeed
                  leagueId={leagueId}
                  username={cleanedUsername}
                  currentRosters={
                    leagueSnapshot
                      ? (() => {
                          const out: Record<
                            string,
                            Record<string, number>
                          > = {};
                          for (const r of leagueSnapshot.rosters) {
                            if (r.owner_name) {
                              out[r.owner_name] = r.position_counts;
                              if (r.is_me) out["you"] = r.position_counts;
                            }
                          }
                          return out;
                        })()
                      : null
                  }
                  currentPickNo={
                    leagueSnapshot?.draft.next_pick_no ?? null
                  }
                />
              )}
            </div>

            {/* Coach column: sticky on desktop, inline on mobile. */}
            {sleeperUser && (
              <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
                <CoachChat
                  leagueId={leagueId}
                  username={cleanedUsername}
                  displayName={String(teamName)}
                  variant="panel"
                  context={{
                    leagueName: league.name,
                    myPickLabel: pickApproach?.my_pick_label ?? null,
                    picksUntilMe: pickApproach?.picks_until_me ?? null,
                    lean: topLean,
                  }}
                />
              </aside>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  pre_draft: "Draft · Pre-draft",
  drafting: "Draft · Live",
  paused: "Draft · Paused",
  complete: "Draft · Complete",
  no_draft: "Draft · None scheduled",
};

function DraftBanner({
  state,
}: {
  state: Awaited<ReturnType<typeof resolveDraftState>>;
}) {
  const onClock = state.on_the_clock.is_me;
  const tone = onClock
    ? "border-accent bg-accent/10"
    : "border-border-strong bg-surface";

  return (
    <div
      className={`mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-5 py-3 text-sm ${tone}`}
    >
      <div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          {DRAFT_STATUS_LABEL[state.status]}
        </span>
        <span className="ml-3 text-foreground">
          {onClock
            ? `You're up · pick ${state.next_pick_label}`
            : state.next_pick_label && state.on_the_clock.owner_name
              ? `Pick ${state.next_pick_label} · ${state.on_the_clock.owner_name}`
              : "Draft live · waiting on the next pick"}
          {state.my_next_pick_label && state.picks_until_me != null && (
            <span className="text-muted-2">
              {" · "}
              {onClock ? "then" : "your next:"} {state.my_next_pick_label} (
              {state.picks_until_me} away)
            </span>
          )}
        </span>
      </div>
      <span className="font-mono text-[11px] text-muted-2">
        {state.type ?? ""}
      </span>
    </div>
  );
}

function UsernamePrompt({
  leagueId,
  season,
}: {
  leagueId: string;
  season: string;
}) {
  return (
    <form
      method="GET"
      action={`/leagues/${leagueId}`}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="season" value={season} />
      <input
        name="username"
        placeholder="Your Sleeper username"
        className="h-9 w-56 rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
      />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-xs font-semibold text-black transition hover:brightness-110"
      >
        Identify
      </button>
    </form>
  );
}

function calcStanding(
  rosters: Array<{
    roster_id: number;
    settings?: Record<string, unknown> | null;
  }>,
  myRosterId: number,
) {
  const scored = rosters.map((r) => {
    const s = (r.settings ?? {}) as Record<string, unknown>;
    const wins = num(s.wins);
    const losses = num(s.losses);
    const ties = num(s.ties);
    const fpts = num(s.fpts) + num(s.fpts_decimal) / 100;
    return { roster_id: r.roster_id, wins, losses, ties, fpts };
  });
  scored.sort(
    (a, b) =>
      b.wins - a.wins || b.ties - a.ties || b.fpts - a.fpts || a.losses - b.losses,
  );
  const rank = scored.findIndex((x) => x.roster_id === myRosterId) + 1;
  const me = scored.find((x) => x.roster_id === myRosterId);
  if (!me || rank === 0) return null;
  return { rank, wins: me.wins, losses: me.losses, ties: me.ties };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function toSwitcherItem(l: SleeperLeague): LeagueSwitcherItem {
  return {
    league_id: l.league_id,
    name: l.name,
    season: l.season,
    total_rosters: l.total_rosters ?? null,
    status: l.status ?? null,
    is_dynasty: isDynastyLeague(l),
  };
}

function qs(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v);
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

function qsTail(params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, v]) => v);
  if (entries.length === 0) return "";
  return "&" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}
