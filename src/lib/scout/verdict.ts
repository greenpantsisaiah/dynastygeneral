/**
 * Scout verdict. LLM-generated take on a user's full league portfolio.
 * Optionally evaluates a specific claim (e.g., "this is my worst team
 * I've ever drafted") against the data.
 *
 * Server-only. Uses the existing Anthropic client + system prompt
 * voice (no em dashes, decisive, evidence-cited).
 */

import Anthropic from "@anthropic-ai/sdk";
import { recordSpend } from "@/lib/budget";
import type { ScoutTeamScore } from "./score";

export type ScoutVerdict = {
  // Headline take. 1-2 sentences. The take.
  headline: string;
  // 3-5 sentence detail with cited evidence.
  body: string;
  // Per-team one-liner keyed by league_id. UI renders under each card.
  per_team: Record<string, string>;
  // Stub flag set when ANTHROPIC_API_KEY is missing or call fails.
  stub: boolean;
};

const VERDICT_PROMPT = `You are the analyst team behind Dynasty General. The user wants a SCOUT REPORT on a Sleeper player's full dynasty portfolio. You're given each team's composite score, headliners, gaps, age skew, and record.

VOICE
- Decisive. No hedging openers. No "it depends." No "there are several factors."
- Evidence-cited. Name specific players, leagues, gaps. Don't summarize generically.
- Brand: dynasty intelligence analyst speaking to a sophisticated reader.
- Ban: em dashes (Unicode U+2014). Use periods, colons, commas, semicolons, parentheses, or rewrite.

DATA YOU HAVE (NON-NEGOTIABLE)
- ONLY this user's OWN teams, one per league.
- You do NOT have any data on other managers in any league. Never compare this user to other managers in any league. Do NOT say things like "vs the league average" or "compared to the rest of the room."
- Self-reflective claims like "worst team I've ever drafted" or "best build I've ever had" must be evaluated against this user's OWN portfolio of teams. Their portfolio is the comparison set.
- Each team carries 'prior_seasons' (most recent first, up to 3 back) when the league has a previous_league_id chain. Each entry carries season, record (wins/losses/ties), final_rank (1 = champion), and the user's top 3 players that year. USE THIS to confirm or contradict claims about time depth ("you won 2 seasons ago", "you collapsed last year"). Cite specific seasons and players when relevant. If 'prior_seasons' is empty for a team, say so plainly ("this league has no prior season we can see") rather than fabricating.
- Each team carries 'future_picks' (owned draft picks across the next 3 seasons) and 'future_pick_value' (dynasty-equivalent capital). NEVER say a team has "no picks" or "no future capital" without checking these fields first. A team with 4× 2027 R1s has tremendous capital even if their roster is light. Cite the picks specifically by season + round when they're a meaningful share of team value.

OUTPUT
Return ONLY a JSON object with three fields. No prose before or after.
{
  "headline": "1-2 sentences. The take. If a claim is provided, confirm or contradict it explicitly with the leading evidence FROM THE USER'S OWN PORTFOLIO.",
  "body": "3-5 sentences with specific evidence. Name leagues by name, players by name, position gaps, age skew. Reference the actual scores. Acknowledge data limits if the claim implies time depth we can't see. Make the reader trust the call.",
  "per_team": {
    "league_id_1": "one-line take, 12-18 words, names a player + the central tension",
    "league_id_2": "...",
    "...": "..."
  }
}

When evaluating a CLAIM
- "this is my worst team I've ever drafted": comparison set is THIS USER'S other current dynasty teams. If the team in question is the worst of those, confirm. If not, name which of HIS OWN teams is worse and why. Note that we can't see his prior seasons directly.
- "I'm cooked everywhere": check whether at least one of his own teams is actually contender-grade.
- "best draft I've ever had": same logic, comparison set is his own portfolio.
- If the claim is unclear or absent, run a default scout report: rank his teams, name his strongest, name his weakest, name one move opportunity.

When NO CLAIM is provided
- Lead with the user's most striking team (best or worst, whichever is more interesting).
- Always name leagues by name, not by ID.`;

