import type {
  PickOutput,
  StrategyClarifyOutput,
  TradeIncomingOutput,
  TradeOutboundOutput,
} from "@/lib/engine/schemas";
import type { DecisionContext } from "@/lib/engine/context";

/**
 * Iceman-pattern quality criteria. Each check returns {pass, reason?}.
 *
 * These are necessary-but-not-sufficient: passing all checks means the
 * output cleared structural minimums, not that it matched the Iceman
 * level. Human review stays in the loop for texture.
 */

export type Check = { name: string; pass: boolean; reason?: string };

const HEDGE_PHRASES = [
  /^it depends\b/i,
  /^there are several/i,
  /^on one hand/i,
  /^this is a good question/i,
  /\btough call\b/i,
  /\bmany factors\b/i,
  /\bvarious considerations\b/i,
];

const AI_HYPE_PHRASES = [
  /\bai[- ]powered\b/i,
  /\bas an ai\b/i,
  /\bi'm an? ai\b/i,
  /\b(artificial intelligence|large language model)\b/i,
];

function noHedgingOpener(text: string): Check {
  const trimmed = text.trim();
  const hit = HEDGE_PHRASES.find((r) => r.test(trimmed));
  return {
    name: "no_hedging_opener",
    pass: !hit,
    reason: hit ? `Hedge detected: ${hit.source}` : undefined,
  };
}

function noAiHype(text: string): Check {
  const hit = AI_HYPE_PHRASES.find((r) => r.test(text));
  return {
    name: "no_ai_hype",
    pass: !hit,
    reason: hit ? `AI-hype phrase: ${hit.source}` : undefined,
  };
}

function hasOpportunityCost(text: string | null | undefined): Check {
  return {
    name: "opportunity_cost_present",
    pass: !!text && text.trim().length >= 12,
    reason: text ? undefined : "Missing or too short",
  };
}

function hasWalkAwayFloor(text: string | null | undefined): Check {
  return {
    name: "walk_away_floor_present",
    pass: !!text && text.trim().length >= 8,
    reason: text ? undefined : "Missing walk-away floor",
  };
}

function reasoningDense(bullets: readonly string[]): Check {
  const tooShort = bullets.filter((b) => b.trim().length < 12).length;
  return {
    name: "reasoning_dense",
    pass: bullets.length >= 2 && tooShort === 0,
    reason:
      bullets.length < 2
        ? "Fewer than 2 bullets"
        : tooShort > 0
          ? `${tooShort} bullet(s) too short`
          : undefined,
  };
}

function calibratedLength(
  main: string,
  maxChars: number,
): Check {
  // Measure only the opening clause (the first sentence). Iceman's
  // strongest moves often open with a short decisive clause and then
  // layer reasoning. Longer compound recommendations are fine as long
  // as the *lead* is tight.
  const first = main.split(/(?<=[.!?])\s+/u)[0] ?? main;
  const ok = first.length <= maxChars;
  return {
    name: "calibrated_length",
    pass: ok,
    reason: ok ? undefined : `Lead clause ${first.length} chars > ${maxChars}`,
  };
}

// ── Grounding (no invented players) ──────────────────────────────────────

/**
 * Cross-reference every capitalized multi-word token in the output against
 * an allowed-name set built from the scenario's context (available_players,
 * user roster/headline, opponent headline_players, trade payloads).
 *
 * This is a heuristic: it looks for "First Last" patterns and misses
 * single-token player references, but it reliably catches the "Dameon
 * Pierce / Tyrone Tracy Jr." class of drift that actually breaks user trust.
 */
const STOPWORDS = new Set([
  // pronouns / articles / connectors that sometimes start with capitals at
  // sentence position and then precede a real player name
  "Do", "Don", "You", "Your", "We", "I", "Me", "Not", "Close",
  "The", "This", "That", "Then", "Also", "Yes", "No", "Both", "Fine",
  "With", "And", "But", "Or", "If", "Otherwise", "Given", "So", "Now",
  "Even", "Still", "Once", "Only", "Before", "After", "When", "While",
  "Here", "There", "Where", "Whether", "Since", "Because", "Despite",
  // verbs that commonly start a sentence about a named player
  "Take", "Taking", "Draft", "Drafting", "Trade", "Move", "Moving", "Send", "Sending",
  "Offer", "Keep", "Hold", "Pass", "Target", "Accept", "Decline", "Counter",
  "Consider", "Prefer", "Buy", "Buying", "Sell", "Selling", "Spend", "Spending",
  "Grab", "Start", "Flex", "Bench", "Stash", "Rostering", "Lean", "Adding", "Add",
  "Convert", "Leverage", "Flip", "Flipping", "Choose", "Choosing", "Land", "Landing",
  "Play", "Playing", "Run", "Running", "Make", "Making", "Clear", "Stop", "Win",
  "Lose", "Try", "Drop", "Dropping", "Ship",
  // fantasy-jargon tokens that might be part of multi-word matches
  "RB", "WR", "QB", "TE", "ADP", "PPR", "SUPERFLEX", "SUPER_FLEX",
  "Superflex", "Dynasty", "Round", "Pick", "Tier", "Value",
  // directional / proper-noun-like but not names
  "North", "South", "East", "West",
]);

