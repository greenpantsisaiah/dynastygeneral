/**
 * Admin gate. Server-only.
 *
 * "Admin" today means a hardcoded allow-list set via the ADMIN_EMAILS
 * env var (comma-separated). Used by ops endpoints like the
 * NFL-Draft-window players-cache refresh that the founder needs to
 * trigger but no end-user should ever hit.
 *
 * Not a role/permission system. When we have more than one operator,
 * promote this to a row in the profiles table.
 */

import { getOptionalUser, type AuthUser } from "@/lib/auth/session";

function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * True if the given email is on the admin allow-list. Empty list means
 * no one is admin (refuse-by-default).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.toLowerCase());
}

/**
 * Returns the authenticated user when they're on the admin allow-list,
 * otherwise null. Use as the gate for ops endpoints. Caller should
 * return 401 / 403 on null.
 */
export async function getAdminUser(): Promise<AuthUser | null> {
  const user = await getOptionalUser();
  if (!user) return null;
  if (!isAdminEmail(user.email)) return null;
  return user;
}
