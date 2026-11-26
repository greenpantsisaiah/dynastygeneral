/**
 * Capture a real-league snapshot for offline rendering and design QA.
 *
 * Cloud agent sessions cannot reach Sleeper (proxy 403), so user-facing
 * renders (emails, hub cards, Coach copy) read a committed snapshot of
 * real leagues instead of live calls. Run this on a machine that CAN
 * reach Sleeper (Isaiah's Mac), weekly before the Monday brief:
 *
 *   npx tsx scripts/capture-real-leagues.ts <sleeper_username> [more usernames]
 *
 * Writes evals/fixtures/real-leagues/<username>.json. Renders against a
 * snapshot older than 8 days do not count (docs/team/QUALITY_BAR.md);
 * loadRealLeagueSnapshot() in evals/fixtures/real-leagues/load.ts
 * enforces that.
 *
 * Contents per league: league settings, rosters, users (public Sleeper
 * profile fields only), every regular-season matchup week (played AND
 * scheduled: the season simulator needs the remaining schedule),
 * traded picks, drafts + picks; plus nfl_state, the trimmed Sleeper
 * player records for every rostered or drafted player, and FantasyCalc
 * values for each distinct format. Privacy: no emails, tokens, or postal
 * addresses (Sleeper's public API returns none); league and manager names
 * are fine (they already show in the product).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SLEEPER = "https://api.sleeper.app/v1";
const FANTASYCALC = "https://api.fantasycalc.com/values/current";
const OUT_DIR = join(process.cwd(), "evals/fixtures/real-leagues");
const SNAPSHOT_SCHEMA_VERSION = 1; // keep in sync with evals/fixtures/real-leagues/load.ts

async function get<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "dynastygeneral-snapshot" } });
    if (res.ok) return (await res.json()) as T;
    if (attempt >= 3) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
}

type Json = Record<string, unknown>;

/** Only the public, display-relevant fields of a Sleeper league user. */
function publicUser(u: Json): Json {
  const md = (u.metadata ?? {}) as Json;
  return {
    user_id: u.user_id,
    display_name: u.display_name,
    avatar: u.avatar ?? null,
    is_owner: u.is_owner ?? null,
    metadata: { team_name: md.team_name ?? null },
  };
}

const PLAYER_FIELDS = [
  "player_id", "full_name", "first_name", "last_name", "position", "fantasy_positions", "team", "age",
  "years_exp", "status", "injury_status", "search_rank", "depth_chart_order", "birth_date",
  "adp_dynasty_1qb", "adp_dynasty_2qb", "adp_dynasty_superflex", "adp_dynasty_te_premium", "adp_rookie",
];

async function captureUser(username: string, nflState: Json, players: Record<string, Json>) {
  const user = await get<Json | null>(`${SLEEPER}/user/${encodeURIComponent(username)}`);
  if (!user) throw new Error(`Sleeper user not found: ${username}`);
  const season = String(nflState.season);
  const leagues = await get<Json[]>(`${SLEEPER}/user/${user.user_id}/leagues/nfl/${season}`);

  const playerIds = new Set<string>();
  const formats = new Map<string, { numQbs: number; ppr: number; numTeams: number }>();
  const out: Json[] = [];
  for (const league of leagues) {
    const id = String(league.league_id);
    const [rosters, users, tradedPicks, drafts] = await Promise.all([
      get<Json[]>(`${SLEEPER}/league/${id}/rosters`),
      get<Json[]>(`${SLEEPER}/league/${id}/users`),
      get<Json[]>(`${SLEEPER}/league/${id}/traded_picks`),
      get<Json[]>(`${SLEEPER}/league/${id}/drafts`),
    ]);
    const matchups: Record<number, Json[]> = {};
    // Every week of the season, not just weeks so far: the remaining
    // schedule drives the playoff odds (2026-11-26: a capture that stopped
    // at the current week made the simulator think one game was left).
    const lastWeek = Math.max(18, Number((league.settings as Record<string, unknown> | undefined)?.playoff_week_start ?? 0) - 1);
    for (let w = 1; w <= lastWeek; w++) {
      matchups[w] = await get<Json[]>(`${SLEEPER}/league/${id}/matchups/${w}`);
    }
    const draftPicks: Record<string, Json[]> = {};
    for (const d of drafts) draftPicks[String(d.draft_id)] = await get<Json[]>(`${SLEEPER}/draft/${d.draft_id}/picks`);

    for (const r of rosters) for (const p of [...((r.players as string[]) ?? []), ...((r.taxi as string[]) ?? []), ...((r.reserve as string[]) ?? [])]) playerIds.add(p);
    for (const picks of Object.values(draftPicks)) for (const p of picks) if (p.player_id) playerIds.add(String(p.player_id));

    const positions = (league.roster_positions as string[]) ?? [];
    const numQbs = positions.some((p) => p === "SUPER_FLEX") || positions.filter((p) => p === "QB").length >= 2 ? 2 : 1;
    const scoring = (league.scoring_settings ?? {}) as Json;
    const ppr = typeof scoring.rec === "number" ? scoring.rec : 1;
    // The app always prices with numTeams=12 (src/lib/players/values.ts); mirror it.
    formats.set(`${numQbs}:${ppr}`, { numQbs, ppr, numTeams: 12 });

    out.push({ league, rosters, users: users.map(publicUser), traded_picks: tradedPicks, drafts, draft_picks: draftPicks, matchups });
    console.log(`  ${league.name}: ${rosters.length} rosters, weeks 1-${Object.keys(matchups).length}`);
  }

  const fantasycalc: Record<string, unknown> = {};
  for (const [key, f] of formats) {
    fantasycalc[key] = await get(`${FANTASYCALC}?isDynasty=true&numQbs=${f.numQbs}&numTeams=${f.numTeams}&ppr=${f.ppr}`);
  }

  const trimmed: Record<string, Json> = {};
  for (const id of playerIds) {
    const p = players[id];
    if (!p) continue;
    trimmed[id] = Object.fromEntries(PLAYER_FIELDS.filter((k) => k in p).map((k) => [k, p[k]]));
  }

  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    captured_at: new Date().toISOString(),
    nfl_state: nflState,
    user: { user_id: user.user_id, username: user.username, display_name: user.display_name },
    leagues: out,
    players: trimmed,
    fantasycalc,
  };
}

async function main() {
  const usernames = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (usernames.length === 0) {
    console.error("Usage: npx tsx scripts/capture-real-leagues.ts <sleeper_username> [more]");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const nflState = await get<Json>(`${SLEEPER}/state/nfl`);
  console.log(`NFL ${nflState.season} week ${nflState.week} (display ${nflState.display_week})`);
  console.log("Fetching the Sleeper players blob (about 5 MB)...");
  const players = await get<Record<string, Json>>(`${SLEEPER}/players/nfl`);
  for (const u of usernames) {
    console.log(`Capturing ${u}`);
    const snap = await captureUser(u, nflState, players);
    const file = join(OUT_DIR, `${u.toLowerCase()}.json`);
    writeFileSync(file, JSON.stringify(snap) + "\n");
    console.log(`Wrote ${file} (${snap.leagues.length} leagues, ${Object.keys(snap.players).length} players)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
