/**
 * Platform-agnostic league types. The `LeagueSnapshot` defined in
 * `strategy/league-state/snapshot` is the consumer-facing unified type;
 * everything downstream of it (windows, contender outlook, decision
 * synthesis, coach context) reads only that.
 *
 * The types in THIS file are the smaller surface area the platform
 * adapter exposes BEFORE the snapshot is built: user lookup, league
 * listing, and the building blocks adapters return so the snapshot
 * builder doesn't have to know which platform produced them.
 *
 * Adding a new platform = implement the PlatformAdapter interface in
 * `./adapter.ts` and register it in `./registry.ts`. No consumer
 * changes required.
 */

export type PlatformId = "sleeper" | "mfl";

export type PlatformLabel = {
  id: PlatformId;
  name: string; // "Sleeper", "MyFantasyLeague"
  status: "live" | "coming_soon" | "beta";
  // What we ask the user for to identify themselves on this platform.
  // Sleeper = username. MFL = league_id + year + (optional) franchise_id.
  handle_label: string;
  handle_placeholder: string;
};

export const PLATFORMS: PlatformLabel[] = [
  {
    id: "sleeper",
    name: "Sleeper",
    status: "live",
    handle_label: "Sleeper username",
    handle_placeholder: "e.g. sleeperuser",
  },
  {
    id: "mfl",
    name: "MyFantasyLeague",
    status: "coming_soon",
    handle_label: "MFL league ID",
    handle_placeholder: "e.g. 12345",
  },
];

export function getPlatform(id: PlatformId): PlatformLabel {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown platform: ${id}`);
  return p;
}

/**
 * Platform-agnostic representation of a user. Different platforms key
 * users differently (Sleeper: numeric user_id; MFL: per-league
 * franchise_id). The adapter normalizes to this.
 */
export type UnifiedUser = {
  platform: PlatformId;
  // Stable id within the platform. Format is platform-specific but
  // opaque to consumers.
  platform_user_id: string;
  // What the user types (Sleeper username, MFL franchise name, etc).
  handle: string;
  // Display name to show in UI.
  display_name: string | null;
};

/**
 * Platform-agnostic league summary, used in the league list before
 * the user opens one. Snapshot building happens later.
 */
export type UnifiedLeagueSummary = {
  platform: PlatformId;
  platform_league_id: string;
  season: string;
  name: string;
  total_rosters: number;
  status: string | null;
  format: "1qb" | "2qb" | "superflex";
  // True if this is a dynasty league (not redraft / keeper).
  is_dynasty: boolean;
  // Per-platform extras for the link target (e.g. MFL needs season +
  // league_id; Sleeper just needs league_id).
  link_params: Record<string, string>;
};
