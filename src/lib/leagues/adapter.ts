/**
 * Platform adapter interface. One implementation per fantasy host.
 *
 * The adapter's job is to bridge platform-specific APIs to the
 * platform-agnostic types our engine consumes. Adapters do NOT make
 * strategy decisions; they just produce normalized data.
 *
 * Current implementations:
 * - SleeperAdapter (live): wraps lib/sleeper/* fetchers.
 * - MflAdapter (coming soon): stub that returns NotImplemented errors
 *   so the UI can show "MFL is on the roadmap" cleanly.
 *
 * To add a third platform: implement this interface, register in
 * `./registry.ts`. No consumer changes required.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";
import type {
  PlatformId,
  UnifiedLeagueSummary,
  UnifiedUser,
} from "./types";

export class PlatformNotReadyError extends Error {
  constructor(platform: PlatformId, message?: string) {
    super(message ?? `${platform} adapter is not yet implemented.`);
    this.name = "PlatformNotReadyError";
  }
}

export interface PlatformAdapter {
  readonly platform: PlatformId;

  /**
   * Resolve a user-supplied handle to a platform user. Returns null on
   * not-found (the caller should display "no account matches" UX).
   * Throws on infrastructure error (network, schema validation).
   */
  findUser(handle: string): Promise<UnifiedUser | null>;

  /**
   * List the user's leagues for a season. Filters to dynasty by
   * default; the consumer can choose to also surface keeper/redraft
   * via the returned `is_dynasty` flag.
   */
  listLeagues(args: {
    user: UnifiedUser;
    season: string;
  }): Promise<UnifiedLeagueSummary[]>;

  /**
   * Build the full LeagueSnapshot for a single league. This is the
   * load-bearing call: every downstream surface (windows, contender
   * outlook, decision card, coach context) reads from the snapshot
   * and never touches platform-specific schemas.
   */
  buildSnapshot(args: {
    leagueId: string;
    user: UnifiedUser | null;
    season?: string;
  }): Promise<LeagueSnapshot>;
}
