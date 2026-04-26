/**
 * Engine Integrity checks.
 *
 * "Did the engine see what it was supposed to see?" Single backstop
 * suite that runs N independent integrity assertions over the
 * snapshot, available pool, player values, and synthesized decision.
 * Any severe failure renders an unconditional danger banner on the
 * league hub; warnings show in `?diagnose=1`.
 *
 * Pattern that established this module: the Sam LaPorta incident
 * 2026-04-25, where a top-100 undrafted player was silently absent
 * from `available` because Sleeper's `roster.players` field
 * carried stale prior-season state. The Coach correctly hedged but
 * the Decision card surfaced wrong recommendations. Per user
 * 2026-04-25: "this is one of the most obvious core parts of this
 * product"; data integrity is non-negotiable EXPECTED behavior.
 *
 * Per user direction 2026-04-25: be 100% perfect on expected
 * behavior; experimental work goes on the delighter side. This
 * module is the expected-behavior backstop. Each check is a pure
 * function over already-loaded state, runs in O(n) over the pool,
 * and never makes external calls. Total render cost is sub-10ms.
 *
 * Add a new risk: add a new function plus one entry in
 * `runEngineIntegrityChecks`. No new infrastructure per check.
 */

import type { LeagueSnapshot } from "../strategy/league-state/snapshot";
import type { AvailablePlayer } from "./available";
import type { PlayerValue } from "./values";
import type { Decision } from "../strategy/decision-synthesis/types";
import { effectiveStarterReqs } from "../strategy/decision-synthesis/synthesize";
import { buildFormatRulesFromSnapshot } from "../engine/llm-contract";
import { runCompletenessSanityChecks } from "./sanity";

export type IntegrityKind =
  | "pool_missing_player"
  | "drafted_in_available"
  | "roster_not_found"
  | "roster_identity_mismatch"
  | "position_unknown"
  | "format_mismatch"
  | "cache_stale"
  | "starter_reqs_drift"
  | "availability_incoherent"
  | "cross_source_position";

export type IntegritySeverity = "severe" | "warning";

export type IntegrityIssue = {
  kind: IntegrityKind;
  severity: IntegritySeverity;
  headline: string;
  detail: string;
  evidence: string;
};

export type IntegrityReport = {
  severity: "ok" | "severe" | "warning";
  issues: IntegrityIssue[];
  severe_count: number;
  warning_count: number;
};

export function runEngineIntegrityChecks(args: {
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
  playerValues: Map<string, PlayerValue>;
  decision: Decision | null;
  rosterPositionsRaw: string[];
  playersFetchedAt: number | null;
}): IntegrityReport {
  const issues: IntegrityIssue[] = [];

  issues.push(...runPoolCompletenessCheck(args));
  issues.push(...runDraftedPresenceCheck(args));
  issues.push(...runRosterIdentificationCheck(args));
  issues.push(...runRosterIdentityVerification(args));
  issues.push(...runPositionNormalizationCheck(args));
  issues.push(...runFormatDetectionCheck(args));
  issues.push(...runCacheFreshnessCheck(args));
  issues.push(...runStarterReqsConsistencyCheck(args));
  issues.push(...runAvailabilityCoherenceCheck(args));
  issues.push(...runCrossSourcePositionCheck(args));

  const severe = issues.filter((i) => i.severity === "severe");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    severity: severe.length > 0 ? "severe" : warnings.length > 0 ? "warning" : "ok",
    issues,
    severe_count: severe.length,
    warning_count: warnings.length,
  };
}

// 1. Pool completeness. Reuses the existing FantasyCalc-baseline
// check from sanity.ts and projects results into the unified
// IntegrityIssue shape. The LaPorta-class bug.
function runPoolCompletenessCheck(args: {
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
  playerValues: Map<string, PlayerValue>;
}): IntegrityIssue[] {
  const draftedIds = new Set<string>();
  for (const p of args.snap.draft.picks_made) {
    if (p.player_id) draftedIds.add(p.player_id);
  }
  const missing = runCompletenessSanityChecks({
    available: args.available,
    playerValues: args.playerValues,
    draftedIds,
  });
  return missing.map((m) => ({
    kind: "pool_missing_player" as const,
    severity: "severe" as const,
    headline: `${m.name} (${m.position ?? "?"}, consensus #${m.consensus_rank}) silently missing from available pool`,
    detail: `Top-100 consensus player who is neither in the available pool nor in the drafted set. Recommendations downstream may exclude this player as a candidate.`,
    evidence: `player_id ${m.player_id}, consensus_rank ${m.consensus_rank}, raw_value ${m.raw_value.toFixed(1)}`,
  }));
}

