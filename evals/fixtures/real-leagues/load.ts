/**
 * Loader for the committed real-league snapshot (docs/team/QUALITY_BAR.md,
 * "The real-league snapshot"). Written by scripts/capture-real-leagues.ts
 * on a machine that can reach Sleeper. Renders against a snapshot older
 * than MAX_AGE_DAYS do not count, so the loader refuses a stale file
 * unless the caller explicitly allows it (and says so in its output).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SNAPSHOT_SCHEMA_VERSION = 1;
export const MAX_AGE_DAYS = 8;
const DIR = join(__dirname);

export interface RealLeagueEntry {
  league: Record<string, unknown> & { league_id: string; name: string; settings?: Record<string, unknown> };
  rosters: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  traded_picks: Array<Record<string, unknown>>;
  drafts: Array<Record<string, unknown>>;
  draft_picks: Record<string, Array<Record<string, unknown>>>;
  matchups: Record<string, Array<Record<string, unknown>>>;
}

export interface RealLeagueSnapshot {
  schema_version: number;
  captured_at: string;
  nfl_state: Record<string, unknown>;
  user: { user_id: string; username: string; display_name: string };
  leagues: RealLeagueEntry[];
  players: Record<string, Record<string, unknown>>;
  fantasycalc: Record<string, unknown>;
}

export function snapshotAgeDays(capturedAt: string, now = Date.now()): number {
  return (now - Date.parse(capturedAt)) / 86_400_000;
}

export function isStale(capturedAt: string, now = Date.now()): boolean {
  const age = snapshotAgeDays(capturedAt, now);
  return !Number.isFinite(age) || age > MAX_AGE_DAYS;
}

export function listRealLeagueSnapshots(): string[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}

export function loadRealLeagueSnapshot(username: string, opts: { allowStale?: boolean } = {}): RealLeagueSnapshot {
  const file = join(DIR, `${username.toLowerCase()}.json`);
  if (!existsSync(file)) {
    throw new Error(`No real-league snapshot for ${username}. Run scripts/capture-real-leagues.ts on a machine that can reach Sleeper.`);
  }
  const snap = JSON.parse(readFileSync(file, "utf8")) as RealLeagueSnapshot;
  if (snap.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`Snapshot ${username} is schema ${snap.schema_version}, loader expects ${SNAPSHOT_SCHEMA_VERSION}. Re-capture it.`);
  }
  if (isStale(snap.captured_at) && !opts.allowStale) {
    throw new Error(
      `Snapshot ${username} was captured ${snapshotAgeDays(snap.captured_at).toFixed(1)} days ago (limit ${MAX_AGE_DAYS}). Re-capture it before rendering.`,
    );
  }
  return snap;
}
