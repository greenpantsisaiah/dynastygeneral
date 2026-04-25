/**
 * Intelligence Analyst service. Generates 3-5 fan-out briefings on
 * the current league state. Server-side only.
 *
 * Each call produces multiple briefings of varying kinds (narrative,
 * tier, quadrant, graph, comparison, timeline) so the user's feed
 * gets fed faster, like an analyst team posting parallel takes.
 *
 * Voice: terse 3-sentence body per briefing. Confident, evidence-cited,
 * specific (named teams, named picks, named scarcities). The product
 * positions the user as the general; this service is the analyst team.
 *
 * Implementation: real Anthropic call via runStructured. The LLM gets
 * the FULL archetype catalog as analytical raw material plus snapshot
 * + ranked + observations. It chooses which dimensions cut the data
 * most usefully right now and emits 3-5 briefings of varying shapes.
 *
 * Falls back to a deterministic stub when ANTHROPIC_API_KEY is missing
 * so the dev experience works without burning credits.
 */

import { z } from "zod";
import { runStructured } from "@/lib/engine/anthropic";
import { buildFormatRulesFromSnapshot } from "@/lib/engine/llm-contract";
import { ARCHETYPES } from "../archetypes";
import type { LeagueSnapshot } from "../league-state/snapshot";
import type { RankedArchetype } from "../archetypes/schema";
import type { OpponentReadout } from "../opponents/observe";
import type {
  Briefing,
  BriefingKind,
  BriefingPrecondition,
  BriefingSeverity,
} from "./types";
import type { Position } from "../archetypes/schema";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

function nowIso(): string {
  return new Date().toISOString();
}

// ── Output schema (loose for stage 2) ──────────────────────────────
// We validate the outer shape strictly (kind, severity, required
// strings). The per-kind data payload is z.unknown() and cast to the
// discriminated type. Tightening per-kind schemas comes when we add
// more renderers and want to fail-fast on data shape mismatches.

const BRIEFING_KINDS: BriefingKind[] = [
  "narrative",
  "tier",
  "quadrant",
  "graph",
  "comparison",
  "timeline",
];
const SEVERITIES: BriefingSeverity[] = ["info", "notable", "critical"];

const preconditionSchema = z.object({
  kind: z.literal("position_count_eq"),
  owner_name: z.string().min(1),
  position: z.enum(POSITIONS as [Position, ...Position[]]),
  value: z.number().int().min(0),
});

const briefingItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(BRIEFING_KINDS as [BriefingKind, ...BriefingKind[]]),
  severity: z.enum(SEVERITIES as [BriefingSeverity, ...BriefingSeverity[]]),
  headline: z.string().min(1).max(120),
  body: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  topic_tags: z.array(z.string()).default([]),
  data: z.unknown(),
  preconditions: z.array(preconditionSchema).optional(),
});

const analystOutputSchema = z.object({
  briefings: z.array(briefingItemSchema).min(1).max(8),
});

const analystToolInputSchema = {
  type: "object",
  required: ["briefings"],
  properties: {
    briefings: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        required: [
          "id",
          "kind",
          "severity",
          "headline",
          "body",
          "evidence",
          "topic_tags",
          "data",
        ],
        properties: {
          id: { type: "string", description: "Stable kebab-case id" },
          kind: {
            type: "string",
            enum: BRIEFING_KINDS,
            description:
              "Pick the SHAPE the data wants. narrative for prose takes; tier for ranked lists; quadrant for 2D placement; graph for trade-lane / relationship visualizations; comparison for head-to-head tables; timeline for week-by-week scenario projection.",
          },
          severity: {
            type: "string",
            enum: SEVERITIES,
            description: "info < notable < critical",
          },
          headline: {
            type: "string",
            maxLength: 120,
            description:
              "<=120 chars analyst voice. Punchy, specific, names a thing.",
          },
          body: {
            type: "string",
            description:
              "EXACTLY 3 short sentences. Hits the take, names the evidence, gives the implication. No hedging, no preamble.",
          },
          evidence: {
            type: "array",
            items: { type: "string" },
            description:
              "Bulleted observable signals that drove this briefing. 2-4 items.",
          },
          topic_tags: {
            type: "array",
            items: { type: "string" },
            description:
              "kebab-case tags for filtering and promotion (e.g. 'qb-cartel', 'trade-lane', 'messmn225').",
          },
          data: {
            type: "object",
            description:
              "Kind-specific payload. See per-kind schema in the user message. Always object, never null.",
          },
          preconditions: {
            type: "array",
            items: {
              type: "object",
              required: ["kind", "owner_name", "position", "value"],
              properties: {
                kind: { type: "string", enum: ["position_count_eq"] },
                owner_name: { type: "string" },
                position: { type: "string", enum: POSITIONS },
                value: { type: "integer", minimum: 0 },
              },
            },
            description:
              "OPTIONAL but REQUIRED whenever the briefing's TAKE depends on a SPECIFIC position count for a NAMED owner. Example: a 'zero TEs' or 'no QBs' briefing for owner X must emit { kind: 'position_count_eq', owner_name: 'X', position: 'TE', value: 0 }. The system uses these to suppress your take when the user catches up to it. Omit when the briefing has no count-based claim.",
          },
        },
      },
    },
  },
} as const;

