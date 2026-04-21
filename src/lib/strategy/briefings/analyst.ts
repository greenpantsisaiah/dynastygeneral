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
import { ARCHETYPES } from "../archetypes";
import type { LeagueSnapshot } from "../league-state/snapshot";
import type { RankedArchetype } from "../archetypes/schema";
import type { OpponentReadout } from "../opponents/observe";
import type {
  Briefing,
  BriefingKind,
  BriefingSeverity,
} from "./types";

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

const briefingItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(BRIEFING_KINDS as [BriefingKind, ...BriefingKind[]]),
  severity: z.enum(SEVERITIES as [BriefingSeverity, ...BriefingSeverity[]]),
  headline: z.string().min(1).max(120),
  body: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  topic_tags: z.array(z.string()).default([]),
  data: z.unknown(),
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

  const draftSummary = {
    status: snap.draft.status,
    type: snap.draft.type,
    total_teams: snap.total_teams,
    next_pick_no: snap.draft.next_pick_no,
    picks_made: snap.draft.picks_made.length,
    format: snap.format,
    scoring: snap.scoring,
  };

  return `You are producing 3-5 intelligence briefings on the current league state. Your role is the analyst team for the user (the general). Each briefing is one structured take on what's happening RIGHT NOW.

VOICE
- Terse 3-sentence body per briefing. Hit the take, name the evidence, give the implication. No preamble. No hedging.
- Confident, specific, named (cite team owner names, pick labels, position counts).
- Ban: em dashes (Unicode U+2014). Use periods, colons, commas, semicolons, parentheses, or rewrite. This is absolute.

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

YOUR TASK
Produce 3-5 briefings via the analyst_briefings tool. Choose kinds based on what the data wants to say. At least one briefing should reference opponents by name. At least one should call the user's drift trajectory. Vary severity (info/notable/critical) based on actionability.

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
      "Emit 3-5 intelligence briefings on the current league state. Each briefing is one structured analytical take with a kind-specific data payload.",
    inputJsonSchema: analystToolInputSchema as unknown as Record<string, unknown>,
    outputSchema: analystOutputSchema,
    userMessage,
    model: "sonnet",
    maxTokens: 4000,
    temperature: 0.6,
  });

  // Normalize: add generated_at + triggered_by, cast data to the
  // discriminated type. The LLM emitted the kind + data but didn't
  // know the timestamp or trigger source.
  return result.output.briefings.map((b) => ({
    ...b,
    data: b.data as Record<string, unknown>,
    generated_at,
    triggered_by: trigger,
  })) as Briefing[];
}
