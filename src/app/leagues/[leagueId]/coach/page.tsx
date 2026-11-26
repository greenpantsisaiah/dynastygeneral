import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Coach Chat",
  robots: { index: false, follow: false },
};
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import { getLeague, getNflState, getUserByUsername } from "@/lib/sleeper";
import { CoachChat } from "@/components/league/coach-chat";
import { UsageChip } from "@/components/billing/usage-meter";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { seasonQuickPrompts } from "@/lib/coach/season-prompts";
import { leagueKind } from "@/lib/email/build-brief";
import { buildFormatRulesFromRosterPositions } from "@/lib/engine/llm-contract";
import { tradeWindow } from "@/lib/strategy/verdict/trade-window";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string; season?: string; ask?: string }>;
};

export default async function CoachPage({
  params,
  searchParams,
}: PageProps) {
  const { leagueId } = await params;
  const { username, ask } = await searchParams;
  const urlUsername = (username ?? "").trim().replace(/^@/, "");
  const initialPrompt = ask ? ask.trim().slice(0, 500) : undefined;

  // Coach is a signed-in-only surface. Anonymous visitors get
  // redirected to /login with a return path so they land back here
  // after auth. Per founder direction 2026-05-14: "when not logged
  // in, it shouldn't even be available."
  const authUser = await getOptionalUser().catch(() => null);
  if (!authUser) {
    const q = new URLSearchParams();
    if (urlUsername) q.set("username", urlUsername);
    if (initialPrompt) q.set("ask", initialPrompt);
    const next = `/leagues/${leagueId}/coach${q.size ? `?${q.toString()}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // Signed in without ?username (a bare link, or one from /home): use the
  // Sleeper username saved on the profile, the same default the hub uses.
  let savedUsername: string | null = null;
  if (!urlUsername) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("profiles")
        .select("sleeper_username")
        .eq("id", authUser.id)
        .maybeSingle();
      savedUsername = (data?.sleeper_username as string | null) ?? null;
    } catch (err) {
      console.error("[coach:profile-lookup]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
    }
  }
  const cleanedUsername = urlUsername || savedUsername || "";

  const [league, sleeperUser, nflState] = await Promise.all([
    getLeague(leagueId),
    cleanedUsername ? getUserByUsername(cleanedUsername) : Promise.resolve(null),
    getNflState().catch(() => null),
  ]);
  const inSeason = nflState?.season_type === "regular" || nflState?.season_type === "post";
  const seasonPrompts =
    inSeason && league
      ? seasonQuickPrompts({
          kind: leagueKind(league),
          tradeOpen: tradeWindow(
            buildFormatRulesFromRosterPositions({
              rosterPositions: league.roster_positions ?? [],
              scoringHighlights: [],
              isSuperflex: false,
              leagueSettings: (league.settings ?? null) as Record<string, unknown> | null,
            }),
            nflState?.week ?? null,
          ).open,
        })
      : null;
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
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Talk it through
                </h1>
                <UsageChip feature="coach" />
              </div>
              <p className="mt-2 text-sm text-muted">
                Ask for advice, test a trade idea, or argue with a call.
                Coach reads the live league snapshot on every turn.
              </p>
            </div>
            <Link
              href={`/leagues/${leagueId}${cleanedUsername ? `?username=${encodeURIComponent(cleanedUsername)}` : ""}`}
              className="font-mono text-xs uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
            >
              ← Back to league
            </Link>
          </div>

          {!cleanedUsername && (
            <div className="mt-6 rounded-md border border-danger/60 bg-danger/5 px-4 py-3 text-sm text-danger">
              No Sleeper account is saved on your profile, so Coach cannot
              tell which roster is yours. Add your Sleeper username in{" "}
              <Link href="/account" className="underline">
                account settings
              </Link>
              .
            </div>
          )}

          {cleanedUsername && (
            <CoachChat
              leagueId={leagueId}
              username={cleanedUsername}
              displayName={me ?? cleanedUsername}
              initialPrompt={initialPrompt}
              seasonPrompts={seasonPrompts}
            />
          )}
        </div>
      </main>
    </>
  );
}
