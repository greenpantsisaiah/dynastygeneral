import { redirect } from "next/navigation";

/**
 * /soundboard merged into /rankings on 2026-05-14 per founder
 * direction: "after merging rankings/soundboard into a singular
 * architecture." The unified Rankings Lab now hosts all 8 dials, the
 * doctrine readout, presets, and per-dial methodology drawers in one
 * place. State persists for signed-in users via the existing
 * /api/soundboard/profile route; anonymous users get localStorage.
 *
 * This file kept as a permanent redirect so any bookmarks or
 * external links (Coach paywall references, etc.) survive.
 */

export const dynamic = "force-dynamic";

export default function SoundboardRedirect() {
  redirect("/rankings");
}
