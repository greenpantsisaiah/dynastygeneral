/**
 * Delete a shared verdict by short_code. Auth required; RLS
 * additionally enforces that the row's user_id matches auth.uid()
 * so a logged-in user can't delete someone else's share.
 *
 * Public-page reads still work via the canonical fetchSharedVerdict
 * (RLS allows anonymous select). This route is delete-only.
 */

import { getOptionalUser } from "@/lib/auth/session";
import {
  deleteSharedVerdict,
  isValidShortCode,
} from "@/lib/share/trade-verdict-share";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isValidShortCode(code)) {
    return Response.json({ ok: false, error: "Invalid code." }, { status: 400 });
  }

  const user = await getOptionalUser();
  if (!user) {
    return Response.json(
      { ok: false, error: "Sign in to delete shares." },
      { status: 401 },
    );
  }

  const deleted = await deleteSharedVerdict(code);
  if (!deleted) {
    // Either the row doesn't exist OR doesn't belong to this user.
    // Don't disambiguate; both should look like "not found" so we
    // don't leak the existence of other users' shares.
    return Response.json(
      { ok: false, error: "Share not found." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