// 2. Drafted-in-available. The inverse of LaPorta. If a drafted
// player_id appears in the available pool, the engine could
// recommend an already-taken player.
function runDraftedPresenceCheck(args: {
  snap: LeagueSnapshot;
  available: AvailablePlayer[];
}): IntegrityIssue[] {
  const draftedIds = new Set<string>();
  for (const p of args.snap.draft.picks_made) {
    if (p.player_id) draftedIds.add(p.player_id);
  }
  const issues: IntegrityIssue[] = [];
  for (const player of args.available) {
    if (!draftedIds.has(player.id)) continue;
    issues.push({
      kind: "drafted_in_available",
      severity: "severe",
      headline: `${player.name} (${player.position ?? "?"}) is in the available pool but already drafted`,
      detail: `player_id appears in both snap.draft.picks_made and the available pool. The engine could recommend a player who is no longer on the board.`,
      evidence: `player_id ${player.id}, position ${player.position ?? "?"}, team ${player.team ?? "?"}`,
    });
    // Cap reporting at first 5 to keep banner readable. The
    // pattern, not the count, is the trust signal.
    if (issues.length >= 5) break;
  }
  return issues;
}

// 3. Roster identification. find(r => r.is_me) must return non-null
// or the entire user-roster pipeline is poisoned.
function runRosterIdentificationCheck(args: {
  snap: LeagueSnapshot;
}): IntegrityIssue[] {
  const me = args.snap.rosters.find((r) => r.is_me);
  if (me) return [];
  return [
    {
      kind: "roster_not_found",
      severity: "severe",
      headline: "Your roster could not be identified in this league",
      detail:
        "snap.rosters.find(r => r.is_me) returned null. Possible causes: you are a co-owner (not primary owner), your Sleeper username changed, or the user-id mapping is stale. Until this is resolved every roster-aware surface (Decision card, position counts, anchors, Coach context) will treat you as having no players.",
      evidence: `Total rosters: ${args.snap.rosters.length}; none flagged is_me`,
    },
  ];
}

// 3b. Roster identity verification. The is_me roster passed the
// find() guard but may still be the wrong roster (wrong username
// in URL, stale profile mapping, navigation accident landed on
// someone else's hub). Cross-check against ground truth: during
// an active draft, picks_made is authoritative on which roster
// owns which players. If is_me roster has zero attributed picks
// while the draft has picks, the identity is almost certainly
// wrong. Pattern: Strawhatdoofy hub viewed under izzydabomb
// session 2026-04-25.
function runRosterIdentityVerification(args: {
  snap: LeagueSnapshot;
}): IntegrityIssue[] {
  const me = args.snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  const picks = args.snap.draft.picks_made;
  if (picks.length === 0) return [];
  const minePickCount = picks.filter(
    (p) => p.roster_id === me.roster_id,
  ).length;
  if (minePickCount > 0) return [];
  return [
    {
      kind: "roster_identity_mismatch",
      severity: "severe",
      headline: `You are mapped to roster ${me.roster_id} but Sleeper shows zero picks for that roster in this draft`,
      detail:
        "The hub identified your roster from owner_id matching, but ground-truth draft picks attribute zero selections to that roster while the draft has progressed. You are almost certainly viewing the wrong team. Common causes: a stale ?username= in the URL, a navigation that loaded another manager's view, or a saved-username mismatch. Every recommendation below this banner reflects the WRONG team's roster.",
      evidence: `is_me roster_id=${me.roster_id}, owner_id=${me.owner_id}, picks_in_draft=${picks.length}, picks_attributed_to_me=${minePickCount}`,
    },
  ];
}

