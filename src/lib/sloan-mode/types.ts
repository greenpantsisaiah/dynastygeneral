/**
 * Shared types + constants for Sloan-mode. Lives in a server-and-
 * client-safe module so client components can read the cookie name
 * without pulling in next/headers (which is server-only and breaks
 * the client bundle build).
 */

export const SLOAN_COOKIE_NAME = "dg_sloan";
export const SLOAN_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 year

export type SloanMode = "off" | "on";

const VALID: ReadonlySet<SloanMode> = new Set(["off", "on"]);

export function isSloanMode(s: string): s is SloanMode {
  return VALID.has(s as SloanMode);
}
