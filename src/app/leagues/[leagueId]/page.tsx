import Link from "next/link";
import { notFound } from "next/navigation";

// Live-draft app. Never cache the route segment: a cached SSR response
// can persist a half-round-stale snapshot for minutes, which makes the
// "picks until you" count and Draft Watch unreliable.
export const dynamic = "force-dynamic";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import {
  getLeague,
  getLeagueUsers,
  getNflState,
  getRosters,
  getUserByUsername,
} from "@/lib/sleeper";
import { resolveDraftState, type DraftStatus } from "@/lib/sleeper/draft-state";
import { buildLeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import { LiveStrategyBoard } from "@/components/league/live-strategy-board";
import { LeaguePulse } from "@/components/league/league-pulse";
import { generatePulse, type Pulse } from "@/lib/strategy/pulse";
import { computeWindows, type WindowsResult } from "@/lib/strategy/windows/compute";
import { selectPlaysFromHere } from "@/lib/strategy/plays-from-here/select";
import { enrichPlaysFromHere } from "@/lib/strategy/plays-from-here/enrich";
import type { ResolvedPlayFromHere } from "@/lib/strategy/plays-from-here/types";
import { buildPickApproach } from "@/lib/strategy/pick-approach/predict";
import type { PickApproach as PickApproachData } from "@/lib/strategy/pick-approach/types";
import {
  enrichPickApproachWithCandidates,
  enrichRankedWithCandidates,
  getAvailableForRequest,
} from "@/lib/strategy/player-suggestions/enrich";
import { enrichArchetypeWithTargets } from "@/lib/strategy/player-suggestions/play-targets";
import { WindowsBar } from "@/components/league/windows-bar";
import { WindowWeightingPrompt } from "@/components/league/window-weighting-prompt";
import { PlaysFromHere } from "@/components/league/plays-from-here";
import { PickApproach } from "@/components/league/pick-approach";
import { StrategicForks } from "@/components/league/strategic-forks";
import { detectVanillaWarning, type VanillaWarning } from "@/lib/strategy/vanilla-warning/detect";
import { VanillaWarningPanel } from "@/components/league/vanilla-warning";
import { buildOpponentReadout, type OpponentReadout } from "@/lib/strategy/opponents/observe";
import { OpponentObservations } from "@/components/league/opponent-observations";
import { OpponentCharacterizations } from "@/components/league/opponent-characterizations";
import { buildOpponentCharacterizations } from "@/lib/strategy/opponents/characterize";
import type { OpponentCharacterization } from "@/lib/strategy/opponents/characterize";
import { BriefingFeed } from "@/components/league/briefing-feed";
import type { RankedArchetype } from "@/lib/strategy/archetypes/schema";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string; season?: string }>;
};

