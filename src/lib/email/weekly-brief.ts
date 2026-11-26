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
import { lintDecisionItems, lintTradeDesk, userSuppliedNames } from "@/lib/email/trade-desk/lint";
import { buildDecisionItems, type DecisionDigest, type DecisionItem } from "@/lib/decisions/items";

/**
 * Version of this template. Bump it on ANY change to the rendered email.
 * The cron only broadcasts when EMAIL_BRIEF_APPROVED_VERSION equals this
 * value, so a new template always goes to the admin preview list first
 * and reaches users only after Isaiah approves that exact version.
 */
export const WEEKLY_BRIEF_TEMPLATE_VERSION = "2026-11-26.desk7";

export type { BriefTier, DeskLeague };

/**
 * The tier the brief renders as. While the brief_pro_split flag is off
 * (the beta, billing off), everyone gets the full brief: no locked panel,
 * no /pricing link. Coordinator, 2026-11-26: the site says "Free during
 * the beta", so the email must not show a paywall.
 */
export function briefRenderTier(subscriptionTier: BriefTier, proSplitOn: boolean): BriefTier {
  return proSplitOn ? subscriptionTier : "pro";
}

export interface ComposedBrief {
  subject: string;
  html: string;
  text: string;
  /** Content-lint failures (items first, then the email). Non-empty blocks a broadcast. */
  lint: string[];
  /** The shared decision items and digest the email was written from (/home reads the same). */
  items: DecisionItem[];
  digest: DecisionDigest;
}

export function composeWeeklyBrief(args: {
  ownerName: string;
  /** The reader's Sleeper username, carried on every league link. */
  sleeperUsername?: string | null;
  tier: BriefTier;
  leagues: DeskLeague[];
  resultsWeek: number;
  nflWeek: number;
  /** nfl_state.season_start_date, so deadlines print as a day and time. */
  seasonStartDate?: string | null;
  /** nfl_state.season, for the item ids. Defaults to the send date's year. */
  season?: string;
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
    sleeperUsername: args.sleeperUsername,
    tier: args.tier,
    resultsWeek: args.resultsWeek,
    leagues: args.leagues,
    seasonStartDate: args.seasonStartDate,
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
  const sendDate = args.sendDate ?? new Date();
  const { items, digest } = buildDecisionItems({ model, season: args.season ?? String(sendDate.getUTCFullYear()) });
  const lint = [...lintDecisionItems(items, userSuppliedNames(model)), ...lintTradeDesk({
    model,
    html,
    text,
    subject,
    nflWeek: args.nflWeek,
    expectedLeagueIds: args.expectedLeagueIds ?? args.leagues.map((l) => l.leagueId),
    unsubscribeUrl: args.unsubscribeUrl,
    mailingAddress: args.mailingAddress,
  })];
  if (args.preview && lint.length > 0) {
    const banner = `<div style="background:#FBE8E3;color:#AE3823;font:13px/1.5 sans-serif;padding:12px 16px;">Preview only. The content lint would block this broadcast:<br>${lint.map(esc).join("<br>")}</div>`;
    html = html.replace(/<body([^>]*)>/, `<body$1>${banner}`);
    text = `PREVIEW ONLY. The content lint would block this broadcast:\n${lint.map((l) => `- ${l}`).join("\n")}\n\n${text}`;
  }
  return { subject, html, text, lint, items, digest };
}
