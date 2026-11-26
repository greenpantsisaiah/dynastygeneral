/**
 * The From header for user-facing email. Inboxes show the display name,
 * so a bare address reads as "brief" (Isaiah, 2026-11-26: "brief seems
 * like a lacking this is trustworthy email thing"). Any bare address,
 * from EMAIL_FROM or the default, gets the brand name in front; an
 * EMAIL_FROM that already carries a display name is kept as is.
 */

export const SENDER_NAME = "Dynasty General";
export const DEFAULT_BRIEF_ADDRESS = "brief@dynastygeneral.app";

export function briefFrom(envFrom: string | undefined = process.env.EMAIL_FROM): string {
  const raw = (envFrom ?? "").trim() || DEFAULT_BRIEF_ADDRESS;
  if (raw.includes("<")) return raw;
  return `${SENDER_NAME} <${raw}>`;
}
