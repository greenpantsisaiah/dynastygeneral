/**
 * Briefing schema. The output of the Intelligence Analyst service.
 *
 * Each briefing is one analytical take on the current league state.
 * Multiple kinds (narrative, tier, quadrant, graph, comparison,
 * timeline) so the analyst can pick whichever shape the data wants
 * for THIS particular insight. Every briefing is pinnable, browsable
 * in the chronological feed, and (when promoted) elevatable to the
 * War Room.
 *
 * Voice constraint: 3-sentence terse body. The analyst hits hard
 * and moves on; users scroll like a news feed of takes.
 */

import type { Position } from "../archetypes/schema";

export type BriefingKind =
  | "narrative"
  | "tier"
  | "quadrant"
  | "graph"
  | "comparison"
  | "timeline";

export type BriefingSeverity = "info" | "notable" | "critical";

// Machine-checkable precondition. The renderer re-evaluates these
// against the current snapshot on every page load so a briefing whose
// claim no longer holds (e.g. "you have 0 TEs" but you've since drafted
// 2) gets marked as resolved/invalidated instead of shown as a fact.
//
// Only one kind today: position_count_eq (the user said zero, you now
// have N). Add more kinds (position_count_gte, has_top_n_at_position)
// as new bug shapes surface. Keep it small + machine-checkable; do
// not let the analyst freelance arbitrary predicates here.
export type BriefingPrecondition = {
  kind: "position_count_eq";
  owner_name: string;
  position: Position;
  value: number;
};

// Common shape on every briefing
export type BriefingMeta = {
  id: string; // stable per-briefing ID
  kind: BriefingKind;
  severity: BriefingSeverity;
  headline: string; // <= 60 chars, analyst-voice
  body: string; // 3-sentence terse body
  evidence: string[]; // bullets citing observable signals
  topic_tags: string[]; // e.g. ["qb-cartel", "trade-lane", "messmn225"]
  generated_at: string; // ISO timestamp
  // Pick number the briefing was generated AT. Lets the renderer show
  // "as of pick N, M picks ago" when the world has moved on. Null
  // when the briefing was generated outside a draft context.
  generated_at_pick_no?: number | null;
  triggered_by: string; // human-readable trigger ("user requested" | "after pick 4.7" | "auto on snapshot delta")
  // Optional. The analyst emits these for any TAKE that depends on a
  // specific count/state. Renderer suppresses or annotates the
  // briefing when ANY precondition no longer holds against the
  // current snapshot.
  preconditions?: BriefingPrecondition[];
};

// Per-kind data payloads
export type NarrativeData = {
  // No extra structure; body covers it
  related_archetype_ids?: string[];
};

export type TierData = {
  axis_label: string; // "Trade target priority" | "Roster need urgency" | etc.
  items: Array<{
    label: string; // tier item name
    score: number; // 0..100
    reason: string; // 1-line evidence
  }>;
};

export type QuadrantData = {
  x_axis: { label: string; left: string; right: string };
  y_axis: { label: string; bottom: string; top: string };
  cells: Array<{
    quadrant: "tl" | "tr" | "bl" | "br";
    label: string;
    members: string[]; // owner names or roster IDs
    notes?: string;
  }>;
  edges?: Array<{
    from: string;
    to: string;
    label: string;
    note?: string;
  }>;
};

export type GraphData = {
  nodes: Array<{
    id: string;
    label: string;
    group?: string;
    attrs?: Record<string, string | number>;
  }>;
  edges: Array<{
    from: string;
    to: string;
    label?: string;
    weight?: number;
    note?: string;
  }>;
};

export type ComparisonData = {
  subject: string; // e.g. "Your roster"
  vs: string; // e.g. "messmn225"
  rows: Array<{
    metric: string;
    subject_value: string;
    vs_value: string;
    advantage: "subject" | "vs" | "even";
  }>;
};

export type TimelineData = {
  weeks: Array<{
    week: string; // "Wk5", "Wk10", etc.
    event: string;
    confidence: number; // 0..1
    if_it_happens: string;
  }>;
  if_all_breaks_right: string; // dream-payoff line
};

// Discriminated union: one type per kind
export type Briefing =
  | (BriefingMeta & { kind: "narrative"; data: NarrativeData })
  | (BriefingMeta & { kind: "tier"; data: TierData })
  | (BriefingMeta & { kind: "quadrant"; data: QuadrantData })
  | (BriefingMeta & { kind: "graph"; data: GraphData })
  | (BriefingMeta & { kind: "comparison"; data: ComparisonData })
  | (BriefingMeta & { kind: "timeline"; data: TimelineData });

// Forward-compat: position helper for renderers
export type { Position };
