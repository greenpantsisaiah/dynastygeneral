/**
 * POST /api/coach/[leagueId]?username=...
 *
 * Conversational coach. Takes the user's chat history + new message,
 * builds a fresh league snapshot, packs the most useful context (top
 * archetypes, top available players with ADP, opponent observations,
 * windows), and calls Claude with the SYSTEM_PROMPT identity. Returns
 * the assistant reply.
 *
 * Server-side keeps the API key off the client and lets us assemble
 * the full context with one call. History lives in localStorage on
 * the client and gets re-sent each turn.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
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
import { computeWindows } from "@/lib/strategy/windows/compute";
import { buildPickApproach } from "@/lib/strategy/pick-approach/predict";
import { getAvailableForRequest } from "@/lib/strategy/player-suggestions/enrich";
import { SYSTEM_PROMPT } from "@/lib/engine/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const bodySchema = z.object({
  history: z.array(messageSchema).max(40),
  message: z.string().min(1).max(4000),
});

// Coach voice extension. Layered onto SYSTEM_PROMPT so the existing
// "no em dash, sharp dynasty coach" identity is preserved.
const COACH_CONTRACT = `

## Coach mode

You are now in interactive coaching mode. The user is asking you about
their league directly. You have a fresh league snapshot in this turn's
context (archetypes, picks made, opponents, windows, available players
with ADP). Use it.

When the user asks "compare X vs Y vs Z," produce:
1. A ranked recommendation (1, 2, 3) with one-line reasoning each.
2. The single sharpest case for each player so they can stress-test.
3. Your final pick with the decision rule that broke any tie.

When the user asks general advice: same identity as elsewhere in the
product. Lead with the call. Cite specific signals from the context.
Don't hedge. If they push back with new info, acknowledge it
specifically and re-run the call.

Format: plain text. Short paragraphs. Numbered lists when ranking.
No em dashes. No headers/sections unless the answer is genuinely
multi-topic.`;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const url = new URL(req.url);
  const username = url.searchParams.get("username")?.trim().replace(/^@/, "") ?? "";

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "request body wasn't readable" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400 },
    );
  }
  const { history, message } = parsed.data;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        reply:
          "[STUB] Coach is offline (no ANTHROPIC_API_KEY). Set the env var to enable real responses.",
      },
      { status: 200 },
    );
  }

  // Build league context per turn. Same data path as the league hub.
  const [league, rosters, users] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  if (!league) {
    return NextResponse.json({ error: "league not found" }, { status: 404 });
  }
  const sleeperUser = username ? await getUserByUsername(username) : null;
  const draftState = await resolveDraftState(
    leagueId,
    sleeperUser?.user_id ?? null,
  );
  const snapshot = await buildLeagueSnapshot({
    league,
    rosters,
    users,
    draftState,
    mySleeperUserId: sleeperUser?.user_id ?? null,
  });
  const ranked = rankArchetypes(snapshot);
  const opponents = buildOpponentReadout(snapshot);
  const windows = computeWindows(snapshot);
  let pickApproach = buildPickApproach(snapshot, ranked);
  const available = await getAvailableForRequest(snapshot).catch(() => []);

  // Trim context to what's useful in chat. Top 30 available players
  // (covers the realistic queue), all ranked archetypes, opponents +
  // their trade angles, windows.
  const me = snapshot.rosters.find((r) => r.is_me);
  const contextPayload = {
    league: {
      name: league.name,
      season: league.season,
      format: snapshot.format,
      scoring: snapshot.scoring,
      total_teams: snapshot.total_teams,
    },
    me: me
      ? {
          owner: me.owner_name,
          position_counts: me.position_counts,
          avg_age: me.avg_age,
          record: `${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""}`,
        }
      : null,
    draft: {
      status: snapshot.draft.status,
      next_pick_no: snapshot.draft.next_pick_no,
      my_next_pick_label: pickApproach?.my_pick_label ?? null,
      picks_until_me: pickApproach?.picks_until_me ?? null,
    },
    windows: {
      win_now: windows.win_now.score,
      future_value: windows.future_value.score,
      current_ratio: windows.current_ratio,
    },
    ranked_archetypes: ranked.map((r) => ({
      id: r.archetype.id,
      name: r.archetype.name,
      drift_pct: Math.round(r.drift_score * 100),
      phase: r.phase ?? "acquisition",
      gamble_pct: Math.round(r.live_gamble.pct * 100),
      horizon: r.archetype.horizon,
    })),
    opponents: opponents.teams.map((t) => ({
      owner: t.owner_name,
      picks: t.picks_count,
      patterns: t.observations.map((o) => o.pattern_name),
      trade_angles: t.trade_angles.map((a) => ({
        stance: a.stance,
        headline: a.headline,
      })),
    })),
    top_available: available.slice(0, 30).map((p) => ({
      name: p.name,
      pos: p.position,
      team: p.team,
      age: p.age,
      sleeper_rank: p.search_rank,
      adp: p.adp,
    })),
  };

  const client = new Anthropic({ apiKey });
  const system = `${SYSTEM_PROMPT}${COACH_CONTRACT}`;

  // First user message carries the context. Keeps it cached across
  // turns since the system prompt + that turn don't change.
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `LEAGUE CONTEXT (current snapshot):\n${JSON.stringify(contextPayload, null, 2)}\n\nAcknowledge briefly that you've loaded the context, then wait for my question.`,
    },
    {
      role: "assistant",
      content:
        "Loaded. Ready to coach. Ask me about picks, trades, your window, or specific opponents.",
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 0.5,
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });
  } catch (err) {
    console.error("[coach]", err);
    return NextResponse.json(
      { error: "coach call failed" },
      { status: 502 },
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return NextResponse.json({
    reply: text || "(no response)",
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cache_read: response.usage.cache_read_input_tokens ?? null,
      cache_creation: response.usage.cache_creation_input_tokens ?? null,
    },
  });
}
