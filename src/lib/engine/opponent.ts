import type { SleeperRoster } from "@/lib/sleeper";
import {
  formatPlayerShort,
  humanize,
  type HumanPlayer,
} from "@/lib/players/cache";
import type { SleeperPlayer } from "@/lib/sleeper/schemas";

/**
 * Per-team profile distilled for the decision engine's context.
 *
 * Keeps each team summary small and model-legible. The goal is to give
 * enough signal for opponent-incentive reasoning ("who's a trade partner?
 * who's a non-buyer? who's tilted?") without dumping full rosters.
 */

export type AgeBucket = "young" | "peak" | "aging" | "old";

export type TeamProfile = {
  roster_id: number;
  owner_name: string;
  record: { wins: number; losses: number; ties: number; fpts: number };
  standing_rank: number | null;
  counts: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    other: number;
  };
  starter_quality: {
    // Heuristic shorthand: "elite"=at-least-one top-tier at the position;
    // "solid"=starter-grade; "thin"=below replacement.
    QB: QualityTier;
    RB: QualityTier;
    WR: QualityTier;
    TE: QualityTier;
  };
  age_buckets: Record<AgeBucket, number>;
  avg_age: number | null;
  headline_players: string[]; // 3-5 named players that define the team
  strengths: string[];
  pain_points: string[];
  label: TeamLabel;
};

export type QualityTier = "elite" | "solid" | "thin" | "unknown";

export type TeamLabel =
  | "qb_banker"
  | "qb_stable"
  | "qb_needy"
  | "tilted_buyer"
  | "desperation"
  | "balanced"
  | "autopicker";

export type LeagueProfile = {
  teams: TeamProfile[];
  dynamics: {
    trade_counterparties: number[];
    non_buyers: number[];
    tilted_buyers: number[];
  };
};

export function buildLeagueProfile({
  rosters,
  users,
  players,
  totalRosters,
}: {
  rosters: SleeperRoster[];
  users: Map<number, { name: string }>; // roster_id → user
  players: Map<string, SleeperPlayer>;
  totalRosters: number;
}): LeagueProfile {
  const scored = rosters.map((r) =>
    scoreRoster(r, users.get(r.roster_id)?.name ?? `Team ${r.roster_id}`, players),
  );
  // standing (by wins desc, ties, fpts desc)
  const ranked = [...scored].sort(
    (a, b) =>
      b.record.wins - a.record.wins ||
      b.record.ties - a.record.ties ||
      b.record.fpts - a.record.fpts,
  );
  ranked.forEach((t, i) => {
    t.standing_rank = i + 1;
  });

  // label pass: requires knowing league-wide QB distribution
  for (const t of scored) {
    t.label = labelTeam(t, totalRosters);
  }

  return {
    teams: scored.sort((a, b) => a.roster_id - b.roster_id),
    dynamics: {
      trade_counterparties: scored
        .filter((t) => t.label === "desperation" || t.label === "qb_needy" || t.label === "tilted_buyer")
        .map((t) => t.roster_id),
      non_buyers: scored
        .filter((t) => t.label === "qb_stable" || t.label === "balanced")
        .map((t) => t.roster_id),
      tilted_buyers: scored
        .filter((t) => t.label === "tilted_buyer")
        .map((t) => t.roster_id),
    },
  };
}

function scoreRoster(
  r: SleeperRoster,
  ownerName: string,
  players: Map<string, SleeperPlayer>,
): TeamProfile {
  const s = (r.settings ?? {}) as Record<string, unknown>;
  const wins = num(s.wins);
  const losses = num(s.losses);
  const ties = num(s.ties);
  const fpts = num(s.fpts) + num(s.fpts_decimal) / 100;

  const ids = [...(r.players ?? [])];
  const resolved = ids
    .map((id) => players.get(id))
    .filter((p): p is SleeperPlayer => !!p)
    .map(humanize);

  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, other: 0 };
  for (const p of resolved) {
    const pos = (p.position ?? "").toUpperCase();
    if (pos === "QB") counts.QB += 1;
    else if (pos === "RB") counts.RB += 1;
    else if (pos === "WR") counts.WR += 1;
    else if (pos === "TE") counts.TE += 1;
    else counts.other += 1;
  }

  const age_buckets: Record<AgeBucket, number> = {
    young: 0,
    peak: 0,
    aging: 0,
    old: 0,
  };
  let ageSum = 0;
  let ageCount = 0;
  for (const p of resolved) {
    if (p.age == null) continue;
    ageSum += p.age;
    ageCount += 1;
    age_buckets[ageBucket(p.age)] += 1;
  }

  const headline_players = pickHeadline(resolved);

  const starter_quality = {
    QB: tierForPosition(resolved, "QB"),
    RB: tierForPosition(resolved, "RB"),
    WR: tierForPosition(resolved, "WR"),
    TE: tierForPosition(resolved, "TE"),
  };

  const strengths = deriveStrengths(starter_quality, counts);
  const pain_points = derivePainPoints(starter_quality, counts);

  return {
    roster_id: r.roster_id,
    owner_name: ownerName,
    record: { wins, losses, ties, fpts },
    standing_rank: null,
    counts,
    starter_quality,
    age_buckets,
    avg_age: ageCount ? +(ageSum / ageCount).toFixed(1) : null,
    headline_players,
    strengths,
    pain_points,
    label: "balanced",
  };
}