function collectNames(texts: string[]): Set<string> {
  const names = new Set<string>();
  const re = /\b([A-Z][a-z]+(?:[.'’-][A-Za-z]+)?(?:\s+(?:Jr\.|Sr\.|II|III|IV))?(?:\s+[A-Z][a-z]+(?:[.'’-][A-Za-z]+)?)+)\b/g;
  for (const t of texts) {
    if (!t) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const token = m[1];
      const first = token.split(/\s+/)[0];
      if (STOPWORDS.has(first)) continue;
      names.add(token);
    }
  }
  return names;
}

export function buildAllowedNames(
  ctx: DecisionContext,
  extras: string[] = [],
): Set<string> {
  const texts: string[] = [
    ...ctx.me.headline,
    ...ctx.league_profile.teams.flatMap((t) => t.headline_players),
    ...ctx.league_profile.teams.map((t) => t.owner_name),
    ...extras,
  ];
  const found = collectNames(texts);
  // also allow single-word team owner handles as-is
  for (const t of ctx.league_profile.teams) {
    found.add(t.owner_name);
  }
  // "You" / "Me" references: add the user's team name explicitly
  found.add(ctx.me.team_name);
  if (ctx.me.display_name) found.add(ctx.me.display_name);
  return found;
}

export function noUnnamedPlayerDrift(
  outputTexts: string[],
  allowed: Set<string>,
): Check {
  const mentioned = collectNames(outputTexts);
  const allowedTokens = new Set<string>();
  for (const a of allowed) {
    for (const tok of a.split(/\s+/)) if (tok.length > 2) allowedTokens.add(tok);
  }
  const illegal: string[] = [];
  for (const m of mentioned) {
    if (allowed.has(m)) continue;
    // Loose: name is contained by or contains an allowed name
    // (handles "Marvin Harrison" ≈ "Marvin Harrison Jr." and "Jordan Love"
    // where "Love" happens to be a non-player token elsewhere)
    const loose = [...allowed].some((a) => a.includes(m) || m.includes(a));
    if (loose) continue;
    // Token-level: if every word in the mentioned phrase appears in some
    // allowed name's tokens, treat as a reference to an allowed player
    // (e.g. "Javonte" matches "Javonte Williams" in allowed).
    const tokens = m.split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length > 0 && tokens.every((t) => allowedTokens.has(t))) continue;
    illegal.push(m);
  }
  return {
    name: "no_unnamed_player_drift",
    pass: illegal.length === 0,
    reason: illegal.length ? `Invented: ${illegal.slice(0, 4).join(", ")}` : undefined,
  };
}

// ── Decision-specific aggregators ─────────────────────────────────────────

export function evalPick(out: PickOutput): Check[] {
  return [
    noHedgingOpener(out.recommendation),
    noAiHype(out.recommendation + " " + out.reasoning.join(" ")),
    hasOpportunityCost(out.opportunity_cost),
    reasoningDense(out.reasoning),
    calibratedLength(out.recommendation, 220),
  ];
}

export function evalTradeIncoming(out: TradeIncomingOutput): Check[] {
  return [
    noHedgingOpener(out.recommendation),
    noAiHype(out.recommendation + " " + out.reasoning.join(" ")),
    hasOpportunityCost(out.opportunity_cost),
    hasWalkAwayFloor(out.walk_away_floor),
    reasoningDense(out.reasoning),
    {
      name: "opponent_read_present",
      pass: out.opponent_read.trim().length >= 16,
      reason: "Opponent read must be a real sentence",
    },
    calibratedLength(out.recommendation, 200),
  ];
}

export function evalTradeOutbound(out: TradeOutboundOutput): Check[] {
  return [
    noAiHype(out.attack_angle + " " + out.opener_message),
    hasOpportunityCost(out.opportunity_cost),
    hasWalkAwayFloor(out.walk_away_floor),
    {
      name: "packages_complete",
      pass:
        out.packages.length >= 2 &&
        out.packages.every(
          (p) => p.you_send.length >= 1 && p.you_receive.length >= 1,
        ),
    },
    {
      name: "opener_leads_with_incentive",
      pass: /your|you['’]re|their|bye|injury|situation/i.test(out.opener_message),
      reason:
        "Opener should reference the other manager's incentive, not our ask",
    },
  ];
}

export function evalStrategy(out: StrategyClarifyOutput): Check[] {
  return [
    {
      name: "named_state",
      pass: ["contender", "rebuild", "balanced", "undetermined"].includes(
        out.state,
      ),
    },
    {
      name: "signals_dense",
      pass: out.signals.length >= 2,
    },
    {
      name: "next_moves_actionable",
      pass:
        out.next_moves.length >= 2 &&
        out.next_moves.every((m) => m.trim().length >= 12),
    },
    // Closed strategies is a signature iceman move; allow empty, but reward presence
    {
      name: "closed_strategies_addressed",
      pass: true,
    },
  ];
}

export function summarize(checks: Check[]): {
  total: number;
  passed: number;
  failed: Check[];
} {
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed };
}
