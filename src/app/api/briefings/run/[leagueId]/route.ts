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
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBudget } from "@/lib/budget";
import { checkProGate } from "@/lib/auth/paywall";
import { checkCap, recordUse } from "@/lib/consumption/track";
import { isPlanAvailable } from "@/lib/stripe/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  // Briefing generation is a Pro feature. Free users can VIEW shared
  // briefings (read-only) but not generate new ones.
  const gate = await checkProGate();
  if (!gate.ok) return gate.response;

  const ip = clientIpFrom(req);
  const rate = await checkRateLimit("briefings", ip);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Too many briefing runs. Wait ${Math.ceil(rate.reset_ms / 1000)}s.`,
      },
      {
        status: 429,
        headers: {
          "retry-after": String(Math.ceil(rate.reset_ms / 1000)),
        },
      },
    );
  }
  // Per-user daily cap. Free: 3 batches/day, Pro: 100/day. Beta
  // observes only; post-beta enforces. Tunable via env vars.
  if (gate.user.id !== "anonymous-dev") {
    const cap = await checkCap(gate.user.id, "briefing", gate.user.tier);
    if (!cap.allowed) {
      return NextResponse.json(
        {
          error: "daily_cap_reached",
          message: `Daily Briefings cap reached (${cap.used}/${cap.cap}). Resets at midnight UTC.`,
          cap_used: cap.used,
          cap_max: cap.cap,
          tier: gate.user.tier,
          day_pass_available: isPlanAvailable("day_pass"),
        },
        { status: 429 },
      );
    }
  }

  const budget = await checkBudget();
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: "budget_exceeded",
        message: "Daily analyst capacity reached. Try again tomorrow.",
      },
      { status: 503 },
    );
  }

  const { leagueId } = await params;
  const { isValidLeagueId, isValidUsername } = await import(
    "@/lib/sleeper/validate"
  );
  if (!isValidLeagueId(leagueId)) {
    return NextResponse.json(
      { error: "invalid league id" },
      { status: 400 },
    );
  }
  const url = new URL(req.url);
  const username = url.searchParams.get("username")?.trim().replace(/^@/, "") ?? "";
  if (username && !isValidUsername(username)) {
    return NextResponse.json(
      { error: "invalid username" },
      { status: 400 },
    );
  }
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
    // Per-user daily counter. Records every successful briefings
    // batch so analytics + post-beta enforcement work. Best-effort.
    if (gate.user.id !== "anonymous-dev") {
      await recordUse(gate.user.id, "briefing");
    }
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