/**
 * labelTeam QB-count thresholds. SF-centric heuristics, UNCALIBRATED.
 * Per dynasty-assumption-auditor (2026-05-20): these feed the panic-
 * label leverage scores downstream (league-read/analyze.ts
 * PANIC_LEVERAGE_BY_LABEL); if the classifier is miscalibrated the
 * leverage audit compounds. Direction is defensible (QB scarcity in
 * superflex drives panic), but the exact counts need calibration
 * against realized trade behavior conditioned on label. Same trade-log
 * dataset as pick-quality.ts and the arbitrage backtest.
 */
const QB_BANKER_MIN = 3; // 3+ QBs reads as a superflex QB surplus
const QB_DESPERATION_MAX = 1; // 0-1 QBs reads as a superflex structural hole
const QB_STABLE_COUNT = 2; // exactly 2 QBs covers SF starters
const TILTED_MIN_PAINS = 2; // other holes that flip "stable" to "tilted"

function labelTeam(t: TeamProfile, totalRosters: number): TeamLabel {
  void totalRosters;
  // QB bank: 3+ QBs and at least "solid" QB tier
  if (t.counts.QB >= QB_BANKER_MIN && t.starter_quality.QB !== "thin")
    return "qb_banker";
  // desperation: 0-1 QBs or a thin QB tier
  if (t.counts.QB <= QB_DESPERATION_MAX || t.starter_quality.QB === "thin")
    return "desperation";
  // 2 QBs, solid tier: stable or tilted depending on other holes
  if (t.counts.QB === QB_STABLE_COUNT && t.pain_points.length >= TILTED_MIN_PAINS)
    return "tilted_buyer";
  if (t.counts.QB === QB_STABLE_COUNT) return "qb_stable";
  return "balanced";
}

function ageBucket(age: number): AgeBucket {
  if (age <= 24) return "young";
  if (age <= 28) return "peak";
  if (age <= 31) return "aging";
  return "old";
}

function tierForPosition(
  players: HumanPlayer[],
  pos: "QB" | "RB" | "WR" | "TE",
): QualityTier {
  const at = players.filter((p) => (p.position ?? "").toUpperCase() === pos);
  const count = at.length;
  // Without projections wired we use count + rookie/veteran shape as a
  // rough heuristic. The engine is told this is heuristic.
  if (count === 0) return "thin";
  if (pos === "QB") {
    if (count >= 3) return "elite";
    if (count >= 2) return "solid";
    return "thin";
  }
  if (pos === "TE") {
    if (count >= 2) return "solid";
    return "thin";
  }
  if (count >= 5) return "elite";
  if (count >= 3) return "solid";
  return "thin";
}

function pickHeadline(players: HumanPlayer[]): string[] {
  // Prefer named players with position + team populated; cap at 5.
  const sorted = players
    .filter((p) => !!p.position)
    .sort((a, b) => positionPriority(a.position) - positionPriority(b.position));
  return sorted.slice(0, 5).map(formatPlayerShort);
}

function positionPriority(pos: string | null): number {
  switch ((pos ?? "").toUpperCase()) {
    case "QB":
      return 0;
    case "RB":
      return 1;
    case "WR":
      return 2;
    case "TE":
      return 3;
    default:
      return 10;
  }
}

function deriveStrengths(
  q: TeamProfile["starter_quality"],
  c: TeamProfile["counts"],
): string[] {
  const out: string[] = [];
  if (q.QB === "elite" || c.QB >= 3) out.push("QB depth");
  if (q.WR === "elite") out.push("WR depth");
  if (q.RB === "elite") out.push("RB depth");
  if (q.TE === "solid" && c.TE >= 2) out.push("TE depth");
  return out;
}

function derivePainPoints(
  q: TeamProfile["starter_quality"],
  c: TeamProfile["counts"],
): string[] {
  const out: string[] = [];
  if (q.QB === "thin" || c.QB < 2) out.push("QB need");
  if (q.RB === "thin") out.push("RB thin");
  if (q.WR === "thin") out.push("WR thin");
  if (q.TE === "thin" || c.TE === 0) out.push("no viable TE");
  return out;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
