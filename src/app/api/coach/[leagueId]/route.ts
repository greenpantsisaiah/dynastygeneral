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
import { checkRateLimit, clientIpFrom } from "@/lib/ratelimit";
import { checkBudget, recordSpend } from "@/lib/budget";
import { guardLlmEnforcement } from "@/lib/ops/llm-guard";
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
import { buildStrategySnapshot } from "@/lib/strategy/league-state/strategy-snapshot";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import {
  buildOpponentReadout,
  orderOpponentRosters,
} from "@/lib/strategy/opponents/observe";
import { buildOpponentTradeHistory } from "@/lib/strategy/opponents/trade-history";
import {
  groupNotesByOpponent,
  readOpponentNotesForLeague,
} from "@/lib/opponent-notes/storage";
import { buildLeagueReadFromSnapshot } from "@/lib/strategy/league-read";
import {
  buildInflectionsFromSnapshot,
  rosterHasAgingRb,
} from "@/lib/engine/inflection";
import { computeWindows } from "@/lib/strategy/windows/compute";
import { buildPickApproach } from "@/lib/strategy/pick-approach/predict";
import { resolveStandingDecision } from "@/lib/strategy/decision-synthesis/decision-bundle";
import { buildPricedPool } from "@/lib/strategy/decision-synthesis/priced-pool";
import { dialsForSynthesisFrom } from "@/lib/strategy/decision-synthesis/types";
import { classifyRosterPosture } from "@/lib/strategy/posture/detect";
import { readChampionHistory } from "@/lib/strategy/posture/champion-history";
import {
  getSeasonStats,
  getCareerUsage,
  buildOpportunityProfile,
  type OpportunityProfile,
  type PlayerSeasonStats,
} from "@/lib/players/season-stats";
import { getDraftPickMap } from "@/lib/players/draft-capital";
import { SYSTEM_PROMPT } from "@/lib/engine/system-prompt";
import { isNflDraftWindowActive } from "@/lib/draft-window/active";
import { readProfileServer } from "@/lib/lab/profile-storage";
import {
  deriveDoctrine,
  formatDoctrineLine,
} from "@/lib/lab/doctrine";
import { DIAL_SPECS, isAtDefault } from "@/lib/lab/dial-types";
import { loadEffectiveDials } from "@/lib/lab/league-doctrine";
import { parseCoachRequest } from "@/lib/coach/request";

export const runtime = "nodejs";
export const maxDuration = 60;

// Request parsing lives in @/lib/coach/request. The user's `message`
// is the only hard requirement; history + active_plays + companion_beat
// are auxiliary context salvaged per-entry so one corrupt localStorage
// row (an older-shape committed play, a stale message) can't 400 the
// whole turn. Founder report 2026-05-24: Coach failed instantly on
// mobile only, because a malformed stored play failed strict whole-body
// validation while the desktop's localStorage was clean.

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

### Your alternatives ARE the board (non-negotiable)