// 4. Position normalization. If players on the user's roster have
// unrecognized positions, position_counts undercounts them and the
// "fill X hole" math is wrong (engine sees 0 RB when user has 1).
function runPositionNormalizationCheck(args: {
  snap: LeagueSnapshot;
}): IntegrityIssue[] {
  const me = args.snap.rosters.find((r) => r.is_me);
  if (!me) return [];
  const counted =
    me.position_counts.QB +
    me.position_counts.RB +
    me.position_counts.WR +
    me.position_counts.TE +
    me.position_counts.K +
    me.position_counts.DST;
  const expected = me.player_ids.length;
  const unknown = expected - counted;
  if (unknown <= 0) return [];
  return [
    {
      kind: "position_unknown",
      severity: "severe",
      headline: `${unknown} player${unknown === 1 ? "" : "s"} on your roster ${unknown === 1 ? "has" : "have"} unrecognized position`,
      detail: `These players don't count toward starter-requirement math. The engine may report wrong holes (e.g., "fill RB hole" when you actually have an RB the system can't categorize). Likely causes: Sleeper schema change, new position code, or stale player record without a position field.`,
      evidence: `player_ids on roster: ${expected}, counted by position: ${counted}, unaccounted: ${unknown}`,
    },
  ];
}

// 5. Format detection. detectFormat and parseStarterSlots both look
// at roster_positions but historically used different variant
// strings. Cross-check here so future divergence fires immediately.
const SUPERFLEX_VARIANTS = new Set([
  "SUPER_FLEX",
  "SUPERFLEX",
  "SF",
  "Q_FLEX",
]);

function runFormatDetectionCheck(args: {
  snap: LeagueSnapshot;
  rosterPositionsRaw: string[];
}): IntegrityIssue[] {
  const rawHasSf = args.rosterPositionsRaw.some((p) =>
    SUPERFLEX_VARIANTS.has(p.toUpperCase()),
  );
  const detectedSf =
    args.snap.format === "superflex" || args.snap.format === "2qb";
  // 2qb format has no SF slot but has 2 QB hard slots; hasSf=false
  // detectedSf=true is OK in that case. We compare strictly the SF
  // path: if rawHasSf disagrees with the parsed superflex count,
  // that's the bug class.
  const parsedSf = args.snap.starter_slots.superflex > 0;
  if (rawHasSf === parsedSf) return [];
  return [
    {
      kind: "format_mismatch",
      severity: "severe",
      headline: rawHasSf
        ? "League roster_positions contains a super-flex slot but starter_slots.superflex is 0"
        : "starter_slots.superflex is non-zero but no super-flex slot in roster_positions",
      detail: `parseStarterSlots and the raw roster_positions disagree on whether this league has a super-flex slot. This is the SF QB starter bug class: a misread here makes the engine treat a superflex league as 1QB or vice versa, producing wrong starter-need math everywhere.`,
      evidence: `roster_positions: ${args.rosterPositionsRaw.join(", ")} · parsed superflex count: ${args.snap.starter_slots.superflex}`,
    },
  ];
}

// 6. Cache freshness. Stale players blob = stale teams, missed
// trades, missed retirements. Warning at 24h, severe at 48h.
function runCacheFreshnessCheck(args: {
  playersFetchedAt: number | null;
}): IntegrityIssue[] {
  if (args.playersFetchedAt == null) return [];
  const ageMs = Date.now() - args.playersFetchedAt;
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours <= 24) return [];
  return [
    {
      kind: "cache_stale",
      severity: ageHours > 48 ? "severe" : "warning",
      headline: `Players cache is ${Math.round(ageHours)} hours old`,
      detail:
        "Stale data risks missed mid-season trades, retired players still appearing, position changes, and roster transactions. Hub auto-refreshes daily; if this banner persists, the refresh is failing (Sleeper rate-limit, network error, or schema change).",
      evidence: `Last fetch: ${new Date(args.playersFetchedAt).toISOString()}`,
    },
  ];
}

