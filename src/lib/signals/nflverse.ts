/**
 * nflverse signal computation, shared by the ingestion script and the
 * backtest so there is ONE implementation of "fetch nflverse + join to
 * Sleeper ids + compute player/team signals." Per CANONICAL_SOURCES
 * discipline: do not duplicate this compute.
 *
 * Sources (all free): nflverse-data releases (CC-BY-4.0); the
 * DynastyProcess id crosswalk. Keyed to Sleeper player_ids via the
 * crosswalk. See DATA_ACQUISITION_PHASE3.md.
 *
 * IMPORTANT linkage note (2026-05-24): the evaluation rubric reads
 * `rb_role_tier` (categorical), team coaching/scheme signals, and
 * `compounding_news_count`, NOT the raw usage shares. So this module
 * DERIVES `rb_role_tier` from snap/rush/target share (the rubric's own
 * thresholds) to bridge the free data to the RB rubric. The team
 * coaching/scheme signals the WR/TE/QB rubrics read are NOT available
 * from free data; those rubrics stay market-prior-driven until a manual
 * or paid team-signal source lands.
 */

import type { RbRoleTier } from "@/lib/signals/schema";

export const XWALK_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";
const NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download";
export const SKILL = new Set(["QB", "RB", "WR", "TE"]);
const OL_POS = new Set(["T", "G", "C", "OT", "OG", "OL", "LT", "RT", "LG", "RG"]);

// ---------- CSV ----------
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { headers: { accept: "text/csv" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = vals[j] ?? "";
    rows.push(row);
  }
  return rows;
}

