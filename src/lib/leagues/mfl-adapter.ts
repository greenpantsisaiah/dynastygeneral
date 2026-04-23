/**
 * MyFantasyLeague (MFL) PlatformAdapter. STUB.
 *
 * Returns PlatformNotReadyError for every call. Exists so the registry
 * can resolve "mfl" without throwing on import, and so the UI can
 * cleanly render "MFL coming soon" affordances.
 *
 * Implementation plan in docs/MULTI_PLATFORM.md. Real adapter will:
 * 1. Call api.myfantasyleague.com/{year}/export?TYPE=league&L={id}&JSON=1
 *    for league + roster + draft data.
 * 2. Build a draft-state shape (different from Sleeper's; MFL is
 *    salary-cap / linear / auction in addition to snake).
 * 3. Map to LeagueSnapshot via the same buildLeagueSnapshot pathway.
 * 4. Pass platform-specific bits via a discriminated input shape OR
 *    add a per-platform branch inside buildLeagueSnapshot.
 */

import { PlatformNotReadyError, type PlatformAdapter } from "./adapter";

export const mflAdapter: PlatformAdapter = {
  platform: "mfl",

  async findUser() {
    throw new PlatformNotReadyError("mfl");
  },

  async listLeagues() {
    throw new PlatformNotReadyError("mfl");
  },

  async buildSnapshot() {
    throw new PlatformNotReadyError("mfl");
  },
};
