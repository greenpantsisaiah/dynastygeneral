/**
 * Weekly brief email: the Tuesday Trade Desk (approved round 4, 2026-11-25;
 * spec /mnt/project-files/email-redesign/BUILD_SPEC.md PR 1). This file is
 * the one entry the cron, the admin preview and the offline snapshot render
 * call: model, render, lint, in that order.
 *
 * Compliance: every send carries a working unsubscribe link and the
 * mailing address (CAN-SPAM). The cron refuses to send without both, and
 * the content lint fails when either is missing from the rendered email.
 */

import { buildTradeDeskModel, type BriefTier, type DeskLeague } from "@/lib/email/trade-desk/model";
import { deskSubject, renderDeskHtml, renderDeskText, esc } from "@/lib/email/trade-desk/render";
import { lintTradeDesk } from "@/lib/email/trade-desk/lint";

/**
 * Version of this template. Bump it on ANY change to the rendered email.
 * The cron only broadcasts when EMAIL_BRIEF_APPROVED_VERSION equals this
 * value, so a new template always goes to the admin preview list first
 * and reaches users only after Isaiah approves that exact version.
 */
export const WEEKLY_BRIEF_TEMPLATE_VERSION = "2026-11-26.desk1";

export type { BriefTier, DeskLeague };

export interface ComposedBrief {
  subject: string;
  html: string;
  text: string;
  /** Content-lint failures. Non-empty blocks a broadcast. */
  lint: string[];
}

export function composeWeeklyBrief(args: {
  ownerName: string;
  tier: BriefTier;
  leagues: DeskLeague[];
  resultsWeek: number;
  nflWeek: number;
  appUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string;
  sendDate?: Date;
  /** Every league id the user is in; defaults to the leagues passed. */
  expectedLeagueIds?: string[];
  /** Preview: list lint failures at the top of the email instead of hiding them. */
  preview?: boolean;
}): ComposedBrief {
  const model = buildTradeDeskModel({
    ownerName: args.ownerName,
    tier: args.tier,
    resultsWeek: args.resultsWeek,
    leagues: args.leagues,
  });
  const r = {
    model,
    appUrl: args.appUrl,
    unsubscribeUrl: args.unsubscribeUrl,
    mailingAddress: args.mailingAddress,
    sendDate: args.sendDate ?? new Date(),
  };
  const subject = deskSubject(model);
  let html = renderDeskHtml(r);
  let text = renderDeskText(r);
  const lint = lintTradeDesk({
    model,
    html,
    text,
    subject,
    nflWeek: args.nflWeek,
    expectedLeagueIds: args.expectedLeagueIds ?? args.leagues.map((l) => l.leagueId),
    unsubscribeUrl: args.unsubscribeUrl,
    mailingAddress: args.mailingAddress,
  });
  if (args.preview && lint.length > 0) {
    const banner = `<div style="background:#FBE8E3;color:#AE3823;font:13px/1.5 sans-serif;padding:12px 16px;">Preview only. The content lint would block this broadcast:<br>${lint.map(esc).join("<br>")}</div>`;
    html = html.replace(/<body([^>]*)>/, `<body$1>${banner}`);
    text = `PREVIEW ONLY. The content lint would block this broadcast:\n${lint.map((l) => `- ${l}`).join("\n")}\n\n${text}`;
  }
  return { subject, html, text, lint };
}
