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
import { cookies } from "next/headers";
import { z } from "zod";
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBudget, recordSpend } from "@/lib/budget";
import { checkProGate } from "@/lib/auth/paywall";
import { createClient } from "@/lib/supabase/server";
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
import { synthesizeDecision } from "@/lib/strategy/decision-synthesis/synthesize";
import {
  declaredWindowCookieName,
  parseDeclaredWindowId,
} from "@/lib/strategy/declared-window";
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

## Coach mode (identity)

You ARE the analyst team that produced the Decision card the user sees
on the left side of the screen. The card and your voice in this chat
are the SAME entity. Never say "the system recommended" as if it were
a separate authority. Say "I recommended" or "we recommended" or "our
call is X." If the user references a player named in the Decision
card, treat that as something YOU said. Never deny having recommended
a player whose name appears in the current turn's
\`<current_state>.system_decision.recommendation.name\`. The
recommendation is your standing position even if you have not typed
the name yet in chat.

## Truth source per turn

The system PREPENDS a \`<current_state>\` block to each user message
before sending the turn (the user did not type it; the server injected
a fresh JSON snapshot: pick label, picks until you, declared window,
system_decision, ranked archetypes, available players, opponents).
That block is the AUTHORITATIVE truth for THIS turn. If anything you
said in a previous reply contradicts it (a different pick label, a
different roster, a different system_decision player), the new
\`<current_state>\` wins. Always answer based on
\`<current_state>.draft.my_next_pick_label\`, never a label you
mentioned in an earlier reply. Always answer based on the CURRENT
\`system_decision.recommendation\`, never an earlier one.

## The system decision (non-negotiable)

\`<current_state>.system_decision\` is YOUR official per-pick
recommendation. It integrates windows, roster holes, path drift,
scarcity, and pick density. On EVERY turn where the user asks about
ANY player at the current pick (compare, evaluate, alternatives, who,
why, what about), open by stating what your standing call is, then
either reaffirm it or revise it. Two valid moves only:

  1. CONFIRM your call. State the player, recap the primary reason,
     add one sharpening point.
  2. REVISE your call. State the original recommendation, say why you
     are revising ("roster has 3 QB in superflex, a 4th doesn't
     help"), then state the new pick with reasoning.

Never silently disagree. Never discuss alternatives without first
restating your standing call. Never deny having recommended your own
\`system_decision.recommendation.name\`. The user sees the Decision
card and the chat side by side; if the two say different things
without addressing each other, trust collapses.

Also acknowledge the \`window_frame\`. If windows say "lean heavily
win-now, age 24-28, no rookies" and your call is a rookie anyway,
that is a real tension worth explaining: is the scarcity argument
strong enough to override the window, or is the window right and the
call should be revised?

## Pick density (use this to frame every per-pick recommendation)

draft.my_pick_schedule lists the user's remaining picks with gap math
between them. ALWAYS factor density into your call:

- density "wraparound": user owns back-to-back picks. Recommend the
  SCARCER asset for the first pick (the one less likely to survive)
  since the back-to-back pick refills the safer scarcity.
- density "isolated": long wait both sides. Defensive framing: grab
  the fragile-tier asset NOW because there's no refill window.
- density "cluster": multiple user picks in the next ~half round.
  Patient framing: it's OK to punt this pick, the cluster catches up.
- density "normal": standard scarcity math, no special framing.

When relevant, name the next 1-2 user picks by label (e.g. "9.10 then
9.12 back-to-back") so the user sees the schedule reasoning.

## Position gating

Only treat positions present in league.starter_slots.hard (with a
count above 0) as rostered. If hard.K = 0 or hard.DST = 0 or hard.TE
= 0 in this league, NEVER flag the user or any opponent for "zero"
at that position. Different leagues roster different positions;
respect the format.

## Rookies

The available pool now includes incoming rookies (is_rookie = true).
Pre-NFL-draft rookies often have no team, no age, and no Sleeper ADP
yet. When the user asks about a rookie:
  - Acknowledge that landing spot is unknown until the NFL draft.
  - Frame dynasty value as speculative based on pre-draft consensus
    and prospect grade, not stat projections.
  - For startup rookie picks, lean on rookie ADP (variant: "rookie")
    and the user's roster horizon to give a directional take.
  - If the user names a specific rookie not in the top_available
    snapshot, say so directly. Don't fabricate stats.

## Web search (use sparingly)

You have a web_search tool with up to 3 calls per turn. Default to the
authoritative \`<current_state>\` snapshot; reach for the web only when
the user asks something the snapshot genuinely can't answer:

  - Current KTC / DLF / FantasyCalc trade values for a specific player
    when our internal valuation feels suspect or the user explicitly
    asks "what's KTC saying."
  - Recent injury news or training-camp reports on a named player.
  - Trade-market commentary from named dynasty pros (Hayden Winks,
    Sigmund Bloom, JJ Zachariason, Adam Levitan) when discussing a
    trending narrative.
  - Confirmed NFL-draft landing spots for rookies after the NFL draft.

Do NOT search to look up basic stats, ADP, or anything already in the
snapshot. Cite the source briefly when you use the web (e.g.
"per KTC today" or "Footballguys reports").

Format: plain text. Short paragraphs. Numbered lists when ranking.
No em dashes. No headers/sections unless the answer is genuinely
multi-topic.`;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  // Pro tier required. Falls open in dev (no Supabase configured); in
  // prod returns 401 (sign in) or 402 (upgrade).
  const gate = await checkProGate();
  if (!gate.ok) return gate.response;

  // Rate limit + daily budget check BEFORE any expensive work.
  const ip = clientIpFrom(req);
  const rate = await checkRateLimit("coach", ip);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Too many coach calls. Wait ${Math.ceil(rate.reset_ms / 1000)}s and try again.`,
      },
      {
        status: 429,
        headers: {
          "x-ratelimit-limit": String(rate.limit),
          "x-ratelimit-remaining": String(rate.remaining),
          "retry-after": String(Math.ceil(rate.reset_ms / 1000)),
        },
      },
    );
  }
  const budget = await checkBudget();
  if (!budget.allowed) {
    return NextResponse.json(
      {
        error: "budget_exceeded",
        message: `Daily coach capacity reached. Try again tomorrow.`,
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
  const pickApproach = buildPickApproach(snapshot, ranked);
  const available = await getAvailableForRequest(snapshot).catch(() => []);

  // Read declared window from the mirror cookie so coach sees the same
  // window constraint the Decision card applied. Null if not declared.
  const cookieStore = await cookies();
  const declaredWindow = parseDeclaredWindowId(
    cookieStore.get(declaredWindowCookieName(leagueId))?.value ?? null,
  );

  // Compose the system's official per-pick recommendation so coach can
  // confirm or contradict with full awareness. Don't fail the whole
  // request if synthesis errors; coach can still reason from context.
  let decision: Awaited<ReturnType<typeof synthesizeDecision>> | null = null;
  try {
    if (available.length > 0) {
      decision = synthesizeDecision({
        snap: snapshot,
        ranked,
        available,
        windows,
        picks_until_me: pickApproach?.picks_until_me ?? 0,
        declared_window: declaredWindow,
      });
    }
  } catch (err) {
    console.error("[coach:decision-synthesis]", err);
  }

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
      // Starter-slot map. Positions with hard=0 are NOT rostered; do
      // not treat a 0 count there as a gap.
      starter_slots: snapshot.starter_slots,
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
      // User's remaining picks with gap classifications. First entry is
      // the next/current user pick. Density modifies recommendation
      // framing (wraparound = take scarcer first; isolated = grab
      // fragile now; cluster = OK to punt, more picks coming).
      my_pick_schedule: snapshot.draft.my_pick_schedule.slice(0, 8).map(
        (p) => ({
          pick_label: p.pick_label,
          pick_no: p.pick_no,
          gap_to_prev: Number.isFinite(p.gap_to_prev) ? p.gap_to_prev : null,
          gap_to_next: Number.isFinite(p.gap_to_next) ? p.gap_to_next : null,
          density: p.density_kind,
        }),
      ),
    },
    windows: {
      win_now: windows.win_now.score,
      future_value: windows.future_value.score,
      current_ratio: windows.current_ratio,
      declared: declaredWindow,
    },
    // The system's official recommendation for the user's current/next
    // pick. Coach MUST either confirm this call with stated reasoning
    // or contradict it explicitly with stated reasoning. Silent
    // disagreement (picking a different player without addressing the
    // Decision card) creates the conflicting-surfaces problem.
    system_decision: decision
      ? {
          pick_label: decision.pick_label,
          recommendation: {
            name: decision.recommendation.name,
            position: decision.recommendation.position,
            age: decision.recommendation.age,
            adp: decision.recommendation.adp,
            rule: decision.recommendation.rule,
            is_rookie: decision.recommendation.is_rookie,
          },
          primary_reason: decision.recommendation.primary_reason,
          window_frame: decision.window_frame,
          why: decision.why,
          tradeoff_gains: decision.tradeoff.gains,
          tradeoff_losses: decision.tradeoff.losses,
          scarcity_callout: decision.scarcity_callout,
          emergency_trade_up: decision.emergency_trade_up,
        }
      : null,
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
      is_rookie: p.is_rookie,
    })),
  };

  const client = new Anthropic({ apiKey });
  const system = `${SYSTEM_PROMPT}${COACH_CONTRACT}`;

  // Per-turn context injection. The fresh snapshot is wrapped with the
  // current user message so it lands AFTER any prior turns. This makes
  // it the most recent thing the model has seen and resolves the bug
  // where prior assistant turns referencing an earlier pick (e.g.
  // 7.12) overrode the current state (e.g. 9.12). The COACH_CONTRACT
  // tells the model that <current_state> is authoritative when prior
  // turns conflict.
  const turnContent = `<current_state>\n${JSON.stringify(contextPayload, null, 2)}\n</current_state>\n\n${message}`;
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: turnContent },
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
      // Web search lets the coach pull live KTC pricing, recent injury
      // news, and trade-market commentary when the user asks something
      // the snapshot can't answer. Capped at 3 searches per turn so a
      // single coach call can't burn the budget. The model decides when
      // to invoke; the system prompt tells it to prefer the snapshot's
      // authoritative data and reach for the web only on questions
      // that genuinely require fresh external context.
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
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

  // Record spend AFTER the call succeeds. Best-effort; don't block
  // the response on a bookkeeping failure.
  await recordSpend({
    model: "claude-sonnet-4-6",
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }).catch(() => {});

  // Server-side chat history mirror. Pro-tier benefit: cross-device
  // continuity. Best-effort; localStorage on the client is the
  // canonical store for non-Pro users and the offline cache for Pro.
  //
  // In beta-open mode checkProGate lets non-Pro users through, so we
  // re-check tier here: persistence is the Pro perk, not the Coach
  // itself. Free users in beta still use Coach freely; their chats
  // stay in localStorage only.
  if (gate.user.id !== "anonymous-dev" && gate.user.tier === "pro") {
    try {
      const supabase = await createClient();
      await supabase.from("chat_history").insert([
        {
          user_id: gate.user.id,
          league_id: leagueId,
          role: "user",
          content: message,
        },
        {
          user_id: gate.user.id,
          league_id: leagueId,
          role: "assistant",
          content: text || "(no response)",
        },
      ]);
    } catch (err) {
      // Persistence failure shouldn't fail the chat reply. Log + move on.
      console.error("[coach:persist]", err);
    }
  }

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