// ── Stub fallback (used when API key missing) ──────────────────────

function stubBriefings(args: {
  snap: LeagueSnapshot;
  ranked: RankedArchetype[];
  observations: OpponentReadout;
  trigger: string;
}): Briefing[] {
  const { snap, ranked, observations, trigger } = args;
  const me = snap.rosters.find((r) => r.is_me);
  const meName = me?.owner_name ?? "your team";
  const myQB = me?.position_counts.QB ?? 0;
  const myWR = me?.position_counts.WR ?? 0;
  const generated_at = nowIso();
  const total = snap.draft.picks_made.length;

  const briefings: Briefing[] = [];

  briefings.push({
    id: `narr-stub-${Date.now()}-room`,
    kind: "narrative",
    severity: "notable",
    headline: `[STUB] Room read: ${snap.format.toUpperCase()} draft, ${total} picks in`,
    body: `${observations.league.notes[0] ?? "Position spread is roughly even across the room."} ${meName} sits at ${myQB} QB and ${myWR} WR. Top drift candidate: ${ranked[0]?.archetype.name ?? "no clear lane yet"}.`,
    evidence: [
      `${total} picks completed across ${snap.total_teams} teams`,
      `Format: ${snap.format} + ${snap.scoring.join(" + ")}`,
      `[STUB DATA - real LLM not configured]`,
    ],
    topic_tags: ["room-read", "stub"],
    generated_at,
    triggered_by: `${trigger} (STUB)`,
    data: { related_archetype_ids: ranked.slice(0, 3).map((r) => r.archetype.id) },
  });

  if (observations.teams.length >= 2) {
    briefings.push({
      id: `tier-stub-${Date.now()}-threats`,
      kind: "tier",
      severity: "notable",
      headline: "[STUB] Threat tier",
      body: `Real briefings require ANTHROPIC_API_KEY. Stub returns deterministic placeholder threat tier.`,
      evidence: ["[STUB] Set ANTHROPIC_API_KEY in web/.env.local"],
      topic_tags: ["stub"],
      generated_at,
      triggered_by: `${trigger} (STUB)`,
      data: {
        axis_label: "Threat level",
        items: observations.teams.slice(0, 4).map((t, idx) => ({
          label: t.owner_name,
          score: 100 - idx * 15,
          reason: t.observations[0]?.pattern_name ?? "Active draft posture",
        })),
      },
    });
  }

  return briefings;
}

// ── Real LLM path ──────────────────────────────────────────────────

