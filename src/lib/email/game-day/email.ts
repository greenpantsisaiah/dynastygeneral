/**
 * Sunday Game Day email, first slice (BUILD_SPEC PR 3): the hero and the
 * three-analyst lineup panel with its action row. The swing game, all
 * games and who to root for come in later slices. Preview-only until
 * Isaiah approves a rendered copy of GAME_DAY_TEMPLATE_VERSION.
 */

import { BANNED, visibleText } from "@/lib/email/trade-desk/lint";
import { esc } from "@/lib/email/trade-desk/render";
import type { LineupPanel } from "./lineup";
import { heroSubLine, panelHeadline, renderPanelHtml, renderPanelText } from "./panel";

export const GAME_DAY_TEMPLATE_VERSION = "2026-11-27.gameday2";

const C = { bg: "#EFEBE3", card: "#FFFFFF", ink: "#15181D", ink2: "#46505E", mute: "#8A919C", night: "#15181D", gold: "#F2A93B" };
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";

/** Sleeper's lineup page for a league (opens the app on phones with it installed). */
export const sleeperLineupHref = (leagueId: string) => `https://sleeper.com/leagues/${encodeURIComponent(leagueId)}/team`;

const METHOD =
  "Playoff chances come from simulating the rest of each season from this season's scores. They are model estimates, rounded to 5 points, with no graded track record yet. Points per game are this season's Sleeper scores, not a forecast.";

export interface GameDayEmail {
  subject: string;
  html: string;
  text: string;
  lint: string[];
}

function dateLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" }).format(d).replace(",", "").toUpperCase();
}

export function heroSub(p: LineupPanel): string {
  return heroSubLine(p);
}

export function composeGameDayEmail(args: {
  ownerName: string;
  panel: LineupPanel;
  unsubscribeUrl: string;
  mailingAddress: string;
  sendDate: Date;
  /** Override the Sleeper link (tests). */
  lineupHref?: (leagueId: string) => string;
  preview?: boolean;
  /** Names users chose (leagues, managers, players), exempt from the copy rules. */
  userNames?: string[];
}): GameDayEmail {
  const p = args.panel;
  const href = args.lineupHref ?? sleeperLineupHref;
  const subject = panelHeadline(p);
  const kick = [args.ownerName, `Week ${p.week} game day`, `${p.leagues.length} ${p.leagues.length === 1 ? "lineup" : "lineups"}`].filter(Boolean).map(esc).join(" · ");
  const skipped = p.skipped.length
    ? `<p style="margin:8px 0 0;font:12px/1.5 ${SANS};color:${C.mute};">Not read: ${esc(p.skipped.map((s) => `${s.leagueName} (${s.reason})`).join(", "))}.</p>`
    : "";
  const hero = `<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-radius:10px;border-top:4px solid ${C.gold};"><tr><td style="padding:22px;"><div style="font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.mute};">${kick}</div><h2 style="margin:10px 0 0;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:700;color:${C.ink};">${esc(subject)}</h2><p style="margin:8px 0 0;font:15px/1.55 ${SANS};color:${C.ink2};">${esc(heroSub(p))}</p>${skipped}</td></tr></table></td></tr>`;
  const panel = renderPanelHtml({ panel: p, lineupHref: href });
  let html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Dynasty General game day</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:20px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};border-radius:10px;"><tr><td style="padding:14px 20px;font-family:${MONO};font-size:11px;letter-spacing:.16em;color:${C.gold};font-weight:700;">DYNASTY GENERAL <span style="color:#7E8794;font-weight:400;">· GAME DAY · BETA</span></td><td align="right" style="padding:14px 20px;font-family:${MONO};font-size:11px;color:#AEB6C2;">WEEK ${p.week} · ${dateLabel(args.sendDate)}</td></tr></table></td></tr>
${hero}${panel}
<tr><td style="padding:6px 4px 0;font:11px/1.6 ${SANS};color:${C.mute};">${esc(METHOD)}<br>You get this because you have a Dynasty General account. <a href="${esc(args.unsubscribeUrl)}" style="color:${C.mute};">Unsubscribe</a><br>Dynasty General · ${esc(args.mailingAddress)}</td></tr>
</table></td></tr></table></body></html>`;
  let text = [
    `DYNASTY GENERAL GAME DAY (BETA) · WEEK ${p.week} · ${dateLabel(args.sendDate)}`,
    "",
    [args.ownerName, `Week ${p.week} game day`].filter(Boolean).join(" · "),
    subject,
    heroSub(p),
    ...(p.skipped.length ? [`Not read: ${p.skipped.map((s) => `${s.leagueName} (${s.reason})`).join(", ")}.`] : []),
    "",
    renderPanelText({ panel: p, lineupHref: href }),
    "",
    METHOD,
    `Unsubscribe: ${args.unsubscribeUrl}`,
    `Dynasty General · ${args.mailingAddress}`,
  ].join("\n");

  const lint = lintGameDay({ html, text, subject, unsubscribeUrl: args.unsubscribeUrl, mailingAddress: args.mailingAddress, userNames: [args.ownerName, ...(args.userNames ?? [])] });
  if (args.preview && lint.length) {
    html = html.replace(/<body([^>]*)>/, `<body$1><div style="background:#FBE8E3;color:#AE3823;font:13px/1.5 sans-serif;padding:12px 16px;">Preview only. The content lint would block this broadcast:<br>${lint.map(esc).join("<br>")}</div>`);
    text = `PREVIEW ONLY. The content lint would block this broadcast:\n${lint.map((l) => `- ${l}`).join("\n")}\n\n${text}`;
  }
  return { subject, html, text, lint };
}

export function lintGameDay(a: { html: string; text: string; subject: string; unsubscribeUrl: string; mailingAddress: string; userNames: string[] }): string[] {
  const out: string[] = [];
  let ours = `${a.subject}\n${visibleText(a.html)}\n${a.text}`;
  for (const n of [...a.userNames].filter(Boolean).sort((x, y) => y.length - x.length)) ours = ours.split(n).join(" ");
  for (const [re, what] of BANNED) if (re.test(ours)) out.push(`contains ${what}`);
  if (/\bundefined\b|\bnull\b|\bNaN\b/.test(ours)) out.push("a value failed to render (undefined, null or NaN)");
  if (/Roster \d+/.test(ours)) out.push("a manager shows as a roster number");
  if (!a.html.includes(esc(a.unsubscribeUrl)) || !a.text.includes(a.unsubscribeUrl)) out.push("missing unsubscribe link");
  if (!a.mailingAddress.trim() || !a.text.includes(a.mailingAddress)) out.push("missing mailing address");
  return out;
}
