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
import { checkCap, recordUse } from "@/lib/consumption/track";
import { isPlanAvailable } from "@/lib/stripe/client";
import { humanize, resolvePlayers } from "@/lib/players/cache";
import {
  buildOperationalContext,
  enumerateAllLeaguePicks,
} from "@/lib/engine/llm-contract";
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
import { buildOpponentTradeHistory } from "@/lib/strategy/opponents/trade-history";
import {
  groupNotesByOpponent,
  readOpponentNotesForLeague,
} from "@/lib/opponent-notes/storage";
import { buildLeagueReadFromSnapshot } from "@/lib/strategy/league-read";
import { buildInflectionsFromSnapshot } from "@/lib/engine/inflection";
import { readSloanMode } from "@/lib/sloan-mode/cookie";
import { computeWindows } from "@/lib/strategy/windows/compute";
import { buildPickApproach } from "@/lib/strategy/pick-approach/predict";
import { getAvailableForRequest } from "@/lib/strategy/player-suggestions/enrich";
import { synthesizeDecision } from "@/lib/strategy/decision-synthesis/synthesize";
import {
  declaredWindowCookieName,
  parseDeclaredWindowId,
} from "@/lib/strategy/declared-window";
import { SYSTEM_PROMPT } from "@/lib/engine/system-prompt";
import { isNflDraftWindowActive } from "@/lib/draft-window/active";

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

## Trade initiation (proactive + reactive)

When the user asks about INITIATING a trade (not "should I accept this
offer," but "should I make an offer" or "should I trade up" or
"someone put a pick on the block"), use this structure:

