/**
 * Sloan-mode cookie. Server-readable.
 *
 * Sloan mode is a single toggle that flips the entire UI register
 * from Voice A (default brand) to Voice B (model-transparent
 * register). Same data; different reader posture.
 *
 * Cookie-mirrored so server-rendered surfaces can switch register
 * without a client round-trip.
 *
 * Server-only: imports next/headers. The shared cookie name +
 * SloanMode type live in `./types.ts` so client components (the
 * useSloanMode hook) can import them without pulling next/headers
 * into the browser bundle.
 */

import { cookies } from "next/headers";
import {
  SLOAN_COOKIE_NAME,
  SLOAN_MAX_AGE_S,
  type SloanMode,
  isSloanMode,
} from "./types";

export type { SloanMode };
export { SLOAN_COOKIE_NAME };

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
