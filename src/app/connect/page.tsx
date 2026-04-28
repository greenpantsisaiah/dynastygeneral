import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Connect Your League",
  description:
    "Connect your Sleeper dynasty league to Dynasty General. Enter your username and get live trade evaluation, pick recommendations, and strategy coaching on your real roster.",
  alternates: { canonical: "/connect" },
};
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import {
  getLeaguesForUser,
  getNflState,
  getUserByUsername,
  isDynastyLeague,
  type SleeperLeague,
} from "@/lib/sleeper";
import { PLATFORMS, type PlatformId } from "@/lib/leagues/types";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  LeagueListGroup,
  type LeagueListItem,
} from "@/components/league/league-list";
import { TrackEvent } from "@/components/track-event";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    username?: string;
    season?: string;
    platform?: string;
  }>;
};

export default async function ConnectPage({ searchParams }: PageProps) {
  const { username = "", season, platform: platformParam } = await searchParams;
  const platform: PlatformId =
    platformParam === "mfl" ? "mfl" : "sleeper";
  const cleaned = username.trim().replace(/^@/, "");

  // MFL flow not implemented yet; show coming-soon state when picked.
  if (platform === "mfl") {
    return (
      <>
        <SiteNav />
        <main className="flex-1 bg-grid">
          <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
            <Ticker label="Connect · pick your platform" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              MFL support is coming next.
            </h1>
            <p className="mt-4 max-w-xl text-muted">
              MyFantasyLeague support is on the roadmap. The engine is
              already platform-agnostic; we're wiring the MFL adapter
              now. Drop your email on the waitlist and we'll ping you the
              day it ships.
            </p>
            <PlatformPicker selected={platform} username={cleaned} />
            <Link
              href="/#waitlist"
              className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 sm:h-11 sm:w-auto"
            >
              Notify me when MFL ships →
            </Link>
          </div>
        </main>
      </>
    );
  }

  // Sleeper flow (current production behavior).
  let sleeperUser = null;
  let leagues: SleeperLeague[] = [];
  let resolvedSeason = season ?? "";
  let errorMessage: string | null = null;

  if (cleaned) {
    try {
      sleeperUser = await getUserByUsername(cleaned);
      if (!sleeperUser) {
        errorMessage = `No Sleeper account matches "${cleaned}". Check the spelling and try again.`;
      } else {
        if (!resolvedSeason) {
          const state = await getNflState();
          resolvedSeason = state?.season ?? String(new Date().getFullYear());
        }
        leagues = await getLeaguesForUser(sleeperUser.user_id, resolvedSeason);

        // Persist the verified sleeper identity to the signed-in
        // user's profile so future "my leagues" navigation can default
        // to it without retyping. Fail-soft: connection still works
        // even if the upsert fails (logged-out user, RLS hiccup, etc).
        try {
          const authUser = await getOptionalUser();
          if (authUser) {
            const supabase = await createClient();
            await supabase
              .from("profiles")
              .update({
                sleeper_user_id: sleeperUser.user_id,
                sleeper_username:
                  sleeperUser.display_name ?? sleeperUser.username ?? cleaned,
              })
              .eq("id", authUser.id);
          }
        } catch (err) {
          console.error("[connect:save-profile]", err);
        }
      }
    } catch (err) {
      console.error("[connect]", err);
      errorMessage = "Sleeper didn't respond. Retry in a moment.";
    }
  }

  const dynastyLeagues = leagues.filter(isDynastyLeague);
  const otherLeagues = leagues.filter((l) => !isDynastyLeague(l));

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
          <Ticker label="Connect · pick your platform" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Pull in your leagues.
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            We support multiple fantasy hosts. Sleeper is live today.
            MyFantasyLeague is on the roadmap.
          </p>

          <PlatformPicker selected={platform} username={cleaned} />

          <form method="GET" action="/connect" className="mt-8">
            <input type="hidden" name="platform" value="sleeper" />
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                Sleeper username
              </span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  name="username"
                  defaultValue={cleaned}
                  required
                  autoComplete="off"
                  placeholder="e.g. sleeperuser"
                  className="h-12 flex-1 rounded-md border border-border-strong bg-surface px-3 text-base text-foreground outline-none focus:border-accent sm:h-11"
                />
                <button
                  type="submit"
                  className="inline-flex h-12 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 sm:h-11 sm:w-auto"
                >
                  Fetch leagues
                </button>
              </div>
            </label>
          </form>

          {errorMessage && (
            <div className="mt-6 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-foreground">
              {errorMessage}
            </div>
          )}

          {cleaned && (
            <TrackEvent
              payload={{ event: "sleeper_username_submit", username: cleaned }}
            />
          )}
          {sleeperUser && !errorMessage && (
            <TrackEvent
              payload={{
                event: "leagues_fetched",
                username: cleaned,
                dynasty_count: dynastyLeagues.length,
                other_count: otherLeagues.length,
              }}
            />
          )}
          {sleeperUser && !errorMessage && (
            <div className="mt-10 space-y-8">
              <div className="rounded-lg border border-border-soft bg-surface px-5 py-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
                      Identified
                    </div>
                    <div className="mt-1 text-foreground">
                      <span className="font-semibold">
                        {sleeperUser.display_name ?? sleeperUser.username ?? "-"}
                      </span>
                      <span className="text-muted"> · {sleeperUser.user_id}</span>
                      <span className="text-muted"> · season {resolvedSeason}</span>
                    </div>
                  </div>
                  <Link
                    href={`/scout/${encodeURIComponent(cleaned)}${
                      resolvedSeason ? `?season=${resolvedSeason}` : ""
                    }`}
                    className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground transition hover:border-accent/60 hover:text-accent sm:h-8"
                  >
                    Scout report →
                  </Link>
                </div>
              </div>

              <LeagueListGroup
                title="Dynasty leagues"
                leagues={dynastyLeagues.map(toListItem)}
                buildHref={(id) =>
                  buildLeagueHref(id, resolvedSeason, cleaned)
                }
                emphasized
              />
              {otherLeagues.length > 0 && (
                <LeagueListGroup
                  title="Other leagues (redraft / keeper)"
                  leagues={otherLeagues.map(toListItem)}
                  buildHref={(id) =>
                    buildLeagueHref(id, resolvedSeason, cleaned)
                  }
                />
              )}
              {leagues.length === 0 && (
                <div className="rounded-md border border-border-soft bg-surface px-5 py-6 text-sm text-muted">
                  No leagues on this account for {resolvedSeason}. Try a
                  different season or double-check the username.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function PlatformPicker({
  selected,
  username,
}: {
  selected: PlatformId;
  username: string;
}) {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      {PLATFORMS.map((p) => {
        const isSelected = p.id === selected;
        const isLive = p.status === "live";
        const href = `/connect?platform=${p.id}${
          username ? `&username=${encodeURIComponent(username)}` : ""
        }`;
        return (
          <Link
            key={p.id}
            href={href}
            aria-current={isSelected ? "page" : undefined}
            className={`rounded-lg border-2 px-4 py-4 transition ${
              isSelected
                ? "border-accent bg-accent/5"
                : "border-border-strong bg-surface hover:border-border-strong/80"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div className="text-base font-semibold text-foreground">
                {p.name}
              </div>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                  isLive ? "text-success" : "text-muted-2"
                }`}
              >
                {isLive ? "Live" : "Coming soon"}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted">
              {isLive
                ? "Read-only public API. Free to connect."
                : "API mapped, adapter wiring in progress."}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function toListItem(l: SleeperLeague): LeagueListItem {
  return {
    league_id: l.league_id,
    name: l.name ?? null,
    season: l.season,
    total_rosters: l.total_rosters ?? null,
    status: l.status ?? null,
  };
}

function buildLeagueHref(
  leagueId: string,
  season: string,
  username: string,
): string {
  const params = new URLSearchParams();
  if (season) params.set("season", season);
  if (username) params.set("username", username);
  const qs = params.toString();
  return `/leagues/${leagueId}${qs ? `?${qs}` : ""}`;
}
