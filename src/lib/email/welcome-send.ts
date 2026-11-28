/**
 * Builds and sends the welcome brief (welcome-brief.ts) for one account,
 * right after a homepage signup.
 *
 * Gates, all required or nothing is sent:
 * - RESEND_API_KEY, the mailing address, EMAIL_REPLY_TO and an unsubscribe
 *   secret are configured,
 * - the send guard: users get the email only when EMAIL_WELCOME_APPROVED_VERSION
 *   equals WELCOME_BRIEF_TEMPLATE_VERSION. Until Isaiah approves a version the
 *   welcome is HELD (logged, nothing sent); previews go to the admin list
 *   through /api/admin/welcome-preview?send=1, never to the signup,
 * - the account has not opted out and was never sent a welcome,
 * - the content lint is clean.
 *
 * Never throws: a signup must never fail because its welcome could not go.
 * Every failure path logs a `[welcome-brief:*]` tag, so it becomes an incident.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { getNflState } from "@/lib/sleeper";
import { briefOwnerName, buildBriefLeagues } from "@/lib/email/build-brief";
import { buildTradeDeskModel, type BriefTier } from "@/lib/email/trade-desk/model";
import { buildDecisionItems, type DecisionItem } from "@/lib/decisions/items";
import { WELCOME_BRIEF_TEMPLATE_VERSION, composeWelcomeBrief, type ComposedWelcome } from "@/lib/email/welcome-brief";
import { briefRenderTier } from "@/lib/email/weekly-brief";
import { resolveSendMode } from "@/lib/email/send-guard";
import { resolveMailingAddress } from "@/lib/email/mailing-address";
import { briefFrom } from "@/lib/email/sender";
import { OPT_OUT, WEEKLY_BRIEF_LIST, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { flagOn } from "@/lib/flags/server";
import { effectiveTier } from "@/lib/auth/session";

/** notifications.kind for a sent welcome (one per account, ever). */
export const WELCOME_KIND = "welcome_brief";

/** The welcome for one Sleeper username, from the same builders /home uses. */
export async function buildWelcomeBrief(args: {
  username: string;
  displayName?: string | null;
  tier: BriefTier;
  appUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string;
  logTag: string;
  now?: Date;
  preview?: boolean;
  /** Render-only hook (the --no-trade sample render); production never sets it. */
  filterItems?: (items: DecisionItem[]) => DecisionItem[];
}): Promise<ComposedWelcome | { error: "nfl_state_unavailable" }> {
  const nfl = await getNflState();
  if (!nfl || !nfl.week) return { error: "nfl_state_unavailable" };
  const now = args.now ?? new Date();
  const { leagues, resultsWeek } = await buildBriefLeagues({
    username: args.username,
    season: nfl.season,
    nflWeek: nfl.week,
    seasonType: nfl.season_type,
    logTag: args.logTag,
    now,
    withCharacter: true,
  });
  const ownerName = briefOwnerName(args.displayName, args.username);
  const model = buildTradeDeskModel({
    ownerName,
    sleeperUsername: args.username,
    tier: args.tier,
    resultsWeek,
    leagues,
    seasonStartDate: nfl.season_start_date,
    now,
  });
  const { items } = buildDecisionItems({ model, season: nfl.season });
  return composeWelcomeBrief({
    ownerName,
    leagues,
    items: args.filterItems ? args.filterItems(items) : items,
    appUrl: args.appUrl,
    unsubscribeUrl: args.unsubscribeUrl,
    mailingAddress: args.mailingAddress,
    preview: args.preview,
  });
}

export type WelcomeOutcome =
  | "sent"
  | "held_unapproved"
  | "unconfigured"
  | "already_sent"
  | "opted_out"
  | "no_account"
  | "no_leagues"
  | "lint_blocked"
  | "failed";