function buildUserMessage(args: {
  snap: LeagueSnapshot;
  ranked: RankedArchetype[];
  observations: OpponentReadout;
}): string {
  const { snap, ranked, observations } = args;
  const me = snap.rosters.find((r) => r.is_me);
  const meSummary = me
    ? {
        owner_name: me.owner_name,
        position_counts: me.position_counts,
        avg_age: me.avg_age,
        record: `${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""}`,
      }
    : null;

  // Catalog summary: archetype IDs + names + categories + horizons.
  // Full catalog is too verbose; the LLM gets enough to choose archetypes
  // for narrative/tier briefings. Per-archetype detail is in ranked.
  const catalogSummary = ARCHETYPES.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    horizon: a.horizon,
    tagline: a.tagline,
  }));

  const rankedSummary = ranked.map((r) => ({
    id: r.archetype.id,
    name: r.archetype.name,
    drift_score: Number(r.drift_score.toFixed(2)),
    opening_boost: r.opening_boost,
    trajectory: {
      direction: r.trajectory.direction,
      delta: r.trajectory.delta,
      reasons: r.trajectory.reasons,
    },
    live_gamble_pct: Number(r.live_gamble.pct.toFixed(2)),
    active_openings: r.active_openings,
  }));

  const opponentsSummary = observations.teams.map((t) => ({
    owner_name: t.owner_name,
    picks_count: t.picks_count,
    observations: t.observations.map((o) => ({
      pattern_name: o.pattern_name,
      severity: o.severity,
      evidence: o.evidence,
    })),
  }));

  // Operational format rules via the single source of truth
  // (llm-contract.ts buildFormatRulesFromSnapshot). Mirrors the Coach
  // + decision endpoints so the SYSTEM_PROMPT hard rules ("never claim
  // 'doesn't start' without checking format_rules") fire here too.
  // Briefings authoring without this would risk the same superflex-
  // blind framings the Coach used to produce.
  const formatRules = buildFormatRulesFromSnapshot(snap);

  const draftSummary = {
    status: snap.draft.status,
    type: snap.draft.type,
    total_teams: snap.total_teams,
    next_pick_no: snap.draft.next_pick_no,
    picks_made: snap.draft.picks_made.length,
    format: snap.format,
    scoring: snap.scoring,
    // Which positions this league actually rosters as starters. Any
    // position with hard=0 is NOT a roster gap; do not flag as deficit.
    starter_slots: snap.starter_slots,
    // Derived operational rules. CHECK before claiming "X doesn't
    // start" or "Y is bench-only." second_qb_starts === true means a
    // second QB STARTS in the SF slot.
    format_rules: formatRules,
  };

  return `You are producing 2-3 intelligence briefings on the current league state. Your role is the analyst team for the user (the general). Each briefing is one structured take on what's happening RIGHT NOW.

A feed of mediocre briefings is worse than two strong ones. Emit a fourth ONLY if it's genuinely additive (new evidence, not a rephrasing). Do not pad to hit a count.

VOICE
- Terse 3-sentence body per briefing. Hit the take, name the evidence, give the implication. No preamble. No hedging.
- Confident, specific, named (cite team owner names, pick labels, position counts).
- Verb-led headlines and body sentences. Forbidden openers: "A", "The", "There", "It", "While", "Although". "Bain runs hard inside" beats "The thing about Bain is he runs hard inside."
- Confidence vocabulary: lock / lean / coin-flip / fade. Not "this is a strong recommendation"; just "lock."
- Ban: em dashes (Unicode U+2014). Use periods, colons, commas, semicolons, parentheses, or rewrite. This is absolute.

PER-KIND TONE
- narrative: editorial. Lead with a named team, scarcity, or drift. Avoid meta ("the room is positioning").
- tier: ranked-bullet. Each item is a verb-led one-liner.
- quadrant: surgical. Each cell is a label + members; the note explains the lever.
- graph: structural. Edges name a real trade lane or relationship.
- comparison: head-to-head, surgical. Rows that the user can act on.
- timeline: speculative. "If X by Wk5" framing with explicit confidence.

SEVERITY CALIBRATION (non-negotiable, prevents inflation)
- info: default. Use this unless the user should change behavior.
- notable: promote here when the user should act THIS WEEK.
- critical: promote here when the user should act TODAY.
A feed where every briefing is "notable" is noise. Default low; promote on actionability.

KIND SELECTION
Pick the shape that best fits the analytical insight. You can use the same kind multiple times across the 3-5 briefings IF the analytical insights genuinely call for it. Otherwise vary.
- narrative: prose take, no special data shape. Use for state-of-the-room, recommendations, framing.
- tier: ranked list of items with score + reason. Use for opponent threat ranking, archetype drift order, position scarcity tiers, trade target priority.
- quadrant: 2x2 placement of teams (or other entities). Use when 2 dimensions cut the data well, like roster_strength x position_desperation. Include edges between cells if trade lanes exist.
- graph: nodes + edges. Use for trade-lane diagrams, relationship maps.
- comparison: head-to-head table (subject vs vs). Use for "you vs the other contender" or "your build vs the league average."
- timeline: week-by-week scenario projection with confidence and a dream-payoff line. Use for "if X happens by Wk5..." narratives.

PER-KIND DATA SHAPES (fill the data field accordingly)
narrative: { "related_archetype_ids": ["id1", "id2"] }
tier: { "axis_label": "Threat level", "items": [{ "label": "Owner", "score": 0-100, "reason": "1 line evidence" }, ...] }
quadrant: {
  "x_axis": { "label": "...", "left": "...", "right": "..." },
  "y_axis": { "label": "...", "bottom": "...", "top": "..." },
  "cells": [{ "quadrant": "tl"|"tr"|"bl"|"br", "label": "...", "members": ["Owner1", "Owner2"], "notes": "..." }, ...],
  "edges": [{ "from": "Owner", "to": "Owner", "label": "Trade lane name", "note": "..." }, ...]
}
graph: { "nodes": [{ "id": "...", "label": "...", "group": "...", "attrs": {...} }, ...], "edges": [{ "from": "...", "to": "...", "label": "...", "weight": 0-1, "note": "..." }, ...] }
comparison: { "subject": "Your roster", "vs": "Owner X", "rows": [{ "metric": "...", "subject_value": "...", "vs_value": "...", "advantage": "subject"|"vs"|"even" }, ...] }
timeline: { "weeks": [{ "week": "Wk5", "event": "...", "confidence": 0-1, "if_it_happens": "..." }, ...], "if_all_breaks_right": "The dream payoff line." }

CONTEXT (current league state)
draft: ${JSON.stringify(draftSummary)}

me: ${JSON.stringify(meSummary)}

ranked archetypes (this is what the user is currently drifting toward, sorted by total score):
${JSON.stringify(rankedSummary, null, 2)}

opponent observations (named patterns the system has detected from picks made):
${JSON.stringify(opponentsSummary, null, 2)}

archetype catalog (your analytical vocabulary; all available archetype names + categories + horizons; reference these by id when relevant):
${JSON.stringify(catalogSummary, null, 2)}

POSITION GATING (non-negotiable)
Only flag positional deficits at positions this league actually rosters. Check draft.starter_slots.hard: any position with a value of 0 is NOT rostered as a starter; NEVER flag a user or opponent for "zero K" or "zero DST" or similar when that position is not in the format. Same goes for IDP positions not listed in starter_slots.

PRECONDITIONS (required when your TAKE is count-anchored)
Briefings live in a chronological feed. The user keeps drafting. A briefing whose TAKE depends on a specific count ("you have 0 TEs," "messmn225 has 3 QBs") becomes wrong the moment that count changes. To prevent stale takes from showing as live facts, emit a 'preconditions' array on EVERY briefing whose body or headline cites a specific position count for a named owner.
Example: headline "You have zero TEs in a TE-premium format" must include { kind: 'position_count_eq', owner_name: '<the user's owner_name from me.owner>', position: 'TE', value: 0 }. The system re-checks these on render and suppresses your take once the user reaches the value you said was at zero.
Briefings about general trends, room reads, opponent strategy, or pure prose without specific count claims do not need preconditions.

YOUR TASK
Produce 2-3 briefings via the analyst_briefings tool (4 if a fourth is genuinely additive). Choose kinds based on what the data wants to say. At least one briefing should reference opponents by name. At least one should call the user's drift trajectory. Default severity to 'info'; promote to 'notable' / 'critical' per the calibration rules above.

Remember: no em dashes. Use periods, colons, commas, semicolons, parens.`;
}

