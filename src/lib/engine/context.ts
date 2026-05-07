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
import {
  buildFormatRulesFromRosterPositions,
  enumerateAllLeaguePicks,
  type FormatRules,
  type TradePricing,
} from "./llm-contract";
import {
  startupPickValue,
  SUPERFLEX_PICK_MULTIPLIER,
} from "@/lib/players/future-picks";
import {
  resolveInflections,
  type InflectionContext,
} from "./inflection";
import {
  buildInflectionInputsFromHumanPlayer,
} from "./inflection/build-inputs";
import { analyzeLeagueRead, type LeagueRead } from "@/lib/strategy/league-read";
import type { Position } from "@/lib/strategy/archetypes/schema";

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
    // Operational rules derived from format + roster_positions via
    // buildFormatRulesFromRosterPositions. Single source of truth in
    // llm-contract.ts; mirrors the Coach + briefings shape so the same
    // SYSTEM_PROMPT hard rules ("never claim a position 'doesn't start'
    // without checking format_rules") fire correctly here too.
    format_rules: FormatRules;
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
  // Trade pricing context. Single shape across all LLM endpoints
  // (Coach, decisions, briefings) defined in llm-contract.ts. The
  // SYSTEM_PROMPT trade rules require this; without it the LLM
  // freelances trade math (the 6.2-for-4.3 failure that triggered
  // the contract's existence).
  pricing: TradePricing;
  // Inflection-window bifurcations for the user's roster players. Per
  // the 2026-05-07 statistical-architecture decision: when a player is
  // in an inflection window (aging cliff, post-injury return, rookie
  // debut, etc.), the conditional outcome distribution is bimodal.
  // We surface the bifurcation (Story A / B with probabilities,
  // signal scorecard, named comparators) instead of a single point
  // estimate. Coach is required to lead with the bifurcation when an
  // inflection is active.
  // Keyed by player_id; only roster players in at least one window
  // appear here. Empty object when nothing is active.
  inflections: Record<string, InflectionContext>;
  // League read: in-draft trade leverage + structural-constraint
  // guardrails + trade-window timing. Computed from existing
  // league_profile dynamics + user roster + format rules.
  // Per the 2026-05-07 chat-gap diagnostic: founder repeatedly chats
  // Coach for this synthesis. We now compute it server-side and pass
  // to the LLM so Coach auto-leads with it. UI surface deferred.
  league_read: LeagueRead | null;
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

  // Derive operational format rules via the single source of truth
  // (llm-contract.ts). Mirrors the Coach + briefings shape so the
  // SYSTEM_PROMPT hard rules ("never claim 'doesn't start' without
  // checking format_rules") fire correctly here too.
  const rosterPositions = league.roster_positions ?? [];
  // Read keeper info from Sleeper league.settings (passthrough on the
  // schema). Per Sleeper convention: type 0=redraft, 1=keeper,
  // 2=dynasty. max_keepers populates only on keeper leagues.
  const settingsRaw = (league.settings ?? {}) as Record<string, unknown>;
  const settingsType =
    typeof settingsRaw["type"] === "number"
      ? (settingsRaw["type"] as number)
      : 2;
  const leagueType: "redraft" | "keeper" | "dynasty" =
    settingsType === 0
      ? "redraft"
      : settingsType === 1
        ? "keeper"
        : "dynasty";
  const maxKeepers =
    leagueType === "keeper" && typeof settingsRaw["max_keepers"] === "number"
      ? (settingsRaw["max_keepers"] as number)
      : null;
  const formatRules = buildFormatRulesFromRosterPositions({
    rosterPositions,
    scoringHighlights,
    isSuperflex,
    leagueType,
    maxKeepers,
  });

  // Player values for every rostered player across the league, resolved
  // against FantasyCalc (KTC-equivalent) for this format. Cached
  // server-side so this is at most one upstream fetch per format per
  // 24h. The full pool covers any trade discussion: user's roster +
  // every potential counterparty's roster.
  //
  // Note: assembleContext doesn't have draftState (that lives in the
  // hub page route), so pick_values stays empty here. The
  // SYSTEM_PROMPT rule "no pricing = describe ASK SHAPES" handles
  // pick-involving trades safely until draftState is wired.
  const isPpr =
    scoringHighlights.some((s) => /\bPPR\b/i.test(s)) &&
    !scoringHighlights.some((s) => /half/i.test(s));
  const isHalfPpr = scoringHighlights.some((s) => /half.?PPR/i.test(s));
  const isTePremium = scoringHighlights.some((s) =>
    /TE.?premium|TEP/i.test(s),
  );
  const playerValueMap = await resolvePlayerValues({
    ids: [...allIds],
    isSuperflex,
    isPpr,
    isHalfPpr,
    isTePremium,
  });
  const playerValuesRecord: TradePricing["player_values"] = {};
  for (const [id, v] of playerValueMap.entries()) {
    playerValuesRecord[id] = {
      value: v.value,
      overall_rank: v.overall_rank,
      position_rank: v.position_rank,
    };
  }

  // Inflection-window resolution for the user's roster. We pre-group
  // ALL rostered players (across the league) by team+position so the
  // successor / position-room saturation signals can fire correctly
  // (a rookie RB on the user's team that displaces the veteran lives
  // on the same NFL team but may not be on the user's roster).
  const allRosteredHumans = [...allIds]
    .map((id) => playersMap.get(id))
    .filter((p): p is SleeperPlayer => !!p)
    .map((p) => humanize(p));
  const teamPosIndex = new Map<string, HumanPlayer[]>();
  for (const p of allRosteredHumans) {
    if (!p.team || !p.position) continue;
    const key = `${p.team}:${p.position.toUpperCase()}`;
    const arr = teamPosIndex.get(key) ?? [];
    arr.push(p);
    teamPosIndex.set(key, arr);
  }
  const inflections: Record<string, InflectionContext> = {};
  for (const player of myRosterHumans) {
    if (!player.team || !player.position) continue;
    const key = `${player.team}:${player.position.toUpperCase()}`;
    const sameTeamSamePosition = (teamPosIndex.get(key) ?? []).filter(
      (p) => p.id !== player.id,
    );
    const inputs = buildInflectionInputsFromHumanPlayer({
      player,
      sameTeamSamePosition,
    });
    if (!inputs) continue;
    const resolved = resolveInflections(inputs);
    if (resolved) inflections[player.id] = resolved;
  }

  // League read: synthesize trade-leverage opportunities + structural
  // guardrails + trade-window timing from existing league_profile
  // dynamics + user roster + format rules.
  const userPositionCounts: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  const userPlayerValuesByPosition: Record<
    Position,
    Array<{ player_id: string; player_name: string; value: number }>
  > = { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] };
  for (const p of myRosterHumans) {
    const pos = (p.position ?? "").toUpperCase() as Position;
    if (
      pos !== "QB" &&
      pos !== "RB" &&
      pos !== "WR" &&
      pos !== "TE" &&
      pos !== "K" &&
      pos !== "DST"
    ) {
      continue;
    }
    userPositionCounts[pos] = (userPositionCounts[pos] ?? 0) + 1;
    const v = playerValueMap.get(p.id);
    if (v && typeof v.value === "number") {
      userPlayerValuesByPosition[pos].push({
        player_id: p.id,
        player_name: p.name,
        value: v.value,
      });
    }
  }
  const league_read = analyzeLeagueRead({
    profile,
    formatRules,
    userState: {
      position_counts: userPositionCounts,
      player_values_by_position: userPlayerValuesByPosition,
    },
    myRosterId: myRoster?.roster_id ?? null,
    currentPickNo: null, // draft state lives in resolveDraftState; v2 plumb-through
    totalRosters,
    rounds: 0,
  });

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
      format_rules: formatRules,
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
        "Player values from FantasyCalc (KTC-equivalent), normalized 0-100. Pick values from the KTC-anchored startupPickValue scale, format-multiplied for SF. Both compose arithmetically. Receiving side of any trade must land in [0.85x, 1.15x] of sending side.",
      fairness_band_pct: 15,
      player_values_present: playerValueMap.size > 0,
      player_value_count: playerValueMap.size,
      player_values: playerValuesRecord,
      // Price every pick in rounds 1-8 across the league (12 teams x 8
      // rounds = 96 picks for a 12-team). Without this, pick-involving
      // trades force the LLM to bracket-and-guess values that don't
      // map to its own picks (the counterparty's first-rounder, etc.).
      // That hallucination class produced the 2026-05-05 bad-trade-
      // analysis incident in the founder's "Final Countdown" league.
      pick_values: enumerateAllLeaguePicks(totalRosters, 8).map((p) => ({
        ...p,
        ktc_value: Math.round(
          startupPickValue(p.pick_no) *
            (isSuperflex ? SUPERFLEX_PICK_MULTIPLIER : 1.0),
        ),
      })),
      sf_pick_multiplier: isSuperflex ? SUPERFLEX_PICK_MULTIPLIER : 1.0,
    },
    inflections,
    league_read,
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

  // Inflection-window bifurcations on roster players. Per the
  // 2026-05-07 statistical-architecture decision: when a roster player
  // is in an aging cliff / rookie debut / post-injury window, the
  // outcome distribution is bimodal. Coach must NOT collapse to a
  // single point estimate; lead with the bifurcation and the
  // signal scorecard.
  const inflectionEntries = Object.entries(ctx.inflections);
  if (inflectionEntries.length > 0) {
    lines.push(``);
    lines.push(`## Inflection-window bifurcations on your roster`);
    lines.push(
      `- These players are in HIGH-VARIANCE moments where the outcome distribution is bimodal. Do NOT recommend a single point estimate; lead with Story A vs Story B framing, cite the scorecard signals by name, and let the user weigh the bifurcation.`,
    );
    for (const [, ctx2] of inflectionEntries) {
      for (const r of ctx2.resolutions) {
        lines.push(``);
        lines.push(
          `### ${ctx2.player_name} (${ctx2.position}) · ${r.window.replace(/_/g, " ")}`,
        );
        lines.push(`- ${r.headline}`);
        lines.push(
          `- Calibration: ${r.confidence_summary.text}`,
        );
        lines.push(`- Story A "${r.story_a_label}" probability: ${Math.round(r.p_story_a * 100)}%`);
        lines.push(`- Story B "${r.story_b_label}" probability: ${Math.round(r.p_story_b * 100)}%`);
        lines.push(`- Scorecard:`);
        for (const s of r.signals) {
          const arrow =
            s.direction === "story_a"
              ? "(A)"
              : s.direction === "story_b"
                ? "(B)"
                : s.direction === "neutral"
                  ? "(neutral)"
                  : "(data missing)";
          lines.push(
            `  · [${s.confidence}] ${s.name} ${arrow}: ${s.observation ?? "n/a"}`,
          );
        }
        const aComps = r.comparators.filter((c) => c.story === "a");
        const bComps = r.comparators.filter((c) => c.story === "b");
        if (aComps.length > 0) {
          lines.push(
            `- Story A comparators: ${aComps.map((c) => `${c.player} ${c.year ?? ""} (${c.outcome_summary})`).join("; ")}`,
          );
        }
        if (bComps.length > 0) {
          lines.push(
            `- Story B comparators: ${bComps.map((c) => `${c.player} ${c.year ?? ""} (${c.outcome_summary})`).join("; ")}`,
          );
        }
      }
    }
  }

  // League read: trade-leverage synthesis, structural constraints,
  // trade-window timing. Surfaced before "League dynamics" so Coach
  // sees the synthesized strategic frame before the raw dynamics
  // categories. Per the 2026-05-07 chat-gap diagnostic: founder
  // repeatedly chats Coach for this; the data was always there but
  // never auto-led with.
  if (ctx.league_read) {
    const lr = ctx.league_read;
    lines.push(``);
    lines.push(`## League read (trade leverage + structural strategy)`);
    lines.push(`- ${lr.headline}`);
    if (lr.top_leverage_opportunities.length > 0) {
      lines.push(`- Top trade leverage targets:`);
      for (const op of lr.top_leverage_opportunities) {
        lines.push(
          `  · ${op.opponent_name} (${op.opponent_panic_label}, leverage score ${op.leverage_score}/100)`,
        );
        lines.push(`    Send: ${op.send_position}. Asset hint: ${op.send_asset_hint}.`);
        lines.push(
          `    Receive: ${op.receive_position ?? "TBD"}. Asset hint: ${op.receive_asset_hint}.`,
        );
        if (op.opponent_softness_signals.length > 0) {
          lines.push(
            `    Softness signals: ${op.opponent_softness_signals.slice(0, 3).join("; ")}.`,
          );
        }
        lines.push(`    Framing: ${op.framing_one_liner}`);
      }
    }
    for (const c of lr.structural_constraints) {
      if (c.is_active) {
        lines.push(`- Structural guardrail: ${c.guardrail_message}`);
      }
    }
    if (lr.trade_window) {
      lines.push(`- Trade window: ${lr.trade_window.message}`);
    }
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
