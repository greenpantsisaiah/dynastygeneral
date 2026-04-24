/**
 * NFL Draft window awareness. When active:
 *   - Coach prompt receives a "NFL Draft is live" context line so it
 *     handles the in-flight rookie state (some rookies have teams,
 *     others don't) intelligently rather than assuming a static
 *     pre-draft world.
 *   - League hub ticker surfaces a "live" indicator nudging users to
 *     use the Refresh button between rounds.
 *   - Cache TTLs may be tightened further in future iterations
 *     (currently 60min default; safe enough with the user-facing
 *     refresh button).
 *
 * Set via env vars (UTC, inclusive):
 *   NFL_DRAFT_WINDOW_START=2026-04-23
 *   NFL_DRAFT_WINDOW_END=2026-04-26
 *
 * Both must be set for the window to count as active. Unset = window
 * is closed (default behavior off-season).
 */

export function isNflDraftWindowActive(now: Date = new Date()): boolean {
  const start = process.env.NFL_DRAFT_WINDOW_START;
  const end = process.env.NFL_DRAFT_WINDOW_END;
  if (!start || !end) return false;

  const startMs = Date.parse(`${start}T00:00:00Z`);
  // End is INCLUSIVE: the user is allowed to refresh through the end
  // of that day in UTC. Convert to end-of-day for the upper bound.
  const endMs = Date.parse(`${end}T23:59:59Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  const t = now.getTime();
  return t >= startMs && t <= endMs;
}

/**
 * Human-readable label for the active window. Returns null when
 * inactive. Used by UI surfaces that want to render the dates.
 */
export function nflDraftWindowLabel(): string | null {
  if (!isNflDraftWindowActive()) return null;
  const start = process.env.NFL_DRAFT_WINDOW_START;
  const end = process.env.NFL_DRAFT_WINDOW_END;
  if (!start || !end) return null;
  return `${start} → ${end}`;
}