export async function generateBriefings(args: {
  snap: LeagueSnapshot;
  ranked: RankedArchetype[];
  observations: OpponentReadout;
  trigger?: string;
}): Promise<Briefing[]> {
  const trigger = args.trigger ?? "user requested";
  const generated_at = nowIso();

  // No API key: return stub briefings so dev and demo work offline.
  if (!process.env.ANTHROPIC_API_KEY) {
    return stubBriefings({
      snap: args.snap,
      ranked: args.ranked,
      observations: args.observations,
      trigger,
    });
  }

  const userMessage = buildUserMessage({
    snap: args.snap,
    ranked: args.ranked,
    observations: args.observations,
  });

  const result = await runStructured({
    toolName: "analyst_briefings",
    toolDescription:
      "Emit 2-3 intelligence briefings (4 only if genuinely additive) on the current league state. Each briefing is one structured analytical take with a kind-specific data payload.",
    inputJsonSchema: analystToolInputSchema as unknown as Record<string, unknown>,
    outputSchema: analystOutputSchema,
    userMessage,
    model: "sonnet",
    // 4000 fits a multi-briefing run: each briefing emits a structured
    // tool call (kind + headline + body + evidence + per-kind data
    // blocks). Below 4000 the model truncates the second or third
    // briefing in the batch.
    maxTokens: 4000,
    temperature: 0.6,
  });

  // Stamp the pick-no this briefing was generated AT. The renderer
  // uses it to compute pick-age ("as of pick 81, 8 picks ago") so
  // outdated takes can be visibly aged even when their preconditions
  // technically still hold. picks_made.length is the count BEFORE the
  // current pick number, so it equals the most recent completed pick.
  const generated_at_pick_no =
    args.snap.draft.picks_made.length > 0
      ? args.snap.draft.picks_made.length
      : null;

  // Normalize: add generated_at + triggered_by + pick anchor, cast data
  // to the discriminated type. The LLM emitted kind/data/preconditions
  // but didn't know the timestamp, pick number, or trigger source.
  return result.output.briefings.map((b) => ({
    ...b,
    data: b.data as Record<string, unknown>,
    generated_at,
    generated_at_pick_no,
    triggered_by: trigger,
    preconditions: b.preconditions as BriefingPrecondition[] | undefined,
  })) as Briefing[];
}