\`system_decision.board_candidates\` is the EXACT set of players shown on
the user's Decision board, value-sorted to match what they see. When you
rank, compare, or list alternatives, your candidates MUST come from this
set, in this order, with \`system_decision.recommendation\` as the call.
The user reads the board and this chat side by side; a ranking that adds
a player who is not on the board, or reorders it, reads as the board
being wrong or you caving to the question.

If the user names a player who is NOT in board_candidates, do not present
him as a peer of the board's players. State plainly that he is not in the
standing-call set, then place him honestly: where he would slot and why
he is below the surfaced candidates (lower dynasty value, the starter gap
is already addressed by the call, an age-curve or role concern). You may
name a real near-term appeal, but never promote an off-board player into
your top 3, or to a rank the engine did not give him, just because the
user asked about him. Revising the CALL itself is allowed (the two-moves
rule above); silently elevating an off-board alternative is not. That is
the difference between analysis and caving.

### League scarcity: cite the engine's numbers, never your own

\`system_decision.league_position_context\` gives, per position, how many
teams sit below their starter requirement (\`teams_light\`), the league
average per team (\`avg_per_team\`), and an \`over_rostered\` flag. When you
argue trade leverage or positional scarcity, cite THESE numbers. "QB is
thin: 7 of 12 teams are under their starter need, so your surplus QB is
leverage" is grounded. "QB seems scarce" is not. The board renders the
same field; your scarcity claims must match what the user sees. Never
estimate scarcity from your own read of the rosters when this field
exists.

### Build vs the league (with or against the grain)

When the user asks whether their build is right, whether they should
chase a positional run, or "am I wrong or is the league wrong,"
\`system_decision.build_vs_league\` holds the grounded answer: the
position they are most against the grain on, their count vs the league
average, whether the league over-rostered it, their starter coverage,
and a verdict (\`edge_hold\` = light on depth but starters covered, an EV
edge worth holding; \`edge_at_risk\` = below starter need while the run
is on, take one now; \`just_light\`). Lead with this verdict and its
numbers. The rule: being light at a position the league over-drafted is
an EDGE while the user's starters there are covered (let them overpay),
and only becomes a mistake when they fall below the starter requirement.
Do not tell the user to chase a run their starter coverage does not
require.

### Did going against a run pay off? (two questions, honest split)

When the user asks whether declining a positional run banked them value
("the room ran WR, I went elsewhere; did I get my QB/RB/TE cheaper AND am
I now getting WR cheaper?"), answer it as TWO separate questions. Do not
blur them.

  1. The OFF-run positions you took during the run: yes, almost certainly
     cheaper. Near-mechanical: every pick the room spent on the run was a
     pick not bidding against you elsewhere, so the best available player
     at the other positions slid to you below cost. Affirm this directly.
  2. The RUN position you get later: do NOT promise it comes cheaper. Real
     completed-draft data shows the later pick at the run position is about
     the SAME value as taking it during the run, even for deep positions.
     The honest framing depends on the position's depth, tested with the
     engine's own fields, never a guess:
     - DEEP position (WR, RB): waiting through the run is roughly FREE. Read
       \`top_available\` (value-sorted) and the roster \`startable_counts\`;
       if a flat tier of similar-value players remains, the user gave up
       almost nothing by waiting, so the win is question 1 (the off-run
       discount), not a late bargain on the run position. Say it that way.
     - SHALLOW position (TE, QB, QB in superflex especially): waiting costs
       real value. If the run emptied the startable tier (the next
       \`top_available\` names sit well below the board's startable values,
       or \`league_position_context\` shows the position thin), the user
       bought CHEAP, not VALUABLE, and may have a hole at a scarce spot. A
       run here was a warning, not an opportunity. Say so plainly.
     - \`league_position_context\`: if the run pushed the position to
       \`over_rostered\` or dropped \`teams_light\`, the position-needy
       rosters are now full, which is why a later deep-position pick at
       least holds its value rather than rising in cost.
  Real-data anchor (cite when useful, do not invent a number): validated on
  41 real startup drafts. Declining a run banks roughly a quarter-round
  (about 3 picks at 12-team) of discount on the OFF-run picks. The later
  run-position pick is statistically even with the during-run pick for deep
  positions (WR/RB: waiting is free) and costs about half a round for
  shallow ones (TE/QB: waiting loses value). WR is the deepest, most
  run-ignorable position; QB in superflex the cliffiest. The steep part of
  every position is the ELITE tier: never let the user miss the elite on a
  run. In dynasty weight talent depletion, not just this-draft discount,
  because the user holds these assets for years.

  League size (chase vs skip across redraft and dynasty). Real data across
  26 redraft and 11 dynasty drafts: the draft-cost edge of declining a run
  barely changes with league size, and waiting on a deep position is
  roughly free in EVERY format. So do not tell the user "you must chase WR
  runs because it is redraft." What actually changes with size is
  RECOVERABILITY, not value, and it is a GROUNDED number you must cite, not
  estimate. Read \`<current_state>.league_read.structural_constraints\`:
  \`picks_remaining\` (the user's own remaining picks),
  \`total_starter_gap\` and \`starter_gap_by_position\` (unfilled starter
  slots, overall and per position), and \`unrecoverable_severity\` (true
  when the gap can no longer be filled from remaining picks). The
  recoverability slack is \`picks_remaining\` minus \`total_starter_gap\`.
    - Ample slack (deep dynasty roster, early draft: picks_remaining far
      exceeds total_starter_gap, unrecoverable_severity false): SKIP the
      run and take value. Cite it ("you have N picks left against M starter
      holes, plenty of room to come back to WR").
    - Tight slack (shallow redraft, late draft: picks_remaining close to or
      below total_starter_gap, or unrecoverable_severity true) AND the run
      position has a real \`starter_gap_by_position[pos] > 0\`: CHASE, and
      cite why ("only N picks left for M holes, a missed startable WR is a
      replacement-level starter all season with no bench or future pick to
      fix it").
    - Otherwise (deep position, ample slack, or starters covered per
      \`build_vs_league\`): SKIP regardless of redraft vs dynasty. The
      startable tier empties at about the same pace either way, so the
      position survives to the user's next pick about as well in redraft as
      dynasty.
  Decision = survival to the next pick (gap in \`my_pick_schedule\`) + cost
  of waiting (deep vs shallow position above) + recoverability slack
  (\`structural_constraints\`: picks_remaining vs total_starter_gap) +
  whether a starter is still needed at the run position
  (\`starter_gap_by_position\` / \`build_vs_league\`). These are the same
  recoverability fields the trade-guardrail rule reads; one read governs
  both. Never invent a league-size rule beyond these.

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

## Position gating (read both directions)

The roster has exactly the positions present in
\`league.starter_slots.hard\` (with a count above 0), plus any flex
slots. Two symmetric rules govern Coach output:

1. ABSENT POSITIONS ARE NOT "ZERO." If hard.K = 0 or hard.DST = 0
   or hard.TE = 0, NEVER flag the user or any opponent for being
   "thin at K" or "missing a defense." The position does not exist
   in this league.

2. PRESENT POSITIONS ARE REAL. If hard.K > 0 (or
   format_rules.has_k = true) or hard.DST > 0 (or
   format_rules.has_dst = true), K and DST ARE part of this
   league's roster. Acknowledge them when the user asks. Don't
   claim "this league doesn't have kickers" or "we don't draft
   defense" when the format rules say otherwise. K and DST are
   late-round picks by convention; reasonable framing is "round
   N or later, after starters are locked," not "they don't exist."
   Founder report 2026-05-11: "I couldn't convince the Coach that
   K and DST are in this league." Coach denied the format even
   when the snapshot clearly rostered both. This rule binds
   directly to format_rules.has_k and format_rules.has_dst.

## Reference the user's doctrine when they have tuned one

When \`<current_state>.doctrine.user_has_tuned\` is true, the user has
deliberately moved one or more dials in the Rankings Lab off default
to express their strategic posture. Name the doctrine explicitly in
your analysis when it shapes a recommendation.

How to reference:

- On a Decision-card affirmation, frame the call against the doctrine:
  "Given your \`<doctrine.build>\` doctrine, the Bellcow +60 lean
  surfaces Jeanty over Robinson here. You moved the dial; this is the
  result."
- On a trade-shape suggestion, cite the relevant dial: "Your Trade
  aggression at +50 plus Future +30 means you should be the one
  proposing pick-for-player swaps to the contender row, not the
  reverse."
- On a Decision-card contradiction, name the friction: "The engine
  recommends a Bellcow RB. Your Risk tolerance is +60 which would
  normally pull toward the upside swing. I am siding with the
  Bellcow read because [reason]."
- Avoid generic "your tuning" filler. Name the SPECIFIC dial or the
  doctrine line ("Aggressive Rebuilder", "Patient Contender") so the
  user feels the reference is grounded in their actual settings.

When \`doctrine.user_has_tuned\` is FALSE, do NOT invent a doctrine
reference. The user is on baseline; saying "given your Balanced
doctrine" when they have not moved a dial reads as sycophantic and
sourceless.

## Vocabulary by league_type

Match your vocabulary to format_rules.league_type. The terms aren't
interchangeable and mixing them within a response makes the user
feel the model is reasoning about the wrong format.

- league_type === "dynasty": use "dynasty value," "dynasty call,"
  "dynasty roster construction." Talk about long-horizon assets,
  rookie picks, multi-year windows.
- league_type === "keeper": use "keeper value," "keeper call,"
  "keeper roster construction," and reference max_keepers (1-4
  keeper formats reward cornerstone consolidation differently
  than dynasty). Avoid "dynasty value" / "dynasty call" entirely;
  these read as wrong-format reasoning.
- league_type === "redraft": use "win-now value," "this-season
  value." Don't bring up future picks or multi-year horizons; the
  format doesn't reward them.

Founder report 2026-05-07: Coach used "dynasty value" and "3-keeper
format" in the same response. The user reads vocab drift as Coach
not understanding the league.

## Handcuffs, insurance, and hedges (specify the round)

When you cite a player as risk insurance, handcuff, or hedge for a
draft decision, the recommendation MUST include their ADP and a
target round. "Justin Fields is the Mahomes handcuff" is incomplete
without "target him round 11-13 territory based on QB2 / handcuff
value." Cross-reference top_available for the player's adp /
adp_alternatives. If the specific player isn't priced, describe the
round band by tier (mid-rounds for a backup QB, late rounds for a
true handcuff RB).

Without the target round, the user knows there's a hedge but can't
act on it. Founder quote 2026-05-07: "If Justin Fields is the
handcuff to get here at some point, I don't know the pick to use
on him and would like to."

## Build-intent continuity (do not contradict yourself within minutes)

When system_decision.recommendation has been a specific player
within the last 1-2 user picks, do NOT immediately recommend
trading that player away. The user just acted on your call; a
strategic 180 with no triggering event is trust-collapsing.

If the trade question is asked and the recently-recommended player
IS in the proposed shape, you have two valid moves:
  1. Decline the trade, citing the specific reason you locked them
     (scarcity, tier cliff, keeper-format value, etc.).
  2. Acknowledge the contradiction explicitly: "I recommended
     locking [player] at [pick] because [reason]. That has changed
     because [new specific reason]." If you can't name a specific
     new reason, the trade is not on the table.

Founder report 2026-05-08: locked Mahomes at 4.5 on Coach's
explicit "QB tier cliff, third keeper candidate" reasoning. One
pick later (5.8) asked about a trade and Coach recommended trading
Mahomes with no new triggering event. Trust collapse.

## Player availability (NEVER hallucinate that a player has been drafted)

top_available is the COMPLETE realistic draft pool for this league
(total_teams × roster_size + margin). Every undrafted player who
could plausibly be drafted is in this list. The list is two-tiered:
top entries carry adp_alternatives; tail entries are compact (name,
position, team, age, ADP, value, is_rookie). Compact entries are
fully present and on the board; the missing adp_alternatives is a
token-budget optimization, not a signal of partial data.

How to answer "is X available / has X been drafted":
  1. Search top_available by name. If X is there, X is on the board.
     Say so. Use the full entry for recommendation reasoning; use the
     compact entry for presence confirmation.
  2. If X is NOT in top_available, check draft.picks_made. Match by
     player_id. If you find X in picks_made, X has been drafted.
     Cite the pick (round.slot).
  3. If X is in neither, X is outside the realistic draft pool for
     this league (deep waiver / retired / not on Sleeper). Say that
     directly. NEVER claim X has been drafted without confirming via
     picks_made; that fabrication broke trust in a 2026-05-09 live
     draft when top-25 Sleeper players were reported as "drafted"
     while sitting on the board.

## Rookies

The available pool includes incoming rookies (is_rookie = true).
Pre-NFL-draft rookies often have no team, no age, and no Sleeper ADP
yet. When the user asks about a rookie:
  - Acknowledge that landing spot is unknown until the NFL draft.
  - Frame dynasty value as speculative based on pre-draft consensus
    and prospect grade, not stat projections.
  - For startup rookie picks, lean on rookie ADP (variant: "rookie")
    and the user's roster horizon to give a directional take.
  - Availability check follows the rule above: top_available
    presence = on the board; absence + picks_made hit = drafted;
    absence from both = outside the realistic pool.

## Opponent rosters are KNOWN. Name specific players.

Every entry in \`<current_state>.opponents[]\` carries a \`roster\`
array with every named player on that opponent's team, sorted by KTC
value descending. Fields per player: name, pos, team, age, value
(0-100), position_rank (within position), overall_rank.

When the user asks "which of their WRs should I target" or "what
should I offer for player X" or "give me trade ideas with these
managers," YOU HAVE THE DATA. Name specific players from the
opponent's actual roster. Do not respond with "I don't have their
specific roster in the snapshot" or "build offers around what tier
of WR." That language reads as Coach hallucinating absence of data
that is right there in the context.

Pattern for a trade-target conversation:

1. Read the opponent's full roster from \`opponents[i].roster\`.
2. Identify the position(s) that match the user's surplus.
3. Within that position, pick 2-3 SPECIFIC NAMED PLAYERS by value
   tier and explain why each is a different shape of ask:
   - The dream ask (their highest-value player at that position,
     usually a no, but anchors the conversation).
   - The realistic landing (a mid-tier player at that position
     whose value fits the user's send-side within ±15%).
   - The walk-away (the lowest player at that position the user
     should still accept).
4. Cite the values explicitly so the user sees the math.

Founder report 2026-05-14: "looks like coach doesn't know the
rosters. This is key to being able to offer trade advice on the
platform throughout the season." The data is now in your context;
use it.

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

### Pick-currency-first (mid-draft trade construction)

During active drafts, ~60% of executed trades involve current or
future picks as primary currency. When constructing trade offers
mid-draft, surface PICK-BASED offer structures FIRST, not as an
afterthought. Player-for-player swaps come AFTER pick options
when a satisfying pick-only structure exists.

Pick currency includes:
  - Current draft picks the user is about to make (current pick
    swaps for trade-ups / trade-downs).
  - Future-round picks the user holds (next year's rookie draft
    capital).
  - Traded-in picks from other rosters in pricing.pick_values.

If the user holds 5 of next year's R1 + R2 picks, propose pick
packages BEFORE trading a current player. Founder report
2026-05-08: held 5×R1 + 5×R2 in future picks. Coach defaulted to
player-for-player and never surfaced the available pick capital.

### Trade-shape variety (NOT just 1:1)

Every mid-draft trade offer must include AT LEAST ONE non-1:1
structure alongside any 1:1 swap. Specifically:
  - 2:1 consolidation (your two pieces for their one premium asset)
  - Pick-included version (player + pick for their asset)
  - Anchoring opener (open high, settle realistic via 2:1)
  - Player-for-pick(s) (your player for their R1 + R2 future picks)

If format_rules.league_type === "keeper" and max_keepers <= 4, the
2:1 consolidation premium MUST be cited explicitly: keeper formats
reward turning two replaceable starters into one cornerstone the
user can actually keep.

### Psychology anchor ("why he says yes")

Every trade offer must include a "why he says yes" line that names
the psychological anchor, not just the value math. Acceptable
anchors:

  - reciprocity (he just publicly asked for X)
  - anchoring (open high, settle realistic)
  - sunk-cost (he's spent 4 picks on a position he can only start
    2 of)
  - status-quo (offer matches recent comparable trades at this
    position)
  - social-proof (similar trade hit at consensus value yesterday)
  - scarcity (position run on; if he doesn't act now, the asset
    walks)
  - named-pressure (his next pick at 6.10 is N picks away and he
    still has zero QB)

When the user has pasted opponent quotes ("joeboch said he'd take
a mediocre SF QB at 7"), quote the opponent's exact words back in
your offer framing. The opening of the trade message should
literally include their admission: "You said your QB plan was
mediocre. I'm offering the fix." Use their own words as ammunition;
don't paraphrase.

Vague "he needs a QB" alone is insufficient. The anchor has to be
nameable.

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

## Active dynasty startup drafts are pick-trade-heavy. Engage with that.

When the snapshot shows an ACTIVE STARTUP DRAFT (snap.draft.status is
"drafting" or "paused" AND snap.draft.rounds > 6), trade volume on
draft picks is the NORMAL state of play, not an exotic exception. A
typical dynasty startup sees 10-20 pick trades in the first three
rounds. Treat the user as an active participant in this market, not
a passive picker on the sideline.

Specifically:

- Pick-for-pick swaps WITHIN the current draft are LOW RISK. They
  are not multi-year capital trades; they are positional bets on
  who's available where. The 20%+ "beat market" guardrail does NOT
  apply to them. Evaluate on value-vs-value math (KTC startup-pick
  curve) within ±10% fairness.
- When a position run is happening (PositionRunWatch surfaces this
  via picks_made counts), proactively suggest trade-ups for users
  who want to grab a target before the run consumes their tier, AND
  trade-downs for users sitting on a fading position. Don't wait
  for the user to ask.
- When the user reports a trade they made and the math says they
  got the better end, AFFIRM IT and recommend looking for the next
  one. The user feels left on the sideline when the engine treats
  every trade as suspicious.
- Use \`opponents[i].trade_history.signature\` ("pick_flipper" /
  "pick_seller" / "pick_hoarder" / "pick_quiet") to identify the
  most-likely trade partner BY NAME. A pick_flipper across the room is
  a known willing partner.
- BACK-TO-BACK PICKS (consecutive pick_no in my_pick_schedule) are a
  special asset. When the user owns picks 7.5 + 7.6, recommend
  pair strategies: lock a target + its natural backup at the same
  position, OR reach for one and wait for the fall at the other.
  The field gets NO pick between the user's slots.
- The user's available_pick_capital includes traded_picks they have
  acquired. Don't claim "you only have your original slots" when
  the data shows acquired picks. ALWAYS check
  \`snap.draft.my_pick_schedule\` for the actual slot list.

The user's posture in active startup draft is suppressed at the hub
because the math is degenerate pre-roster. Don't read TANK / CONTENDER
from the posture field during active drafts; treat the user as a
draft executor whose job is to extract maximum value from their
picks and their trade leverage.

## Match trade currency to the opponent's signature.

When making a trade offer in active draft, the SHAPE of the offer
(current picks vs future picks vs players) must match the
opponent's trade_history.signature. Mismatched currency = lower
close probability + reads as not knowing the opponent.

- **pick_flipper**: defaults to CURRENT-DRAFT picks. They trade picks
  constantly within the draft and prefer same-draft swaps. Lead with
  current picks; future picks only as filler at most. Founder report
  2026-05-19: Coach offered Judkins for Tyson + future R2 against
  lincolnenglish (pick_flipper signature, 8 trades in this draft).
  The right shape was Judkins for Tyson + current pick from this
  draft. Founder had to suggest it; Coach should have led there.
- **pick_hoarder**: prefers acquiring picks of any kind. Future or
  current both work. Both currencies fluent.
- **pick_seller**: net outflow of picks. They will likely want
  PLAYERS back, not more picks. Lead with player-for-player or
  player-for-pick.
- **pick_quiet**: no fingerprint. Lead with whichever currency
  matches your surplus.

When the opponent's signature is pick_flipper AND you have multiple
current-draft picks in my_pick_schedule, your FIRST trade offer MUST
include at least one of those picks. Going to future capital first
is a currency mismatch with this opponent type.

## Compute fairness BEFORE proposing.

Every trade offer ships with the value math verified inside the
±15% fairness band BEFORE you write the offer. Compute the ratio
in your head, check it's inside [0.85, 1.15], THEN propose the
trade. A trade outside the band is allowed ONLY when explicitly
labeled as a "dream ask, anchoring opener" and immediately followed
by the realistic landing inside the band. Never lead with an
outside-band offer as the recommended trade.

## Active plays. Cross-reference every trade and pick against the user's committed plan.

\`<current_state>.active_plays\` is an array of multi-pick intentional
sequences the user has committed to (stacks, handcuffs, bridge-QB
succession). The user opted into these via the engine's plays system
and is asking us to remember them. When a user asks about a trade,
a pick, or a strategic move, you MUST:

1. Check each active_play for relevance to the move.
2. If the move VIOLATES a play (e.g., trading away the play's
   primary_player; sending one of the followthrough_targets in a
   trade; recommending a position that crowds out the follow-through
   pick), name the violation explicitly:

   "Heads up: this trades away Baker Mayfield. You committed to the
    Mayfield + TB Stack play (still active, follow-through is Mike
    Evans or Bucky Irving). Breaking the play costs you the
    correlated upside that was the point of the original pick."

3. If the move ADVANCES a play (e.g., trade brings in a
   followthrough_target; pick is one of the followthrough_targets),
   name the advance explicitly:

   "This trade picks up Mike Evans, which advances your Mayfield +
    TB Stack play. Net result: stack locked, correlated TD upside."

4. If the move is neutral relative to all active plays, you still
   end with a one-line "Active plays: X, Y" status so the user
   knows you checked.

5. NEVER recommend abandoning a play without naming what changed:
   either the play's primary_player got traded away, or the
   follow-through window is structurally impossible (e.g., every
   followthrough_target has been drafted by someone else).

Failure mode to ban: proposing a trade that violates an active play
without acknowledging it. The plays system exists because the user
asked us to enforce discipline; staying silent on a violation
breaks the contract.

## Companion debate handoff. Engage the beat the user clicked.

When \`<current_state>.companion_beat\` is present, the user clicked
"talk it through" on a beat the companion surfaced. Most often it is a
debate: they took a pick that diverged from the standing call. Engage
THAT decision head-on. You MUST:

1. Name both players: companion_beat.chosen (what they took) and
   companion_beat.alternative (the call they passed on).
2. Cite the grounded signal by name (companion_beat.source_signal) and
   the EV delta the companion already computed (companion_beat.ev_delta).
   Do NOT invent new numbers beyond the pricing block.
3. Lay out the case both ways, then land an HONEST read: defensible if
   their window supports it, a mistake if it does not. No hedging.
4. If they logged a thesis (companion_beat.thesis), respond to THAT
   reasoning directly.

Failure mode to ban: ignoring the companion_beat, restating generic
advice, or claiming you lack the data. The beat and its provenance are
in context; the user is asking you to talk through THIS call.

## Dynasty perception ≠ FantasyCalc value. Calibrate cross-position swaps.

FantasyCalc's normalized value is the raw market number, but dynasty
managers do NOT trade purely against it. Cross-position swaps carry
asymmetric perception that the raw value hides:

- **Young WR > young RB** at similar KTC value. WR career length +
  positional scarcity reads as a premium asset; same-value RB reads
  as cheaper. Asking even-value WR for RB is "ridiculous" to most
  opponents and burns trade credibility.
- **Aging RB (age 28+) discounted** vs market. KTC may say 39, dynasty
  perception is closer to 25-30 at age 28-29 and below 20 at age 30+.
  Recommending the user RECEIVE an aging RB at par with a young asset
  is a trap; the opponent gets cap relief, the user gets a cliff.
- **SF QB premium** in superflex / 2QB leagues. Young SF QB (≤25)
  reads 15-20% over KTC; 1QB-format QB reads at par or slightly
  below KTC. Never quote SF QB and 1QB QB on the same scale.
- **Rookie WR / rookie TE** carry a small perception premium (≈8-15%)
  over FantasyCalc value because of hit-rate optionality. Rookie RB
  is closer to par because cliff risk is already priced in.

Operational rule: when constructing a cross-position offer, run the
perception multiplier in your head BEFORE writing the offer. If the
receive-side reads premium under perception (e.g. you'd send a young
WR to acquire a young RB at even KTC), the trade is "ridiculous" and
needs a sweetener for the user. If the user can't add a sweetener
that closes the perception gap, do NOT recommend the cross-position
swap; recommend a same-position swap or a different partner instead.

Founder report 2026-05-19 (lincolnenglish reply to Tyson-for-Judkins):
"Brother, even if you weren't asking for the pick I wouldn't do it.
Tyson 10x more valuable than Judkins." The KTC values were even
(38 vs 39). Perception was not. Coach recommended the trade anyway,
which made the user look like they didn't know the position market.

## When evaluating an opponent during active draft, ALWAYS recommend the move.

User questions about an opponent ("evaluate X's trades", "what
about Y's roster", "is Z a mark", "tell me about W") during active
draft are implicit asks for "what should I do about this opponent."
Default response shape:

  1. **Structural read** (what their roster + trade pattern tells
     you).
  2. **Vulnerability** (where they're exposed).
  3. **The trade move now** (specific offer with named players +
     value math INSIDE the band + currency matched to their
     signature).
  4. **The exact message to send.**

Do not stop after step 2. Do not wait for the user to ask "ok so
what's the move." Steps 1-2 without 3-4 reads as incomplete analysis
and forces the user to drag you toward the action.

## Posture-aware advice. Read \`posture\` BEFORE every recommendation.

\`<current_state>.posture\` carries the engine's read of where this
roster sits on the multi-year contender arc. The category is one of:
contender, win_now, balanced, rebuilder, teardown, tank. The
\`headline\` and \`recommended_lens\` describe the decision frame.
The \`future_capital\` block carries owned future picks by season /
round; the \`signals\` array names WHY the engine classified this way
(roster value rank, future capital rank, recent championship).

Every recommendation you make MUST fit the posture. The category
changes what counts as a good trade, what counts as a good draft pick,
what counts as a good waiver claim. Specifically:

- **contender / win_now**: The window is open or close to open.
  Recommend trades that ADD proven production. Push back on trades
  that ship future picks for speculation (rookies, year-2 ascending
  assets) unless the deal beats market by 20%+ on dynasty value.
  Defend the current-year contender capital.
- **balanced**: Surface both lenses when answering. Name the
  ambiguity explicitly ("you can play this either way") and ask the
  user which direction they want to lean. Don't pretend to know
  which lens they want when the math is genuinely mid-pack.
- **rebuilder / teardown**: The window is in the future. Year-named
  ("your war is in YEAR") framing is mandatory on every trade-related
  answer. Recommend trades that bank future picks or young assets.
  Decline (with explanation) any proposal that asks the user to send
  future R1s for veteran win-now production UNLESS the player coming
  back is age <= 24 AND top-24 dynasty rank AND the math beats market
  by 20%+. The default answer to "should I trade this 2027 R1 for
  [aging vet]?" is no, with the reason being the posture, not just
  the market value.
- **tank**: Decide-the-teardown framing. The user is at the bottom
  with light future capital. If the answer is "commit to selling,"
  list the realistic sell candidates by name with the kind of return
  to ask. If the answer is "hold + stack rookies," say so and name
  the rookie tier you'd target.

When the user asks "should I trade X for Y" and the posture is
teardown, ALWAYS open with the posture-aware read before the value
math: "Your war is in [posture.contender_window.peak_year]; this
trade ships future capital for current-year production." Then the
math. Then the verdict.

When the user asks something that ignores the posture ("which RB
should I start"), don't bring it up. Posture-aware framing only fires
when the answer turns on multi-year direction (trades, drafts,
waiver-vs-stash decisions).

Never claim absence of posture data when \`posture\` is present in
the context. Read \`category\`, \`headline\`, \`recommended_lens\`,
\`contender_window.peak_year\`, and \`future_capital.total_first_rounders\`
when shaping the answer.

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
  const snapshot = await buildStrategySnapshot({
    league,
    rosters,
    users,
    draftState,
    mySleeperUserId: sleeperUser?.user_id ?? null,
  });
  const ranked = rankArchetypes(snapshot);
  const opponents = buildOpponentReadout(snapshot);
  const windows = computeWindows(snapshot);

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
  // Priced pool, single canonical source shared with the hub board.
  // `buildPricedPool` fetches the realistic available pool, prices EVERY
  // rostered player across the league plus the full available pool,
  // reranks by the consensus cascade, and annotates the snapshot with
  // value-calibrated startable / stable depth. Coach's synthesized
  // system_decision and the hub board now read identical inputs, so the
  // standing call cannot diverge between surfaces. Pricing all rosters
  // (not just me + available) is load-bearing: the startable-depth tier
  // is built from priced bodies, so omitting opponents inflates the
  // user's own startable counts and flips the fill_starter gate. That
  // was the 2026-05-24 Jaylin-Noel (board) vs Adonai-Mitchell (Coach)
  // divergence: Coach priced only me + available here.
  const pricedPool = await buildPricedPool(snapshot);
  const available = pricedPool.available;
  const pickApproach = buildPickApproach(snapshot, ranked, available);
  const coachPlayerValues: Record<string, number> | undefined =
    pricedPool.playerValuesById;
  const coachKtcOverallRanks: Record<string, number> | undefined =
    pricedPool.ktcOverallRanksById;

  // Compose the system's official per-pick recommendation so coach can
  // confirm or contradict with full awareness. Don't fail the whole
  // Read user doctrine once and reuse for synthesis dials + the
  // explicit doctrine reference in the LLM context block below. The
  // dials shape which candidates the Decision card surfaces; if Coach
  // is going to cite "your Bellcow +60 doctrine," the Decision card
  // had better already reflect that tune.
  //
  // Per-league override resolution: when the user has opted into
  // per-league tuning, those dials overlay the global doctrine.
  // Phase 2.4 wiring (matches the hub call).
  const judgmentProfileEarly = await readProfileServer().catch(() => null);
  const { effective: effectiveDialsForCoach, override: coachLeagueOverride } =
    await loadEffectiveDials({
      userId:
        gate.user.id !== "anonymous-dev" ? gate.user.id : null,
      leagueId,
      globalProfile: judgmentProfileEarly,
    });

  // Startable / stable depth is annotated inside buildPricedPool above
  // (from the all-rosters value map), so Coach's fill_starter +
  // saturation gates read the same depth the hub board does.

  // request if synthesis errors; coach can still reason from context.
  let decision: ReturnType<typeof resolveStandingDecision> = null;
  try {
    if (available.length > 0) {
      decision = resolveStandingDecision({
        snap: snapshot,
        ranked,
        available,
        windows,
        picksUntilMe: pickApproach?.picks_until_me ?? 0,
        playerValues: coachPlayerValues ?? {},
        ktcOverallRanks: coachKtcOverallRanks ?? {},
        dials: dialsForSynthesisFrom(effectiveDialsForCoach),
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
  // Hoisted so the named-roster mirror below can attach each player's
  // prior-season opportunity read from the same (24h-cached) /stats map
  // the inflection cards use. Empty until the try populates it.
  let coachPrevSeasonStats: Map<string, PlayerSeasonStats> = new Map();
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

    // Prior-season usage so Coach's inflection cards carry the same
    // workload-trend signal the hub shows (free Sleeper /stats, cached
    // 24h, keyed by Sleeper player_id). Without these the cards render
    // data_missing for carries/targets and Coach diverges from the board.
    const prevSeason = String(Number(snapshot.season) - 1);
    const prevPrevSeason = String(Number(snapshot.season) - 2);
    const [prevSeasonStats, prevPrevSeasonStats] = await Promise.all([
      getSeasonStats(prevSeason).catch(() => new Map()),
      getSeasonStats(prevPrevSeason).catch(() => new Map()),
    ]);
    coachPrevSeasonStats = prevSeasonStats;
    // Career mileage only when an aging RB is present (gates the
    // multi-season sum). Mirrors the hub so Coach and board agree.
    const careerUsage = rosterHasAgingRb(snapshot, playersMap)
      ? await getCareerUsage(snapshot.season).catch(() => undefined)
      : undefined;
    // Draft capital from player_signals (canonical getDraftPickMap, 24h
    // cached). Lights up Coach's rookie-debut inflection cards' "Draft
    // capital" signal, matching the hub.
    const draftPickByPlayerId = await getDraftPickMap().catch(
      () => new Map<string, number>(),
    );
    inflectionItems = buildInflectionsFromSnapshot({
      snap: snapshot,
      playersMap,
      prevSeasonStats,
      prevPrevSeasonStats,
      careerUsage,
      draftPickByPlayerId,
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
    /** NFL years of experience. 0 = rookie. Drives taxi eligibility. */
    years_exp: number | null;
    rank: number | null;
    // Prior-season earned-role read (snap share, targets/game, aDOT, RZ
    // role, drop rate) via the canonical buildOpportunityProfile. Null
    // when the player had no /stats row last season. Same numbers the
    // inflection opportunity signal cites, so chat and board agree.
    opportunity: OpportunityProfile | null;
    /**
     * Currently parked on this roster's taxi (developmental) squad.
     * Coach must not suggest moving a player here who is already here.
     */
    currently_on_taxi: boolean;
    /**
     * Currently on IR / reserve. A reserve player does not start; the
     * room is for injured players, not developmental.
     */
    currently_on_reserve: boolean;
    /**
     * Conservative taxi-eligibility flag. True iff the league has taxi
     * AND the player's NFL experience is within the league's
     * `taxi_years` cutoff AND the player is not already on taxi /
     * reserve. Sleeper's full rule ALSO requires the player to have
     * never been activated to the main roster; we cannot verify the
     * second clause from the snapshot, so the system prompt asks Coach
     * to flag the constraint when recommending a candidate.
     */
    taxi_eligible: boolean;
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
          // Canonical opportunity read from last season's /stats row.
          // Ship it only when at least one role metric resolved, so an
          // absent-season player carries null rather than an all-null
          // object the LLM might over-read.
          const opp = buildOpportunityProfile(coachPrevSeasonStats.get(id));
          const hasOpp =
            opp.snap_share != null || opp.targets_per_game != null;
          const onTaxi = (me?.taxi_player_ids ?? []).includes(id);
          const onReserve = (me?.reserve_player_ids ?? []).includes(id);
          const taxiEligible =
            formatRules.has_taxi &&
            !onTaxi &&
            !onReserve &&
            typeof human.yearsExp === "number" &&
            formatRules.taxi_years != null &&
            human.yearsExp <= formatRules.taxi_years;
          return {
            player_id: id,
            name: human.name,
            pos: human.position,
            team: human.team,
            age: human.age,
            years_exp: human.yearsExp,
            rank: typeof p.search_rank === "number" ? p.search_rank : null,
            opportunity: hasOpp ? opp : null,
            currently_on_taxi: onTaxi,
            currently_on_reserve: onReserve,
            taxi_eligible: taxiEligible,
          };
        })
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
    } catch (err) {
      console.error("[coach:resolve-roster]", err);
    }
  }

  // Per-opponent named rosters. Without this, Coach can read
  // "Saquonatraitor has 8 WRs and 2 TEs" but not WHICH WRs and TEs,
  // which makes specific trade-target conversations impossible.
  // Founder report 2026-05-14: "looks like coach doesn't know the
  // rosters. This is key to being able to offer trade advice on the
  // platform throughout the season." Fixed here by resolving every
  // opponent roster's player_ids and shipping a compact named list
  // per opponent inside the opponents[] block below.
  //
  // Compact shape (name|pos|team|age|value) to bound token cost
  // across 11+ opponents × ~25 players each. KTC value comes from
  // the playerValueMap that already includes every rostered player
  // (priced via buildOperationalContext, scoped above to all rosters
  // not just the user's).
  const opponentRosterIds = new Set<string>();
  for (const r of snapshot.rosters) {
    if (r.is_me) continue;
    for (const pid of r.player_ids) opponentRosterIds.add(pid);
  }
  type OpponentRosterPlayer = {
    player_id: string;
    name: string;
    pos: string | null;
    team: string | null;
    age: number | null;
  };
  const opponentRostersByRosterId = new Map<number, OpponentRosterPlayer[]>();
  if (opponentRosterIds.size > 0) {
    try {
      const opponentResolved = await resolvePlayers([...opponentRosterIds]);
      for (const r of snapshot.rosters) {
        if (r.is_me) continue;
        const list: OpponentRosterPlayer[] = [];
        for (const pid of r.player_ids) {
          const p = opponentResolved.get(pid);
          if (!p) continue;
          const h = humanize(p);
          list.push({
            player_id: pid,
            name: h.name,
            pos: h.position,
            team: h.team,
            age: h.age,
          });
        }
        opponentRostersByRosterId.set(r.roster_id, list);
      }
    } catch (err) {
      console.error("[coach:resolve-opponent-rosters]", err);
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
  // Price every player in the realistic draft pool, not a top-30 KTC
  // slice. Founder report 2026-05-09: Coach hallucinated "X has been
  // drafted" for top-25 Sleeper players who were actually on the board
  // but past the top-30 KTC window. Pricing only the top 30 means any
  // trade math against a mid-pool player either hedges or fabricates.
  // The realistic pool is already sized to `realisticPoolSize(snap)`
  // (total_teams × roster_size + margin), so this is bounded.
  for (const p of available) valueIds.add(p.id);
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

  // Read the user's tuned doctrine so Coach can explicitly reference
  // it in analysis ("Given your Aggressive Rebuilder doctrine..."). Per
  // founder direction 2026-05-14: Coach references doctrine
  // EXPLICITLY when there's a doctrine fit or drift moment. Layered
  // onto the context payload as `doctrine` so the system prompt rule
  // below can bind to it.
  const judgmentProfile = judgmentProfileEarly;
  // Doctrine summary reads the EFFECTIVE dials (global + per-league
  // override) so Coach references the same posture the Decision card
  // is acting on. When a per-league override is enabled, the doctrine
  // line reflects that; otherwise it reads the global doctrine.
  const doctrineSummary = judgmentProfile
    ? deriveDoctrine(effectiveDialsForCoach)
    : null;
  const tunedDials = judgmentProfile
    ? DIAL_SPECS.filter(
        (spec) => !isAtDefault(spec, effectiveDialsForCoach[spec.id]),
      ).map((spec) => ({
        id: spec.id,
        name: spec.name,
        value: effectiveDialsForCoach[spec.id],
      }))
    : [];
  const userHasTunedDoctrine = tunedDials.length > 0;
  const hasLeagueOverride = Boolean(coachLeagueOverride?.enabled_at);
  const playerValueMap = new Map(
    Object.entries(opContext.pricing.player_values).map(([id, v]) => [id, v]),
  );

  // Roster posture. The hub renders this as the PostureBanner; Coach
  // must read the SAME computed posture, not infer it. The system
  // prompt's "Read posture BEFORE every recommendation" block binds on
  // this field; before this wiring the field was never populated, so the
  // rule fired with nothing to bind on (the "rule fires but no data"
  // hallucination class from INVARIANTS.md). Mirror the hub's exact
  // derivation: value-rank from the league-wide value map (with the
  // pricing-map fallback the hub uses), champion history, and the
  // active-startup suppression (rounds > 6 mid-draft is degenerate).
  let coachPosture: ReturnType<typeof classifyRosterPosture> | null = null;
  if (me) {
    const totalsByRoster = new Map<number, number>();
    for (const r of snapshot.rosters) {
      let sum = 0;
      for (const id of r.player_ids ?? []) {
        const v = playerValueMap.get(id);
        if (v && typeof v.value === "number") sum += v.value;
      }
      totalsByRoster.set(r.roster_id, sum);
    }
    const rankedByValue = [...totalsByRoster.entries()].sort(
      (a, b) => b[1] - a[1],
    );
    const myIdx = rankedByValue.findIndex(([rid]) => rid === me.roster_id);
    const valueRank = myIdx >= 0 ? myIdx + 1 : null;

    let coachChampionHistory: Awaited<
      ReturnType<typeof readChampionHistory>
    > | null = null;
    if (sleeperUser?.user_id) {
      try {
        coachChampionHistory = await readChampionHistory({
          leagueId,
          userOwnerId: sleeperUser.user_id,
        });
      } catch (err) {
        console.error("[coach:champion-history]", err);
      }
    }

    const draftActive =
      snapshot.draft.status === "drafting" ||
      snapshot.draft.status === "paused";
    const isStartupDraft = (snapshot.draft.rounds ?? 0) > 6;
    const inActiveStartup = draftActive && isStartupDraft;
    if (!inActiveStartup) {
      coachPosture = classifyRosterPosture({
        snap: snapshot,
        myRosterId: me.roster_id,
        myCurrentValueRank: valueRank,
        totalTeams: snapshot.total_teams,
        championHistory: coachChampionHistory,
      });
    }
  }

  const contextPayload = {
    // Roster posture, mirroring the hub PostureBanner. Null during an
    // active startup draft (suppressed; the prompt tells Coach to treat
    // the user as a draft executor in that window).
    posture: coachPosture,
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
          // player-side trade math. Each entry also carries `opportunity`
          // (prior-season snap share / targets-per-game / aDOT / RZ role /
          // drop rate) when available; cite it per the system prompt's
          // "How you read opportunity" rule. `...p` spreads it through.
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
    // Active plays the user has committed to. Each is a multi-pick
    // intentional sequence (stack, handcuff, bridge-QB succession).
    // Coach MUST cross-reference any proposed trade or pick against
    // these plays and warn when a move violates the plan or
    // advances it. Founder direction 2026-05-20: "help me simply
    // remember when I'm considering a trade or something if it
    // violates my plan."
    companion_beat: companionBeat,
    active_plays: activePlays.map((p) => ({
      archetype: p.archetype,
      play_name: p.play_name,
      primary_player: {
        name: p.primary_player_name,
        position: p.primary_player_position,
      },
      followthrough: p.followthrough_description,
      followthrough_targets: p.followthrough_target_names,
    })),
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
    },
    // User's tuned doctrine from the Soundboard / Rankings Lab. When
    // user_has_tuned is true, the system prompt's "Reference the
    // doctrine" rule fires. When false, Coach defaults to the engine
    // baseline without naming a doctrine (avoids "Given your Balanced
    // doctrine..." when the user has not actually tuned anything).
    doctrine: doctrineSummary
      ? {
          user_has_tuned: userHasTunedDoctrine,
          line: formatDoctrineLine(doctrineSummary),
          build: doctrineSummary.build,
          stance: doctrineSummary.stance,
          voice: doctrineSummary.voice,
          calibrated_count: doctrineSummary.calibrated_count,
          tuned_dials: tunedDials,
          /** True when the user has a per-league override active for this league. */
          has_league_override: hasLeagueOverride,
        }
      : null,
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
          why: decision.why,
          tradeoff_gains: decision.tradeoff.gains,
          tradeoff_losses: decision.tradeoff.losses,
          scarcity_callout: decision.scarcity_callout,
          emergency_trade_up: decision.emergency_trade_up,
          // The EXACT candidate set shown on the user's Decision board,
          // value-sorted to match the default view. Coach ranks WITHIN
          // this set (see the system-prompt rule "Your alternatives ARE
          // the board") instead of freelancing the full pool, so the
          // chat and the board never disagree about the options. Founder
          // report 2026-05-22: Coach ranked Woody Marks #2 though he was
          // never on the board, because system_decision shipped only the
          // #1 recommendation, not the surfaced list.
          board_candidates: [...decision.quadrant_candidates]
            .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
            .map((c) => ({
              name: c.name,
              position: c.position,
              team: c.team,
              age: c.age,
              adp: c.adp,
              value: c.value,
              ktc_overall_rank: c.ktc_overall_rank,
              survival_pct: c.survival_pct,
              availability: c.availability_next_pick,
              is_call: c.player_id === decision.recommendation.player_id,
            })),
          // Same per-position league scarcity the board renders, so
          // Coach's leverage/scarcity claims cite identical numbers.
          // Canonical: synthesizeDecision -> league_position_context.
          league_position_context: decision.league_position_context,
          // Build-vs-league read (with/against the grain + starter
          // coverage verdict). Same field the board renders.
          build_vs_league: decision.build_vs_league,
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
    // Every non-me roster is a real, named opponent. buildOpponentReadout
    // only CHARACTERIZES opponents that fire a signal (>=3 picks or an
    // active trade angle) and DROPS the rest from `teams`. The named
    // roster + trade history + notes exist for every roster, so emit one
    // opponent entry per roster (characterized first via
    // orderOpponentRosters), attaching the observation / angle layer only
    // when present. Bug 2026-05-16 (Elite 10 / "Mike Ekans"): Coach said
    // it did not have an opponent whose named roster was fully in context,
    // because opponents[] was built from the dropped readout list instead
    // of from every roster.
    opponents: orderOpponentRosters(
      snapshot.rosters,
      opponents.teams.map((x) => x.roster_id),
    ).map((r) => {
      const t = opponents.teams.find((x) => x.roster_id === r.roster_id);
      // Pick-trade history derived from snapshot.draft.traded_picks
      // (no extra Sleeper call). Surfaces counterparty psychology
      // (pick flipper / hoarder / seller / quiet) so Coach can read
      // behavioral patterns instead of just current roster state.
      // The joeboch fingerprint from the 2026-05-08 izzydabomb session.
      const tradeHistory = buildOpponentTradeHistory({
        rosterId: r.roster_id,
        tradedPicks: snapshot.draft.traded_picks,
        currentSeason: snapshot.season,
      });
      // User-logged notes about this opponent. Most-recent first.
      // Coach treats these as named-pressure ammunition per the
      // existing system-prompt rule "USE the opponent's own words."
      // Limited to 5 most-recent per opponent to bound prompt size.
      const notes = (opponentNotesByRoster.get(r.roster_id) ?? [])
        .slice(0, 5)
        .map((n) => ({
          kind: n.kind,
          body: n.body,
          logged_at: n.created_at,
        }));
      // Named roster with KTC values for THIS opponent. Sorted by
      // value descending so Coach reads their headline assets first
      // when scanning a long room. Wired 2026-05-14 after founder
      // report: "looks like coach doesn't know the rosters." Built for
      // EVERY roster (opponentRostersByRosterId above), so it is present
      // even for opponents the readout dropped.
      const namedRoster = (opponentRostersByRosterId.get(r.roster_id) ?? [])
        .map((p) => {
          const v = playerValueMap.get(p.player_id);
          return {
            name: p.name,
            pos: p.pos,
            team: p.team,
            age: p.age,
            value: v ? v.value : null,
            position_rank: v ? v.position_rank : null,
            overall_rank: v ? v.overall_rank : null,
          };
        })
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
      const picksCount =
        t?.picks_count ??
        snapshot.draft.picks_made.filter((p) => p.roster_id === r.roster_id)
          .length;
      return {
        owner: r.owner_name ?? t?.owner_name ?? `Roster ${r.roster_id}`,
        roster_id: r.roster_id,
        picks: picksCount,
        position_counts: r.position_counts ?? null,
        patterns: (t?.observations ?? []).map((o) => o.pattern_name),
        trade_angles: (t?.trade_angles ?? []).map((a) => ({
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
        roster: namedRoster,
      };
    }),
    top_available: (() => {
      // top_available now ships the FULL realistic draft pool, not a
      // top-30 KTC slice. Founder report 2026-05-09: Coach kept
      // hallucinating "X has been drafted" for top-25 Sleeper players
      // who were actually on the board, because absence from the
      // top-30 slice was misread as drafted. The realistic pool is
      // sized to `realisticPoolSize(snap)` upstream (total_teams ×
      // roster_size + margin), so every player who could plausibly
      // get drafted is included.
      //
      // Two-tier shape to keep token cost bounded:
      //   - Top 60 by KTC value + every decision-card player: FULL
      //     entry with adp_alternatives. These are the candidates
      //     Coach actively reasons about and recommends.
      //   - Remaining pool: COMPACT entry (no adp_alternatives) for
      //     presence verification + basic profile. Coach can confirm
      //     "yes X is on the board" + cite age/position/value without
      //     paying the variant-breakdown tax for every mid-pool player.
      const fullEntry = (p: (typeof available)[number]) => {
        const v = playerValueMap.get(p.id);
        return {
          name: p.name,
          pos: p.position,
          team: p.team,
          age: p.age,
          sleeper_rank: p.search_rank,
          adp: p.adp,
          adp_variant: p.adp_variant,
          adp_alternatives: p.adp_alternatives ?? [],
          is_rookie: p.is_rookie,
          value: v ? v.value : null,
        };
      };
      const compactEntry = (p: (typeof available)[number]) => {
        const v = playerValueMap.get(p.id);
        return {
          name: p.name,
          pos: p.position,
          team: p.team,
          age: p.age,
          sleeper_rank: p.search_rank,
          adp: p.adp,
          adp_variant: p.adp_variant,
          is_rookie: p.is_rookie,
          value: v ? v.value : null,
        };
      };
      const fullIds = new Set<string>();
      const entries: Array<
        ReturnType<typeof fullEntry> | ReturnType<typeof compactEntry>
      > = [];
      // Tier 1: top 60 by KTC get full entries.
      for (const p of available.slice(0, 60)) {
        fullIds.add(p.id);
        entries.push(fullEntry(p));
      }
      // Decision-card players past index 60 also get full entries; they
      // are by definition decision-relevant.
      for (const id of decisionCardPlayerIds) {
        if (fullIds.has(id)) continue;
        const p = available.find((a) => a.id === id);
        if (!p) continue;
        fullIds.add(id);
        entries.push(fullEntry(p));
      }
      // Tier 2: every other player in the realistic pool gets a compact
      // entry. Eliminates the "X has been drafted" hallucination class
      // by guaranteeing every undrafted relevant player is in the
      // snapshot, while keeping token cost manageable.
      for (const p of available) {
        if (fullIds.has(p.id)) continue;
        entries.push(compactEntry(p));
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

  // Taxi-question classifier. Mirrors the trade guard: when the user
  // asks about taxi placement in a league that has no taxi squad,
  // structurally inject a GUARD that bars the LLM from recommending
  // taxi candidates at all. Bug class: 2026-05-27, Coach recommended a
  // current starter for taxi while the league rules + current taxi
  // list were absent from context.
  const TAXI_QUESTION_RE = /\btaxi\b|\bpractice squad\b|\bdevelopmental squad\b/i;
  const looksLikeTaxiQuestion = TAXI_QUESTION_RE.test(message);
  const taxiGuard =
    looksLikeTaxiQuestion && !formatRules.has_taxi
      ? `\n\n[GUARD] This league has no taxi squad (format_rules.has_taxi === false; taxi_slots === ${formatRules.taxi_slots}). Do not recommend taxi candidates. Tell the user plainly that taxi does not exist in this league and stop.\n`
      : "";

  // Unread-surface classifier. When the user asks about a league
  // surface Coach does not have in context (this week's matchup, live
  // scoring, opponent lineups, recent waiver claims / FAAB bids, the
  // league chat / commish notes), refuse speculation and name what to
  // consult. Same shape as the trade + taxi guards. Founder direction
  // 2026-05-27: "tell coach explicitly not to speculate on stuff it
  // doesn't have."
  const UNREAD_SURFACE_RE =
    /\b(this week|current week|matchup|projected score|live score|opposing lineup|opponent('|)s lineup|starting lineup|waiver wire|waiver claim|faab|free agent (?:add|bid)|league chat|commish|commissioner|rule override)\b/i;
  const looksLikeUnreadSurfaceQuestion = UNREAD_SURFACE_RE.test(message);
  const unreadSurfaceGuard = looksLikeUnreadSurfaceQuestion
    ? `\n\n[GUARD] The user is asking about a league surface that is not in your context (matchups / live scoring / opponent lineups / waiver claims / FAAB / league chat / commish notes). Say plainly which surface is missing and propose what to consult (Sleeper league settings, the matchup tab, beat-writer reports). Do not bracket-and-guess; bracket-and-guess on absent data is the hallucination class.\n`
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
  const turnContent = `<current_state>\n${JSON.stringify(contextPayload, null, 2)}\n</current_state>${tradeGuard}${taxiGuard}${unreadSurfaceGuard}\n\n${message}`;
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
