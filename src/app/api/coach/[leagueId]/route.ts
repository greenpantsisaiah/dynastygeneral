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
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBudget, recordSpend } from "@/lib/budget";
import { guardLlmEnforcement } from "@/lib/ops/llm-guard";
import { checkProGate } from "@/lib/auth/paywall";
import { checkCap, recordUse } from "@/lib/consumption/track";
import { isPlanAvailable } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { parseCoachRequest } from "@/lib/coach/request";
import {
  buildCoachTurn,
  COACH_MAX_TOKENS,
  COACH_MODEL,
  COACH_TEMPERATURE,
  COACH_TOOLS,
} from "@/lib/coach/turn";

export const runtime = "nodejs";
export const maxDuration = 60;

// Request parsing lives in @/lib/coach/request. The user's `message`
// is the only hard requirement; history + active_plays + companion_beat
// are auxiliary context salvaged per-entry so one corrupt localStorage
// row (an older-shape committed play, a stale message) can't 400 the
// whole turn. Founder report 2026-05-24: Coach failed instantly on
// mobile only, because a malformed stored play failed strict whole-body
// validation while the desktop's localStorage was clean.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  // Auth required. In beta-open mode any signed-in user passes; the
  // daily Anthropic budget cap is the actual cost ceiling. Falls open
  // in dev (no Supabase configured). In prod returns 401 (sign in)
  // or 402 (when beta mode is off and user is non-Pro).
  const gate = await checkProGate();
  if (!gate.ok) return gate.response;

  const guard = guardLlmEnforcement();
  if (guard) return guard;

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
  // Per-user daily cap. During beta this only OBSERVES; post-beta it
  // enforces. Free: 5/day, Pro: 200/day (extreme protective ceiling).
  // Caps tunable via env vars; see lib/consumption/track.ts.
  if (gate.user.id !== "anonymous-dev") {
    const cap = await checkCap(gate.user.id, "coach", gate.user.tier);
    if (!cap.allowed) {
      return NextResponse.json(
        {
          error: "daily_cap_reached",
          message: `Daily Coach cap reached (${cap.used}/${cap.cap}). Resets at midnight UTC.`,
          cap_used: cap.used,
          cap_max: cap.cap,
          tier: gate.user.tier,
          // Day Pass option for break-through. Inline action, never a
          // modal. Client posts to /api/checkout with plan=day_pass.
          // Reflect the actual configured availability so the UI
          // doesn't show a button that leads to a broken checkout.
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
  const parsed = parseCoachRequest(json);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { history, message, activePlays, companionBeat } = parsed.data;

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
  // Context assembly (snapshot, priced pool, decision, <current_state>,
  // guards, system prompt) lives in @/lib/coach/turn so the Coach
  // quality eval replays the exact production prompt.
  const turn = await buildCoachTurn({
    leagueId,
    username,
    userId: gate.user.id !== "anonymous-dev" ? gate.user.id : null,
    history,
    message,
    activePlays,
    companionBeat,
  });
  if (!turn.ok) {
    return NextResponse.json({ error: turn.error }, { status: turn.status });
  }
  const { system, messages } = turn;
  const client = new Anthropic({ apiKey });


  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: COACH_MODEL,
      max_tokens: COACH_MAX_TOKENS,
      temperature: COACH_TEMPERATURE,
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral" },
        },
      ],
      // Web search lets the coach pull live KTC pricing, recent injury
      // news, and trade-market commentary when the user asks something
      // the snapshot can't answer. Capped at 3 searches per turn (see
      // COACH_TOOLS). The model decides when to invoke; the system
      // prompt tells it to prefer the snapshot's authoritative data.
      tools: COACH_TOOLS,
      messages,
    },
    // Bound the call below the 60s Vercel function limit (maxDuration).
    // A web-search-augmented turn on a large late-draft context can run
    // long; without this the function gets hard-killed at 60s and the
    // client sees an opaque 504 with no body and no log. A 50s SDK
    // timeout instead throws a catchable error so we return a clean,
    // specific 502 the user (and the logs) can act on.
    { timeout: 50_000 },
    );
  } catch (err) {
    // Log message + stack per the silent-catch invariant, not just a tag.
    const e = err as { message?: string; stack?: string };
    console.error("[coach]", e?.message, e?.stack);
    const timedOut =
      err instanceof Anthropic.APIConnectionTimeoutError ||
      /timeout|timed out|aborted/i.test(e?.message ?? "");
    return NextResponse.json(
      {
        error: timedOut
          ? "Coach took too long to answer. Try a more specific question, or resend in a moment."
          : "Coach hit an error reaching the model. Resend in a moment.",
      },
      { status: 502 },
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Record spend AFTER the call succeeds. Best-effort; don't block
  // the response on a bookkeeping failure. web_search_requests is
  // billed separately from tokens by Anthropic (~$10 per 1k); pass
  // it through so the budget cap reflects real cost on search-
  // augmented turns.
  await recordSpend({
    model: COACH_MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    web_search_requests:
      response.usage.server_tool_use?.web_search_requests ?? 0,
  }).catch(() => {});

  // Per-user daily counter. Records every successful Coach turn so
  // analytics + post-beta enforcement work. Best-effort.
  if (gate.user.id !== "anonymous-dev") {
    await recordUse(gate.user.id, "coach");
  }

  // Server-side chat history mirror. Pro-tier benefit: cross-device
  // continuity. Best-effort; localStorage on the client is the
  // Per founder direction 2026-05-14: Coach should remember
  // conversations across devices for ALL signed-in users (not just
  // Pro). Persistence is no longer the Pro perk; cross-device
  // continuity is a baseline expectation for an authenticated
  // product. The `anonymous-dev` synthetic user (dev-mode-only,
  // returned when Supabase is unconfigured locally) still skips
  // persistence so local development doesn't write rows under a
  // fake user_id.
  if (gate.user.id !== "anonymous-dev") {
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