For "should I trade up" / "should I move up to take X":
  1. Confirm whether trading up makes sense AT ALL given the user's
     window (win-now leans defend trade-ups for roster-completing
     starters; future leans rarely justify trading up).
  2. Identify the TARGET PICK (the slot you'd need to land at) and the
     player you're protecting against missing.
  3. Pick the BEST PARTNER from \`opponents[]\`. Best partner has BOTH
     a need that aligns with what the user can spare AND a stance of
     "approach" or holds the pick you want and is in EXECUTING phase
     (won't fight for marginal upgrades). Name the owner.
  4. Construct a fair offer using \`pricing\` (pick values + player
     values from FantasyCalc). Receiving side must be within ±15%
     of sending side. Show the math: "(pick X = 1200) + (player Y =
     800) for (pick Z = 1900). 2000 vs 1900, 5% premium for the
     move-up."
  5. State why THEY accept: tie it to their position_counts holes or
     a trade_angle headline. "They're 0/1 on TE and you're sending
     surplus TE depth."

For "X put pick A.B on the block, should I bid":
  1. State whether the pick is worth pursuing for the user's window.
  2. Look up the pick value in \`pricing.pick_values\` if it's a
     future pick, else estimate from KTC startup curve.
  3. Construct an offer using assets the user can spare (their
     surplus positions + future picks they don't need). Show the
     math.
  4. Predict competition: who else in the league has a need that
     pick fills? If 2+ teams have the same hole, the asking price
     will be high; tell the user.
  5. If the user shouldn't bid, say so directly.

For "who would trade with me right now":
  1. Scan \`opponents[]\` for stance "approach" angles. List up to 3
     by name with their headline.
  2. For each, name what the user could send and what to ask back.
  3. Rank by alignment strength: the team with the BIGGEST hole that
     the user can fill cheapest comes first.

Never propose a trade without naming the owner, listing both sides of
the offer with values, and giving a one-line "why they accept." A
trade idea without those three is freelancing.

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
  // Auth required. In beta-open mode any signed-in user passes; the
  // daily Anthropic budget cap is the actual cost ceiling. Falls open
  // in dev (no Supabase configured). In prod returns 401 (sign in)
  // or 402 (when beta mode is off and user is non-Pro).
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check your message. One or more fields didn't validate." },
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

  // Counterparty-stated-plans: persistent notes the user logs about
  // opponents (stated plans, trade intent, trigger conditions, psych
  // reads). Per opponent-dossier moat pattern: opponent quotes are
  // named-pressure ammunition for trade construction. Anonymous-dev
  // sessions skip the read since they don't have a real user_id.
  let opponentNotesByRoster = new Map<
    number,
    Awaited<ReturnType<typeof readOpponentNotesForLeague>>
  >();
  if (gate.user.id !== "anonymous-dev") {
    try {
      const notes = await readOpponentNotesForLeague({
        userId: gate.user.id,
        leagueId,
      });
      opponentNotesByRoster = groupNotesByOpponent(notes);
    } catch (err) {
      console.error("[coach:opponent-notes]", err);
    }
  }
  let available = await getAvailableForRequest(snapshot).catch(() => []);

  // Mirror the hub's value-resolve + rerank pipeline so coach's
  // synthesized system_decision uses the same canonical pool ordering
  // the Decision card uses. Without this, coach reasons against a
  // dynasty_rank-sorted pool while the user sees a KTC-sorted one,
  // and "the system says X" diverges between surfaces. Single
  // FantasyCalc fetch is cached, so the cost is in-memory lookups.
  let coachPlayerValues: Record<string, number> | undefined;
  let coachKtcOverallRanks: Record<string, number> | undefined;
  try {
    const valueIds: string[] = [];
    const me = snapshot.rosters.find((r) => r.is_me);
    if (me) for (const id of me.player_ids) valueIds.push(id);
    for (const p of available) valueIds.push(p.id);
    const { resolvePlayerValues } = await import("@/lib/players/values");
    const valueMap = await resolvePlayerValues({
      ids: valueIds,
      isSuperflex:
        snapshot.format === "superflex" || snapshot.format === "2qb",
      isPpr: snapshot.scoring.includes("PPR"),
      isHalfPpr: snapshot.scoring.includes("half-PPR"),
      isTePremium: snapshot.scoring.includes("TE-premium"),
    });
    const values: Record<string, number> = {};
    const ranks: Record<string, number> = {};
    for (const [id, v] of valueMap.entries()) {
      values[id] = v.value;
      if (typeof v.overall_rank === "number") ranks[id] = v.overall_rank;
    }
    coachPlayerValues = values;
    coachKtcOverallRanks = ranks;
    const { rerankByConsensus } = await import("@/lib/players/rerank");
    available = rerankByConsensus(available, values);
  } catch (err) {
    console.error("[coach:rerank-available]", err);
  }

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
        player_values: coachPlayerValues,
        ktc_overall_ranks: coachKtcOverallRanks,
      });
    }
  } catch (err) {
    console.error("[coach:decision-synthesis]", err);
  }

  // League read + inflections. Both are existing engine outputs the
  // hub renders; Coach should see them too so the system_prompt rules
  // they reference (league_read trade-leverage proactive surface +
  // inflection bifurcation framing) actually bind. Built lazily and
  // best-effort: if either fails, Coach still works on the rest of
  // the context.
  let leagueRead: ReturnType<typeof buildLeagueReadFromSnapshot> | null = null;
  let inflectionItems: ReturnType<typeof buildInflectionsFromSnapshot> = [];
  try {
    const allRosterIds = new Set<string>();
    for (const r of snapshot.rosters) {
      for (const id of r.player_ids ?? []) allRosterIds.add(id);
    }
    for (const p of snapshot.draft.picks_made) {
      if (p.player_id) allRosterIds.add(p.player_id);
    }
    const playersMap = await resolvePlayers([...allRosterIds]);

    const lrValueMap = new Map<
      string,
      { value: number; overall_rank: number | null }
    >();
    if (coachPlayerValues) {
      for (const [id, value] of Object.entries(coachPlayerValues)) {
        lrValueMap.set(id, {
          value,
          overall_rank: coachKtcOverallRanks?.[id] ?? null,
        });
      }
    }

    const playerNameLookup = (id: string) => {
      const sp = playersMap.get(id);
      if (!sp) return null;
      const combined = [sp.first_name, sp.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const name = sp.full_name ?? combined ?? id;
      return { name, position: sp.position ?? null };
    };

    leagueRead = buildLeagueReadFromSnapshot({
      snap: snapshot,
      playerValueMap: lrValueMap,
      playerNameLookup,
    });

    inflectionItems = buildInflectionsFromSnapshot({
      snap: snapshot,
      playersMap,
    });
  } catch (err) {
    console.error("[coach:league-read+inflections]", err);
  }

  // Trim context to what's useful in chat. Top 30 available players
  // (covers the realistic queue), all ranked archetypes, opponents +
  // their trade angles, windows.
  const me = snapshot.rosters.find((r) => r.is_me);

  // Resolve the user's roster to NAMED players. Per architecture
  // pillar (reference_invariants_doc.md): "The coach LLM must
  // receive the user's NAMED roster (player name, position, team,
  // age). IDs alone produce hallucinations like 'you need a TE'
  // when the user already has Kincaid." Without this the prompt's
  // "verify before assert" rule has nothing to verify against.
  let myPlayersResolved: Array<{
    player_id: string;
    name: string;
    pos: string | null;
    team: string | null;
    age: number | null;
    rank: number | null;
  }> = [];
  if (me && me.player_ids.length > 0) {
    try {
      const resolved = await resolvePlayers(me.player_ids);
      myPlayersResolved = me.player_ids
        .map((id) => {
          const p = resolved.get(id);
          return p ? { id, p } : null;
        })
        .filter(
          (entry): entry is { id: string; p: NonNullable<ReturnType<typeof resolved.get>> } =>
            entry !== null,
        )
        .map(({ id, p }) => {
          const human = humanize(p);
          return {
            player_id: id,
            name: human.name,
            pos: human.position,
            team: human.team,
            age: human.age,
            rank: typeof p.search_rank === "number" ? p.search_rank : null,
          };
        })
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
    } catch (err) {
      console.error("[coach:resolve-roster]", err);
    }
  }

  // Operational context: derived format rules + pricing + starter
  // demand. Single source of truth in `llm-contract.ts`; refactored
  // out of inline derivation 2026-04-24 so new endpoints inherit the
  // same shape via import instead of copy-pasting the math (which
  // drifts and produces format-blind / pricing-free regressions).
  // Price every player IN ANY ROSTER plus the top of the available
  // pool. Per dynasty-trade-realism-tester 2026-04-25: prior code
  // priced only the user's roster + top 30 available, leaving
  // opponent-roster players outside the pricing scope. The Coach
  // would then have no anchor for "should I trade for player X on
  // their team?" and either hedge or freelance numbers. Including
  // every rostered player keeps the Coach's trade math grounded for
  // any in-league trade target.
  //
  // Decision-card player IDs: every player the Decision card surfaces
  // (standing call + top_candidates + quadrant_candidates) MUST also
  // appear in Coach's top_available + pricing valueIds, even if their
  // FantasyCalc value puts them past index 30 in the harmonized pool.
  // Bug 2026-05-08 izzydabomb session: Coach said "D'Andre Swift
  // isn't in the available pool. He's been drafted" while the
  // Decision card was simultaneously surfacing Swift in the WIN-NOW
  // lane. SNAPSHOT diagnosis: Coach received system_decision.
  // recommendation = Swift but top_available (sliced to top-30 by
  // KTC value) did not contain him; Swift's value 22 ranked him past
  // index 30. The model interpreted absence as "drafted." Internal
  // contradiction in the snapshot. Fix: include all Decision-card
  // player IDs in both top_available and pricing.valueIds so the
  // payload is self-consistent.
  const decisionCardPlayerIds = new Set<string>();
  if (decision) {
    if (decision.recommendation?.player_id) {
      decisionCardPlayerIds.add(decision.recommendation.player_id);
    }
    for (const c of decision.top_candidates ?? []) {
      if (c.player_id) decisionCardPlayerIds.add(c.player_id);
    }
    for (const c of decision.quadrant_candidates ?? []) {
      if (c.player_id) decisionCardPlayerIds.add(c.player_id);
    }
  }

  // Cost: 12 teams * ~10 players + 30 available + decision-card
  // candidates (typically 4-12) + me = ~150-180 IDs.
  // FantasyCalc cache holds 200+; one-time lookup, no extra fetch.
  const valueIds = new Set<string>();
  for (const r of snapshot.rosters) {
    for (const id of r.player_ids) valueIds.add(id);
  }
  for (const p of available.slice(0, 30)) valueIds.add(p.id);
  for (const id of decisionCardPlayerIds) valueIds.add(id);
  // Price ALL picks in rounds 1-8 across the league, not just the
  // user's own schedule. Coach trade-analysis bug 2026-05-05: when a
  // trade involved a counterparty's pick (1.09 in the founder's case),
  // Coach saw pick_values: [missing], hallucinated a value, and gave
  // wrong advice. Pricing the full board prevents this entire class.
  const opContext = await buildOperationalContext({
    snap: snapshot,
    pickIds: valueIds,
    picksToPrice: enumerateAllLeaguePicks(snapshot.total_teams, 8).map(
      (p) => ({ ...p, ktc_value: 0 }),
    ),
  });
  const formatRules = opContext.format_rules;
  const starterDemandRemaining = opContext.starter_demand_remaining;
  const pricedSchedule = opContext.pricing.pick_values;
  const playerValueMap = new Map(
    Object.entries(opContext.pricing.player_values).map(([id, v]) => [id, v]),
  );

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
      // Operational rules derived from format + scoring + starter_slots.
      // CHECK THIS before claiming "X doesn't start" or "Y is bench."
      // In superflex (second_qb_starts === true), a second QB starts in
      // the SF slot. Hard-coded contract; bypassing it = engine bug.
      format_rules: formatRules,
    },
    me: me
      ? {
          owner: me.owner_name,
          position_counts: me.position_counts,
          // Per-position deficit between starter requirement and
          // current count. Use this for "do I need another QB" /
          // "starter hole at TE" reasoning instead of inferring from
          // position_counts + format guessing.
          starter_demand_remaining: starterDemandRemaining,
          avg_age: me.avg_age,
          record: `${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""}`,
          // Named roster with KTC-equivalent values where available.
          // Use this list (not position_counts) to VERIFY any claim
          // about WHO is on the roster, AND use `value` to bound any
          // player-side trade math.
          players: myPlayersResolved.map((p) => {
            const v = playerValueMap.get(p.player_id);
            return {
              ...p,
              value: v ? v.value : null,
              overall_rank: v ? v.overall_rank : null,
              position_rank: v ? v.position_rank : null,
            };
          }),
        }
      : null,
    // Trade pricing context (single source of truth via
    // buildOperationalContext). Receiving side of any trade MUST be
    // within ±15% of sending side; player values from FantasyCalc
    // compose arithmetically with pick values. See SYSTEM_PROMPT
    // hard rules.
    pricing: opContext.pricing,
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
    // Per-opponent profile for trade-initiation reasoning. Includes
    // position_counts (so the model can do exact math: "they have 0
    // TEs in a 1-TE league") and trade_angles from observe.ts which
    // already classifies stance (approach / extract / avoid) plus
    // surplus / deficit patterns. The model uses this to answer
    // "who has a need that lines up with what I have?" without
    // re-deriving roster shape from picks alone.
    opponents: opponents.teams.map((t) => {
      const r = snapshot.rosters.find((x) => x.roster_id === t.roster_id);
      // Pick-trade history derived from snapshot.draft.traded_picks
      // (no extra Sleeper call). Surfaces counterparty psychology
      // (pick flipper / hoarder / seller / quiet) so Coach can read
      // behavioral patterns instead of just current roster state.
      // The joeboch fingerprint from the 2026-05-08 izzydabomb session.
      const tradeHistory = buildOpponentTradeHistory({
        rosterId: t.roster_id,
        tradedPicks: snapshot.draft.traded_picks,
        currentSeason: snapshot.season,
      });
      // User-logged notes about this opponent. Most-recent first.
      // Coach treats these as named-pressure ammunition per the
      // existing system-prompt rule "USE the opponent's own words."
      // Limited to 5 most-recent per opponent to bound prompt size.
      const notes = (opponentNotesByRoster.get(t.roster_id) ?? [])
        .slice(0, 5)
        .map((n) => ({
          kind: n.kind,
          body: n.body,
          logged_at: n.created_at,
        }));
      return {
        owner: t.owner_name,
        roster_id: t.roster_id,
        picks: t.picks_count,
        position_counts: r?.position_counts ?? null,
        patterns: t.observations.map((o) => o.pattern_name),
        trade_angles: t.trade_angles.map((a) => ({
          stance: a.stance,
          headline: a.headline,
        })),
        trade_history: {
          signature: tradeHistory.signature,
          summary: tradeHistory.summary,
          picks_sent: tradeHistory.picks_sent,
          picks_received: tradeHistory.picks_received,
          future_picks_sent: tradeHistory.future_picks_sent,
          future_picks_received: tradeHistory.future_picks_received,
          current_picks_sent: tradeHistory.current_picks_sent,
          current_picks_received: tradeHistory.current_picks_received,
        },
        notes,
      };
    }),
    top_available: (() => {
      const buildEntry = (p: (typeof available)[number]) => {
        const v = playerValueMap.get(p.id);
        return {
          name: p.name,
          pos: p.position,
          team: p.team,
          age: p.age,
          sleeper_rank: p.search_rank,
          adp: p.adp,
          adp_variant: p.adp_variant,
          // ADP variant breakdown so Coach can cite cross-reference
          // values when explaining a counterintuitive call. Per
          // founder feedback 2026-05-08: the Sleeper UI default ADP
          // looks like "different planets" from the model's value
          // unless we surface the variants explicitly.
          adp_alternatives: p.adp_alternatives ?? [],
          is_rookie: p.is_rookie,
          // KTC-equivalent value (0-100). Bound trade asks using this
          // for any player on this list. Null when FantasyCalc didn't
          // ship a value for this player (rare; usually pre-NFL-draft
          // rookie or recent waiver).
          value: v ? v.value : null,
        };
      };
      const seen = new Set<string>();
      const entries: ReturnType<typeof buildEntry>[] = [];
      for (const p of available.slice(0, 30)) {
        seen.add(p.id);
        entries.push(buildEntry(p));
      }
      // Append any Decision-card player whose ID is past the top-30
      // slice. Guarantees the payload never says "Swift is the lean"
      // while top_available omits Swift. See decisionCardPlayerIds
      // construction above for the bug-class history.
      for (const id of decisionCardPlayerIds) {
        if (seen.has(id)) continue;
        const p = available.find((a) => a.id === id);
        if (!p) continue;
        seen.add(id);
        entries.push(buildEntry(p));
      }
      return entries;
    })(),
    // League read: trade-leverage synthesis + structural constraints.
    // Coach uses this to lead with strategic framing per the
    // system_prompt's "auto-lead with trade leverage during active
    // drafts" rule. Null when synthesis failed (best-effort).
    league_read: leagueRead,
    // Inflection windows on rostered + relevant available players.
    // Drives the system_prompt's "inflection bifurcation framing"
    // rule (mandatory bimodal framing for aging-cliff / rookie-debut
    // / post-injury players).
    inflections: inflectionItems,
    // Sloan-mode toggle from the user's browser cookie. When "on",
    // Coach adopts the drier register (Voice B) per BRAND_VOICE.md:
    // confidence intervals, signal scorecards, and model provenance
    // surface inline. Same content, different reader posture.
    sloan_mode: await readSloanMode(),
    nfl_draft_live: isNflDraftWindowActive(),
  };

  const client = new Anthropic({ apiKey });
  // During the NFL Draft window, append a short context line so the
  // coach reasons about in-flight rookie state correctly. Otherwise
  // the static prompt's "pre-NFL-draft rookies often have no team"
  // framing becomes stale mid-draft.
  const draftLiveContext = isNflDraftWindowActive()
    ? `\n\n## NFL Draft is LIVE\n\nThe NFL Draft is happening right now. The available pool contains a mix of pre-draft rookies (team: null) and post-draft rookies (team assigned). Treat each rookie individually based on their current team field. Picks are landing every few minutes; the user's snapshot may already be 30-60s stale by the time you reply. If the user asks "where did X get drafted," check the team field in top_available; only reach for web_search if the rookie isn't in the snapshot or their team field looks ambiguous.`
    : "";
  const system = `${SYSTEM_PROMPT}${COACH_CONTRACT}${draftLiveContext}`;

  // Trade-question classifier. When the user asks about trades and we
  // have NO pricing context to anchor against, structurally inject a
  // GUARD line that bars the LLM from freelancing trade math. Per
  // context-doctor 2026-04-24: the "6.2 for 4.3" failure happened
  // because pricing was absent and the model fabricated numbers.
  // Pricing is present whenever pricedSchedule has entries; the guard
  // only fires on real-pricing-absent requests.
  const TRADE_QUESTION_RE =
    /\btrade|offer|swap|send him|package|target|pick.*for.*pick|player.*for.*pick|for his pick\b/i;
  const looksLikeTradeQuestion = TRADE_QUESTION_RE.test(message);
  const hasPickPricing = pricedSchedule.length > 0;
  const hasPlayerPricing = playerValueMap.size > 0;
  // Guard fires when EITHER pricing axis is missing for the kind of
  // trade math the user is asking about. Picks-only trades survive
  // without player values; player-for-player needs both.
  const tradeMentionsPlayer = /\bplayer|him\b|trade .* for /i.test(message);
  const guardMissingPick = looksLikeTradeQuestion && !hasPickPricing;
  const guardMissingPlayer =
    looksLikeTradeQuestion && tradeMentionsPlayer && !hasPlayerPricing;
  const tradeGuard =
    guardMissingPick || guardMissingPlayer
      ? `\n\n[GUARD] Trade math requires pricing context. ${
          guardMissingPick ? "Pick values are unavailable. " : ""
        }${
          guardMissingPlayer ? "Player values are unavailable. " : ""
        }Decline to propose specific trades; describe the archetype of an acceptable ask (round bands, position type, value direction) instead. Numeric trade math without pricing context is the regression class we just fixed; do not regress.\n`
      : "";

  // Per-turn context injection. The fresh snapshot is wrapped with the
  // current user message so it lands AFTER any prior turns. This makes
  // it the most recent thing the model has seen and resolves the bug
  // where prior assistant turns referencing an earlier pick (e.g.
  // 7.12) overrode the current state (e.g. 9.12). The COACH_CONTRACT
  // tells the model that <current_state> is authoritative when prior
  // turns conflict.
  // Cost guard 2026-04-28: cap re-sent history at 20 messages.
  // Schema permits 40, but late-session turns at 40 messages can
  // reach ~16K+ input tokens, doubling per-turn cost. Slicing the
  // last 20 turns retains all recent context while bounding worst-
  // case input growth. The user-visible difference at most sessions
  // is zero (most coach sessions stay well under 20 turns).
  const COACH_HISTORY_LIMIT = 20;
  const trimmedHistory =
    history.length > COACH_HISTORY_LIMIT
      ? history.slice(-COACH_HISTORY_LIMIT)
      : history;
  const turnContent = `<current_state>\n${JSON.stringify(contextPayload, null, 2)}\n</current_state>${tradeGuard}\n\n${message}`;
  const messages: Anthropic.MessageParam[] = [
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
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
  // the response on a bookkeeping failure. web_search_requests is
  // billed separately from tokens by Anthropic (~$10 per 1k); pass
  // it through so the budget cap reflects real cost on search-
  // augmented turns.
  await recordSpend({
    model: "claude-sonnet-4-6",
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