function buildUserMessage(args: {
  username: string;
  claim: string | null;
  claim_target_league_id: string | null;
  teams: ScoutTeamScore[];
}): string {
  const { username, claim, claim_target_league_id, teams } = args;
  // One unified ranking. Drafting teams are characterized via the same
  // strategy/window data as full rosters; the build_phase flag tells
  // the model how confidently to talk about them. Empty (0-player)
  // teams sort last and are framed as pre-draft only.
  const ranked = [...teams].sort((a, b) => {
    if (a.build_phase === "empty" && b.build_phase !== "empty") return 1;
    if (b.build_phase === "empty" && a.build_phase !== "empty") return -1;
    return a.composite_score - b.composite_score;
  });
  const teamSummaries = ranked.map((t, i) => ({
    rank_worst_to_best: i + 1,
    league_id: t.league_id,
    league_name: t.league_name,
    league_format: t.league_format,
    season: t.season,
    status: t.status,
    build_phase: t.build_phase, // "empty" | "drafting" | "active"
    composite_score: Math.round(t.composite_score),
    team_value: Math.round(t.team_value),
    starter_completeness: Number(t.starter_completeness.toFixed(2)),
    avg_age: t.avg_age != null ? Number(t.avg_age.toFixed(1)) : null,
    record: t.record,
    top_players: t.top_players.map((p) => ({
      name: p.name,
      pos: p.position,
      team: p.team,
      age: p.age,
      dynasty_value: Math.round(p.dynasty_value),
    })),
    worst_gap: t.worst_gap,
    roster_size: t.roster_size,
    position_counts: t.position_counts,
    starter_needs: t.starter_needs,
    // Adequacy is the engine's verdict on whether each position is
    // thin / adequate / deep / core. Trust this over raw counts.
    position_adequacy: t.position_adequacy,
    // Strategy intelligence from the same engine that powers the hub.
    // Present even for drafting teams (lean is real with 4-8 picks).
    strategy: t.strategy
      ? {
          top_path: t.strategy.top_path,
          coherence: t.strategy.coherence,
          win_now_score: Math.round(t.strategy.win_now),
          future_value_score: Math.round(t.strategy.future_value),
          horizon_lean: t.strategy.horizon_lean,
        }
      : null,
    // Owned future draft picks across the next 3 seasons. The verdict
    // MUST consult this before claiming a team has "no picks" or "no
    // future capital." A team that traded current value for picks
    // shows up as future_pick_value-heavy with a thin live roster.
    future_picks: t.future_picks,
    future_pick_value: Math.round(t.future_pick_value),
    // Prior-season summaries from walking previous_league_id (most
    // recent first, up to 3 back). Empty when this league has no
    // prior chain. Use this to confirm or contradict claims about
    // recency ("you won 2 seasons ago", "you collapsed last year")
    // instead of refusing to engage with time-depth claims.
    prior_seasons: t.prior_seasons.map((p) => ({
      season: p.season,
      record: p.record,
      final_rank: p.final_rank,
      total_rosters: p.total_rosters,
      top_players: p.top_players,
    })),
    // 5-year contender outlook summary. Lets the verdict tie its take
    // to forward trajectory: a "bubble now, contender 2028-2029" team
    // should NOT be told to chase 2026 wins.
    outlook_summary: t.outlook_summary,
    // Cross-portfolio "best in class" badge if this team tops a category
    superlative: t.superlative,
  }));
  return `SCOUT TARGET: @${username}

${claim ? `THE CLAIM: "${claim}"` : "NO CLAIM PROVIDED. Run a default scout report."}

${claim_target_league_id ? `CLAIM TARGETS league_id: ${claim_target_league_id}` : ""}

TEAMS (sorted worst to best by composite_score; each carries strategy intelligence + any best-in-class superlative):
${JSON.stringify(teamSummaries, null, 2)}

How to talk about each team based on build_phase:
- active: full evaluation. Cite strategy (archetype + drift + coherence), trending (win-now vs future), top assets, gaps. Be specific.
- drafting: this is a partial build mid-draft or mid-startup. The strategy lean IS real signal (the same engine that powers the live draft hub produced it). Characterize what path the user is leaning into based on the picks made so far, what options are still open, and which top_players already commit them to a horizon. Do NOT say "too thin to evaluate" or "no signal." Frame as "leaning toward X" or "early commitment to Y."
- empty: pre-draft, no roster yet. One line that the build hasn't started; nothing to scout until they pick.

Reading positional depth (NON-NEGOTIABLE):
The system already labels each position's depth in 'position_adequacy'. Trust it. Never freelance positional depth from raw counts.
- 'core' means this is the strategy's PRIMARY lever and the count meets the archetype's exemplar threshold (e.g. 5+ RBs in RB Committee, 6+ WRs in WR Stockpiler, 3+ QBs in QB Cartel). NEVER call a 'core' position thin, shallow, light, or razor-thin. It is the strategy's whole point.
- 'deep' means depth past starters. Use as a strength.
- 'adequate' means starters are covered but no real bench depth. Don't oversell as deep, don't undersell as thin.
- 'thin' is the only label you may describe as a depth concern. It corresponds to count below the league's required starter_needs at that position.
'starter_needs' tells you the league's required starter count per position. Reference this when explaining a 'thin' label, not raw roster size.

Reading the contender outlook (NON-NEGOTIABLE):
'outlook_summary' projects each team's win-now score across the next 5 seasons under position-specific aging + materialized-pick assumptions, banded as Rebuild (<60), Bubble (60-74), or Contender (75+). When present, USE IT to ground takes about trajectory:
- A team with peak_tier='contender' in a future year is on a real window. Frame the take around protecting that window. Do NOT advise them to chase the current year if the current year is Rebuild/Bubble.
- A team with contender_window spanning multiple years (e.g. 2028-2029) is positioned for sustained contention; the lever is holding the assets that fund it.
- A team with peak_tier='rebuild' across the whole horizon needs more capital or younger talent acquired now.
- 'outlook_summary' is null when we couldn't compute the projection (empty roster, snapshot failure). Don't fabricate a window in that case.

Reading future-pick capital (NON-NEGOTIABLE):
'future_picks' lists draft picks owned across the next five seasons. 'future_pick_value' is its dynasty-equivalent value, calibrated against KeepTradeCut market pricing (an elite young player like Bijan or Chase ≈180 on this scale; a generic next-year R1 ≈100; an early R2 ≈60). Class-strength and superflex multipliers are already baked into the number; trust it.
- A team with significant future_pick_value is doing PICK ACCUMULATION. Frame it that way: "punted current value for futures, sitting on 4× 2027 R1s + 3× 2028 R1s." Never describe such a team as having "no picks" or "no future capital."
- A team with future_pick_value > 30% of (team_value + future_pick_value) has reshaped its build around picks; that's the headline lever, not their thin starting lineup.
- A team with empty future_picks has either traded ALL their futures away (weakness if light on roster, fine if loaded), or our traded_picks data is unavailable; if unavailable, say so plainly rather than asserting they have nothing.

If a team has a SUPERLATIVE (best-in-class badge), reference it.

Produce the JSON verdict now. Remember: no em dashes.`;
}