export default async function LeagueHubPage({
  params,
  searchParams,
}: PageProps) {
  const { leagueId } = await params;
  const { username = "", season: seasonParam } = await searchParams;

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

  // Draft state: tolerant of failure, banner is supplemental
  let draftState: Awaited<ReturnType<typeof resolveDraftState>> | null = null;
  try {
    draftState = await resolveDraftState(leagueId, sleeperUser?.user_id ?? null);
  } catch (err) {
    console.error("[hub:draft-state]", err);
  }
  const draftActive =
    draftState?.status === "drafting" || draftState?.status === "paused";

  // Live strategy board + League pulse: both consume the same snapshot.
  // Tolerant of failure. UI degrades to empty state if snapshot can't
  // build (e.g. Sleeper outage or player cache failure).
  let rankedArchetypes: RankedArchetype[] = [];
  let pulse: Pulse[] = [];
  let windows: WindowsResult | null = null;
  let playsFromHere: ResolvedPlayFromHere[] = [];
  let pickApproach: PickApproachData | null = null;
  let vanillaWarning: VanillaWarning | null = null;
  let opponentReadout: OpponentReadout | null = null;
  let opponentCharacterizations: OpponentCharacterization[] = [];
  let availablePlayers: Awaited<
    ReturnType<typeof getAvailableForRequest>
  > = [];
  let leagueSnapshot:
    | Awaited<ReturnType<typeof buildLeagueSnapshot>>
    | null = null;
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
      pulse = generatePulse(snapshot);
      windows = computeWindows(snapshot);
      playsFromHere = selectPlaysFromHere(snapshot);
      vanillaWarning = detectVanillaWarning(snapshot, rankedArchetypes);
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
    } catch (err) {
      console.error("[hub:strategy-rank]", err);
    }
  }

  // Derive standing if we have my roster + records on all rosters.
  const standing = myRoster ? calcStanding(rosters, myRoster.roster_id) : null;
  const season = seasonParam ?? league.season;

  // Hub action grid. Pruned to workflows that aren't covered above:
  // incoming trade evaluation, outbound trade construction, and the
  // freeform coach chat. "I'm on the clock" deep-LLM form moved to an
  // inline link near Strategic Forks; "What's my strategy?" snapshot
  // is the always-visible Live Strategy Board + Forks panels.
  const actions = [
    {
      href: `/leagues/${leagueId}/trade${qs({ username: cleanedUsername, season })}`,
      label: "I have a trade",
      sub: "Incoming trade decision",
      ring: "foreground",
    },
    {
      href: `/leagues/${leagueId}/trade?mode=outbound${qsTail({
        username: cleanedUsername,
        season,
      })}`,
      label: "I want to make a trade",
      sub: "Attack a target",
      ring: "foreground",
    },
    {
      href: `/leagues/${leagueId}/coach${qs({ username: cleanedUsername, season })}`,
      label: "Talk it through",
      sub: "Debate picks, ask for advice",
      ring: "accent",
    },
  ] as const;
  const onClockHref = `/leagues/${leagueId}/pick${qs({ username: cleanedUsername, season })}`;

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
          <Ticker
            label={`League · ${league.season}${nflState?.week ? ` · Week ${nflState.week}` : ""}`}
          />

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {league.name}
              </h1>
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
              </div>
            </div>

            {!cleanedUsername && (
              <UsernamePrompt leagueId={leagueId} season={season} />
            )}
          </div>

          {draftActive && draftState && (
            <DraftBanner state={draftState} />
          )}

          {sleeperUser && <WindowWeightingPrompt leagueId={leagueId} />}

          {windows && sleeperUser && (
            <WindowsBar leagueId={leagueId} windows={windows} />
          )}

          <LeaguePulse pulse={pulse} />

          {vanillaWarning && <VanillaWarningPanel warning={vanillaWarning} />}

          {pickApproach && <PickApproach approach={pickApproach} />}

          <StrategicForks
            ranked={rankedArchetypes}
            available={availablePlayers}
            snapshot={leagueSnapshot}
            myPickLabel={pickApproach?.my_pick_label ?? null}
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

          {opponentReadout && (
            <OpponentObservations readout={opponentReadout} />
          )}

          {sleeperUser && (
            <BriefingFeed leagueId={leagueId} username={cleanedUsername} />
          )}

          <section className="mt-12">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-2">
              What do you want help with?
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {actions.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className="group flex items-start justify-between rounded-lg border border-border-strong bg-surface p-5 transition hover:border-accent/60"
                >
                  <div>
                    <div className="text-base font-semibold text-foreground">
                      {a.label}
                    </div>
                    <div className="mt-1 text-sm text-muted">{a.sub}</div>
                  </div>
                  <span className="font-mono text-xs text-accent opacity-0 transition group-hover:opacity-100">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>
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
            ? `You're on the clock · pick ${state.next_pick_label}`
            : state.next_pick_label && state.on_the_clock.owner_name
              ? `Pick ${state.next_pick_label} · ${state.on_the_clock.owner_name}`
              : "Draft live · waiting on the next pick"}
          {!onClock &&
            state.my_next_pick_label &&
            state.picks_until_me != null && (
              <span className="text-muted-2">
                {" · "}your next: {state.my_next_pick_label} (
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
