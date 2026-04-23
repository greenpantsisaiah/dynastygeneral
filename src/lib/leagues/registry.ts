/**
 * Adapter registry. Resolves a PlatformId to its PlatformAdapter.
 * Single source of truth for "which platforms exist" at runtime.
 *
 * Used by route handlers + server components that accept a platform
 * query param. Default platform is Sleeper (current production
 * behavior); explicit fallthrough.
 */

import type { PlatformAdapter } from "./adapter";
import { sleeperAdapter } from "./sleeper-adapter";
import { mflAdapter } from "./mfl-adapter";
import type { PlatformId } from "./types";

const ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  sleeper: sleeperAdapter,
  mfl: mflAdapter,
};

export function getAdapter(platform: PlatformId): PlatformAdapter {
  return ADAPTERS[platform];
}

/**
 * Parse a `platform` query param. Defaults to "sleeper" so existing
 * URLs keep working. Returns null on unknown value (caller can 400).
 */
export function parsePlatformParam(
  raw: string | null | undefined,
): PlatformId | null {
  if (!raw) return "sleeper";
  if (raw === "sleeper" || raw === "mfl") return raw;
  return null;
}
