import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import {
  getLeaguesForUser,
  getNflState,
  getUserByUsername,
  isDynastyLeague,
  type SleeperLeague,
} from "@/lib/sleeper";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ username?: string; season?: string }>;
};

export default async function ConnectPage({ searchParams }: PageProps) {
  const { username = "", season } = await searchParams;
  const cleaned = username.trim().replace(/^@/, "");

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
          <Ticker label="Connect Sleeper · no password required" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Pull in your leagues.
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            Enter your Sleeper username. We&apos;ll fetch your dynasty leagues
            and drop you into the decision hub.
          </p>

          <form method="GET" action="/connect" className="mt-10">
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                Sleeper username
              </span>
              <div className="flex gap-2">
                <input
                  name="username"
                  defaultValue={cleaned}
                  required
                  autoComplete="off"
                  placeholder="e.g. sleeperuser"
                  className="h-11 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
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
                        {sleeperUser.display_name ?? sleeperUser.username ?? "–"}
                      </span>
                      <span className="text-muted"> · {sleeperUser.user_id}</span>
                      <span className="text-muted"> · season {resolvedSeason}</span>
                    </div>
                  </div>
                  <Link
                    href={`/scout/${encodeURIComponent(cleaned)}${
                      resolvedSeason ? `?season=${resolvedSeason}` : ""
                    }`}
                    className="inline-flex h-8 items-center rounded-md border border-border-strong bg-surface px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground transition hover:border-accent/60 hover:text-accent"
                  >
                    Scout report →
                  </Link>
                </div>
              </div>

              <LeagueGroup
                title="Dynasty leagues"
                leagues={dynastyLeagues}
                season={resolvedSeason}
                username={cleaned}
                emphasized
              />
              {otherLeagues.length > 0 && (
                <LeagueGroup
                  title="Other leagues (redraft / keeper)"
                  leagues={otherLeagues}
                  season={resolvedSeason}
                  username={cleaned}
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

function LeagueGroup({
  title,
  leagues,
  season,
  username,
  emphasized = false,
}: {
  title: string;
  leagues: SleeperLeague[];
  season: string;
  username: string;
  emphasized?: boolean;
}) {
  if (leagues.length === 0) return null;
  const buildHref = (leagueId: string) => {
    const params = new URLSearchParams();
    if (season) params.set("season", season);
    if (username) params.set("username", username);
    const qs = params.toString();
    return `/leagues/${leagueId}${qs ? `?${qs}` : ""}`;
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-2">
          {title}
        </h2>
        <span className="font-mono text-[11px] text-muted-2">
          {leagues.length}
        </span>
      </div>
      <ul className="mt-3 grid gap-2">
        {leagues.map((l) => (
          <li key={l.league_id}>
            <Link
              href={buildHref(l.league_id)}
              className={`flex items-center justify-between rounded-md border px-4 py-3 text-sm transition ${
                emphasized
                  ? "border-border-strong bg-surface hover:border-accent/60"
                  : "border-border-soft bg-surface/60 hover:border-border-strong"
              }`}
            >
              <div>
                <div className="font-medium text-foreground">{l.name}</div>
                <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
                  {l.season} · {l.total_rosters ?? "?"} teams ·{" "}
                  {l.status ?? "unknown"}
                </div>
              </div>
              <span className="font-mono text-[11px] text-accent">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
