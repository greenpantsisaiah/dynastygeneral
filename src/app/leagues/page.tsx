import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getLeaguesForUser,
  getNflState,
  isDynastyLeague,
} from "@/lib/sleeper";
import {
  LeagueListGroup,
  type LeagueListItem,
} from "@/components/league/league-list";

export const metadata = {
  title: "My Leagues",
  description: "Your connected Sleeper dynasty leagues.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MyLeaguesPage() {
  const user = await getOptionalUser();
  if (!user) redirect("/login?next=/leagues");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("sleeper_user_id, sleeper_username")
    .eq("id", user.id)
    .maybeSingle();
  const savedUsername = (profile?.sleeper_username as string | null) ?? null;
  const savedUserId = (profile?.sleeper_user_id as string | null) ?? null;

  type LeagueRow = LeagueListItem & { is_dynasty: boolean };
  let leagues: LeagueRow[] = [];
  let fetchError = false;
  let resolvedSeason = "";
  if (savedUserId) {
    try {
      const state = await getNflState();
      resolvedSeason =
        state?.season ?? String(new Date().getFullYear());
      const live = await getLeaguesForUser(savedUserId, resolvedSeason);
      leagues = live.map((l) => ({
        league_id: l.league_id,
        name: l.name ?? null,
        season: l.season,
        total_rosters: l.total_rosters ?? null,
        status: l.status ?? null,
        is_dynasty: isDynastyLeague(l),
      }));
      leagues.sort((a, b) =>
        a.is_dynasty === b.is_dynasty ? 0 : a.is_dynasty ? -1 : 1,
      );
    } catch (err) {
      console.error("[my-leagues:live]", err);
      fetchError = true;
    }
  }

  const dynastyLeagues = leagues.filter((l) => l.is_dynasty);
  const otherLeagues = leagues.filter((l) => !l.is_dynasty);

  function buildHref(id: string): string {
    const params = new URLSearchParams();
    if (resolvedSeason) params.set("season", resolvedSeason);
    if (savedUsername) params.set("username", savedUsername);
    const qs = params.toString();
    return `/leagues/${id}${qs ? `?${qs}` : ""}`;
  }

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <Ticker label="My leagues · pick one to open the hub" />
            <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                My leagues
              </h1>
              {savedUsername ? (
                <div className="flex items-baseline gap-3 text-xs">
                  <span className="text-muted">
                    Saved as{" "}
                    <span className="font-mono text-foreground">
                      @{savedUsername}
                    </span>
                  </span>
                  <Link
                    href="/connect"
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
                  >
                    Not me? Re-connect →
                  </Link>
                </div>
              ) : null}
            </div>

            {!savedUserId ? (
              <div className="mt-6 rounded-lg border border-border-strong bg-surface px-5 py-5">
                <p className="text-sm text-muted">
                  Connect your Sleeper account so we know which roster is
                  yours. Once saved, your leagues show up here and the hub
                  loads to your team automatically.
                </p>
                <Link
                  href="/connect"
                  className="mt-4 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-black transition hover:brightness-110"
                >
                  Connect Sleeper →
                </Link>
              </div>
            ) : fetchError ? (
              <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-5 py-4 text-sm text-foreground">
                Sleeper didn&rsquo;t respond. Refresh in a moment, or{" "}
                <Link href="/connect" className="text-accent hover:underline">
                  re-connect
                </Link>
                .
              </div>
            ) : leagues.length === 0 ? (
              <div className="mt-6 rounded-lg border border-border-strong bg-surface px-5 py-5">
                <p className="text-sm text-muted">
                  Sleeper has no leagues for{" "}
                  <span className="font-mono">@{savedUsername}</span> in the
                  current season. Check the username, or maybe try a
                  different season.{" "}
                  <Link
                    href="/connect"
                    className="text-accent hover:underline"
                  >
                    Re-connect →
                  </Link>
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {dynastyLeagues.length > 0 && (
                  <LeagueListGroup
                    title="Dynasty leagues"
                    leagues={dynastyLeagues}
                    buildHref={buildHref}
                    emphasized
                  />
                )}
                {otherLeagues.length > 0 && (
                  <LeagueListGroup
                    title="Other leagues (redraft / keeper)"
                    leagues={otherLeagues}
                    buildHref={buildHref}
                  />
                )}
              </div>
            )}

            <div className="mt-10 flex flex-wrap items-center gap-4 text-xs text-muted-2">
              <Link href="/account" className="hover:text-accent">
                Account settings →
              </Link>
              <Link href="/connect" className="hover:text-accent">
                Connect another account →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