export async function sendWelcomeBriefIfDue(userId: string): Promise<WelcomeOutcome> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const mailingAddress = resolveMailingAddress()?.value;
    const replyTo = process.env.EMAIL_REPLY_TO?.trim();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dynastygeneral.app";
    const unsub = unsubscribeUrl(appUrl, userId);
    if (!apiKey || !mailingAddress || !replyTo || !unsub) {
      console.error("[welcome-brief:config]", JSON.stringify({ RESEND_API_KEY: !apiKey, mailing: !mailingAddress, EMAIL_REPLY_TO: !replyTo, unsubscribe: !unsub }));
      return "unconfigured";
    }
    const guard = resolveSendMode({
      templateVersion: WELCOME_BRIEF_TEMPLATE_VERSION,
      approvedVersion: process.env.EMAIL_WELCOME_APPROVED_VERSION,
      previewTo: process.env.EMAIL_PREVIEW_TO,
      replyTo,
      requestedMode: null,
    });
    if (guard.mode !== "broadcast") {
      // Expected until Isaiah approves a version: not an incident.
      console.info("[welcome-brief:held]", userId, guard.reason, WELCOME_BRIEF_TEMPLATE_VERSION);
      return "held_unapproved";
    }

    const admin = getAdminClient();
    const [{ data: profile }, { data: marks }, { data: sub }] = await Promise.all([
      admin.from("profiles").select("sleeper_username, display_name").eq("id", userId).maybeSingle(),
      admin
        .from("notifications")
        .select("kind, status")
        .eq("user_id", userId)
        .eq("league_id", OPT_OUT.league_id)
        .in("kind", [OPT_OUT.kind(WEEKLY_BRIEF_LIST), WELCOME_KIND]),
      admin.from("subscriptions").select("tier, status").eq("user_id", userId).maybeSingle(),
    ]);
    if ((marks ?? []).some((m) => m.kind === OPT_OUT.kind(WEEKLY_BRIEF_LIST))) return "opted_out";
    if ((marks ?? []).some((m) => m.kind === WELCOME_KIND && m.status === "sent")) return "already_sent";
    const username = (profile?.sleeper_username as string | null) ?? null;
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? null;
    if (!username || !email) {
      console.error("[welcome-brief:account]", userId, JSON.stringify({ username: !!username, email: !!email }));
      return "no_account";
    }

    const brief = await buildWelcomeBrief({
      username,
      displayName: (profile?.display_name as string | null) ?? null,
      tier: briefRenderTier(effectiveTier(sub ?? null), flagOn("brief_pro_split", userId)),
      appUrl,
      unsubscribeUrl: unsub,
      mailingAddress,
      logTag: "welcome-brief",
    });
    if ("error" in brief) {
      console.error("[welcome-brief:nfl]", userId, brief.error);
      return "failed";
    }
    if (brief.tiles.length === 0 && !brief.firstCall) {
      // Nothing to characterize yet; the Tuesday brief carries the connect nudge.
      console.info("[welcome-brief:no-leagues]", userId);
      return "no_leagues";
    }
    if (brief.lint.length > 0) {
      console.error("[welcome-brief:lint]", userId, JSON.stringify(brief.lint));
      return "lint_blocked";
    }

    const { Resend } = await import("resend");
    const { error: sendErr } = await new Resend(apiKey).emails.send({
      from: briefFrom(),
      to: email,
      replyTo,
      subject: brief.subject,
      html: brief.html,
      text: brief.text,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    await admin.from("notifications").upsert(
      {
        user_id: userId,
        league_id: OPT_OUT.league_id,
        kind: WELCOME_KIND,
        status: sendErr ? "failed" : "sent",
        error_message: sendErr?.message ?? null,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id,league_id,kind" },
    );
    if (sendErr) {
      console.error("[welcome-brief:send]", userId, sendErr.name ?? "", sendErr.message);
      return "failed";
    }
    console.info("[welcome-brief:sent]", userId, WELCOME_BRIEF_TEMPLATE_VERSION);
    return "sent";
  } catch (err) {
    console.error("[welcome-brief:error]", userId, err instanceof Error ? `${err.message}\n${err.stack}` : err);
    return "failed";
  }
}