export function num(s: string | undefined): number | null {
  if (s == null || s === "" || s === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function htToInches(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d+)-(\d+)$/);
  if (m) return Number(m[1]) * 12 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function pctRank(values: number[], v: number, lowerIsBetter: boolean): number {
  const n = values.length;
  if (n <= 1) return 0.5;
  let below = 0;
  for (const x of values) if (x < v) below++;
  const p = below / (n - 1);
  return lowerIsBetter ? 1 - p : p;
}

/**
 * Derive the RB role tier the rubric reads, from the usage shares we
 * can get free. Thresholds are the rubric's own (rb.ts): strict_bellcow
 * > 70% snap share, bellcow 60-70%. A passdown specialist plays but
 * barely runs (low rush share) while catching passes (real target
 * share). No snap data -> starter_uncertain (the rubric widens its band
 * rather than asserting a role).
 */
export function deriveRbRoleTier(
  snapShare: number | null,
  rushShare: number | null,
  targetShare: number | null,
): RbRoleTier | null {
  if (snapShare == null) return "starter_uncertain";
  if (rushShare != null && rushShare < 0.1 && (targetShare ?? 0) >= 0.12) {
    return "passdown";
  }
  if (snapShare >= 0.7) return "strict_bellcow";
  if (snapShare >= 0.6) return "bellcow";
  if (snapShare >= 0.45) return "lead_back";
  return "committee_member";
}

export type Crosswalk = {
  gsisToSleeper: Map<string, string>;
  pfrToSleeper: Map<string, string>;
  nameBySleeper: Map<string, string>;
  posBySleeper: Map<string, string>;
  birthYearBySleeper: Map<string, number>;
  draftYearBySleeper: Map<string, number>;
};

export async function loadCrosswalk(): Promise<Crosswalk> {
  const xwalk = await fetchCsv(XWALK_URL);
  const gsisToSleeper = new Map<string, string>();
  const pfrToSleeper = new Map<string, string>();
  const nameBySleeper = new Map<string, string>();
  const posBySleeper = new Map<string, string>();
  const birthYearBySleeper = new Map<string, number>();
  const draftYearBySleeper = new Map<string, number>();
  for (const r of xwalk) {
    const sleeper = r.sleeper_id?.trim();
    if (!sleeper || sleeper === "NA") continue;
    if (r.gsis_id && r.gsis_id !== "NA") gsisToSleeper.set(r.gsis_id, sleeper);
    if (r.pfr_id && r.pfr_id !== "NA") pfrToSleeper.set(r.pfr_id, sleeper);
    if (r.name) nameBySleeper.set(sleeper, r.name);
    if (r.position) posBySleeper.set(sleeper, r.position.toUpperCase());
    const by = Number((r.birthdate ?? "").slice(0, 4));
    if (Number.isFinite(by)) birthYearBySleeper.set(sleeper, by);
    const dy = Number(r.draft_year ?? "");
    if (Number.isFinite(dy) && dy > 1900) draftYearBySleeper.set(sleeper, dy);
  }
  return {
    gsisToSleeper,
    pfrToSleeper,
    nameBySleeper,
    posBySleeper,
    birthYearBySleeper,
    draftYearBySleeper,
  };
}

export async function fetchSleeperActiveIds(): Promise<Set<string>> {
  try {
    const res = await fetch("https://api.sleeper.app/v1/players/nfl");
    if (!res.ok) return new Set();
    const blob = (await res.json()) as Record<string, { active?: boolean }>;
    const set = new Set<string>();
    for (const [id, p] of Object.entries(blob)) if (p?.active) set.add(id);
    return set;
  } catch {
    return new Set();
  }
}

export type ComputedPlayerSignal = {
  player_id: string;
  position: string | null;
  team: string | null;
  snap_share_prior_year: number | null;
  route_participation_prior_year: number | null;
  target_share_prior_year: number | null;
  rush_share_prior_year: number | null;
  rb_role_tier: RbRoleTier | null;
  draft_round: number | null;
  draft_pick_no: number | null;
  ras: number | null;
  weight_lb: number | null;
  height_in: number | null;
};

export type ComputedTeamSignal = {
  team: string;
  ol_continuity_score: number | null;
};

/**
 * Route participation for WR / TE from nflverse pbp_participation
 * (CC-BY-4.0; available per season 2021-2024). The file lists every
 * player on the field per play but does NOT chart per-player routes,
 * so route participation here is the well-established free proxy:
 *
 *   route_participation = (dropback plays the player was on the field)
 *                       / (his team's dropback plays in those games)
 *
 * A "dropback" is a play with a non-null `time_to_throw` (the QB
 * dropped back to pass). A WR / TE on the field for a dropback is
 * presumed to have run a route; the denominator is the team's dropback
 * total in the same game so a player who misses games is not penalized
 * for snaps he was never present for. Mid-season trades are handled by
 * crediting each game to the team the player actually lined up for that
 * week (the possession_team on the plays he appears in). RB pass-block
 * snaps inflate RB participation, so this is computed for WR / TE only;
 * the RB rubric reads role tier, not route rate.
 *
 * Validated 2026-05-30 against 2023: the top route-rate WR/TE are the
 * expected full-time receivers (DeVonta Smith 98.5%, Garrett Wilson,
 * Keenan Allen, Amon-Ra St. Brown, George Kittle), no value exceeds
 * 100%, GP-floored at MIN_TEAM_DROPBACKS so a one-game cameo cannot
 * masquerade as a full-season read.
 *
 * Per-season by construction (one file per year), so the backtest reads
 * the prior season's rate (temporally blinded) and the live ingest
 * reads the latest completed season's rate.
 */
export type RouteParticipation = {
  player_id: string; // Sleeper id
  position: string; // WR | TE (primary, from on-field positions)
  team: string | null; // primary team that season
  route_rate: number; // 0..1 dropbacks-on-field / team dropbacks
  dropbacks_on_field: number;
  team_dropbacks: number;
};

const MIN_TEAM_DROPBACKS = 100; // GP floor: ignore cameo-only seasons

function pbpParticipationUrl(season: string): string {
  return `${NFLVERSE}/pbp_participation/pbp_participation_${season}.csv`;
}

export async function buildRouteParticipation(
  season: string,
  xwalk: Crosswalk,
): Promise<Map<string, RouteParticipation>> {
  let rows: Record<string, string>[];
  try {
    rows = await fetchCsv(pbpParticipationUrl(season));
  } catch {
    return new Map(); // season file absent -> signal degrades to null
  }
  return aggregateRouteParticipation(rows, xwalk);
}

/**
 * Pure aggregation half of route participation: takes already-fetched
 * pbp_participation rows and the crosswalk, returns the per-player route
 * rate map. Split out from the fetch so it is unit-testable without a
 * network call. `minTeamDropbacks` is the GP floor (defaults to the
 * production MIN_TEAM_DROPBACKS; tests pass a small value).
 */
export function aggregateRouteParticipation(
  rows: Record<string, string>[],
  xwalk: Crosswalk,
  minTeamDropbacks: number = MIN_TEAM_DROPBACKS,
): Map<string, RouteParticipation> {
  const { gsisToSleeper, posBySleeper } = xwalk;
  // team-game dropback totals, player on-field dropbacks, the team a
  // player lined up for per game, and the player's on-field position mix.
  const teamGameDb = new Map<string, number>(); // `${team}|${game}` -> count
  const playerGameTeam = new Map<string, Map<string, string>>(); // gsis -> game -> team
  const playerDb = new Map<string, number>(); // gsis -> dropbacks on field
  const playerPos = new Map<string, Map<string, number>>(); // gsis -> pos -> count

  for (const r of rows) {
    const isDb = num(r.time_to_throw) != null; // QB dropped back to pass
    const team = r.possession_team ?? "";
    const game = r.nflverse_game_id ?? "";
    if (isDb && team && game) {
      const k = `${team}|${game}`;
      teamGameDb.set(k, (teamGameDb.get(k) ?? 0) + 1);
    }
    const offIds = (r.offense_players ?? "").split(";").filter(Boolean);
    const offPos = (r.offense_positions ?? "").split(";").filter(Boolean);
    for (let j = 0; j < offIds.length; j++) {
      const gsis = offIds[j];
      if (!gsis) continue;
      const pgt = playerGameTeam.get(gsis) ?? new Map<string, string>();
      if (game) pgt.set(game, team);
      playerGameTeam.set(gsis, pgt);
      const pos = offPos[j];
      if (pos) {
        const pp = playerPos.get(gsis) ?? new Map<string, number>();
        pp.set(pos, (pp.get(pos) ?? 0) + 1);
        playerPos.set(gsis, pp);
      }
      if (isDb) playerDb.set(gsis, (playerDb.get(gsis) ?? 0) + 1);
    }
  }

  const out = new Map<string, RouteParticipation>();
  for (const [gsis, db] of playerDb) {
    const sleeper = gsisToSleeper.get(gsis);
    if (!sleeper) continue;
    // On-field position takes precedence; fall back to crosswalk.
    const posMix = playerPos.get(gsis);
    const onFieldPos = posMix
      ? [...posMix.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;
    const pos = (onFieldPos ?? posBySleeper.get(sleeper) ?? "").toUpperCase();
    if (pos !== "WR" && pos !== "TE") continue;
    const pgt = playerGameTeam.get(gsis);
    let denom = 0;
    let lastTeam: string | null = null;
    const teamCount = new Map<string, number>();
    if (pgt) {
      for (const [game, team] of pgt) {
        denom += teamGameDb.get(`${team}|${game}`) ?? 0;
        if (team) {
          teamCount.set(team, (teamCount.get(team) ?? 0) + 1);
          lastTeam = team;
        }
      }
    }
    if (denom < minTeamDropbacks) continue;
    const primaryTeam =
      teamCount.size > 0
        ? [...teamCount.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : lastTeam;
    out.set(sleeper, {
      player_id: sleeper,
      position: pos,
      team: primaryTeam,
      route_rate: Number(Math.min(1, db / denom).toFixed(4)),
      dropbacks_on_field: db,
      team_dropbacks: denom,
    });
  }
  return out;
}

/**
 * Build all player + team signals for a season from nflverse, joined to
 * Sleeper ids. "Season" is the prior year whose usage the signals
 * describe (snap_share_prior_year etc. = this season's realized usage).
 * draft + combine are season-independent (one file each).
 */
export async function buildSeasonSignals(
  season: string,
  xwalk: Crosswalk,
): Promise<{
  players: Map<string, ComputedPlayerSignal>;
  teams: Map<string, ComputedTeamSignal>;
}> {
  const { gsisToSleeper, pfrToSleeper, posBySleeper } = xwalk;
  const rows = new Map<string, ComputedPlayerSignal>();
  const get = (sleeper: string): ComputedPlayerSignal => {
    let r = rows.get(sleeper);
    if (!r) {
      r = {
        player_id: sleeper,
        position: null,
        team: null,
        snap_share_prior_year: null,
        route_participation_prior_year: null,
        target_share_prior_year: null,
        rush_share_prior_year: null,
        rb_role_tier: null,
        draft_round: null,
        draft_pick_no: null,
        ras: null,
        weight_lb: null,
        height_in: null,
      };
      rows.set(sleeper, r);
    }
    return r;
  };

  // stats_player: target_share (direct) + rush_share (player / team carries)
  try {
    const stats = await fetchCsv(
      `${NFLVERSE}/stats_player/stats_player_reg_${season}.csv`,
    );
    const teamCarries = new Map<string, number>();
    for (const r of stats) {
      const c = num(r.carries);
      if (c && r.recent_team)
        teamCarries.set(
          r.recent_team,
          (teamCarries.get(r.recent_team) ?? 0) + c,
        );
    }
    for (const r of stats) {
      const pos = (r.position ?? "").toUpperCase();
      if (!SKILL.has(pos)) continue;
      const sleeper = gsisToSleeper.get(r.player_id ?? "");
      if (!sleeper) continue;
      const row = get(sleeper);
      row.position = pos;
      row.team = r.recent_team || row.team;
      row.target_share_prior_year = num(r.target_share);
      const c = num(r.carries);
      const tc = teamCarries.get(r.recent_team ?? "");
      row.rush_share_prior_year =
        c != null && tc && tc > 0 ? Number((c / tc).toFixed(4)) : null;
    }
  } catch {
    // season file may not exist yet; signals degrade to null.
  }

  // snap_counts: mean offense_pct -> snap_share; OL continuity per team.
  const olByTeamWeek = new Map<string, Map<number, Set<string>>>();
  try {
    const snaps = await fetchCsv(
      `${NFLVERSE}/snap_counts/snap_counts_${season}.csv`,
    );
    const acc = new Map<string, { sum: number; n: number }>();
    for (const r of snaps) {
      const pos = (r.position ?? "").toUpperCase();
      const team = r.team ?? "";
      const week = num(r.week);
      const offPct = num(r.offense_pct);
      if (
        OL_POS.has(pos) &&
        team &&
        week != null &&
        offPct != null &&
        offPct >= 0.5
      ) {
        const byWeek = olByTeamWeek.get(team) ?? new Map<number, Set<string>>();
        const set = byWeek.get(week) ?? new Set<string>();
        set.add(r.pfr_player_id ?? r.player ?? "");
        byWeek.set(week, set);
        olByTeamWeek.set(team, byWeek);
      }
      if (!SKILL.has(pos)) continue;
      const sleeper = pfrToSleeper.get(r.pfr_player_id ?? "");
      if (!sleeper || offPct == null) continue;
      const a = acc.get(sleeper) ?? { sum: 0, n: 0 };
      a.sum += offPct;
      a.n += 1;
      acc.set(sleeper, a);
    }
    for (const [sleeper, a] of acc) {
      if (a.n === 0) continue;
      get(sleeper).snap_share_prior_year = Number((a.sum / a.n).toFixed(4));
    }
  } catch {
    /* degrade */
  }

  const teams = new Map<string, ComputedTeamSignal>();
  for (const [team, byWeek] of olByTeamWeek) {
    const weeks = [...byWeek.keys()].sort((a, b) => a - b);
    if (weeks.length < 2) continue;
    let sum = 0;
    let pairs = 0;
    for (let i = 1; i < weeks.length; i++) {
      const prev = byWeek.get(weeks[i - 1])!;
      const cur = byWeek.get(weeks[i])!;
      let overlap = 0;
      for (const id of cur) if (prev.has(id)) overlap++;
      sum += Math.min(overlap, 5) / 5;
      pairs++;
    }
    teams.set(team, {
      team,
      ol_continuity_score: pairs > 0 ? Number((sum / pairs).toFixed(4)) : null,
    });
  }

  // route participation (WR / TE) from pbp_participation, same season.
  try {
    const routes = await buildRouteParticipation(season, xwalk);
    for (const [sleeper, rp] of routes) {
      const row = get(sleeper);
      row.route_participation_prior_year = rp.route_rate;
      row.position = row.position ?? rp.position;
      row.team = row.team ?? rp.team;
    }
  } catch {
    /* degrade */
  }

  // draft_picks (all years).
  try {
    const draft = await fetchCsv(`${NFLVERSE}/draft_picks/draft_picks.csv`);
    for (const r of draft) {
      const sleeper =
        gsisToSleeper.get(r.gsis_id ?? "") ??
        pfrToSleeper.get(r.pfr_player_id ?? "");
      if (!sleeper) continue;
      const round = num(r.round);
      const pick = num(r.pick);
      if (round == null && pick == null) continue;
      const row = get(sleeper);
      row.draft_round = round != null ? Math.round(round) : row.draft_round;
      row.draft_pick_no = pick != null ? Math.round(pick) : row.draft_pick_no;
    }
  } catch {
    /* degrade */
  }

  // combine (all years): ht/wt + position-relative athletic composite.
  try {
    const combine = await fetchCsv(`${NFLVERSE}/combine/combine.csv`);
    const norm = (p: string) => {
      const u = (p ?? "").toUpperCase();
      if (u === "FB") return "RB";
      return u;
    };
    const metrics = ["forty", "vertical", "broad_jump", "cone", "shuttle", "bench"];
    const lowerBetter = new Set(["forty", "cone", "shuttle"]);
    const pools = new Map<string, Record<string, number[]>>();
    for (const r of combine) {
      const pos = norm(r.pos ?? "");
      const pool = pools.get(pos) ?? {};
      for (const m of metrics) {
        const v = num(r[m]);
        if (v != null) (pool[m] = pool[m] ?? []).push(v);
      }
      pools.set(pos, pool);
    }
    for (const r of combine) {
      const sleeper = pfrToSleeper.get(r.pfr_id ?? "");
      if (!sleeper) continue;
      const pos = norm(r.pos ?? "");
      const pool = pools.get(pos) ?? {};
      const ps: number[] = [];
      for (const m of metrics) {
        const v = num(r[m]);
        if (v != null && pool[m]?.length)
          ps.push(pctRank(pool[m], v, lowerBetter.has(m)));
      }
      const row = get(sleeper);
      row.height_in = htToInches(r.ht) ?? row.height_in;
      const w = num(r.wt);
      row.weight_lb = w != null ? Math.round(w) : row.weight_lb;
      row.ras =
        ps.length > 0
          ? Number(((ps.reduce((s, x) => s + x, 0) / ps.length) * 100).toFixed(1))
          : row.ras;
    }
  } catch {
    /* degrade */
  }

  // Derive rb_role_tier for RBs (the bridge to the RB rubric). Fall back
  // to the crosswalk position when stats did not set one.
  for (const row of rows.values()) {
    const pos = (row.position ?? posBySleeper.get(row.player_id) ?? "").toUpperCase();
    row.position = pos || row.position;
    if (pos === "RB") {
      row.rb_role_tier = deriveRbRoleTier(
        row.snap_share_prior_year,
        row.rush_share_prior_year,
        row.target_share_prior_year,
      );
    }
  }

  return { players: rows, teams };
}