// Failure stubs. Each return path uses the reason that actually
// applies, so the UI message matches the real cause. The old single
// stub conflated "no API key" with "call failed" / "parse failed",
// producing the misleading "Set ANTHROPIC_API_KEY" headline whenever
// the LLM call truncated its output.
type StubReason = "no_key" | "no_teams" | "call_failed" | "parse_failed";

function buildStub(reason: StubReason): ScoutVerdict {
  const lines: Record<StubReason, { headline: string; body: string }> = {
    no_key: {
      headline: "Scout offline. Set ANTHROPIC_API_KEY to enable verdicts.",
      body: "Without a verdict LLM, you can still see the per-team scores below. The composite ranks teams worst to best by dynasty value times starter completeness.",
    },
    no_teams: {
      headline: "No dynasty teams to scout.",
      body: "This user has no scoreable dynasty rosters in this season. Try a different season or username.",
    },
    call_failed: {
      headline: "Verdict call failed. Scores below are still live.",
      body: "The analyst pass errored out (network, rate limit, or model issue). Per-team scores and strategy are computed locally and remain accurate.",
    },
    parse_failed: {
      headline: "Verdict response was truncated. Scores below are still live.",
      body: "The analyst pass returned an incomplete response (most likely too many teams for one verdict). Per-team scores and strategy are computed locally and remain accurate.",
    },
  };
  return { ...lines[reason], per_team: {}, stub: true };
}

export async function generateScoutVerdict(args: {
  username: string;
  claim: string | null;
  claim_target_league_id: string | null;
  teams: ScoutTeamScore[];
}): Promise<ScoutVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return buildStub("no_key");
  if (args.teams.length === 0) return buildStub("no_teams");
  const client = new Anthropic({ apiKey });
  const message = buildUserMessage(args);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      // 4000 fits realistic portfolios. The previous 1200 truncated the
      // per_team JSON for users with 15+ dynasty teams, producing an
      // unparseable response and a misleading "Set ANTHROPIC_API_KEY"
      // stub. Sonnet only generates what it needs; higher cap is free.
      max_tokens: 4000,
      temperature: 0.6,
      system: [
        {
          type: "text",
          text: VERDICT_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: message }],
    });
  } catch (err) {
    console.error("[scout:verdict]", err);
    return buildStub("call_failed");
  }

  await recordSpend({
    model: "claude-sonnet-4-6",
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }).catch(() => {});

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Strip markdown fences if model added them.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<ScoutVerdict>;
    if (
      typeof parsed.headline === "string" &&
      typeof parsed.body === "string" &&
      parsed.per_team &&
      typeof parsed.per_team === "object"
    ) {
      return {
        headline: parsed.headline,
        body: parsed.body,
        per_team: parsed.per_team as Record<string, string>,
        stub: false,
      };
    }
  } catch (err) {
    console.error("[scout:verdict-parse]", err, cleaned.slice(0, 200));
  }
  return buildStub("parse_failed");
}
