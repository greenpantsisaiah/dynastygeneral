import {
  getLeague,
  getLeagueUsers,
  getMatchups,
  getNflState,
  getRosters,
  getTradedPicks,
  getUserByUsername,
  type SleeperLeague,
  type SleeperRoster,
  type SleeperLeagueUser,
} from "@/lib/sleeper";
import {
  formatPlayerShort,
  humanize,
  resolvePlayers,
  type HumanPlayer,
} from "@/lib/players/cache";
import type { SleeperPlayer } from "@/lib/sleeper/schemas";
import {
  buildLeagueProfile,
  type LeagueProfile,
  type TeamProfile,
} from "./opponent";
import {
  inferStrategyFromRoster,
  type InferredStrategy,
} from "@/lib/strategy/infer";
import { resolvePlayerValues, type PlayerValue } from "@/lib/players/values";

/**
 * Decision context: everything the engine needs to reason over a single
 * decision moment, in a small, model-legible shape.
 */

export type DecisionContext = {
  league: {
    id: string;
    name: string;
    season: string;
    status: string | null;
    total_rosters: number;
    roster_positions: string[];
    scoring_highlights: string[];
    is_superflex: boolean;
    format_type: "dynasty" | "keeper" | "redraft" | "unknown";
    // Operational rules derived from format + roster_positions.
    // Mirrors the Coach context contract so the same SYSTEM_PROMPT
    // hard rules ("never claim a position 'doesn't start' without
    // checking format_rules") fire correctly here too.
    format_rules: {
      qb_starters_max: number;
      rb_starters_max: number;
      wr_starters_max: number;
      te_starters_max: number;
      second_qb_starts: boolean;
      te_premium: boolean;
      flex_eligible: readonly ["RB", "WR", "TE"];
      sf_eligible: readonly ["QB", "RB", "WR", "TE"] | null;
    };
  };
  nfl: { season: string; week: number; season_type: string } | null;
  me: {
    sleeper_user_id: string | null;
    username: string | null;
    display_name: string | null;
    team_name: string;
    roster_id: number | null;
    record: { wins: number; losses: number; ties: number; fpts: number } | null;
    standing_rank: number | null;
    strategy: InferredStrategy;
    roster: HumanPlayer[];
    starters: HumanPlayer[];
    headline: string[];
  };
  league_profile: LeagueProfile;
  traded_picks_summary: string;
  // Trade pricing context. Player values from FantasyCalc, KTC-equivalent,
  // normalized 0-100. Resolved for the user's roster + every team's
  // headline players. Per dynasty-trade-realism-tester audit 2026-04-24:
  // SYSTEM_PROMPT trade rules require pricing context; without it the
  // LLM was freelancing trade math.
  pricing: {
    scale_note: string;
    fairness_band_pct: number;
    player_values_present: boolean;
    player_value_count: number;
    // Map keyed by Sleeper player_id. Renderer surfaces this inline
    // beside player names so the LLM doesn't need a separate lookup.
    player_values: Record<string, { value: number; overall_rank: number | null; position_rank: number | null }>;
    // Pick values. Empty for the decision endpoints (which don't have
    // draftState) until they wire it in. The system-prompt rule's
    // "pricing.pick_values empty + pick-involving trade = forbidden"
    // path keeps this honest in the meantime.
    pick_values: Array<{
      pick_label: string;
      pick_no: number;
      round: number;
      ktc_value: number;
    }>;
  };
};

export type ContextInputs = {
  leagueId: string;
  sleeperUsername?: string | null;
};

