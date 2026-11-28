/**
 * /home: the logged-in home across every league (round 4 of the
 * multi-league home design). The weekly email is the teaser; this page is
 * home. Both read one builder (`buildDecisionItems`), so an email button
 * (`/home?item={id}`) lands on the same item, worded the same way.
 *
 * Dark behind `multi_league_home`. Admins (ADMIN_EMAILS) see it for preview;
 * everyone else is sent to /leagues until the flag goes on.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { getOptionalUser } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { flagOn } from "@/lib/flags/server";
import { createClient } from "@/lib/supabase/server";
import { getNflState } from "@/lib/sleeper";
import { briefOwnerName, buildBriefLeagues } from "@/lib/email/build-brief";
import { buildTradeDeskModel } from "@/lib/email/trade-desk/model";
import { buildDecisionItems } from "@/lib/decisions/items";
import { loadEmailedTrades, overlayEmailedTrades } from "@/lib/decisions/emailed";
import { DecisionHome } from "@/components/home/decision-feed";
import { loadLineupPanel } from "@/lib/email/game-day/load";
import { buildLineupDesk, type LineupDesk } from "@/lib/email/game-day/panel";
import { teamTile } from "@/lib/decisions/character";

export const metadata = {
  title: "Home",
  description: "Every decision across your leagues, soonest deadline first.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item } = await searchParams;
  const user = await getOptionalUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(item ? `/home?item=${item}` : "/home")}`);
  if (!flagOn("multi_league_home", user.id) && !isAdminEmail(user.email)) redirect("/leagues");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("sleeper_username, display_name")
    .eq("id", user.id)
    .maybeSingle();
  const username = (profile?.sleeper_username as string | null) ?? null;
  const displayName = (profile?.display_name as string | null) ?? null;

  const nfl = await getNflState();
  if (!username || !nfl || !nfl.week) {
    return (
      <EmptyHome
        line={
          !username
            ? "No Sleeper account saved yet. Connect one and every league's decisions land here."
            : "Sleeper did not return the current NFL week. Retry in a minute."
        }
      />
    );
  }

  const [{ leagues, resultsWeek }, lineups] = await Promise.all([
    buildBriefLeagues({
      username,
      season: nfl.season,
      nflWeek: nfl.week,
      seasonType: nfl.season_type,
      logTag: "home",
      withCharacter: true,
    }),
    nfl.season_type === "regular" ? loadLineupDesk(username, nfl.season, nfl.week) : Promise.resolve(null),
  ]);
  if (leagues.length === 0) {
    return <EmptyHome line={`No ${nfl.season} Sleeper leagues found for ${username}. Join or connect one and its decisions land here.`} />;
  }
  const now = new Date();
  const model = buildTradeDeskModel({
    ownerName: briefOwnerName(displayName, username),
    tier: user.tier,
    resultsWeek,
    leagues,
    seasonStartDate: nfl.season_start_date,
    // Same rule as the email: a trade whose trade-by time has passed is gone.
    now,
  });
  const live = buildDecisionItems({ model, season: nfl.season });
  // A trade the email sent stays here as emailed until its trade-by time,
  // so the email and the app never name different buyers.
  const { items, digest } = overlayEmailedTrades({
    ...live,
    emailed: await loadEmailedTrades(supabase, user.id, now),
    now,
  });

  const q = new URLSearchParams({ username, season: nfl.season }).toString();
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <DecisionHome
          digest={digest}
          items={items}
          focusId={item ?? null}
          lineups={lineups}
          teams={leagues.flatMap((l) => {
            const t = l.character ? teamTile(l.leagueId, l.leagueName, l.character) : null;
            return t ? [t] : [];
          }).sort((a, b) => b.order - a.order)}
          hrefs={{
            offer: (t) => `/leagues/${t.league_id}/trade?${q}`,
            coach: (t) => `/leagues/${t.league_id}/coach?${q}&ask=${encodeURIComponent(`Talk me through this call: ${t.title}`)}`,
            sleeper: (l) => `https://sleeper.com/leagues/${l.league_id}/team`,
            league: (id) => `/leagues/${id}?${q}`,
            item: (i) => `/home?item=${encodeURIComponent(i.id)}`,
            allLeagues: "/leagues",
          }}
        />
      </main>
    </>
  );
}

/** Most time /home waits on the lineup panel before rendering without it. */
const LINEUP_BUDGET_MS = 20_000;

/**
 * This week's lineup panel (the Game Day email's three-analyst read). A
 * failure or a slow Sleeper never blocks /home: the page renders without
 * the card and the failure is logged with a tag, so it becomes an incident.
 */
async function loadLineupDesk(username: string, season: string, week: number): Promise<LineupDesk | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.error("[home:lineups] lineup panel exceeded", LINEUP_BUDGET_MS, "ms; rendering without it");
      resolve(null);
    }, LINEUP_BUDGET_MS);
  });
  const work = (async () => {
    try {
      const res = await loadLineupPanel({ username, season, week, now: new Date(), logTag: "home:lineups" });
      if ("error" in res) {
        console.error("[home:lineups]", res.error);
        return null;
      }
      return buildLineupDesk(res.panel);
    } catch (err) {
      console.error("[home:lineups]", err instanceof Error ? `${err.message}\n${err.stack}` : err);
      return null;
    }
  })();
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function EmptyHome({ line }: { line: string }) {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Home</h1>
          <p className="mt-3 text-muted">{line}</p>
          <Link href="/leagues" className="mt-6 inline-block text-sm text-accent underline">
            Go to my leagues
          </Link>
        </div>
      </main>
    </>
  );
}
