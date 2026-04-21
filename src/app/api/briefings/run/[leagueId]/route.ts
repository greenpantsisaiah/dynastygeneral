/**
 * POST /api/briefings/run/[leagueId]?username=...
 *
 * Triggers the Intelligence Analyst service. Builds the league
 * snapshot server-side, calls the analyst, returns generated
 * briefings as JSON. Client appends them to its localStorage feed.
 *
 * Server-side execution keeps the Anthropic API key off the client.
 */

import { NextResponse } from "next/server";
import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getUserByUsername,
} from "@/lib/sleeper";
import { resolveDraftState } from "@/lib/sleeper/draft-state";
import { buildLeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import { buildOpponentReadout } from "@/lib/strategy/opponents/observe";
import { generateBriefings } from "@/lib/strategy/briefings/analyst";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const url = new URL(req.url);
  const username = url.searchParams.get("username")?.trim().replace(/^@/, "") ?? "";
  const trigger = url.searchParams.get("trigger") ?? "user requested";

  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  if (!league) {
    return NextResponse.json({ error: "league not found" }, { status: 404 });
  }

  const sleeperUser = username ? await getUserByUsername(username) : null;
  let draftState: Awaited<ReturnType<typeof resolveDraftState>> | null = null;
  try {
    draftState = await resolveDraftState(leagueId, sleeperUser?.user_id ?? null);
  } catch (err) {
    console.error("[briefings:draft-state]", err);
    return NextResponse.json(
      { error: "could not resolve draft state" },
      { status: 502 },
    );
  }
  if (!draftState) {
    return NextResponse.json(
      { error: "no draft state available" },
      { status: 404 },
    );
  }

  try {
    const snapshot = await buildLeagueSnapshot({
      league,
      rosters,
      users,
      draftState,
      mySleeperUserId: sleeperUser?.user_id ?? null,
    });
    const ranked = rankArchetypes(snapshot);
    const observations = buildOpponentReadout(snapshot);
    const briefings = await generateBriefings({
      snap: snapshot,
      ranked,
      observations,
      trigger,
    });
    return NextResponse.json({
      briefings,
      generated_at: new Date().toISOString(),
      trigger,
    });
  } catch (err) {
    console.error("[briefings:run]", err);
    return NextResponse.json(
      { error: "analyst service failed" },
      { status: 500 },
    );
  }
}