export async function assembleContext(
  inputs: ContextInputs,
): Promise<DecisionContext> {
  const { leagueId, sleeperUsername } = inputs;

  const [league, rosters, users, nflState, tradedPicks] = await Promise.all([
    getLeague(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
    getNflState(),
    getTradedPicks(leagueId),
  ]);

  if (!league) throw new Error(`League ${leagueId} not found`);

  const username = sleeperUsername?.trim().replace(/^@/, "") ?? "";
  const me = username ? await getUserByUsername(username) : null;

  // Collect all player ids from all rosters and resolve once
  const allIds = new Set<string>();
  for (const r of rosters) {
    for (const id of r.players ?? []) allIds.add(id);
  }
  const playersMap = await resolvePlayers([...allIds]);

  const userByRoster = buildUserByRosterMap(rosters, users);

  const myRoster = me
    ? rosters.find((r) => r.owner_id === me.user_id) ?? null
    : null;
  const myUser = me ? users.find((u) => u.user_id === me.user_id) ?? null : null;

  const totalRosters = league.total_rosters ?? rosters.length;
  const profile = buildLeagueProfile({
    rosters,
    users: userByRoster,
    players: playersMap,
    totalRosters,
  });

  const strategy = inferStrategyFromRoster(myRoster ?? undefined, totalRosters);

  const myRosterHumans = myRoster
    ? humansFrom(myRoster.players ?? [], playersMap)
    : [];
  const myStarters = myRoster
    ? humansFrom(myRoster.starters ?? [], playersMap)
    : [];

  const rankForRoster = (rosterId: number | null) =>
    rosterId == null
      ? null
      : profile.teams.find((t) => t.roster_id === rosterId)?.standing_rank ?? null;

  const recordForRoster = (rosterId: number | null) => {
    if (rosterId == null) return null;
    const t = profile.teams.find((p) => p.roster_id === rosterId);
    return t ? t.record : null;
  };

  const scoringHighlights = describeScoring(league);
  const isSuperflex = (league.roster_positions ?? []).some(
    (p) => p === "SUPER_FLEX" || p === "SUPERFLEX" || p === "SF",
  );

  const teamName =
    (myUser?.metadata as Record<string, unknown> | null | undefined)
      ?.team_name ??
    myUser?.display_name ??
    me?.display_name ??
    "Your team";

  // Derive operational format rules + starter slot maxes from
  // roster_positions. Mirrors the Coach context contract; needed so
  // SYSTEM_PROMPT trade rules ("never claim 'doesn't start' without
  // checking format_rules") fire correctly here too.
  const rosterPositions = league.roster_positions ?? [];
  const countSlot = (slot: string): number =>
    rosterPositions.filter((p) => p === slot).length;
  const flexCount = countSlot("FLEX") + countSlot("REC_FLEX") + countSlot("WRRB_FLEX");
  const recFlexCount = countSlot("REC_FLEX");
  const sfSlots =
    countSlot("SUPER_FLEX") + countSlot("SUPERFLEX") + countSlot("SF") + countSlot("Q_FLEX");
  const qbStartersMax = countSlot("QB") + sfSlots;
  const teStartersMax = countSlot("TE") + recFlexCount + Math.max(0, flexCount - recFlexCount);
  const rbStartersMax = countSlot("RB") + Math.max(0, flexCount - recFlexCount);
  const wrStartersMax = countSlot("WR") + flexCount;
  const tePremium = scoringHighlights.some((s) => /TE.?premium|TEP/i.test(s));

  // Player values for every rostered player across the league, resolved
  // against FantasyCalc (KTC-equivalent) for this format. Cached
  // server-side so this is at most one upstream fetch per format per
  // 24h. The full pool covers any trade discussion: user's roster +
  // every potential counterparty's roster.
  const isPpr = scoringHighlights.some((s) => /\bPPR\b/i.test(s)) && !scoringHighlights.some((s) => /half/i.test(s));
  const isHalfPpr = scoringHighlights.some((s) => /half.?PPR/i.test(s));
  const playerValueMap = await resolvePlayerValues({
    ids: [...allIds],
    isSuperflex,
    isPpr,
    isHalfPpr,
  });
  const playerValuesRecord: Record<string, { value: number; overall_rank: number | null; position_rank: number | null }> = {};
  for (const [id, v] of playerValueMap.entries()) {
    playerValuesRecord[id] = {
      value: v.value,
      overall_rank: v.overall_rank,
      position_rank: v.position_rank,
    };
  }

  return {
    league: {
      id: league.league_id,
      name: league.name,
      season: league.season,
      status: league.status ?? null,
      total_rosters: totalRosters,
      roster_positions: rosterPositions,
      scoring_highlights: scoringHighlights,
      is_superflex: isSuperflex,
      format_type: classifyFormat(league),
      format_rules: {
        qb_starters_max: qbStartersMax,
        rb_starters_max: rbStartersMax,
        wr_starters_max: wrStartersMax,
        te_starters_max: teStartersMax,
        second_qb_starts: qbStartersMax >= 2,
        te_premium: tePremium,
        flex_eligible: ["RB", "WR", "TE"] as const,
        sf_eligible: isSuperflex
          ? (["QB", "RB", "WR", "TE"] as const)
          : null,
      },
    },
    nfl: nflState
      ? {
          season: nflState.season,
          week: nflState.week,
          season_type: nflState.season_type,
        }
      : null,
    me: {
      sleeper_user_id: me?.user_id ?? null,
      username: me?.username ?? null,
      display_name: me?.display_name ?? null,
      team_name: String(teamName),
      roster_id: myRoster?.roster_id ?? null,
      record: recordForRoster(myRoster?.roster_id ?? null),
      standing_rank: rankForRoster(myRoster?.roster_id ?? null),
      strategy,
      roster: myRosterHumans,
      starters: myStarters,
      headline: myRosterHumans
        .filter((p) => !!p.position)
        .slice(0, 8)
        .map(formatPlayerShort),
    },
    league_profile: profile,
    traded_picks_summary: summarizeTradedPicks(tradedPicks, profile.teams),
    pricing: {
      scale_note:
        "Player values from FantasyCalc 2026-04-24 (KTC-equivalent), normalized 0-100. Use to bound any trade ask: receiving side total must land in [0.85x, 1.15x] of sending side. Pick values not yet wired into this endpoint; for pick-involving trades describe ask SHAPES instead of fabricating numbers (per system-prompt rule).",
      fairness_band_pct: 15,
      player_values_present: playerValueMap.size > 0,
      player_value_count: playerValueMap.size,
      player_values: playerValuesRecord,
      pick_values: [],
    },
  };
}

function buildUserByRosterMap(
  rosters: SleeperRoster[],
  users: SleeperLeagueUser[],
): Map<number, { name: string }> {
  const byUserId = new Map<string, SleeperLeagueUser>();
  for (const u of users) byUserId.set(u.user_id, u);
  const out = new Map<number, { name: string }>();
  for (const r of rosters) {
    if (!r.owner_id) continue;
    const u = byUserId.get(r.owner_id);
    if (!u) continue;
    const meta = (u.metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof meta.team_name === "string" && meta.team_name) ||
      u.display_name ||
      `Team ${r.roster_id}`;
    out.set(r.roster_id, { name });
  }
  return out;
}

function humansFrom(
  ids: readonly string[],
  players: Map<string, SleeperPlayer>,
): HumanPlayer[] {
  return ids
    .map((id) => players.get(id))
    .filter((p): p is SleeperPlayer => !!p)
    .map(humanize);
}

function describeScoring(league: SleeperLeague): string[] {
  const s = league.scoring_settings ?? {};
  const out: string[] = [];
  const rec = numOrNull(s.rec);
  if (rec === 1) out.push("Full PPR");
  else if (rec === 0.5) out.push("Half PPR");
  else if (rec === 0) out.push("Standard (no PPR)");
  else if (rec != null) out.push(`${rec} PPR`);

  const recTE = numOrNull(s.bonus_rec_te);
  if (recTE && recTE > 0) out.push(`TE premium +${recTE}/rec`);

  const passTd = numOrNull(s.pass_td);
  if (passTd === 6) out.push("6-point pass TDs");
  else if (passTd === 4) out.push("4-point pass TDs");

  return out;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function classifyFormat(
  league: SleeperLeague,
): "dynasty" | "keeper" | "redraft" | "unknown" {
  const t = league.settings?.type;
  if (t === 2) return "dynasty";
  if (t === 1) return "keeper";
  if (t === 0) return "redraft";
  return "unknown";
}

function summarizeTradedPicks(
  picks: Array<{ season: string; round: number; roster_id: number; owner_id: number }>,
  teams: TeamProfile[],
): string {
  if (picks.length === 0) return "No traded picks recorded.";
  // Net picks per roster_id: +1 acquired, -1 given up
  const net = new Map<number, number>();
  for (const p of picks) {
    net.set(p.owner_id, (net.get(p.owner_id) ?? 0) + 1);
    net.set(p.roster_id, (net.get(p.roster_id) ?? 0) - 1);
  }
  const lines: string[] = [];
  for (const t of teams) {
    const n = net.get(t.roster_id) ?? 0;
    if (n !== 0) {
      lines.push(`${t.owner_name}: ${n > 0 ? "+" : ""}${n} picks`);
    }
  }
  return lines.length === 0 ? "Balanced (no net movement)." : lines.join("; ");
}

// ── Prompt-friendly rendering ─────────────────────────────────────────────

/**
 * Render the context as a compact markdown block for inclusion in the
 * model's user message. Kept short and scannable. The model doesn't need
 * prose, just structured facts.
 */
export function renderContextForPrompt(ctx: DecisionContext): string {
  const lines: string[] = [];
  lines.push(`## League`);
  lines.push(
    `- ${ctx.league.name} (${ctx.league.season}) · ${ctx.league.format_type}${
      ctx.league.is_superflex ? " · SUPERFLEX" : ""
    } · ${ctx.league.total_rosters} teams · ${ctx.league.status ?? ""}`.trim(),
  );
  if (ctx.league.scoring_highlights.length) {
    lines.push(`- Scoring: ${ctx.league.scoring_highlights.join(", ")}`);
  }
  if (ctx.league.roster_positions.length) {
    lines.push(`- Roster: ${ctx.league.roster_positions.join(", ")}`);
  }
  // Format rules. CHECK THIS before claiming "X doesn't start" or
  // similar position-availability claims. Per SYSTEM_PROMPT hard rule.
  const fr = ctx.league.format_rules;
  lines.push(
    `- Starter maxes: QB=${fr.qb_starters_max}${fr.second_qb_starts ? " (SF: 2nd QB STARTS)" : ""}, RB=${fr.rb_starters_max}, WR=${fr.wr_starters_max}, TE=${fr.te_starters_max}${fr.te_premium ? " (TE-premium scoring)" : ""}`,
  );
  // Trade pricing scale note + sample of top values from the user's
  // roster to anchor the LLM's number sense for THIS format.
  if (ctx.pricing.player_values_present) {
    lines.push(`- Trade pricing: ${ctx.pricing.scale_note}`);
    const myRosterValues = ctx.me.roster
      .map((p) => ({ id: p.id, name: p.name, ...ctx.pricing.player_values[p.id] }))
      .filter((p) => typeof p.value === "number")
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 5);
    if (myRosterValues.length > 0) {
      lines.push(
        `  · Your roster anchors (KTC-equiv 0-100): ${myRosterValues.map((p) => `${p.name} ${p.value}`).join(", ")}`,
      );
    }
  } else {
    lines.push(
      `- Trade pricing: NOT AVAILABLE this turn. Per system rule, do not propose specific numeric trades; describe ask SHAPES instead.`,
    );
  }
  if (ctx.nfl) {
    lines.push(
      `- NFL: ${ctx.nfl.season} · ${ctx.nfl.season_type} · Week ${ctx.nfl.week}`,
    );
  }

  lines.push(``);
  lines.push(`## You`);
  lines.push(
    `- ${ctx.me.team_name}${
      ctx.me.username ? ` (@${ctx.me.username})` : ""
    }${
      ctx.me.standing_rank
        ? ` · rank ${ctx.me.standing_rank}/${ctx.league.total_rosters}`
        : ""
    }`,
  );
  if (ctx.me.record) {
    lines.push(
      `- Record: ${ctx.me.record.wins}-${ctx.me.record.losses}${
        ctx.me.record.ties ? `-${ctx.me.record.ties}` : ""
      } · ${ctx.me.record.fpts.toFixed(1)} fpts`,
    );
  }
  lines.push(
    `- Inferred strategy: ${ctx.me.strategy.state} (${Math.round(
      ctx.me.strategy.confidence * 100,
    )}% confidence)`,
  );
  if (ctx.me.strategy.signals.length) {
    for (const s of ctx.me.strategy.signals) lines.push(`  · ${s}`);
  }
  if (ctx.me.headline.length) {
    lines.push(`- Roster highlights:`);
    for (const h of ctx.me.headline) lines.push(`  · ${h}`);
  }

  lines.push(``);
  lines.push(`## League dynamics`);
  const dyn = ctx.league_profile.dynamics;
  lines.push(
    `- Trade counterparties: ${nameList(dyn.trade_counterparties, ctx.league_profile.teams) || "none"}`,
  );
  lines.push(
    `- Non-buyers: ${nameList(dyn.non_buyers, ctx.league_profile.teams) || "none"}`,
  );
  lines.push(
    `- Tilted buyers: ${nameList(dyn.tilted_buyers, ctx.league_profile.teams) || "none"}`,
  );

  lines.push(``);
  lines.push(`## Teams`);
  for (const t of ctx.league_profile.teams) {
    const rec = `${t.record.wins}-${t.record.losses}${
      t.record.ties ? `-${t.record.ties}` : ""
    }`;
    const pain =
      t.pain_points.length > 0 ? ` · pain: ${t.pain_points.join(", ")}` : "";
    const strong =
      t.strengths.length > 0 ? ` · strengths: ${t.strengths.join(", ")}` : "";
    lines.push(
      `- ${t.owner_name} [${t.label}] · ${rec} · QB${t.counts.QB}/RB${t.counts.RB}/WR${t.counts.WR}/TE${t.counts.TE}${strong}${pain}`,
    );
    if (t.headline_players.length) {
      lines.push(`  · ${t.headline_players.slice(0, 3).join(" | ")}`);
    }
  }

  lines.push(``);
  lines.push(`## Traded picks (net)`);
  lines.push(`- ${ctx.traded_picks_summary}`);

  return lines.join("\n");
}

function nameList(ids: number[], teams: TeamProfile[]): string {
  return ids
    .map((id) => teams.find((t) => t.roster_id === id)?.owner_name ?? String(id))
    .join(", ");
}
