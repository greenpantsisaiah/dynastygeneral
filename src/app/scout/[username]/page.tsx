/**
 * Scout report. Public, no auth. Pulls a Sleeper user's dynasty teams,
 * scores each one (using the same archetype/window engine that powers
 * the active league hub), ranks worst-to-best, and streams an LLM
 * verdict that confirms or contradicts an optional claim.
 *
 * Examples:
 *   /scout/BradyH20
 *   /scout/BradyH20?claim=this+is+the+worst+team+I+have+ever+drafted
 *   /scout/BradyH20?claim=...&claim_league=1234567890
 *   /scout/BradyH20?season=2026
 *
 * Streaming: the page lands immediately with deterministic data
 * (scores, archetype lean, windows, superlatives). The verdict block
 * is wrapped in Suspense and fills in when the LLM call returns.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { TrackEvent } from "@/components/track-event";
import { Ticker } from "@/components/ui/ticker";
import { ShareButton } from "@/components/share/share-button";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/ratelimit";
import { checkBudget } from "@/lib/budget";
import {
  getLeaguesForUser,
  getNflState,
  getRosters,
  getUserByUsername,
  getLeagueUsers,
  isDynastyLeague,
  type SleeperLeague,
  type SleeperRoster,
  type SleeperLeagueUser,
} from "@/lib/sleeper";
import {
  computeSuperlatives,
  scoreTeamForLeague,
  type ScoutTeamScore,
} from "@/lib/scout/score";
import { generateScoutVerdict } from "@/lib/scout/verdict";
import { resolveDraftState } from "@/lib/sleeper/draft-state";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const name = decodeURIComponent(username).trim().replace(/^@/, "");
  return {
    title: `Scout: ${name}`,
    description: `Dynasty scout report for Sleeper manager ${name}. Roster grades, team archetypes, championship windows, and AI verdict.`,
    robots: { index: false, follow: false },
  };
}

type PageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{
    claim?: string;
    claim_league?: string;
    season?: string;
  }>;
};

function ownerNameFromUsers(
  users: SleeperLeagueUser[],
  ownerId: string | null,
): string | null {
  if (!ownerId) return null;
  const u = users.find((x) => x.user_id === ownerId);
  if (!u) return null;
  const meta = (u.metadata ?? {}) as Record<string, unknown>;
  return (
    (typeof meta.team_name === "string" && meta.team_name) ||
    u.display_name ||
    `User ${u.user_id}`
  );
}

export default async function ScoutPage({ params, searchParams }: PageProps) {
  const { username } = await params;
  const { claim: rawClaim, claim_league, season } = await searchParams;
  // Cap claim at 500 chars BEFORE it reaches any LLM-bound code path.
  // Scout is unauthenticated and an unbounded claim is a token-inflation
  // amplifier (per dynasty-security-auditor 2026-04-25). The 500-char
  // limit is enough for a real user opinion and short of any meaningful
  // prompt-injection or token-burn attack.
  const claim =
    typeof rawClaim === "string" && rawClaim.length > 0
      ? rawClaim.slice(0, 500)
      : undefined;
  const cleaned = decodeURIComponent(username).trim().replace(/^@/, "");
  if (!cleaned) notFound();

  // Rate limit + budget gate. Scout is a public, force-dynamic page that
  // calls Sonnet with 4000-token output. Pre-audit (cost-watcher 2026-04-22)
  // it had no protection at all (single-IP exposure: $1,558-$7,793/day).
  // Gate at the page level so an over-limit caller gets a clear message
  // instead of the page silently blowing the daily budget.
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  const rate = await checkRateLimit("scout", ip);
  if (!rate.allowed) {
    return (
      <ScoutShell username={cleaned}>
        <p className="mt-6 text-muted">
          You've hit the scout rate limit ({rate.limit} per window). Try
          again in {Math.ceil(rate.reset_ms / 1000)}s.
        </p>
      </ScoutShell>
    );
  }
  // Per-IP daily ceiling. Second layer above the per-window rate.
  // Stops a determined bot from saturating the global budget cap on
  // scout alone (per cost-watcher 2026-04-25).
  const daily = await checkRateLimit("scout-daily", ip);
  if (!daily.allowed) {
    return (
      <ScoutShell username={cleaned}>
        <p className="mt-6 text-muted">
          Daily scout limit reached on this network ({daily.limit} per
          day). The cap resets in {Math.ceil(daily.reset_ms / 3600000)}{" "}
          hours.
        </p>
      </ScoutShell>
    );
  }
  const budget = await checkBudget();
  if (!budget.allowed) {
    return (
      <ScoutShell username={cleaned}>
        <p className="mt-6 text-muted">
          Daily scout capacity reached. Try again tomorrow.
        </p>
      </ScoutShell>
    );
  }

  const sleeperUser = await getUserByUsername(cleaned).catch(() => null);
  if (!sleeperUser) {
    return (
      <ScoutShell username={cleaned}>
        <p className="mt-6 text-muted">
          No Sleeper account matches &quot;{cleaned}&quot;. Check the spelling.
        </p>
      </ScoutShell>
    );
  }

  const resolvedSeason =
    season ??
    (await getNflState().catch(() => null))?.season ??
    String(new Date().getFullYear());

  const allLeagues = await getLeaguesForUser(
    sleeperUser.user_id,
    resolvedSeason,
  ).catch(() => [] as SleeperLeague[]);
  const leagues = allLeagues.filter(isDynastyLeague);

  if (leagues.length === 0) {
    return (
      <ScoutShell
        username={cleaned}
        displayName={sleeperUser.display_name ?? cleaned}
        season={resolvedSeason}
      >
        <p className="mt-6 text-muted">
          No dynasty leagues for {sleeperUser.display_name ?? cleaned} in{" "}
          {resolvedSeason}.
        </p>
      </ScoutShell>
    );
  }

  // Score every dynasty team in parallel. Each call now also runs the
  // snapshot/rank/windows pipeline so we have archetype lean + win-now
  // + future scores per team. Player cache is shared across calls.
  const scored = await Promise.all(
    leagues.map(async (league): Promise<ScoutTeamScore | null> => {
      try {
        // resolveDraftState is required for active drafts because Sleeper
        // returns roster.players === null until the draft completes; the
        // picks live on draftState.picks_so_far. scoreTeamForLeague unions
        // them with roster.players so build_phase + strategy reflect what
        // the team actually owns right now.
        const [rosters, users, draftState] = await Promise.all([
          getRosters(league.league_id),
          getLeagueUsers(league.league_id),
          resolveDraftState(league.league_id, sleeperUser.user_id).catch(
            () => null,
          ),
        ]);
        const myRoster = rosters.find(
          (r: SleeperRoster) => r.owner_id === sleeperUser.user_id,
        );
        if (!myRoster) return null;
        const ownerName =
          ownerNameFromUsers(users, myRoster.owner_id) ??
          sleeperUser.display_name ??
          cleaned;
        return await scoreTeamForLeague({
          league,
          roster: myRoster,
          rosters,
          users,
          mySleeperUserId: sleeperUser.user_id,
          ownerName,
          teamName: ownerName,
          draftState,
        });
      } catch (err) {
        console.error("[scout:score-team]", league.league_id, err);
        return null;
      }
    }),
  );
  const teams = scored.filter((t): t is ScoutTeamScore => t !== null);

  // Cross-portfolio "best in class" badges. Mutates teams in place.
  computeSuperlatives(teams);

  // One unified ranking. Drafting teams are still readable via the
  // strategy pipeline (the same engine that powers the active hub
  // handles thin rosters), so we no longer segregate them. Truly empty
  // rosters sort last; everything else ranks worst-to-best by composite.
  const ranked = [...teams].sort((a, b) => {
    if (a.build_phase === "empty" && b.build_phase !== "empty") return 1;
    if (b.build_phase === "empty" && a.build_phase !== "empty") return -1;
    return a.composite_score - b.composite_score;
  });

  return (
    <ScoutShell
      username={cleaned}
      displayName={sleeperUser.display_name ?? cleaned}
      season={resolvedSeason}
    >
      <TrackEvent
        payload={{ event: "scout_report_run", scouted_username: cleaned }}
      />
      {claim && (
        <div className="mt-6 rounded-md border border-border-soft bg-surface px-4 py-3 text-sm text-muted">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            Claim ·{" "}
          </span>
          <span className="text-foreground italic">
            &quot;{decodeURIComponent(claim)}&quot;
          </span>
        </div>
      )}

      <Suspense fallback={<VerdictSkeleton />}>
        <VerdictBlock
          username={cleaned}
          claim={claim ? decodeURIComponent(claim) : null}
          claim_target_league_id={claim_league ?? null}
          teams={ranked}
        />
      </Suspense>

      {ranked.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              Teams · worst to best
            </h3>
            <span className="font-mono text-[11px] text-muted-2">
              {ranked.length} {ranked.length === 1 ? "team" : "teams"}
            </span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {ranked.map((team, i) => (
              <ScoutCard key={team.league_id} rank={i + 1} team={team} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
        Scout reports by Dynasty General ·{" "}
        <Link href="/connect" className="text-accent hover:underline">
          run yours →
        </Link>
      </p>
    </ScoutShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// Verdict block. Async server component inside <Suspense> so the page
// streams: deterministic content lands immediately, this fills in when
// the LLM call returns.
// ──────────────────────────────────────────────────────────────────

async function VerdictBlock({
  username,
  claim,
  claim_target_league_id,
  teams,
}: {
  username: string;
  claim: string | null;
  claim_target_league_id: string | null;
  teams: ScoutTeamScore[];
}) {
  const verdict = await generateScoutVerdict({
    username,
    claim,
    claim_target_league_id,
    teams,
  });

  return (
    <section className="mt-6 rounded-lg border-2 border-accent/60 bg-accent/5 px-5 py-5">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Verdict
      </div>
      <h2 className="mt-1 text-2xl font-semibold text-foreground">
        {verdict.headline}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">{verdict.body}</p>

      {Object.keys(verdict.per_team).length > 0 && (
        <div className="mt-4 border-t border-accent/20 pt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            Per team
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {teams.map((t) => {
              const line = verdict.per_team[t.league_id];
              if (!line) return null;
              return (
                <li
                  key={t.league_id}
                  className="flex items-baseline gap-2 text-foreground"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 shrink-0">
                    {t.league_name}
                  </span>
                  <span className="text-muted">·</span>
                  <span className="text-foreground">{line}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {verdict.stub && (
        <div className="mt-3 rounded-md border border-border-soft bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Verdict offline · scores below are still live
        </div>
      )}
    </section>
  );
}

function VerdictSkeleton() {
  return (
    <section className="mt-6 rounded-lg border-2 border-accent/60 bg-accent/5 px-5 py-5">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Verdict
      </div>
      <div className="mt-2 h-7 w-2/3 animate-pulse rounded bg-foreground/10" />
      <div className="mt-3 space-y-1.5">
        <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
        <div className="h-4 w-11/12 animate-pulse rounded bg-foreground/10" />
        <div className="h-4 w-9/12 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        Analyst team writing the call...
      </div>
    </section>
  );
}

function ScoutShell({
  username,
  displayName,
  season,
  children,
}: {
  username: string;
  displayName?: string;
  season?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <Ticker label="Scout report · public · shareable" />
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Scouting @{displayName ?? username}
            </h1>
            <div className="flex items-center gap-2">
              {season && (
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">
                  Season {season}
                </span>
              )}
              <ShareButton
                title={`Scout report on @${displayName ?? username}`}
                text={`Dynasty General just scouted @${displayName ?? username}'s portfolio. Take a look:`}
              />
            </div>
          </div>
          {children}
        </div>
      </main>
    </>
  );
}

const COHERENCE_TONE: Record<string, string> = {
  high: "text-success",
  medium: "text-foreground",
  low: "text-muted-2",
  none: "text-muted-2",
};

const HORIZON_LABEL: Record<string, string> = {
  win_now: "Win-now",
  future: "Future",
  balanced: "Balanced",
};

function ScoutCard({ rank, team }: { rank: number; team: ScoutTeamScore }) {
  const isEmpty = team.build_phase === "empty";
  const isDrafting = team.build_phase === "drafting";
  const tone = isEmpty
    ? "border-dashed border-border-strong bg-surface/50"
    : rank === 1
      ? "border-danger/60 bg-danger/5"
      : "border-border-strong bg-surface";
  const rankLabel = isEmpty
    ? "EMPTY"
    : isDrafting
      ? "DRAFTING"
      : rank === 1
        ? "WORST"
        : rank === 2
          ? "2ND WORST"
          : `#${rank}`;
  const rankTone = isEmpty
    ? "text-muted-2"
    : isDrafting
      ? "text-accent"
      : rank === 1
        ? "text-danger"
        : "text-muted-2";

  return (
    <div className={`flex flex-col rounded-lg border ${tone} px-4 py-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.18em] ${rankTone}`}
        >
          {rankLabel} · {team.league_format.toUpperCase()}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {isEmpty
            ? `${team.roster_size} players`
            : isDrafting
              ? `${team.roster_size} picks · score ${Math.round(team.composite_score)}`
              : `score ${Math.round(team.composite_score)}`}
        </span>
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">
        {team.league_name}
      </div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        {team.season} · {team.total_rosters} teams · {team.status ?? "?"}
        {team.record &&
          ` · ${team.record.wins}-${team.record.losses}${team.record.ties ? `-${team.record.ties}` : ""}`}
      </div>

      {team.superlative && (
        <div className="mt-3 rounded-md border border-success/60 bg-success/10 px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
            Best in class · {team.superlative.label}
          </span>
          <span className="ml-2 text-xs text-foreground">
            {team.superlative.metric}
          </span>
        </div>
      )}

      {team.strategy && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-xs">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Strategy
            </div>
            <div
              className={`font-medium ${COHERENCE_TONE[team.strategy.coherence] ?? "text-foreground"}`}
            >
              {team.strategy.top_path
                ? `${team.strategy.top_path.name}`
                : "Vanilla / no lane"}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              {team.strategy.top_path
                ? `${team.strategy.top_path.drift_pct}% drift · ${team.strategy.top_path.phase}`
                : `${team.strategy.coherence} coherence`}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Trending
            </div>
            <div className="font-medium text-foreground">
              {HORIZON_LABEL[team.strategy.horizon_lean]}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              now {Math.round(team.strategy.win_now)} · future{" "}
              {Math.round(team.strategy.future_value)}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-border-soft pt-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Top assets
        </div>
        <ul className="mt-1 space-y-0.5 text-sm">
          {team.top_players.map((p) => (
            <li
              key={p.id}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="text-foreground">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-2">
                  {" "}
                  · {p.position}
                  {p.team ? `-${p.team}` : ""}
                  {p.age != null ? `, age ${p.age}` : ""}
                </span>
              </span>
              <span className="font-mono text-[10px] text-muted-2">
                {Math.round(p.dynasty_value)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            Starter fill
          </span>
          <div className="text-foreground">
            {Math.round(team.starter_completeness * 100)}%
          </div>
        </div>
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            Avg age
          </span>
          <div className="text-foreground">
            {team.avg_age != null ? team.avg_age.toFixed(1) : "?"}
          </div>
        </div>
        {team.worst_gap && (
          <div className="col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-danger">
              Gap
            </span>
            <div className="text-foreground">
              {team.worst_gap.have}/{team.worst_gap.need}{" "}
              {team.worst_gap.position}
            </div>
          </div>
        )}
        {team.future_picks.length > 0 && (
          <div className="col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              Future picks
            </span>
            <div className="text-foreground">
              {team.future_picks
                .map((p) => `${p.count}× ${p.season} R${p.round}`)
                .join(" · ")}
            </div>
          </div>
        )}
        {team.prior_seasons.length > 0 && (
          <div className="col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              History
            </span>
            <div className="text-foreground">
              {team.prior_seasons
                .map((p) => {
                  const rec = p.record
                    ? `${p.record.wins}-${p.record.losses}${p.record.ties ? `-${p.record.ties}` : ""}`
                    : "-";
                  const rank = p.final_rank ? ` · #${p.final_rank}` : "";
                  return `${p.season}: ${rec}${rank}`;
                })
                .join(" · ")}
            </div>
          </div>
        )}
        {team.outlook_summary && (
          <div className="col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              5yr outlook
            </span>
            <div className="text-foreground">
              Peak {team.outlook_summary.peak_year} ·{" "}
              {team.outlook_summary.peak_tier === "contender"
                ? "Contender"
                : team.outlook_summary.peak_tier === "bubble"
                  ? "Bubble"
                  : "Rebuild"}{" "}
              ({team.outlook_summary.peak_score}/100)
              {team.outlook_summary.contender_window && (
                <span className="text-muted">
                  {" "}
                  · window {team.outlook_summary.contender_window.first}
                  {team.outlook_summary.contender_window.first !==
                  team.outlook_summary.contender_window.last
                    ? `-${team.outlook_summary.contender_window.last}`
                    : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

