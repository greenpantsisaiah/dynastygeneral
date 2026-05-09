import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackEvent } from "@/components/track-event";

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
import {
  buildLeagueBriefing,
  type LeagueBriefing,
} from "@/lib/engine/briefing";
import { readProfileServer } from "@/lib/soundboard/storage";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import { LiveStrategyBoard } from "@/components/league/live-strategy-board";
import { computeWindows, type WindowsResult } from "@/lib/strategy/windows/compute";
import {
  computeLeagueOutlook,
  type LeagueOutlook,
} from "@/lib/strategy/league-outlook/compute";
import { LeagueTable } from "@/components/league/league-table";
import { LeagueDivergence } from "@/components/league/league-divergence";
import { SwotCard } from "@/components/league/swot-card";
import { computeSwot } from "@/lib/strategy/swot/compute";
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
import { ContenderOutlookCard } from "@/components/league/contender-outlook-card";
import { computeContenderForecast } from "@/lib/strategy/contender-outlook/forecast";
import { synthesizeContenderOutlook } from "@/lib/strategy/contender-outlook/synthesize";
import type { ContenderOutlook } from "@/lib/strategy/contender-outlook/types";
import { getMyRoster } from "@/lib/strategy/league-state/snapshot";
import { getOptionalUser, getTier } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlaysFromHere } from "@/components/league/plays-from-here";
// DecisionCard parked: superseded by TheCall (the redesigned standing-
// call surface). The component file stays in the codebase pending
// review of TheCall in production; once confirmed, DecisionCard +
// its tests can be deleted in a follow-up commit.
import { TradeStrategyPanel } from "@/components/league/trade-strategy-panel";
import { InflectionPanel } from "@/components/league/inflection-panel";
import { DraftProgressPanel } from "@/components/league/draft-progress-panel";
import { LastVisitWriter } from "@/components/system/last-visit-writer";
import { buildPlanPlayerIds } from "@/lib/last-visit/plan-disruption";
import { TheCall } from "@/components/league/the-call/the-call";
import { LibraryTeaser } from "@/components/league/triage/library-teaser";
import { DashboardSection } from "@/components/league/dashboard/dashboard-section";
import { LeagueEvBankLeaderboard } from "@/components/league/team/league-ev-bank-leaderboard";
import { TeamIdentityPanel } from "@/components/league/team-identity-panel";
import {
  analyzeTeamIdentity,
  type TeamIdentity,
} from "@/lib/strategy/team-identity";
import {
  buildLeagueReadFromSnapshot,
  type LeagueRead,
} from "@/lib/strategy/league-read";
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
import { DecisionQuadrant } from "@/components/league/decision-quadrant";
import { StrategicForks } from "@/components/league/strategic-forks";
import { DraftJournal } from "@/components/league/draft-journal";
import { WatchlistStrip } from "@/components/league/watchlist-strip";
import { TierMap } from "@/components/league/tier-map";
import { buildTierMap, type TierMap as TierMapData } from "@/lib/engine/evaluation/tier-map";
import type {
  PlayerSignalsRow,
  TeamSignalsRow,
} from "@/lib/signals/schema";
import { getAdminClient } from "@/lib/supabase/admin";
import { resolvePlayers } from "@/lib/players/cache";
import { getSeasonStats } from "@/lib/players/season-stats";
import { getProjections } from "@/lib/players/projections";
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

  // Saved Sleeper identity from the signed-in user's profile. Used to
  // (1) default the hub to the user's own team when ?username= is not
  // in the URL (so /account → "My leagues" lands on yourself, not a
  // blank prompt or a stale cache of someone else's hub), and (2)
  // detect when the URL is showing a DIFFERENT manager's hub so we
  // can render a clear "Viewing X" banner. Per 2026-04-25 incident:
  // user navigated to another team's view from a scout link, did not
  // realize, and the engine fed Coach the wrong roster. Every
  // recommendation that turn reflected the wrong team.
  let savedSleeperUsername: string | null = null;
  let savedSleeperUserId: string | null = null;
  try {
    const authUser = await getOptionalUser();
    if (authUser) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("profiles")
        .select("sleeper_user_id, sleeper_username")
        .eq("id", authUser.id)
        .maybeSingle();
      savedSleeperUsername =
        (data?.sleeper_username as string | null) ?? null;
      savedSleeperUserId = (data?.sleeper_user_id as string | null) ?? null;
    }
  } catch (err) {
    captureError(issues, "hub:profile-lookup", err);
  }

  const urlUsername = username.trim().replace(/^@/, "");
  const cleanedUsername = urlUsername || savedSleeperUsername || "";
  const sleeperUser = cleanedUsername
    ? await getUserByUsername(cleanedUsername)
    : null;

  // Viewing-other detection: signed-in user has a saved Sleeper
  // identity AND the resolved sleeperUser.user_id is different. Drives
  // the "Viewing {team}" banner. When the user is anonymous or has
  // never connected, we cannot tell, so the banner is suppressed.
  const isViewingOther =
    !!savedSleeperUserId &&
    !!sleeperUser &&
    sleeperUser.user_id !== savedSleeperUserId;

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
  let leagueBriefing: LeagueBriefing | null = null;
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
  let leagueOutlook: LeagueOutlook | null = null;
  let strategyLab: StrategyLabState | null = null;
  let pathCommitment: ActivePathCommitment | null = null;
  let pathCompetition: PathCompetition | null = null;
  // Player KTC values for the available pool. Powers EV-band tagging
  // on Strategic Forks (bargain / fair / reach) and any future surface
  // that needs cross-position value comparison. Cached server-side
  // (24h FantasyCalc fetch). Best-effort; non-fatal if it fails.
  let playerValuesByIdJson: Record<string, number> = {};
  // Multi-position tier map: scarcity + cliff signals across RB / WR /
  // TE / QB. Powers the Tier Map panel rendered during active drafts.
  // Built from the engine's variance-band overlap method (see
  // src/lib/engine/evaluation/tiers.ts). Best-effort; non-fatal.
  let tierMap: TierMapData | null = null;
  // KTC overall_rank per player_id, surfaced on Top 3 cards alongside
  // ADP so users see both the Sleeper-UI signal and the dynasty-pro
  // signal. Drives the trust-hierarchy callout when the two diverge.
  let ktcOverallRanksByIdJson: Record<string, number> = {};

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
      // Last-season stats power the production half of the
      // starter_talent signal. Projections power the redraft-ADP
      // half. Both non-fatal: failures return empty maps and the
      // snapshot falls back to dynasty rank-only scoring.
      const prevSeason = String(Number(league.season) - 1);
      const [lastSeasonStats, projectionsCache] = await Promise.all([
        getSeasonStats(prevSeason).catch(() => new Map()),
        getProjections(league.season).catch(
          () => ({ byPlayerId: new Map(), fetchedAt: 0 }),
        ),
      ]);
      leagueSnapshot = await buildLeagueSnapshot({
        league,
        rosters,
        users,
        draftState,
        mySleeperUserId: sleeperUser?.user_id ?? null,
        lastSeasonStats,
        projections: projectionsCache.byPlayerId,
      });
      const snapshot = leagueSnapshot;
      rankedArchetypes = rankArchetypes(snapshot);
      windows = computeWindows(snapshot);
      // Digested briefing object. Pre-bundles per-position room
      // health + emergent build trajectory + soundboard dial
      // overrides. Surfaced in ?diagnose=1 for tuning verification.
      // Phase B + Soundboard wiring 2026-04-27.
      try {
        const judgmentProfile = await readProfileServer().catch(
          () => null,
        );
        leagueBriefing = buildLeagueBriefing(snapshot, judgmentProfile);
      } catch (err) {
        captureError(issues, "hub:briefing", err);
      }
      // League-wide outlook: per-team win-now, future, 5-year forecast.
      // Powers the BCD visualizations (scatter, trajectory, table).
      // Best-effort; failure leaves the new viz off but the rest of the
      // hub renders normally. Per founder analysis 2026-04-26.
      try {
        leagueOutlook = await computeLeagueOutlook(snapshot);
      } catch (err) {
        console.error("[hub:league-outlook]", err);
      }
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
        // Look up KTC values for the FULL available pool, not just the
        // top 100 by dynasty_rank. The 100-cap meant any consensus-tier
        // player whose Sleeper search_rank put him outside the top 100
        // (Khalil Shakir, deep-tier WRs/RBs) never received a tier-1
        // KTC ranking and got buried below worse-by-consensus tier-1
        // KTC players in the rerank cascade. Shakir incident,
        // 2026-04-26: invisible to Decision card despite real WR need.
        // FantasyCalc resolver hits a single cached map; expanding the
        // ID list is O(n) lookups, not extra network.
        for (const p of availablePlayers) valueIds.push(p.id);
        const { resolvePlayerValues } = await import(
          "@/lib/players/values"
        );
        valueMap = await resolvePlayerValues({
          ids: valueIds,
          isSuperflex:
            snapshot.format === "superflex" || snapshot.format === "2qb",
          isPpr: snapshot.scoring.includes("PPR"),
          isHalfPpr: snapshot.scoring.includes("half-PPR"),
          isTePremium: snapshot.scoring.includes("TE-premium"),
        });
        const out: Record<string, number> = {};
        const ranksOut: Record<string, number> = {};
        for (const [id, v] of valueMap.entries()) {
          out[id] = v.value;
          if (typeof v.overall_rank === "number") {
            ranksOut[id] = v.overall_rank;
          }
        }
        playerValuesByIdJson = out;
        ktcOverallRanksByIdJson = ranksOut;

        // Build the multi-position tier map from the engine. Loads
        // signals tables (best-effort) so coded RB role tier / scheme
        // tag / etc. flow into evaluate() and shape the tier breaks.
        // Falls through to KTC-only-based tiers if the signals tables
        // are unreachable.
        try {
          const admin = getAdminClient();
          const candidateIds = availablePlayers.map((p) => p.id);
          const [playerSignalsRes, teamSignalsRes] = await Promise.all([
            admin
              .from("player_signals")
              .select("*")
              .in("player_id", candidateIds),
            admin.from("team_signals").select("*"),
          ]);
          const playerSignalsById = new Map<
            string,
            Partial<PlayerSignalsRow>
          >();
          for (const row of (playerSignalsRes.data ??
            []) as Partial<PlayerSignalsRow>[]) {
            if (typeof row.player_id === "string") {
              playerSignalsById.set(row.player_id, row);
            }
          }
          const teamSignalsByTeam = new Map<
            string,
            Partial<TeamSignalsRow>
          >();
          for (const row of (teamSignalsRes.data ??
            []) as Partial<TeamSignalsRow>[]) {
            if (typeof row.team === "string") {
              teamSignalsByTeam.set(row.team, row);
            }
          }
          tierMap = buildTierMap({
            players: availablePlayers.map((p) => {
              const v = valueMap?.get(p.id);
              return {
                player_id: p.id,
                name: p.name,
                team: p.team ?? null,
                position: p.position ?? null,
                age: p.age,
                years_exp: p.yearsExp ?? null,
                search_rank: p.search_rank ?? null,
                ktc_value: v?.value ?? null,
                adp: p.adp,
              };
            }),
            playerSignalsById,
            teamSignalsByTeam,
          });
        } catch (err) {
          captureError(issues, "hub:tier-map", err);
        }

        // Harmonize the available-pool ordering by the consensus
        // cascade (KTC value > ADP > heuristic dynasty_rank). Per
        // 2026-04-25 audit: previously the pool was sorted by
        // dynasty_rank only, while Strategic Forks re-sorted with
        // KTC-first internally. Different surfaces saw different
        // orderings of the same pool, which produced LaPorta
        // (KTC-top TE) ranking #4 by dynasty_rank in the Decision
        // card while showing as a top steal in Strategic Forks.
        // Single canonical ordering now; every downstream surface
        // uses the same `availablePlayers` array.
        try {
          const { rerankByConsensus } = await import(
            "@/lib/players/rerank"
          );
          availablePlayers = rerankByConsensus(availablePlayers, out);
        } catch (err) {
          console.error("[hub:rerank-available]", err);
        }
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
            ktc_overall_ranks: ktcOverallRanksByIdJson,
            horizon_dial: leagueBriefing?.dials.horizon ?? 0,
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

  // League read: trade-leverage synthesis + structural constraints +
  // trade-window timing. Surfaces in TradeStrategyPanel below
  // DecisionCard. Closes the chat-gap diagnostic from 2026-05-07
  // izzydabomb keeper-league session: founder repeatedly chatted Coach
  // for this analysis; data was always there but not surfaced.
  let leagueRead: LeagueRead | null = null;
  let inflectionItems: InflectionContext[] = [];
  let draftProgress: DraftProgress | null = null;
  let teamIdentity: TeamIdentity | null = null;
  let leagueEvBank: LeagueEvBankReadout | null = null;
  if (leagueSnapshot) {
    try {
      // Resolve all rostered players (including ones in picks_made
      // for accurate pick-quality name lookups). Cached, single
      // call. Used by both league-read pick-quality + inflection.
      const allRosterIds = new Set<string>();
      for (const r of leagueSnapshot.rosters) {
        for (const id of r.player_ids ?? []) allRosterIds.add(id);
      }
      for (const p of leagueSnapshot.draft.picks_made) {
        if (p.player_id) allRosterIds.add(p.player_id);
      }
      const playersMap = await resolvePlayers([...allRosterIds]);

      // Build a value map from the JSON-encoded snapshots that the
      // hub already prepared (playerValuesByIdJson +
      // ktcOverallRanksByIdJson). When the value resolver didn't run
      // (e.g., the league hasn't been seeded), the maps are empty
      // and the league-read falls back to generic "their best RB"
      // prose without erroring.
      const lrValueMap: Map<
        string,
        { value: number; overall_rank: number | null }
      > = new Map();
      for (const [id, value] of Object.entries(playerValuesByIdJson)) {
        lrValueMap.set(id, {
          value,
          overall_rank: ktcOverallRanksByIdJson[id] ?? null,
        });
      }

      const playerNameLookup = (id: string) => {
        const sp = playersMap.get(id);
        if (!sp) return null;
        const combined = [sp.first_name, sp.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        const name = sp.full_name ?? combined ?? id;
        return { name, position: sp.position ?? null };
      };

      leagueRead = buildLeagueReadFromSnapshot({
        snap: leagueSnapshot,
        playerValueMap: lrValueMap,
        playerNameLookup,
      });

      inflectionItems = buildInflectionsFromSnapshot({
        snap: leagueSnapshot,
        playersMap,
      });

      // Draft progress scorecard. "How am I doing in this draft."
      // Uses Sleeper format-aware ADP (via pickAdpFromVariants) as
      // the consensus baseline for positioning analysis. ADP is
      // the right baseline for draft-position consensus; FantasyCalc
      // overall_rank is dynasty-value rank and is wrong here. Per
      // founder feedback 2026-05-08: scoring user picks against
      // FantasyCalc rank produced false "reach" labels (Mahomes was
      // top of Sleeper ADP but FantasyCalc-rank ~50 since he's 30).
      //
      // ADP comes from Sleeper's projections endpoint (separate
      // from the SleeperPlayer cache). Earlier bug 2026-05-08:
      // casting SleeperPlayer to PlayerAdp returned null for every
      // pick. Fix: fetch projections explicitly.
      const { pickAdpFromVariants, getProjections } = await import(
        "@/lib/players/projections"
      );
      const adpFmt = {
        isSuperflex:
          leagueSnapshot.format === "superflex" ||
          leagueSnapshot.format === "2qb",
        isPpr: leagueSnapshot.scoring.includes("PPR"),
        isHalfPpr: leagueSnapshot.scoring.includes("half-PPR"),
        isTePremium: leagueSnapshot.scoring.includes("TE-premium"),
        isRookie: false,
      };
      let projectionsForAdp:
        | Awaited<ReturnType<typeof getProjections>>
        | null = null;
      try {
        projectionsForAdp = await getProjections(leagueSnapshot.season);
      } catch (err) {
        console.error("[hub:adp-projections]", err);
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
      draftProgress = analyzeDraftProgress({
        snap: leagueSnapshot,
        playerValueMap: lrValueMap,
        playerNameLookup,
        getAdp,
        availablePool: availablePlayers,
      });

      // League-relative EV bank leaderboard. Per founder feedback
      // 2026-05-08: "the EV is cool but I want full league EV so I
      // can look at how I stand relatively." computeLeagueEvBank
      // produces per-roster totals + range envelopes + the user's
      // percentile rank. Surfaced on the triage hub as a micro
      // chart and on /team in full leaderboard form.
      leagueEvBank = analyzeLeagueEvBank({
        snap: leagueSnapshot,
        playerValueMap: lrValueMap,
        getAdp,
      });

      // Team Identity. The "this is your team" hero card. Combines
      // archetype (from rankedArchetypes), position room rank,
      // inflection exposure, lineup talent rank, and predicted
      // keeper slate into a single identity readout. Per founder
      // direction 2026-05-08: characterizing the user's team has
      // always been core mission; this is the consolidation surface.
      // Build playerAges from playersMap so the team-identity
      // comparator can compute young_skew / old_skew dimensions.
      // Cheap (already-resolved players); per memory project_emotional_
      // continuity_through_plan_disruption: comparator is one of the
      // "system thinks out loud" features we want pre-staged ahead of
      // the UI refresh.
      const playerAges = new Map<string, number | null>();
      for (const id of leagueSnapshot.rosters.flatMap(
        (r) => r.player_ids ?? [],
      )) {
        const sp = playersMap.get(id);
        playerAges.set(id, typeof sp?.age === "number" ? sp.age : null);
      }
      teamIdentity = analyzeTeamIdentity({
        snap: leagueSnapshot,
        rankedArchetypes,
        inflections: inflectionItems,
        playerValueMap: lrValueMap,
        playerNameLookup,
        playerAges,
      });
    } catch (err) {
      console.error("[hub:league-read+inflections]", err);
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

  // Draft journal entries: user's own picks_made with player names
  // resolved + pick label formatted. Powers the post-Quadrant
  // self-awareness surface ("your draft so far"). Best-effort; UI
  // degrades gracefully if it fails.
  let journalEntries: Array<{
    pick_no: number;
    pick_label: string;
    taken_player_id: string;
    taken_player_name: string;
  }> = [];
  if (leagueSnapshot) {
    try {
      const myRosterSnap = getMyRoster(leagueSnapshot);
      if (myRosterSnap) {
        const myPicks = leagueSnapshot.draft.picks_made
          .filter((p) => p.roster_id === myRosterSnap.roster_id)
          .sort((a, b) => a.pick_no - b.pick_no);
        if (myPicks.length > 0) {
          const teams = leagueSnapshot.rosters.length;
          const playerIds = myPicks.map((p) => p.player_id);
          const players = await resolvePlayers(playerIds);
          journalEntries = myPicks.map((p) => {
            const round = Math.ceil(p.pick_no / teams);
            const within = ((p.pick_no - 1) % teams) + 1;
            const pl = players.get(p.player_id);
            const combined = [pl?.first_name, pl?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim();
            const playerName = pl?.full_name ?? combined ?? p.player_id;
            return {
              pick_no: p.pick_no,
              pick_label: `${round}.${within}`,
              taken_player_id: p.player_id,
              taken_player_name: playerName,
            };
          });
        }
      }
    } catch (err) {
      console.error("[hub:journal-entries]", err);
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
      <TrackEvent
        payload={{
          event: "league_opened",
          league_id: league.league_id,
          season: Number(league.season),
          dynasty: isDynastyLeague(league),
        }}
      />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-12">
          <Ticker
            label={`League · ${league.season}${nflState?.week ? ` · Week ${nflState.week}` : ""}${draftLive ? " · 🔴 NFL Draft live · refresh between picks" : ""}${betaOpen ? " · Beta · everything open" : ""}`}
          />

          {isViewingOther && savedSleeperUsername && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/60 bg-warning/10 px-4 py-3 text-sm">
              <div className="text-foreground">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
                  Viewing another team
                </span>
                <div className="mt-1">
                  Hub is showing{" "}
                  <span className="font-semibold">{String(teamName)}</span>
                  {sleeperUser?.display_name && sleeperUser.display_name !== teamName ? (
                    <span className="text-muted">
                      {" "}
                      · @{sleeperUser.display_name}
                    </span>
                  ) : null}
                  . Recommendations apply to that roster, not yours.
                </div>
              </div>
              <Link
                href={`/leagues/${leagueId}?username=${encodeURIComponent(savedSleeperUsername)}${seasonParam ? `&season=${seasonParam}` : ""}`}
                className="rounded-md border border-warning/60 bg-surface px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-warning transition hover:border-warning hover:text-foreground"
              >
                Switch to your team →
              </Link>
            </div>
          )}

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

          {/* Briefing panel (?diagnose=1 only). Shows the digested
              per-position room health so the founder can verify
              SWOT and Decision are reading the same numbers. Renders
              when the briefing built successfully and ?diagnose=1
              is set. Phase B 2026-04-27. */}
          {diagnose && leagueBriefing && (
            <div className="mt-4 rounded-lg border border-accent/40 bg-accent/5 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                Briefing · position health
              </div>
              <p className="mt-2 text-xs text-muted">
                Single source of truth consumed by every surface.
                SWOT reads upper-bound (bench depth); Decision reads
                realistic-max (lineup economics). Different numbers,
                same source.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {(
                  ["QB", "RB", "WR", "TE", "K", "DST"] as const
                ).map((pos) => {
                  const h = leagueBriefing!.position_health[pos];
                  const tone =
                    h.room === "thin"
                      ? "border-warning/60 text-warning"
                      : h.room === "saturated"
                        ? "border-danger/40 text-danger"
                        : h.room === "locked"
                          ? "border-success/40 text-success"
                          : "border-border-soft text-muted-2";
                  return (
                    <div
                      key={pos}
                      className={`rounded-md border ${tone} bg-surface px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em]`}
                    >
                      <div className="text-foreground">
                        {pos}: {h.current_count} / {h.realistic_starters}
                      </div>
                      <div className="mt-0.5 text-muted-2 normal-case tracking-normal">
                        hard {h.hard_starters} · realistic {h.realistic_starters} · upper {h.upper_bound_starters}
                      </div>
                      <div className="mt-0.5">{h.room}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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

              {/* AAR pre-launch banner. Surfaces at 75 percent draft
                  completion so the user knows their After-Action
                  Report is being prepped and where to find it. Stays
                  visible through to draft-complete, then yields to
                  the AAR-ready banner below. */}
              {draftActive &&
                draftState &&
                draftState.total_teams > 0 &&
                draftState.rounds > 0 &&
                (() => {
                  const totalPicks =
                    draftState.total_teams * draftState.rounds;
                  const picksMade = draftState.picks_so_far.length;
                  const progressPct =
                    totalPicks > 0
                      ? Math.round((picksMade / totalPicks) * 100)
                      : 0;
                  if (progressPct < 75) return null;
                  return (
                    <div className="mt-6 rounded-md border border-accent/40 bg-accent/5 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                            After-Action Report ·{" "}
                          </span>
                          <span className="text-sm text-foreground">
                            Being prepped. Available the moment your
                            draft ends ({progressPct}% complete).
                          </span>
                        </div>
                        <Link
                          href={`/leagues/${leagueId}/aar${
                            username
                              ? `?username=${encodeURIComponent(username)}`
                              : ""
                          }`}
                          className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:underline"
                        >
                          Preview what's coming →
                        </Link>
                      </div>
                    </div>
                  );
                })()}

              {draftState?.status === "complete" && (
                <div className="mt-6 rounded-lg border-2 border-accent/60 bg-accent/10 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                        After-Action Report ready
                      </div>
                      <p className="mt-1 text-sm text-foreground">
                        Your draft is complete. The full breakdown,
                        grade, and 90-day playbook are waiting.
                      </p>
                    </div>
                    <Link
                      href={`/leagues/${leagueId}/aar${
                        username
                          ? `?username=${encodeURIComponent(username)}`
                          : ""
                      }`}
                      className="rounded-md border border-accent/60 bg-accent/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-accent hover:bg-accent/25"
                    >
                      Read your report →
                    </Link>
                  </div>
                </div>
              )}

              {/* WindowWeightingPrompt removed 2026-04-27. Lanes-as-
                  emergent-direction (Decision card lane grid + Soundboard
                  Horizon dial) replaced the win-now/future declaration
                  prompt. The user's actual picks reveal direction now;
                  declaring it upfront created the "MY LEAN" coercion
                  problem the synthesis fix already solved. WindowsBar
                  meters retained as math (CAN-WIN-NOW vs FUTURE scores
                  are league-state observations, not user declarations). */}

              {/* Last-visit fingerprint writer. Invisible client
                  component that POSTs the current snapshot's
                  fingerprint to /api/last-visit after mount, so the
                  next hub render can compute the "Since [time]: ..."
                  digest + plan-disruption acknowledgment. The read
                  side renders with the visual redesign; this ships
                  the write side now so users start accruing
                  fingerprints immediately. */}
              {leagueSnapshot && (
                <LastVisitWriter
                  leagueId={leagueId}
                  fingerprint={{
                    v: 1,
                    ts: new Date().toISOString(),
                    total_picks_made: leagueSnapshot.draft.picks_made.length,
                    standing_call_id:
                      decision?.recommendation.player_id ?? null,
                    ev_bank_total: draftProgress?.ev_bank?.total_ev ?? null,
                    my_roster_size:
                      leagueSnapshot.rosters.find((r) => r.is_me)?.player_ids
                        .length ?? 0,
                    plan_player_ids: buildPlanPlayerIds({
                      recommendation_id:
                        decision?.recommendation.player_id ?? null,
                      top_candidate_ids:
                        decision?.top_candidates.map((c) => c.player_id) ??
                        [],
                      // next_picks_plan exposes player NAMES not IDs, so
                      // we cannot extend the plan-disruption set from
                      // there without an extra name-to-id round trip.
                      // Recommendation + top_candidates IDs cover the
                      // most-relevant snipe surface today.
                      next_picks_plan_target_ids: [],
                    }),
                  }}
                />
              )}

              {/* DASHBOARD HUB (post-feedback rebuild 2026-05-08):
                  the route-split pivot was wrong; the hub returns to
                  a single page with clear sections. Each section owns
                  one question and contains rich visual content;
                  expand / collapse on the tile, no navigation cost.
                  Mirrors the Coach panel's section identity. */}

              {/* Critical alerts: league pulse + future on-the-clock /
                  plan-disruption banners. */}
              {strategyLab?.league_pulse.headline && (
                <div className="mb-6 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-foreground">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                    League pulse ·
                  </span>{" "}
                  {strategyLab.league_pulse.headline}
                </div>
              )}

              {/* Watchlist strip: "your guys" quick-glance at the top. */}
              {leagueSnapshot && (
                <WatchlistStrip
                  leagueId={leagueId}
                  draftedById={(() => {
                    const ownerByRosterId = new Map(
                      leagueSnapshot.rosters.map((r) => [
                        r.roster_id,
                        r.owner_name,
                      ]),
                    );
                    const map: Record<
                      string,
                      { pick_no: number; owner_name: string | null }
                    > = {};
                    for (const p of leagueSnapshot.draft.picks_made) {
                      map[p.player_id] = {
                        pick_no: p.pick_no,
                        owner_name:
                          ownerByRosterId.get(p.roster_id) ?? null,
                      };
                    }
                    return map;
                  })()}
                  standingCallId={
                    decision?.recommendation?.player_id ?? null
                  }
                />
              )}

              {/* Stage-adaptive section ordering. The Call only
                  renders during active drafts; pre-draft and post-
                  draft hubs lead with planning + trade leverage
                  surfaces respectively. Founder feedback 2026-05-08:
                  "The Call should only show up while drafting, right?
                  Need a pre-draft and post-draft plan, probably
                  focused more on trades, opportunities, etc." */}

              {/* SECTION: The Call (active draft only). */}
              {draftActive && decision && (
                <div className="mb-8">
                  <TheCall
                    decision={decision}
                    leagueType={leagueSnapshot?.league_type ?? "unknown"}
                    maxKeepers={leagueSnapshot?.max_keepers ?? null}
                  />
                </div>
              )}

              {/* SECTION: Pre-draft prep (pre-draft / no-draft only).
                  When the user lands on the hub before the draft has
                  started, the most-actionable thing is preparing the
                  build, not making a pick. Surfaces Team Identity
                  preview + Library articles for prep. */}
              {!draftActive && draftState?.status !== "complete" && (
                <DashboardSection
                  label="Pre-draft prep"
                  title="Plan the build before the clock starts"
                  tagline="Keepers, comparator, expected build, prep articles."
                  defaultOpen={true}
                  emphasize={true}
                >
                  {teamIdentity && <TeamIdentityPanel data={teamIdentity} />}
                  <LibraryTeaser
                    contextTags={(() => {
                      const tags: string[] = ["ADP", "rookies"];
                      if (
                        leagueSnapshot?.format === "superflex" ||
                        leagueSnapshot?.format === "2qb"
                      )
                        tags.push("superflex");
                      if (leagueSnapshot?.league_type === "dynasty")
                        tags.push("dynasty");
                      if (leagueSnapshot?.league_type === "keeper")
                        tags.push("dynasty");
                      return tags;
                    })()}
                  />
                </DashboardSection>
              )}

              {/* SECTION: How you're doing. Always renders when
                  draft has started (active or complete). Hidden
                  pre-draft (no picks made yet means EV bank +
                  position diagnostic have nothing to say). */}
              {(draftActive || draftState?.status === "complete") && (
                <DashboardSection
                  label="How you're doing"
                  title="Your bank, your fits, your sharp positioning"
                  tagline="Where the model thinks you stand vs the league. Numbers + per-pick contributions + confidence bands."
                  defaultOpen={true}
                >
                  {draftProgress && <DraftProgressPanel data={draftProgress} />}
                  {leagueEvBank && leagueEvBank.ranked_count > 0 && (
                    <LeagueEvBankLeaderboard bank={leagueEvBank} />
                  )}
                  {windows && sleeperUser && (
                    <WindowsBar leagueId={leagueId} windows={windows} />
                  )}
                </DashboardSection>
              )}

              {/* SECTION: Your team. Always renders. Identity,
                  comparator, risk fingerprint, contender outlook. */}
              <DashboardSection
                label="Your team"
                title="Who you're building"
                tagline="Identity, comparator, risk fingerprint, contender outlook."
                defaultOpen={!draftActive}
              >
                {teamIdentity && <TeamIdentityPanel data={teamIdentity} />}
                {inflectionItems.length > 0 && (
                  <InflectionPanel items={inflectionItems} />
                )}
                {contenderOutlook && (
                  <ContenderOutlookCard outlook={contenderOutlook} />
                )}
              </DashboardSection>

              {/* SECTION: The league. Trade leverage, opponent
                  intel, league-wide signals. Default-open varies by
                  stage: collapsed during drafts (The Call dominates
                  attention) and expanded post-draft / pre-draft
                  (trade leverage IS the activity). */}
              {(leagueRead ||
                leagueOutlook ||
                opponentCharacterizations.length > 0 ||
                pathCompetition) && (
                <DashboardSection
                  label="The league"
                  title="Trade leverage and opponent reads"
                  tagline="Where the soft spots are, who needs what, what to send."
                  defaultOpen={!draftActive}
                  emphasize={!draftActive && draftState?.status === "complete"}
                >
                  {leagueRead && <TradeStrategyPanel data={leagueRead} />}
                  {opponentCharacterizations.length > 0 && (
                    <OpponentCharacterizations
                      items={opponentCharacterizations}
                    />
                  )}
                  {pathCompetition && (
                    <SamePathThreatsCard competition={pathCompetition} />
                  )}
                  {leagueOutlook && leagueSnapshot && (
                    <>
                      <SwotCard
                        swot={computeSwot(leagueSnapshot, leagueOutlook)}
                      />
                      <LeagueDivergence outlook={leagueOutlook} />
                      <LeagueTable outlook={leagueOutlook} />
                    </>
                  )}
                </DashboardSection>
              )}

              {/* SECTION: Intel. Library + briefings + news +
                  alerts. Collapsed by default. */}
              <DashboardSection
                label="Intel"
                title="What the model is reading"
                tagline="Library articles + briefings + statistical methodology."
                defaultOpen={false}
              >
                <LibraryTeaser
                  contextTags={(() => {
                    const tags: string[] = [];
                    if (
                      leagueSnapshot?.format === "superflex" ||
                      leagueSnapshot?.format === "2qb"
                    ) {
                      tags.push("superflex");
                    }
                    if (leagueSnapshot?.scoring.includes("TE-premium")) {
                      tags.push("TE-premium");
                    }
                    if (leagueSnapshot?.league_type === "dynasty") {
                      tags.push("dynasty");
                    }
                    if (leagueSnapshot?.league_type === "keeper") {
                      tags.push("dynasty");
                    }
                    if (draftActive) {
                      tags.push("ADP", "EV", "rookies");
                    }
                    return tags;
                  })()}
                />
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
              </DashboardSection>
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
