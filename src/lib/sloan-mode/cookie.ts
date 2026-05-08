/**
 * Sloan-mode cookie. Server-readable.
 *
 * Sloan mode is a single toggle that flips the entire UI register
 * from Voice A (default brand) to Voice B (model-transparent
 * register). Same data; different reader posture. Confidence
 * intervals, signal scorecards, model provenance, and dial values
 * become visible inline. The toggle does not change the visual
 * shape of any surface; the user's muscle memory survives.
 *
 * Cookie-mirrored so server-rendered surfaces can switch register
 * without a client round-trip. Pattern matches the WindowsBar /
 * judgment-profile cookie mirror.
 */

import { cookies } from "next/headers";

export const SLOAN_COOKIE_NAME = "dg_sloan";
const SLOAN_MAX_AGE_S = 60 * 60 * 24 * 365; // 1 year

export type SloanMode = "off" | "on";

const VALID: ReadonlySet<SloanMode> = new Set(["off", "on"]);

function isSloanMode(s: string): s is SloanMode {
  return VALID.has(s as SloanMode);
}

/**
 * Read sloan mode from cookies. Defaults to "off" (polished casual
 * voice). Server components only.
 */
export async function readSloanMode(): Promise<SloanMode> {
  try {
    const store = await cookies();
    const raw = store.get(SLOAN_COOKIE_NAME)?.value;
    if (raw && isSloanMode(raw)) return raw;
  } catch {
    // cookies() throws outside a request context; default to off.
  }
  return "off";
}

/**
 * Build the Set-Cookie header value for sloan mode. Used by the API
 * route that toggles the cookie.
 */
export function buildSloanCookie(mode: SloanMode): {
  name: string;
  value: SloanMode;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
  };
} {
  return {
    name: SLOAN_COOKIE_NAME,
    value: mode,
    options: {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SLOAN_MAX_AGE_S,
    },
  };
}
