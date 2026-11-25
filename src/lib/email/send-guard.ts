/**
 * Broadcast guard for bulk email (weekly brief first). A bulk send is red
 * tier in the team charter, and the 2026-11-25 first send went out on a
 * stale template from an older deployment. This guard makes that class
 * impossible: nothing reaches users unless the deployed template version
 * is the one Isaiah approved, and every new version goes to the admin
 * preview list first.
 *
 * Pure: the cron passes env + request params in and acts on the result.
 */

export type SendMode =
  | { mode: "broadcast" }
  | { mode: "preview"; to: string[]; reason: string }
  | { mode: "refuse"; reason: string };

export interface SendGuardInput {
  /** The template version compiled into this deployment. */
  templateVersion: string;
  /** EMAIL_BRIEF_APPROVED_VERSION: the version Isaiah approved for users. */
  approvedVersion: string | undefined;
  /** EMAIL_PREVIEW_TO (comma list); falls back to EMAIL_REPLY_TO (Isaiah's inbox). */
  previewTo: string | undefined;
  replyTo: string | undefined;
  /** `?mode=preview` forces preview even when the version is approved. */
  requestedMode: string | null;
}

export function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function resolveSendMode(input: SendGuardInput): SendMode {
  const to = parseEmailList(input.previewTo);
  const previewList = to.length > 0 ? to : parseEmailList(input.replyTo);
  const preview = (reason: string): SendMode =>
    previewList.length > 0
      ? { mode: "preview", to: previewList, reason }
      : { mode: "refuse", reason: `${reason}; no preview address (set EMAIL_PREVIEW_TO)` };

  if (input.requestedMode === "preview") return preview("preview_requested");
  const approved = input.approvedVersion?.trim();
  if (!approved) return preview("no_approved_version");
  if (approved !== input.templateVersion) {
    return preview(`approved_version_mismatch (approved ${approved}, deployed ${input.templateVersion})`);
  }
  return { mode: "broadcast" };
}
