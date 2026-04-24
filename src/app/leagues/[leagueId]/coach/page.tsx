import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Coach Chat",
  robots: { index: false, follow: false },
};
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import { getLeague, getUserByUsername } from "@/lib/sleeper";
import { CoachChat } from "@/components/league/coach-chat";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string; season?: string }>;
};

export default async function CoachPage({
  params,
  searchParams,
}: PageProps) {
  const { leagueId } = await params;
  const { username } = await searchParams;
  const cleanedUsername = (username ?? "").trim().replace(/^@/, "");

  const [league, sleeperUser] = await Promise.all([
    getLeague(leagueId),
    cleanedUsername ? getUserByUsername(cleanedUsername) : Promise.resolve(null),
  ]);
  if (!league) notFound();

  const me =
    sleeperUser && (sleeperUser.display_name || sleeperUser.username);

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <Ticker label={`Coach · ${league.name}`} />

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Talk it through
              </h1>
              <p className="mt-2 text-sm text-muted">
                Debate picks, ask for advice, work a trade angle. Your
                coach has the live league snapshot loaded each turn.
              </p>
            </div>
            <Link
              href={`/leagues/${leagueId}${cleanedUsername ? `?username=${encodeURIComponent(cleanedUsername)}` : ""}`}
              className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
            >
              ← Back to hub
            </Link>
          </div>

          {!cleanedUsername && (
            <div className="mt-6 rounded-md border border-danger/60 bg-danger/5 px-4 py-3 text-sm text-danger">
              No username on the URL. Coach needs a Sleeper username to
              know which roster is yours. Go back to the hub and identify
              first.
            </div>
          )}

          {cleanedUsername && (
            <CoachChat
              leagueId={leagueId}
              username={cleanedUsername}
              displayName={me ?? cleanedUsername}
            />
          )}
        </div>
      </main>
    </>
  );
}