// 7. Starter-reqs consistency. effectiveStarterReqs (used by the
// engine for fill_starter rules) and qb_starters_max (used by the
// LLM contract) must produce the same QB number. If they ever
// drift, the SF QB starter bug returns.
function runStarterReqsConsistencyCheck(args: {
  snap: LeagueSnapshot;
}): IntegrityIssue[] {
  const eng = effectiveStarterReqs(args.snap);
  const fr = buildFormatRulesFromSnapshot(args.snap);
  if (eng.QB === fr.qb_starters_max) return [];
  return [
    {
      kind: "starter_reqs_drift",
      severity: "severe",
      headline: `QB starter-need disagreement: engine=${eng.QB}, LLM contract=${fr.qb_starters_max}`,
      detail: `effectiveStarterReqs and format_rules.qb_starters_max are supposed to produce the same number for QB (hard.QB + superflex). Drift here means the Decision card and the Coach disagree about whether the user has a QB hole. This is the bug class shipped in 3c61992.`,
      evidence: `effectiveStarterReqs.QB=${eng.QB}, qb_starters_max=${fr.qb_starters_max}`,
    },
  ];
}

// 8. Availability coherence. A candidate flagged "probably_gone" on
// the Top 3 must not also be a primary recommendation in the Next
// Picks Plan at the corresponding slot. The Higgins bug class.
function runAvailabilityCoherenceCheck(args: {
  decision: Decision | null;
}): IntegrityIssue[] {
  if (!args.decision) return [];
  const probablyGoneNames = new Set<string>();
  for (const c of args.decision.top_candidates) {
    if (c.availability_next_pick === "probably_gone") {
      probablyGoneNames.add(c.name);
    }
  }
  if (probablyGoneNames.size === 0) return [];
  const issues: IntegrityIssue[] = [];
  for (const item of args.decision.next_picks_plan) {
    for (const name of item.target_names) {
      if (!probablyGoneNames.has(name)) continue;
      issues.push({
        kind: "availability_incoherent",
        severity: "severe",
        headline: `${name} is flagged "probably gone by next pick" but recommended at ${item.pick_label}`,
        detail: `The engine identified this player as fragile-to-gone before your next slot, then recommended him AT that slot. This is the Higgins bug class: divergent ADP filters between the candidate badge and the next-picks-plan pool. They must use the same predicate.`,
        evidence: `pick_label ${item.pick_label}, target_position ${item.target_position}`,
      });
      if (issues.length >= 3) return issues;
    }
  }
  return issues;
}

// 9. Cross-source position check. FantasyCalc and Sleeper both
// publish position; if they disagree on a top-100 player, one
// source is wrong and we want to know.
function runCrossSourcePositionCheck(args: {
  available: AvailablePlayer[];
  playerValues: Map<string, PlayerValue>;
}): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const cap = Math.min(args.available.length, 100);
  for (let i = 0; i < cap; i++) {
    const p = args.available[i];
    const v = args.playerValues.get(p.id);
    if (!v || !v.position || !p.position) continue;
    const sleeper = p.position.toUpperCase();
    const fc = v.position.toUpperCase();
    if (sleeper === fc) continue;
    // DST and DEF are aliases per INVARIANTS; treat as equal.
    if (
      (sleeper === "DST" && fc === "DEF") ||
      (sleeper === "DEF" && fc === "DST")
    ) {
      continue;
    }
    issues.push({
      kind: "cross_source_position",
      severity: "warning",
      headline: `${p.name}: Sleeper position "${sleeper}" disagrees with FantasyCalc "${fc}"`,
      detail: `One source has stale or wrong position data for this player. The engine trusts Sleeper today; if Sleeper is wrong, every position-aware decision for this player is wrong.`,
      evidence: `player_id ${p.id}, sleeper ${sleeper}, fantasycalc ${fc}`,
    });
    if (issues.length >= 5) break;
  }
  return issues;
}

export function summarizeIntegrityReport(report: IntegrityReport): string {
  if (report.severity === "ok") return "integrity: clean";
  const head = report.issues
    .slice(0, 3)
    .map((i) => `[${i.severity}] ${i.kind}: ${i.headline}`);
  return `integrity: ${report.severe_count} severe, ${report.warning_count} warning. Top: ${head.join(" | ")}`;
}
