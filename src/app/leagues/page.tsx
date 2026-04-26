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

  type LeagueRow = {
    sleeper_league_id: string;
    name: string | null;
    season: string;
    is_dynasty: boolean;
  };
  let leagues: LeagueRow[] = [];
  let fetchError = false;
  if (savedUserId) {
    try {
      const state = await getNflState();
      const season = state?.season ?? String(new Date().getFullYear());
      const live = await getLeaguesForUser(savedUserId, season);
      leagues = live.map((l) => ({
        sleeper_league_id: l.league_id,
        name: l.name ?? null,
        season: l.season,
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
                  <LeagueGroup
                    title="Dynasty leagues"
                    leagues={dynastyLeagues}
                    emphasized
                  />
                )}
                {otherLeagues.length > 0 && (
                  <LeagueGroup
                    title="Redraft / keeper"
                    leagues={otherLeagues}
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

function LeagueGroup({
  title,
  leagues,
  emphasized,
}: {
  title: string;
  leagues: Array<{
    sleeper_league_id: string;
    name: string | null;
    season: string;
  }>;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-surface px-5 py-5 ${
        emphasized ? "border-accent/40" : "border-border-strong"
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        {title}
      </div>
      <ul className="mt-3 divide-y divide-border-soft">
        {leagues.map((l) => (
          <li
            key={l.sleeper_league_id}
            className="flex items-baseline justify-between gap-3 py-2.5"
          >
            <Link
              href={`/leagues/${l.sleeper_league_id}`}
              className="text-base text-foreground transition hover:text-accent"
            >
              {l.name ?? l.sleeper_league_id}
            </Link>
            <span className="font-mono text-[10px] text-muted-2">
              {l.season}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
