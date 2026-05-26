import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackEvent } from "@/components/track-event";

export const metadata: Metadata = {
  title: "League Hub",
  robots: { index: false, follow: false },
};

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
import { isRosterOwnedBy } from "@/lib/sleeper/roster-identity";
import { buildLeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { buildStrategySnapshot } from "@/lib/strategy/league-state/strategy-snapshot";
import {
  buildLeagueBriefing,
  type LeagueBriefing,
} from "@/lib/engine/briefing";
import { readProfileServer } from "@/lib/lab/profile-storage";
import { deriveDoctrine, formatDoctrineLine } from "@/lib/lab/doctrine";
import { detectDoctrineDrift } from "@/lib/lab/drift";
import { loadEffectiveDials } from "@/lib/lab/league-doctrine";
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
import { buildSurvivalResolver } from "@/lib/strategy/decision-synthesis/synthesize";
import { buildPricedPool } from "@/lib/strategy/decision-synthesis/priced-pool";
import { resolveStandingDecision } from "@/lib/strategy/decision-synthesis/decision-bundle";
import {
  dialsForSynthesisFrom,
  type Decision,
} from "@/lib/strategy/decision-synthesis/types";
import {
  enrichPickApproachWithCandidates,
  enrichRankedWithCandidates,
  getAvailableForRequest,
} from "@/lib/strategy/player-suggestions/enrich";
import { enrichArchetypeWithTargets } from "@/lib/strategy/player-suggestions/play-targets";
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
import { LastVisitDigest } from "@/components/league/last-visit-digest";
import { CompanionCheckIn } from "@/components/league/companion-check-in";
import { classifyBeats } from "@/lib/strategy/companion/classify";
import { reconstructPickDebate } from "@/lib/strategy/companion/debate";
import type {
  Beat,
  BeatStage,
  AnticipationInput,
} from "@/lib/strategy/companion/types";
import type { WhatIfReadout } from "@/lib/strategy/decision-synthesis/whatif";
import {
  buildPlanPlayerIds,
  detectPlanDisruption,
} from "@/lib/last-visit/plan-disruption";
import { readLastVisit } from "@/lib/last-visit/cookie";
import {
  computeLastVisitDelta,
  composeDigestLine,
} from "@/lib/last-visit/diff";
import { TheCall } from "@/components/league/the-call/the-call";
import { LibraryTeaser } from "@/components/league/triage/library-teaser";
import { DashboardSection } from "@/components/league/dashboard/dashboard-section";
// LeagueEvBankLeaderboard standalone widget removed: the league
// comparison is now an inline collapsible expander attached to the
// EV bank section inside DraftProgressPanel. Per founder feedback:
// "show me mine, then expand to theirs."
import { TeamIdentityPanel } from "@/components/league/team-identity-panel";
import {
  analyzeTeamIdentity,
  type TeamIdentity,
} from "@/lib/strategy/team-identity";
import { LaneCohortDistribution } from "@/components/league/lane-cohort-distribution";
import { PostureBanner } from "@/components/league/posture-banner";
import { FuturePickCabinet } from "@/components/league/future-pick-cabinet";
import { classifyRosterPosture } from "@/lib/strategy/posture/detect";
import { readChampionHistory } from "@/lib/strategy/posture/champion-history";
import type { RosterPosture } from "@/lib/strategy/posture/types";
import { DraftPositionBanner } from "@/components/league/draft-position-banner";
import { PositionRunWatch } from "@/components/league/position-run-watch";
import { ClassStrengthChip } from "@/components/league/class-strength-chip";
import { computeClassStrength } from "@/lib/strategy/class-strength/compute";
import type { ClassStrength } from "@/lib/strategy/class-strength/compute";
import { readLeagueDoctrine } from "@/lib/lab/league-doctrine";
import { DraftPathProjector } from "@/components/league/draft-path-projector";
import { projectDraftPaths } from "@/lib/strategy/draft-paths/project";
import type { DraftPathProjection } from "@/lib/strategy/draft-paths/types";
import { TradeOpportunitiesPanel } from "@/components/league/trade-opportunities-panel";
import { detectTradeOpportunities } from "@/lib/strategy/trade-opportunities/detect";
import {
  suggestPlaysFromRoster,
  detectRosterShapePlays,
  detectLanePlays,
  type OwnedRosterPlayer,
} from "@/lib/strategy/plays/detect";
import type { Play } from "@/lib/strategy/plays/types";
import type { TradeOpportunity } from "@/lib/strategy/trade-opportunities/detect";
import {
  summarizeUpcomingDraft,
  type UpcomingDraftSummary,
} from "@/lib/strategy/pre-draft/upcoming-draft";
import {
  aggregateRosterIdentity,
  identityMoves,
  type IdentityMove,
  type LaneMembership,
  type PlayerMeta as LanePlayerMeta,
} from "@/lib/strategy/lane-identity";
import {
  buildLeagueReadFromSnapshot,
  type LeagueRead,
} from "@/lib/strategy/league-read";
import {
  buildInflectionsFromSnapshot,
  rosterHasAgingRb,
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
import { resolvePlayers } from "@/lib/players/cache";
import {
  getSeasonStats,
  getCareerUsage,
  buildOpportunityProfile,
} from "@/lib/players/season-stats";
import {
  readOpportunity,
  type OpportunityRead,
} from "@/lib/players/opportunity-read";
import { buildOpponentReadout, type OpponentReadout } from "@/lib/strategy/opponents/observe";
import { OpponentCharacterizations } from "@/components/league/opponent-characterizations";
import { buildOpponentCharacterizations } from "@/lib/strategy/opponents/characterize";
import {
  readOpponentNotesForLeague,
  groupNotesByOpponent,
  type OpponentNote,
} from "@/lib/opponent-notes/storage";
import {
  buildOpponentTradeHistory,
  type OpponentTradeHistory,
} from "@/lib/strategy/opponents/trade-history";
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
import type {
  RankedArchetype,
  Position,
} from "@/lib/strategy/archetypes/schema";

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
  // Hoisted so downstream blocks (e.g., opponent-notes pull) can reuse
  // the resolved auth user without re-fetching the session.
  const authUser = await getOptionalUser().catch(() => null);
  try {
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
    ? rosters.find((r) => isRosterOwnedBy(r, sleeperUser.user_id))
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
  // Doctrine surface: hoisted to render-scope so the page header can
  // show a "Doctrine: <line> · Tune →" chip and the drift detector
  // can compare declared vs behavioral horizon. Reads the same
  // judgmentProfile that already feeds buildLeagueBriefing and
  // synthesizeDecision.
  let doctrineLine: string | null = null;
  let doctrineCalibratedCount: number | null = null;
  let doctrineHasLeagueOverride = false;
  let driftSummary: string | null = null;
  let playsFromHere: ResolvedPlayFromHere[] = [];
  let pickApproach: PickApproachData | null = null;
  let decision: Decision | null = null;
  // Per-candidate earned-role read (snap share + targets trend) for The
  // Call cards, keyed by player_id. Built from the same prior-season
  // /stats maps the inflection cards use, via the canonical readOpportunity.
  let opportunityById: Record<string, OpportunityRead> = {};
  let opponentReadout: OpponentReadout | null = null;
  let opponentCharacterizations: OpponentCharacterization[] = [];
  let opponentNotesByRoster: Map<number, OpponentNote[]> = new Map();
  let opponentTradeHistoryByRoster: Map<number, OpponentTradeHistory> =
    new Map();
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
      leagueSnapshot = await buildStrategySnapshot({
        league,
        rosters,
        users,
        draftState,
        mySleeperUserId: sleeperUser?.user_id ?? null,
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

        // Doctrine readout + drift detection. Both render in the
        // hub header / banner once available. Reads the EFFECTIVE
        // dials (global + per-league override) so the chip reflects
        // what's actually shaping this league's recommendations.
        if (judgmentProfile) {
          const { effective: effectiveDialsForChip, override } =
            await loadEffectiveDials({
              userId: authUser?.id ?? null,
              leagueId,
              globalProfile: judgmentProfile,
            });
          const doctrine = deriveDoctrine(effectiveDialsForChip);
          doctrineLine = formatDoctrineLine(doctrine);
          doctrineCalibratedCount = doctrine.calibrated_count;
          doctrineHasLeagueOverride = Boolean(override?.enabled_at);

          // Drift: compare last N user picks' implied horizon
          // against the declared Horizon dial. Only fires when the
          // user has 5+ picks made AND the gap exceeds threshold.
          const declaredHorizon =
            typeof judgmentProfile.dials.horizon === "number"
              ? judgmentProfile.dials.horizon
              : 0;
          const playerMetaForDrift = new Map<
            string,
            { age: number | null; is_rookie: boolean } | null
          >();
          const me = snapshot.rosters.find((r) => r.is_me);
          const recentUserPickIds = me
            ? snapshot.draft.picks_made
                .filter((p) => p.roster_id === me.roster_id)
                .sort((a, b) => b.pick_no - a.pick_no)
                .slice(0, 8)
                .map((p) => p.player_id)
            : [];
          if (recentUserPickIds.length > 0) {
            const resolved = await resolvePlayers(recentUserPickIds);
            for (const pid of recentUserPickIds) {
              const player = resolved.get(pid);
              if (!player) continue;
              playerMetaForDrift.set(pid, {
                age: typeof player.age === "number" ? player.age : null,
                is_rookie: player.years_exp === 0,
              });
            }
          }
          // Drift suppressed in active startup draft. Founder report
          // 2026-05-19: "+50 before my last pick and I literally
          // picked Saquon Barkley... very hard to feel like that's a
          // drift further to future-leaning." In a startup, the
          // top of the board is dominated by young / rookie assets
          // (Bowers, Daniels, Jeanty at ADP 1-12) so taking them is
          // a market-driven choice, not a posture commitment. Drift
          // detection makes more sense in-season when the user is
          // actively trading + waiver-claiming. Same suppression
          // pattern Phase A.1 uses for posture banner.
          const isStartupDraft =
            (snapshot.draft.rounds ?? 0) > 6;
          const inActiveStartupForDrift =
            (draftState?.status === "drafting" ||
              draftState?.status === "paused") &&
            isStartupDraft;
          if (!inActiveStartupForDrift) {
            const drift = detectDoctrineDrift({
              rosters: snapshot.rosters,
              picks_made: snapshot.draft.picks_made,
              declared_horizon: declaredHorizon,
              player_meta_by_id: playerMetaForDrift,
            });
            if (drift.detected) {
              driftSummary = drift.summary;
            }
          }
        }
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

      // Enrich each card with the opponent's last 3 picks. Surfaces
      // "what are they doing right now?" without making the user open
      // Sleeper. Resolves player names via the cached `resolvePlayers`
      // helper using only the pick IDs we need (3 per opponent), so
      // the additional cost is one cache lookup.
      try {
        const totalTeams = snapshot.total_teams || 12;
        const recentPickIds = new Set<string>();
        const perOpponent = new Map<
          number,
          Array<{ pick_no: number; player_id: string; position: string | null }>
        >();
        for (const c of opponentCharacterizations) {
          const top3 = [...snapshot.draft.picks_made]
            .filter((p) => p.roster_id === c.roster_id)
            .sort((a, b) => b.pick_no - a.pick_no)
            .slice(0, 3);
          perOpponent.set(
            c.roster_id,
            top3.map((p) => ({
              pick_no: p.pick_no,
              player_id: p.player_id,
              position: p.position,
            })),
          );
          for (const p of top3) recentPickIds.add(p.player_id);
        }
        const namesById = await resolvePlayers([...recentPickIds]);
        for (const c of opponentCharacterizations) {
          const picks = perOpponent.get(c.roster_id) ?? [];
          c.recent_picks = picks.map((p) => {
            const sp = namesById.get(p.player_id);
            const combined = [sp?.first_name, sp?.last_name]
              .filter(Boolean)
              .join(" ")
              .trim();
            const name = sp?.full_name ?? combined ?? p.player_id;
            const round = Math.ceil(p.pick_no / totalTeams);
            const within = ((p.pick_no - 1) % totalTeams) + 1;
            return {
              pick_label: `${round}.${within}`,
              player_name: name,
              position: p.position ?? sp?.position ?? null,
            };
          });
        }
      } catch (err) {
        console.error("[hub:opponent-recent-picks]", err);
      }

      // Pre-compute per-opponent trade-history signatures so the
      // OpponentCharacterizations card can surface the fingerprint chip
      // (pick_flipper / hoarder / seller / quiet). Same module Coach
      // calls; no extra Sleeper fetch (operates on
      // snapshot.draft.traded_picks already in memory).
      try {
        for (const r of snapshot.rosters) {
          if (r.is_me) continue;
          const th = buildOpponentTradeHistory({
            rosterId: r.roster_id,
            tradedPicks: snapshot.draft.traded_picks,
            currentSeason: snapshot.season,
          });
          opponentTradeHistoryByRoster.set(r.roster_id, th);
        }
      } catch (err) {
        console.error("[hub:opponent-trade-history]", err);
      }

      // Pull manual opponent notes for the signed-in user so the
      // OpponentCharacterizations panel can render them inline + offer
      // an inline-add form. Coach already reads the same table via
      // its own route. Best-effort; empty map when user isn't signed
      // in or DB read fails.
      try {
        if (authUser) {
          const rawNotes = await readOpponentNotesForLeague({
            userId: authUser.id,
            leagueId,
          });
          opponentNotesByRoster = groupNotesByOpponent(rawNotes);
        }
      } catch (err) {
        console.error("[hub:opponent-notes]", err);
      }

      // Priced pool, single canonical source. One helper fetches the
      // realistic available pool, prices EVERY rostered player across the
      // league plus the full available pool, harmonizes the available
      // ordering by the consensus cascade (KTC > ADP > heuristic), and
      // annotates the snapshot with value-calibrated startable / stable
      // depth. The hub board and Coach both call `buildPricedPool` so
      // their `synthesizeDecision` inputs are identical and the standing
      // call cannot diverge between surfaces (2026-05-24 Jaylin-Noel /
      // Adonai-Mitchell split, caused by Coach pricing only me+available
      // while the hub priced all rosters). The all-rosters pricing is
      // load-bearing for the startable-depth tier AND for the leaguewide
      // rank metric (opponents must be priced or "Lead X pts (100%)"
      // goes structural; founder report 2026-05-11). See priced-pool.ts.
      let valueMap: Awaited<
        ReturnType<typeof import("@/lib/players/values")["resolvePlayerValues"]>
      > | null = null;
      try {
        const priced = await buildPricedPool(snapshot);
        availablePlayers = priced.available;
        valueMap = priced.valueMap;
        playerValuesByIdJson = priced.playerValuesById;
        ktcOverallRanksByIdJson = priced.ktcOverallRanksById;
      } catch (err) {
        captureError(issues, "hub:priced-pool", err);
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
          const profileForDials = await readProfileServer().catch(
            () => null,
          );
          // Per-league override resolution. When the user has opted
          // into per-league tuning for this league, those dial values
          // overlay the global doctrine. Phase 2.4 wiring.
          const { effective: effectiveDials } = await loadEffectiveDials({
            userId: authUser?.id ?? null,
            leagueId,
            globalProfile: profileForDials,
          });
          decision = resolveStandingDecision({
            snap: snapshot,
            ranked: rankedArchetypes,
            available: availablePlayers,
            windows,
            picksUntilMe: pickApproach?.picks_until_me ?? 0,
            playerValues: playerValuesByIdJson,
            ktcOverallRanks: ktcOverallRanksByIdJson,
            dials: dialsForSynthesisFrom(effectiveDials),
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
  let rosterLaneMemberships: LaneMembership[] = [];
  let rosterLaneMoves: IdentityMove[] = [];
  let lastVisitDigestLine: string | null = null;
  let lastVisitDisruptionAck: string | null = null;
  let lastVisitPicksMadeTotal = 0;
  let lastVisitPicksMadeByUser = 0;
  let lastVisitStandingCallChanged = false;
  let lastVisitEvBankDelta: number | null = null;
  let lastVisitHasSnipes = false;
  let companionBeats: Beat[] = [];
  let companionLatestPick: { player_id: string; name: string } | null = null;
  let lastVisitPositionCountDeltas: Partial<Record<string, number>> = {};
  let lastVisitLeagueRankDelta: number | null = null;
  let rosterPosture: RosterPosture | null = null;
  let upcomingDraft: UpcomingDraftSummary | null = null;
  let classStrength: ClassStrength | null = null;
  let draftPathProjection: DraftPathProjection | null = null;
  let tradeOpportunities: TradeOpportunity[] = [];
  let suggestedPlays: Play[] = [];
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

      // Prior-season usage for the inflection workload-trend signal.
      // getSeasonStats is 24h-cached, so prev-season is a cache hit
      // (already fetched for the snapshot's talent score) and only the
      // season-before adds a warm-cache lookup.
      const inflPrevSeason = String(Number(leagueSnapshot.season) - 1);
      const inflPrevPrevSeason = String(Number(leagueSnapshot.season) - 2);
      const [inflPrevStats, inflPrevPrevStats] = await Promise.all([
        getSeasonStats(inflPrevSeason).catch(() => new Map()),
        getSeasonStats(inflPrevPrevSeason).catch(() => new Map()),
      ]);
      // Career mileage (RB cliff signal) only matters when the roster
      // holds an aging RB; gate the multi-season sum on that so other
      // rosters never pay the cold-start fetch.
      const careerUsage = rosterHasAgingRb(leagueSnapshot, playersMap)
        ? await getCareerUsage(leagueSnapshot.season).catch(() => undefined)
        : undefined;
      inflectionItems = buildInflectionsFromSnapshot({
        snap: leagueSnapshot,
        playersMap,
        prevSeasonStats: inflPrevStats,
        prevPrevSeasonStats: inflPrevPrevStats,
        careerUsage,
      });

      // Earned-role read for The Call cards. Built from the same /stats
      // maps via the canonical readOpportunity (one threshold, shared with
      // the inflection signal), only for the players on the board. A
      // rookie with no prior-season role yields null and shows no line,
      // which is itself the honest signal: a proven sophomore's earned
      // role is visible while incoming rookies are projection-only.
      if (decision) {
        const boardIds = new Set<string>(
          decision.quadrant_candidates.map((c) => c.player_id),
        );
        boardIds.add(decision.recommendation.player_id);
        for (const id of boardIds) {
          const read = readOpportunity({
            prev: buildOpportunityProfile(inflPrevStats.get(id)),
            prevPrev: buildOpportunityProfile(inflPrevPrevStats.get(id)),
          });
          if (read) opportunityById[id] = read;
        }
      }

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

      // Roster Posture + Upcoming Draft. Reads multi-year position
      // from current value rank + future pick capital + champion
      // history, plus the user's slot in the upcoming rookie draft +
      // visible traded picks. Both fire pre-draft / active-draft /
      // in-season; the posture banner adapts category, the draft
      // banner only renders when status === "pre_draft".
      try {
        const myRoster = leagueSnapshot.rosters.find((r) => r.is_me);
        if (myRoster) {
          // Inline value-rank fallback. analyzeDraftProgress fills
          // league_rank.numeric_value only when the player-value map
          // is populated AND the league's roster total values are
          // non-zero. Pre-rookie-draft dynasty leagues sometimes
          // present near-zero rosters which short-circuits that path,
          // leaving the posture classifier with null rank. Compute it
          // here so posture always has a tier to read.
          let valueRank = draftProgress?.league_rank.numeric_value ?? null;
          if (valueRank == null) {
            const totalsByRoster = new Map<number, number>();
            for (const r of leagueSnapshot.rosters) {
              let sum = 0;
              for (const id of r.player_ids ?? []) {
                const v = lrValueMap.get(id);
                if (v && typeof v.value === "number") sum += v.value;
              }
              totalsByRoster.set(r.roster_id, sum);
            }
            const ranked = [...totalsByRoster.entries()].sort(
              (a, b) => b[1] - a[1],
            );
            const idx = ranked.findIndex(([rid]) => rid === myRoster.roster_id);
            if (idx >= 0) valueRank = idx + 1;
          }

          let championHistory = null;
          if (sleeperUser?.user_id) {
            try {
              championHistory = await readChampionHistory({
                leagueId,
                userOwnerId: sleeperUser.user_id,
              });
            } catch (err) {
              console.error("[hub:champion-history]", err);
            }
          }
          // Active startup draft: rounds > 6 indicates a startup
          // rather than a rookie-only draft. Posture math fires on
          // degenerate near-zero rosters mid-startup (every team is
          // "12 of 12 by value" until the round completes), producing
          // false TANK classifications. Skip posture in this window;
          // it has no signal until the startup completes. Per founder
          // report 2026-05-18 pick 1.10 TANK false-positive.
          const isStartupDraft =
            (leagueSnapshot.draft.rounds ?? 0) > 6;
          const inActiveStartup =
            draftActive && isStartupDraft;
          rosterPosture = inActiveStartup
            ? null
            : classifyRosterPosture({
                snap: leagueSnapshot,
                myRosterId: myRoster.roster_id,
                myCurrentValueRank: valueRank,
                totalTeams: leagueSnapshot.total_teams,
                championHistory,
              });

          // Upcoming-draft summary. Only meaningful in pre-draft state
          // for now; we compute it always for cheap access by the
          // banner, but the renderer gates on draftState.status.
          upcomingDraft = summarizeUpcomingDraft({
            snap: leagueSnapshot,
            myRosterId: myRoster.roster_id,
          });

          // Class strength. Per-position rookie class multipliers
          // (RB strong, TE thin, etc.) derived from FantasyCalc's
          // top-N rookie pool per position. User can override per
          // league via the league_doctrines.class_strength jsonb.
          // Phase B 2026-05-19. Phase C path projector consumes this
          // to bias toward scarce positions during pick projection.
          try {
            let overrides:
              | Awaited<ReturnType<typeof readLeagueDoctrine>>
              | null = null;
            if (authUser?.id) {
              overrides = await readLeagueDoctrine(authUser.id, leagueId);
            }
            classStrength = await computeClassStrength({
              snap: leagueSnapshot,
              overrides: overrides?.class_strength ?? {},
            });
          } catch (err) {
            console.error("[hub:class-strength]", err);
          }

          // Draft Path Projection. Phase D 2026-05-19. Consumes class
          // strength + user dials + the user's next N owned slots to
          // produce 3-5 ranked positional sequences. Renders the
          // killer pre-draft + active-draft surface that lets the
          // user compare RB-WR-RB-WR-TE vs WR-WR-RB-RB-QB etc. side-
          // by-side.
          if (classStrength) {
            try {
              const profile = await readProfileServer().catch(() => null);
              const { effective: effectiveDials } = await loadEffectiveDials({
                userId: authUser?.id ?? null,
                leagueId,
                globalProfile: profile,
              });
              const numAsDial = (v: unknown): number =>
                typeof v === "number" ? v : 0;
              const whyDials = {
                youth: numAsDial(effectiveDials.youth_weight),
                bellcow: numAsDial(effectiveDials.bellcow_pref),
                continuity: numAsDial(effectiveDials.continuity_weight),
                horizon: numAsDial(effectiveDials.horizon),
                rookie: numAsDial(effectiveDials.rookie_tilt),
                risk: numAsDial(effectiveDials.risk_tolerance),
                consensus: numAsDial(effectiveDials.consensus_lean),
              };
              draftPathProjection = await projectDraftPaths({
                snap: leagueSnapshot,
                myRosterId: myRoster.roster_id,
                dials: whyDials,
                classStrength,
              });
            } catch (err) {
              console.error("[hub:draft-paths]", err);
            }
          }

          // Trade opportunities. Proactively scan for actionable
          // trades during active draft early-mid rounds. Per founder
          // direction 2026-05-19: platform should treat pick trades
          // as the meta, not the exception.
          if (
            upcomingDraft &&
            (draftState?.status === "drafting" ||
              draftState?.status === "paused")
          ) {
            try {
              const availableForOpps =
                await getAvailableForRequest(leagueSnapshot).catch(
                  () => [],
                );
              const valueLookup = (id: string): number | null => {
                const v = lrValueMap.get(id)?.value;
                return typeof v === "number" ? v : null;
              };
              tradeOpportunities = detectTradeOpportunities({
                snap: leagueSnapshot,
                myRosterId: myRoster.roster_id,
                upcomingDraft,
                available: availableForOpps,
                playerValueLookup: valueLookup,
              });

              // Plays the user could / should commit to based on
              // their current roster shape. Founder direction 2026-
              // 05-20: "Identify what they could/should be, help me
              // commit to them." Distinct from the per-pick
              // detectPlaysEnabledBy which only fires on the winner;
              // this scans the user's drafted players for archetype
              // triggers (anchor RB → handcuff suggestion, aging QB
              // → bridge suggestion, owned QB → stack suggestion).
              const ownedIdsSet = new Set<string>();
              for (const p of leagueSnapshot.draft.picks_made) {
                if (p.roster_id === myRoster.roster_id) {
                  ownedIdsSet.add(p.player_id);
                }
              }
              for (const id of myRoster.player_ids ?? []) {
                ownedIdsSet.add(id);
              }
              const ownedIds = Array.from(ownedIdsSet);
              if (ownedIds.length > 0) {
                const ownedResolved = await resolvePlayers(ownedIds);
                const ownedPlayers: OwnedRosterPlayer[] = [];
                for (const id of ownedIds) {
                  const sp = ownedResolved.get(id);
                  if (!sp) continue;
                  const pos = (sp.position ?? "").toUpperCase();
                  if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
                  ownedPlayers.push({
                    id,
                    name: sp.full_name ?? id,
                    position: pos as Position,
                    team: sp.team ?? null,
                    age: typeof sp.age === "number" ? sp.age : null,
                    is_rookie: (sp.years_exp ?? 99) === 0,
                    yearsExp: sp.years_exp ?? 0,
                  });
                }
                const ktcValuesForPlays: Record<string, number> = {};
                for (const [id, v] of lrValueMap.entries()) {
                  ktcValuesForPlays[id] = v.value;
                }
                suggestedPlays = [
                  ...suggestPlaysFromRoster({
                    snap: leagueSnapshot,
                    available: availableForOpps,
                    ktcValues: ktcValuesForPlays,
                    ownedPlayers,
                    survival: buildSurvivalResolver(
                      leagueSnapshot,
                      availableForOpps,
                    ),
                  }),
                  ...detectRosterShapePlays({
                    snap: leagueSnapshot,
                    ownedPlayers,
                    ktcValues: ktcValuesForPlays,
                  }),
                ];
              }
            } catch (err) {
              console.error("[hub:trade-opportunities]", err);
            }
          }
        }
      } catch (err) {
        console.error("[hub:posture]", err);
      }

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

      // Roster lane identity. Multi-attribute lane membership across
      // horizon + archetype + composite axes. Replaces the legacy
      // declared-window framing per 2026-05-11 founder direction.
      // Calibrated against a 58-roster cohort (scripts/build-cohort.ts).
      try {
        const me = leagueSnapshot.rosters.find((r) => r.is_me);
        if (me) {
          const lanePlayerLookup = (id: string): LanePlayerMeta | null => {
            const sp = playersMap.get(id);
            if (!sp) return null;
            const combined = [sp.first_name, sp.last_name]
              .filter(Boolean)
              .join(" ")
              .trim();
            const name = sp.full_name ?? combined ?? id;
            return {
              name,
              position: sp.position ?? null,
              team: sp.team ?? null,
              age: typeof sp.age === "number" ? sp.age : null,
              years_exp:
                typeof sp.years_exp === "number" ? sp.years_exp : null,
              is_rookie: sp.years_exp === 0,
              search_rank: sp.search_rank ?? 9999,
            };
          };
          rosterLaneMemberships = aggregateRosterIdentity({
            playerIds: me.player_ids,
            playerLookup: lanePlayerLookup,
            playerValueMap: lrValueMap,
            snap: leagueSnapshot,
          });
          // Identity moves: for each CLOSE lane, name the specific
          // opponent-rostered targets + the user's surplus that could
          // fund the trade. Persistent monitor surface.
          rosterLaneMoves = identityMoves({
            memberships: rosterLaneMemberships,
            myRosterId: me.roster_id,
            rosters: leagueSnapshot.rosters.map((r) => ({
              roster_id: r.roster_id,
              owner_name: r.owner_name,
              player_ids: r.player_ids,
              is_me: r.is_me,
            })),
            playerLookup: lanePlayerLookup,
            playerValueMap: lrValueMap,
            snap: leagueSnapshot,
          });
          // Fold build identity into the plays cornerstone: every build
          // the roster FITS or PARTLY FITS becomes a committable play,
          // CLOSE builds carrying the identity-move targets + funding.
          suggestedPlays = [
            ...suggestedPlays,
            ...detectLanePlays(rosterLaneMemberships, rosterLaneMoves),
          ];
        }
      } catch (err) {
        console.error("[hub:roster-lane-identity]", err);
      }

      // Last-visit digest + plan-disruption detection. Reads the
      // prior fingerprint cookie, computes the delta and the snipe
      // list, produces user-facing copy. Renders at the top of the
      // dashboard below the Ticker. Best-effort.
      try {
        const prior = await readLastVisit(leagueId);
        const myRoster = leagueSnapshot.rosters.find((r) => r.is_me);
        const delta = computeLastVisitDelta({
          prior,
          now: {
            timestamp_ms: Date.now(),
            total_picks_made: leagueSnapshot.draft.picks_made.length,
            standing_call_id: decision?.recommendation.player_id ?? null,
            ev_bank_total: draftProgress?.ev_bank?.total_ev ?? null,
            my_roster_size: myRoster?.player_ids.length ?? 0,
            my_position_counts: myRoster?.position_counts ?? undefined,
            my_league_rank:
              draftProgress?.league_rank.numeric_value ?? null,
          },
        });
        lastVisitDigestLine = composeDigestLine(delta);
        lastVisitPicksMadeTotal = delta.picks_made_total;
        lastVisitPicksMadeByUser = delta.picks_made_by_user;
        lastVisitStandingCallChanged = delta.standing_call_changed;
        lastVisitEvBankDelta = delta.ev_bank_delta;
        lastVisitPositionCountDeltas = delta.position_count_deltas;
        lastVisitLeagueRankDelta = delta.league_rank_delta;
        const disruption = detectPlanDisruption({
          prior,
          snap: leagueSnapshot,
          playerNameLookup,
        });
        lastVisitDisruptionAck = disruption.acknowledgment;
        lastVisitHasSnipes = disruption.snipes.length > 0;

        // Companion check-in beats (Principle 13). Grounded reactions to
        // what changed since the last visit. The debate beat fires when
        // the user took a pick that diverged from the call they last saw;
        // its whatIf is reconstructed with the same per-pick EV math the
        // EV bank uses (value/100 * (pick_no - ADP)). The milestone beat
        // comes from the league EV-bank rank. Snipe commiseration stays
        // in LastVisitDigest above to avoid double-rendering.
        const companionStage: BeatStage = draftActive
          ? "dynasty_draft"
          : draftState?.status === "complete"
            ? "in_season"
            : "pre_draft";
        // Pool-aware name resolver. A real divergence is
        // available-vs-available, so a rostered-only lookup (playersMap)
        // leaves a raw player id in the copy + Coach seed (the "13320"
        // leak, 2026-05-23). Resolve through the available pool and the
        // decision candidates too; unresolved ids suppress the beat.
        const availableById = new Map(
          availablePlayers.map((p) => [p.id, p]),
        );
        const companionResolveName = (
          id: string,
        ): { name: string; position: string | null } | null => {
          const info = playerNameLookup(id);
          if (info && info.name !== id) return info;
          const ap = availableById.get(id);
          if (ap?.name) return { name: ap.name, position: ap.position ?? null };
          const cand = decision?.top_candidates.find(
            (c) => c.player_id === id,
          );
          if (cand?.name)
            return { name: cand.name, position: cand.position ?? null };
          return null;
        };
        // Current decision candidates corroborate that the cookie call is
        // still a real alternative (re-points the beat at the new Decision
        // Board; filters stale / pre-refactor calls the user never faced).
        const currentCandidateIds = new Set<string>();
        if (decision) {
          currentCandidateIds.add(decision.recommendation.player_id);
          for (const c of decision.top_candidates) {
            currentCandidateIds.add(c.player_id);
          }
        }
        const debate = reconstructPickDebate({
          priorStandingCallId: prior?.standing_call_id ?? null,
          priorTotalPicksMade: prior?.total_picks_made ?? 0,
          myRosterId: leagueSnapshot.my_roster_id,
          picksMade: leagueSnapshot.draft.picks_made,
          currentCandidateIds,
          resolveName: companionResolveName,
          resolveValue: (id) => lrValueMap.get(id)?.value,
          resolveAdp: getAdp,
        });
        const companionWhatIf: WhatIfReadout | null = debate?.whatIf ?? null;
        const companionChosenId: string | null = debate?.chosenId ?? null;
        // Anticipation: the standing call's survival to the user's next
        // pick, grounded in the decision's canonical survival_pct. Fires
        // only when survival is uncertain (the classifier gates >= 75%).
        let companionAnticipation: AnticipationInput | null = null;
        const leadCandidate = decision?.top_candidates?.[0];
        const nextUserSlot = leagueSnapshot.draft.my_pick_schedule?.[0];
        if (
          draftActive &&
          leadCandidate &&
          leadCandidate.survival_pct != null &&
          nextUserSlot
        ) {
          companionAnticipation = {
            subject_label: leadCandidate.name,
            position: leadCandidate.position,
            survival_pct: leadCandidate.survival_pct,
            to_pick_no: nextUserSlot.pick_no,
            to_pick_label: nextUserSlot.pick_label,
            ev_if_chosen: null,
          };
        }
        // Companion play-reaction input: the user's most recent pick since
        // last visit (the client matches it against committed plays).
        if (prior) {
          const sincePrior = prior.total_picks_made ?? 0;
          const recentPick = leagueSnapshot.draft.picks_made
            .filter(
              (p) =>
                p.roster_id === leagueSnapshot.my_roster_id &&
                p.pick_no > sincePrior,
            )
            .sort((a, b) => b.pick_no - a.pick_no)[0];
          if (recentPick) {
            const info = companionResolveName(recentPick.player_id);
            if (info) {
              companionLatestPick = {
                player_id: recentPick.player_id,
                name: info.name,
              };
            }
          }
        }
        companionBeats = classifyBeats({
          stage: companionStage,
          whatIf: companionWhatIf,
          chosenId: companionChosenId,
          anticipation: companionAnticipation,
          evBank: leagueEvBank,
          draftProgress: {
            picks_made: leagueSnapshot.draft.picks_made.length,
            total_picks:
              leagueSnapshot.total_teams * (leagueSnapshot.draft.rounds ?? 0),
          },
        });
      } catch (err) {
        console.error("[hub:last-visit-digest]", err);
      }
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

          <LastVisitDigest
            digestLine={lastVisitDigestLine}
            disruptionAcknowledgment={lastVisitDisruptionAck}
          />

          <CompanionCheckIn
            beats={companionBeats}
            leagueId={leagueId}
            latestPick={companionLatestPick}
          />

          {rosterPosture && <PostureBanner posture={rosterPosture} />}

          {/* Pre-draft only: the Draft Position banner is the intended
              lead hero before the clock starts (no Call yet). Once the
              draft is live it moves into "How you're doing", where slot
              schedule + traded picks read as reference, not the headline
              the user scrolls past every refresh (founder, 2026-05-23).
              The EV bank at-a-glance read lives in the companion
              "Checkpoint" beat above; the standalone EvBankPercentileChip
              was the duplicate and is retired (one EV bank glance, not
              two). The deep per-pick EV bank stays in "How you're
              doing". */}
          {draftState?.status === "pre_draft" && upcomingDraft && (
            <DraftPositionBanner
              summary={upcomingDraft}
              ownerNameByRosterId={
                new Map(
                  leagueSnapshot?.rosters.map((r) => [
                    r.roster_id,
                    r.owner_name ?? `roster #${r.roster_id}`,
                  ]) ?? [],
                )
              }
            />
          )}

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
              {doctrineLine && (
                <div className="mt-2 flex flex-wrap items-baseline gap-2 text-xs">
                  <span className="font-mono uppercase tracking-[0.14em] text-muted-2">
                    Doctrine ·
                  </span>
                  <span className="font-mono uppercase tracking-[0.14em] text-foreground">
                    {doctrineLine}
                  </span>
                  {doctrineHasLeagueOverride && (
                    <span
                      className="rounded-sm border border-[color:#a78bfa]/60 bg-[color:#a78bfa]/10 px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:#a78bfa]"
                      title="Per-league override is active. Resets to global doctrine when disabled in the Rankings Lab."
                    >
                      league override
                    </span>
                  )}
                  {doctrineCalibratedCount != null && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                      {doctrineCalibratedCount} of 8 calibrated
                    </span>
                  )}
                  <Link
                    href={`/rankings?league=${encodeURIComponent(leagueId)}`}
                    className="font-mono uppercase tracking-[0.14em] text-accent hover:underline"
                  >
                    Tune →
                  </Link>
                </div>
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

          {driftSummary && (
            <div className="mt-6 rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-foreground">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-warning">
                    Doctrine drift detected
                  </span>
                  <p className="mt-1 leading-snug">{driftSummary}</p>
                </div>
                <Link
                  href="/rankings"
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:underline"
                >
                  Reconcile in the lab →
                </Link>
              </div>
            </div>
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
                    my_position_counts:
                      leagueSnapshot.rosters.find((r) => r.is_me)
                        ?.position_counts ?? undefined,
                    my_league_rank:
                      draftProgress?.league_rank.numeric_value ?? null,
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
                    // Per-lane state map. Powers the lane-state
                    // transition indicators on the next render
                    // ("Win-Now Floor: CLOSE -> IN").
                    lane_states: Object.fromEntries(
                      rosterLaneMemberships.map((m) => [m.lane_id, m.state]),
                    ),
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
                  focused more on trades, opportunities, etc."

                  Order updated 2026-05-19 per founder direction: The
                  Call leads the active-draft hub. It is the highest-
                  signal panel and was buried below run-watch, class-
                  strength, path projector, and trade opportunities.
                  Those supporting panels still render, but below the
                  primary call. */}

              {/* SECTION: The Call (active draft only). Leads the
                  active-draft hub. */}
              {/* The Call is now one timing feed: the committed plays
                  + suggestions are folded into its WAIT room (the old
                  standalone Active Plays panel was retired here
                  2026-05-21), so commitments live right under the call
                  instead of far down the page. */}
              {draftActive && decision && (
                <div className="mb-8">
                  <TheCall
                    decision={decision}
                    leagueId={leagueId}
                    currentPickNo={leagueSnapshot?.draft.next_pick_no ?? null}
                    opportunityById={opportunityById}
                    suggestedPlays={suggestedPlays}
                    picksMadeForUser={(() => {
                      if (!leagueSnapshot || !myRoster) return [];
                      return leagueSnapshot.draft.picks_made
                        .filter((p) => p.roster_id === myRoster.roster_id)
                        .map((p) => ({
                          player_id: p.player_id,
                          pick_no: p.pick_no,
                        }));
                    })()}
                  />
                </div>
              )}

              {/* BUILD FIT. Moved here (right below The Call) 2026-05-22
                  per founder: the roster-shape benchmark is the strategic
                  frame for trade leverage and belongs near the decision,
                  not buried in Your team. Renders whenever the roster has
                  lane memberships (all stages), not just active draft. */}
              {rosterLaneMemberships.length > 0 && (
                <div className="mb-8">
                  <LaneCohortDistribution memberships={rosterLaneMemberships} />
                </div>
              )}

              {/* Position Run Watch. Renders during active draft so
                  the user reads the position-run signal BEFORE making
                  their first pick. The DraftProgressPanel surfaces the
                  same data inside its "Watch the board" sub-section,
                  but that whole panel is gated behind
                  picks_made_by_user > 0 and is invisible at the user's
                  first-pick moment. Per founder report 2026-05-18 pick
                  1.10: the WR run that drove the question wasn't
                  surfaced anywhere. */}
              {draftActive &&
                leagueSnapshot &&
                leagueSnapshot.draft.picks_made.length > 0 && (
                  <PositionRunWatch
                    picksMade={leagueSnapshot.draft.picks_made}
                    totalTeams={leagueSnapshot.total_teams}
                    myNextPickNo={
                      leagueSnapshot.draft.my_pick_schedule[0]?.pick_no ??
                      leagueSnapshot.draft.next_pick_no ??
                      null
                    }
                  />
                )}

              {/* Class Strength Chip. Visible pre-draft AND active-
                  draft (the rookie-class shape is fixed for the year
                  regardless of draft state). User can override per
                  league when signed in. Phase B 2026-05-19. */}
              {classStrength &&
                (draftState?.status === "pre_draft" || draftActive) && (
                  <ClassStrengthChip
                    classStrength={classStrength}
                    leagueId={leagueId}
                    canEdit={authUser != null}
                  />
                )}

              {/* Draft Path Projector (pre-draft only). During an
                  active draft this is folded into the Decision Board's
                  "By path" angle inside The Call (2026-05-21), so the
                  standalone render is now scoped to pre-draft, where
                  there is no Decision Board yet. */}
              {draftPathProjection &&
                draftPathProjection.paths.length > 0 &&
                draftState?.status === "pre_draft" && (
                  <DraftPathProjector projection={draftPathProjection} />
                )}

              {/* Trade Opportunities. Proactive trade scout during
                  active-draft early-mid rounds. Surfaces 1-3 named
                  partners + value math + draft messages. Founder
                  direction 2026-05-19: treat pick trading as the
                  meta. */}
              {tradeOpportunities.length > 0 && draftActive && (
                <TradeOpportunitiesPanel
                  opportunities={tradeOpportunities}
                />
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
                  position diagnostic have nothing to say). The EV
                  bank's per-pick bars (mine) lead; league
                  comparison is a collapsible expander attached to
                  the same widget. Founder feedback 2026-05-08:
                  "showing me mine and then expanding to theirs would
                  be the obvious thing to do." */}
              {(draftActive || draftState?.status === "complete") && (
                <DashboardSection
                  label="How you're doing"
                  title="Your bank, your fits, your sharp positioning"
                  tagline="Per-pick EV breakdown + position fits + sharp positioning. Tap inside the EV bank to compare to your league."
                  defaultOpen={true}
                  hasChanges={
                    lastVisitPicksMadeTotal > 0 ||
                    (lastVisitEvBankDelta != null &&
                      Math.abs(lastVisitEvBankDelta) >= 0.5)
                  }
                  changeHint={(() => {
                    const parts: string[] = [];
                    if (lastVisitPicksMadeTotal > 0) {
                      parts.push(
                        `${lastVisitPicksMadeTotal} new pick${lastVisitPicksMadeTotal === 1 ? "" : "s"}`,
                      );
                    }
                    if (
                      lastVisitEvBankDelta != null &&
                      Math.abs(lastVisitEvBankDelta) >= 0.5
                    ) {
                      const sign = lastVisitEvBankDelta >= 0 ? "+" : "";
                      parts.push(
                        `EV ${sign}${lastVisitEvBankDelta.toFixed(1)}`,
                      );
                    }
                    return parts.join(" · ") || undefined;
                  })()}
                >
                  {draftProgress && (
                    <DraftProgressPanel
                      data={draftProgress}
                      leagueBank={leagueEvBank}
                      evBankDelta={lastVisitEvBankDelta}
                      positionCountDeltas={lastVisitPositionCountDeltas}
                      leagueRankDelta={lastVisitLeagueRankDelta}
                      leagueName={league?.name ?? null}
                    />
                  )}
                  {/* Draft Position lives here during an active draft:
                      slot schedule + traded picks are reference the user
                      consults occasionally, not the headline they scroll
                      past every refresh (founder, 2026-05-23). Pre-draft
                      keeps it as the lead hero at the top of the hub. */}
                  {draftActive && upcomingDraft && (
                    <DraftPositionBanner
                      summary={upcomingDraft}
                      ownerNameByRosterId={
                        new Map(
                          leagueSnapshot?.rosters.map((r) => [
                            r.roster_id,
                            r.owner_name ?? `roster #${r.roster_id}`,
                          ]) ?? [],
                        )
                      }
                    />
                  )}
                </DashboardSection>
              )}

              {/* "Your team" and "The league" are siblings. For in-
                  season leagues (no active draft AND draft already
                  complete) we render The League FIRST because trade
                  leverage IS the activity. For pre-draft / active-
                  draft we keep Your Team first. Per founder feedback
                  2026-05-15: surface standings higher in-season. */}
              {(() => {
                const inSeasonLayout =
                  !draftActive && draftState?.status === "complete";
                const yourTeamSection = (
                  <DashboardSection
                    key="your-team"
                    label="Your team"
                    title="Who you're building"
                    tagline="Identity, comparator, risk fingerprint, contender outlook."
                    defaultOpen={!draftActive}
                    hasChanges={lastVisitPicksMadeByUser > 0}
                    changeHint={
                      lastVisitPicksMadeByUser > 0
                        ? `${lastVisitPicksMadeByUser} pick${lastVisitPicksMadeByUser === 1 ? "" : "s"} added since you were last here`
                        : undefined
                    }
                  >
                    {teamIdentity && <TeamIdentityPanel data={teamIdentity} />}
                    {rosterPosture &&
                      Object.keys(rosterPosture.future_capital.by_season)
                        .length > 0 && (
                        <FuturePickCabinet
                          capital={rosterPosture.future_capital}
                        />
                      )}
                    {inflectionItems.length > 0 && (
                      <InflectionPanel items={inflectionItems} />
                    )}
                    {contenderOutlook && (
                      <ContenderOutlookCard outlook={contenderOutlook} />
                    )}
                  </DashboardSection>
                );
                const theLeagueSection =
                  leagueRead ||
                  leagueOutlook ||
                  opponentCharacterizations.length > 0 ||
                  pathCompetition ? (
                    <DashboardSection
                      key="the-league"
                      label="The league"
                      title={
                        inSeasonLayout
                          ? "Who is the team to beat?"
                          : "Trade leverage and opponent reads"
                      }
                      tagline={
                        inSeasonLayout
                          ? "League standings, trade leverage, opponent reads."
                          : "Where the soft spots are, who needs what, what to send."
                      }
                      defaultOpen={!draftActive}
                      emphasize={inSeasonLayout}
                      hasChanges={
                        lastVisitPicksMadeTotal > 0 || lastVisitHasSnipes
                      }
                      changeHint={
                        lastVisitHasSnipes
                          ? "Plan target sniped since last visit"
                          : lastVisitPicksMadeTotal > 0
                            ? `${lastVisitPicksMadeTotal} league picks since last visit`
                            : undefined
                      }
                    >
                      {/* In-season: lead with standings so the table to
                          beat is the first thing the user sees. */}
                      {inSeasonLayout && leagueOutlook && leagueSnapshot && (
                        <>
                          <LeagueDivergence outlook={leagueOutlook} />
                          <LeagueTable outlook={leagueOutlook} />
                        </>
                      )}
                      {leagueRead && draftState?.status !== "pre_draft" && (
                        <TradeStrategyPanel data={leagueRead} />
                      )}
                      {opponentCharacterizations.length > 0 &&
                        draftState?.status !== "pre_draft" && (
                          <OpponentCharacterizations
                            items={opponentCharacterizations}
                            leagueId={leagueId}
                            notesByRoster={opponentNotesByRoster}
                            tradeHistoryByRoster={opponentTradeHistoryByRoster}
                            canWriteNotes={authUser != null}
                          />
                        )}
                      {pathCompetition && draftState?.status !== "pre_draft" && (
                        <SamePathThreatsCard competition={pathCompetition} />
                      )}
                      {/* Off-season / non-in-season layout retains the
                          original section order (SWOT > divergence >
                          table) under the trade-leverage framing.
                          Suppress entirely in pre_draft state: SWOT
                          fires "0 on roster" reads, LeagueDivergence /
                          LeagueTable shows identical 38/35 for every
                          team because nobody's rookie-drafted yet, and
                          opponent characterizations are uniformly
                          "BALANCED · EARLY · 15%". Pre-draft uses the
                          DraftPositionBanner + path projector instead. */}
                      {!inSeasonLayout &&
                        draftState?.status !== "pre_draft" &&
                        leagueOutlook &&
                        leagueSnapshot && (
                          <>
                            <SwotCard
                              swot={computeSwot(leagueSnapshot, leagueOutlook)}
                            />
                            <LeagueDivergence outlook={leagueOutlook} />
                            <LeagueTable outlook={leagueOutlook} />
                          </>
                        )}
                      {inSeasonLayout &&
                        leagueOutlook &&
                        leagueSnapshot && (
                          <SwotCard
                            swot={computeSwot(leagueSnapshot, leagueOutlook)}
                          />
                        )}
                      {draftState?.status === "pre_draft" && (
                        <div className="rounded-md border border-border-soft bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
                          League-shape surfaces (SWOT, standings,
                          opponent reads) start firing once the rookie
                          draft differentiates rosters. Until then your
                          draft position and projected sequence carry
                          the read.
                        </div>
                      )}
                    </DashboardSection>
                  ) : null;
                return inSeasonLayout ? (
                  <>
                    {theLeagueSection}
                    {yourTeamSection}
                  </>
                ) : (
                  <>
                    {yourTeamSection}
                    {theLeagueSection}
                  </>
                );
              })()}

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

            {/* Coach column: sticky on desktop, inline on mobile.
                Anonymous visitors see a sign-in card instead of the
                chat. Coach uses paid LLM calls, persists history per
                user, and references account-bound doctrine; surfacing
                it for unauth visitors would either fail at the API or
                leak partial state across sessions. */}
            {sleeperUser && (
              <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
                {authUser ? (
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
                ) : (
                  <div className="flex h-full flex-col justify-between rounded-lg border border-border-strong bg-surface p-5">
                    <div>
                      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                        Coach
                      </div>
                      <h2 className="mt-2 text-lg font-semibold text-foreground">
                        Sign in to use Coach.
                      </h2>
                      <p className="mt-2 text-sm leading-snug text-muted">
                        Coach reads your full named roster, references
                        your tuned doctrine, and remembers conversations
                        across devices. Sign in once; pick up the
                        thread anywhere.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/login?next=/leagues/${leagueId}${cleanedUsername ? `?username=${encodeURIComponent(cleanedUsername)}` : ""}`}
                        className="rounded-md bg-accent px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-black transition hover:brightness-110"
                      >
                        Sign in →
                      </Link>
                      <Link
                        href="/rankings"
                        className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
                      >
                        Explore the model →
                      </Link>
                    </div>
                  </div>
                )}
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
