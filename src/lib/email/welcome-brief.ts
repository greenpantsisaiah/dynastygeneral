/**
 * Welcome brief: the first email a homepage signup gets, right after the
 * signup (coordinator, 2026-11-28; Isaiah's core principles 2026-11-27:
 * characterize each team, then call the first decision).
 *
 * It is a teaser for /home, built from the same pieces /home renders:
 * - the team tiles (`teamTile` over `buildLeagueCharacter`), one row per team,
 * - the first call (`buildDecisionItems`, the same items and sentences /home
 *   and the Tuesday brief use), linked to that item on /home.
 * No sentence about a decision is written here; this file only lays out
 * what the shared builders already said.
 *
 * Compliance: every send carries a working unsubscribe link and the
 * mailing address (CAN-SPAM); `lintWelcomeBrief` fails without them.
 * Sending is gated by its own approved version (welcome-send.ts), so a new
 * template reaches users only after Isaiah approves that exact version.
 */

import type { DeskLeague } from "@/lib/email/trade-desk/model";
import { VOICE_COLOR, VOICE_NAME } from "@/lib/email/trade-desk/model";
import { esc, ordinal } from "@/lib/email/trade-desk/render";
import { BANNED, visibleText } from "@/lib/email/trade-desk/lint";
import { decisionItemHref, type DecisionItem, type LeagueCallItem, type TradeItem } from "@/lib/decisions/items";
import { teamTile, type TeamTile } from "@/lib/decisions/character";

/** Bump on ANY change to the rendered email (see EMAIL_WELCOME_APPROVED_VERSION). */
export const WELCOME_BRIEF_TEMPLATE_VERSION = "2026-11-28.welcome1";

/** Team rows shown before "and N more on your home". */
export const WELCOME_TEAMS_SHOWN = 6;

const C = {
  bg: "#EFEBE3", card: "#FFFFFF", ink: "#15181D", ink2: "#46505E", mute: "#8A919C", rule: "#E6E0D4",
  amber: "#B8730B", amberBg: "#FFF3DB", green: "#1D7447", red: "#AE3823", night: "#15181D", gold: "#F2A93B",
  track: "#ECE6DA",
};
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";

export type FirstCall = TradeItem | LeagueCallItem;

/**
 * The decision the email leads with: the top trade worth trying, else a
 * league call that asks for something this week, else the first league call.
 * Same ordering /home uses (items arrive priority-ordered from the builder).
 */
export function pickFirstCall(items: DecisionItem[]): FirstCall | null {
  const trades = items.filter((i): i is TradeItem => i.kind === "trade");
  if (trades.length) return [...trades].sort((a, b) => b.priority - a.priority)[0];
  const calls = items.filter((i): i is LeagueCallItem => i.kind === "league_call");
  return calls.find((c) => c.actionable) ?? [...calls].sort((a, b) => b.priority - a.priority)[0] ?? null;
}

/** Team tiles, best chance to win the league first (the /home order). */
export function welcomeTiles(leagues: DeskLeague[]): TeamTile[] {
  return leagues
    .flatMap((l) => {
      const t = l.character ? teamTile(l.leagueId, l.leagueName, l.character) : null;
      return t ? [t] : [];
    })
    .sort((a, b) => b.order - a.order);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const room = (r: { position: string; rank: number; total: number }) => `${r.position}, ${ordinal(r.rank)} of ${r.total}`;

/** One plain line about the top rival, the same facts the /home tile shows. */
export function rivalSentence(t: TeamTile): string | null {
  const r = t.rival;
  if (!r) return null;
  const gb = r.gamesBack;
  const gap = gb === 0 ? "level on record" : gb > 0 ? `${fmtGames(gb)} back of them` : `${fmtGames(-gb)} up on them`;
  const race = r.favorite
    ? `you lead the title race ${r.myTitleLabel} to ${r.titleLabel}`
    : `they lead the title race ${r.titleLabel} to your ${r.myTitleLabel}`;
  return `Top rival: ${r.manager} (${r.record}). You are ${r.myRecord}, ${gap}; ${race}.`;
}
function fmtGames(g: number): string {
  const s = Number.isInteger(g) ? String(g) : g.toFixed(1);
  return `${s} ${g === 1 ? "game" : "games"}`;
}

export function welcomeSubject(tiles: TeamTile[], first: FirstCall | null, leagueCount: number): string {
  const n = Math.max(tiles.length, leagueCount);
  if (n === 0) return "Connect your Sleeper leagues to get your first read";
  const teams = plural(n, "team");
  if (first?.kind === "trade") return `Your ${teams}, read. First call: ${first.title.split(", ")[0].replace(/\.$/, "")}`;
  if (first) return `Your ${teams}, read. First call in ${first.league_name}: ${first.stance_label}`;
  return `Your ${teams}, read`;
}

export interface WelcomeBriefArgs {
  ownerName: string;
  leagues: DeskLeague[];
  items: DecisionItem[];
  appUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string;
  /** Preview: list lint failures at the top instead of hiding them. */
  preview?: boolean;
}

export interface ComposedWelcome {
  subject: string;
  html: string;
  text: string;
  lint: string[];
  tiles: TeamTile[];
  firstCall: FirstCall | null;
}

// ---------- kit ----------
const kicker = (t: string, color = C.mute) =>
  `<div style="font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${color};">${t}</div>`;
const h = (t: string, size = 22, mt = 8) =>
  `<h2 style="margin:${mt}px 0 0;font-family:${SERIF};font-size:${size}px;line-height:1.25;font-weight:700;color:${C.ink};">${t}</h2>`;
const p = (t: string, size = 14, color = C.ink2, mt = 8) =>
  `<p style="margin:${mt}px 0 0;font-family:${SANS};font-size:${size}px;line-height:1.55;color:${color};">${t}</p>`;
const card = (inner: string, border?: string) =>
  `<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-radius:10px;${border ? `border-top:4px solid ${border};` : ""}"><tr><td style="padding:20px 18px;">${inner}</td></tr></table></td></tr>`;
const button = (t: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.ink};border-radius:6px;"><a href="${esc(href)}" style="display:inline-block;padding:11px 16px;font-family:${SANS};font-size:13px;font-weight:600;color:#fff;text-decoration:none;">${t}</a></td></tr></table>`;
const chip = (t: string) =>
  `<span style="display:inline-block;font-family:${SANS};font-size:11px;font-weight:600;line-height:1;padding:5px 8px;border-radius:999px;color:${C.amber};background:${C.amberBg};white-space:nowrap;">${esc(t)}</span>`;

/** A labeled percentage with a bar (the /home OddsMeter, email-safe). */
function meter(label: string, o: { pct: number; label: string } | null, color: string): string {
  if (!o) return `${kicker(label)}<div style="font:13px ${SANS};color:${C.mute};margin-top:4px;">No odds yet</div>`;
  const w = Math.max(3, Math.min(100, Math.round(o.pct * 100)));
  return `${kicker(label)}<div style="font:700 22px ${SERIF};color:${C.ink};margin-top:2px;">${esc(o.label)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;"><tr><td style="background:${C.track};border-radius:3px;font-size:0;line-height:0;"><div style="width:${w}%;height:6px;border-radius:3px;background:${color};font-size:0;line-height:0;">&nbsp;</div></td></tr></table>`;
}

function tileHtml(t: TeamTile, first: boolean): string {
  const rooms = [t.best ? `<b style="color:${C.ink};">Best room</b> ${esc(room(t.best))}` : null, t.thinnest ? `<b style="color:${C.ink};">Thinnest</b> ${esc(room(t.thinnest))}` : null]
    .filter(Boolean)
    .join(` <span style="color:${C.mute};">·</span> `);
  const rival = rivalSentence(t);
  return `<tr><td style="padding:${first ? 4 : 16}px 0 16px;${first ? "" : `border-top:1px solid ${C.rule};`}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top" style="font:600 15px/1.3 ${SANS};color:${C.ink};">${esc(t.leagueName)}</td><td valign="top" align="right">${t.chip ? chip(t.chip) : ""}</td></tr></table>
${t.note ? p(esc(t.note), 13, C.ink2, 4) : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;table-layout:fixed;"><tr><td width="50%" valign="top" style="padding-right:10px;">${meter("Playoffs", t.playoff, C.green)}</td><td width="50%" valign="top" style="padding-left:10px;">${meter("Win the league", t.title, C.gold)}</td></tr></table>
${rooms ? p(rooms, 13, C.ink2, 10) : ""}${rival ? p(esc(rival), 13, C.ink2, 6) : ""}
</td></tr>`;
}

function callHtml(c: FirstCall, appUrl: string): string {
  const voices = c.voices
    .map((x) => `<tr><td valign="top" width="26" style="padding:8px 10px 8px 0;"><div style="width:22px;height:22px;border-radius:11px;background:${VOICE_COLOR[x.voice]};color:#fff;font:700 10px/22px ${SANS};text-align:center;">${VOICE_NAME[x.voice][0]}</div></td><td style="padding:8px 0;border-top:1px solid ${C.rule};font-family:${SANS};font-size:13px;line-height:1.5;color:${C.ink2};"><b style="color:${C.ink};">${esc(VOICE_NAME[x.voice])} · ${esc(x.stance_label)}.</b> ${esc(x.line)}</td></tr>`)
    .join("");
  const body =
    c.kind === "trade"
      ? `${kicker(`${esc(c.league_name ?? "")}${c.deadline_label ? ` · ${esc(c.deadline_label)}` : ""}`, C.amber)}${h(esc(c.title), 21, 8)}`
      : `${kicker(`${esc(c.league_name ?? "")} · ${esc(c.context)}`, C.amber)}${h(esc(c.stance_label), 21, 8)}${p(esc(c.reason), 14)}`;
  const verdict =
    c.kind === "trade"
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:${C.amberBg};border-radius:8px;"><tr><td style="padding:12px 14px;font:14px/1.5 ${SANS};color:${C.ink};">${esc(c.verdict)}</td></tr></table>`
      : "";
  return card(
    `${kicker("Your first call", C.amber)}<div style="margin-top:10px;">${body}</div>
${voices ? `<div style="margin-top:14px;">${kicker("Where the three analysts land")}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">${voices}</table>` : ""}
${verdict}
<div style="margin-top:16px;">${button(c.kind === "trade" ? "Open this trade on your home" : "Open this call on your home", decisionItemHref(appUrl, c.id))}</div>`,
    C.amber,
  );
}

const METHOD =
  "Playoff and league-winning chances come from simulated seasons of each league built from this season's scores. They are model estimates with no graded track record yet. Rooms rank the total player value you hold at each position against every team in the league.";
const WHY = "You get this because you signed up for the Dynasty General weekly brief at dynastygeneral.app.";
const FOUNDER = "Which of these teams do you care about most? Hit reply and tell me. I read every reply myself.";

export function composeWelcomeBrief(a: WelcomeBriefArgs): ComposedWelcome {
  const tiles = welcomeTiles(a.leagues);
  const firstCall = pickFirstCall(a.items);
  const subject = welcomeSubject(tiles, firstCall, a.leagues.length);
  const home = `${a.appUrl.replace(/\/$/, "")}/home`;
  const shown = tiles.slice(0, WELCOME_TEAMS_SHOWN);
  const more = tiles.length - shown.length;
  const missing = a.leagues.filter((l) => !tiles.some((t) => t.leagueId === l.leagueId));
  const n = a.leagues.length;

  const headline = n === 0 ? "No Sleeper leagues found yet" : `Your ${plural(n, "team")}, read`;
  const sub =
    n === 0
      ? "Join or connect a Sleeper league and the first read lands on your home page."
      : "Where each team stands right now, its best and thinnest rooms, and the rival to watch. Then the first call worth making. The full read, with every league and the three analysts, is on your home page.";

  // ---------- HTML ----------
  const hero = card(`${kicker([a.ownerName, "Welcome"].filter(Boolean).map(esc).join(" · "))}
${h(esc(headline), 27)}
${p(esc(sub), 15)}
<div style="margin-top:14px;">${button(n === 0 ? "Connect Sleeper" : "Open your home", n === 0 ? `${a.appUrl.replace(/\/$/, "")}/connect` : home)}</div>`, C.gold);
  const teams = shown.length
    ? card(`${kicker(`Your teams · best chance to win first`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${shown.map((t, i) => tileHtml(t, i === 0)).join("")}</table>
${more > 0 ? p(`<a href="${esc(home)}" style="color:${C.amber};font-weight:600;text-decoration:none;">${esc(`And ${plural(more, "more team")} on your home`)} &rarr;</a> <span style="color:${C.mute};">${esc(tiles.slice(WELCOME_TEAMS_SHOWN).map((t) => t.leagueName).join(", "))}</span>`, 13, C.ink2, 4) : ""}${missing.length ? p(esc(`No read yet for ${missing.map((l) => l.leagueName).join(", ")}.`), 12, C.mute, 8) : ""}`)
    : "";
  const call = firstCall ? callHtml(firstCall, a.appUrl) : "";
  const founder = card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top" width="46"><div style="width:38px;height:38px;border-radius:19px;background:${C.ink};color:${C.gold};font:700 14px/38px ${SERIF};text-align:center;">I</div></td><td valign="top">${p(`<b style="color:${C.ink};">${esc(FOUNDER)}</b>`, 15, C.ink2, 0)}${p("The weekly brief arrives every Tuesday during the season with the trades worth trying.", 13)}${p("Isaiah, founder", 13, C.mute, 8)}</td></tr></table>`);
  let html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Welcome to Dynasty General</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:20px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};border-radius:10px;"><tr><td style="padding:14px 16px;font-family:${MONO};font-size:11px;letter-spacing:.16em;color:${C.gold};font-weight:700;">DYNASTY GENERAL <span style="color:#7E8794;font-weight:400;">· YOUR FIRST READ · BETA</span></td></tr></table></td></tr>
${hero}${teams}${call}${founder}
<tr><td style="padding:6px 4px 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${C.mute};">${esc(METHOD)}<br>${esc(WHY)} <a href="${esc(a.unsubscribeUrl)}" style="color:${C.mute};">Unsubscribe</a><br>Dynasty General · ${esc(a.mailingAddress)}</td></tr>
</table></td></tr></table></body></html>`;

  // ---------- text ----------
  const out: string[] = ["DYNASTY GENERAL · YOUR FIRST READ (BETA)", ""];
  out.push([a.ownerName, "Welcome"].filter(Boolean).join(" · "), headline, sub, `${n === 0 ? "Connect Sleeper" : "Open your home"}: ${n === 0 ? `${a.appUrl.replace(/\/$/, "")}/connect` : home}`, "");
  if (shown.length) {
    out.push("YOUR TEAMS · BEST CHANCE TO WIN FIRST");
    for (const t of shown) {
      out.push(`${t.leagueName}${t.chip ? ` (${t.chip})` : ""}`);
      if (t.note) out.push(`  ${t.note}`);
      out.push(`  Playoffs ${t.playoff?.label ?? "no odds yet"}. Win the league ${t.title?.label ?? "no odds yet"}.`);
      const rooms = [t.best ? `Best room ${room(t.best)}` : null, t.thinnest ? `Thinnest ${room(t.thinnest)}` : null].filter(Boolean).join(". ");
      if (rooms) out.push(`  ${rooms}.`);
      const rival = rivalSentence(t);
      if (rival) out.push(`  ${rival}`);
    }
    if (more > 0) out.push(`And ${plural(more, "more team")} on your home (${tiles.slice(WELCOME_TEAMS_SHOWN).map((t) => t.leagueName).join(", ")}): ${home}`);
    if (missing.length) out.push(`No read yet for ${missing.map((l) => l.leagueName).join(", ")}.`);
    out.push("");
  }
  if (firstCall) {
    out.push("YOUR FIRST CALL");
    if (firstCall.kind === "trade") {
      out.push(`${firstCall.league_name ?? ""}${firstCall.deadline_label ? ` · ${firstCall.deadline_label}` : ""}`, firstCall.title);
    } else {
      out.push(`${firstCall.league_name ?? ""} · ${firstCall.context}`, firstCall.stance_label, firstCall.reason);
    }
    for (const v of firstCall.voices) out.push(`  ${VOICE_NAME[v.voice]} · ${v.stance_label}. ${v.line}`);
    if (firstCall.kind === "trade") out.push(firstCall.verdict);
    out.push(`Open it on your home: ${decisionItemHref(a.appUrl, firstCall.id)}`, "");
  }
  out.push(FOUNDER, "The weekly brief arrives every Tuesday during the season with the trades worth trying.", "Isaiah, founder", "");
  out.push(METHOD, WHY, `Unsubscribe: ${a.unsubscribeUrl}`, `Dynasty General · ${a.mailingAddress}`);
  let text = out.join("\n");

  const lint = lintWelcomeBrief({ subject, html, text, unsubscribeUrl: a.unsubscribeUrl, mailingAddress: a.mailingAddress, leagues: a.leagues });
  if (a.preview && lint.length > 0) {
    const banner = `<div style="background:#FBE8E3;color:#AE3823;font:13px/1.5 sans-serif;padding:12px 16px;">Preview only. The content lint would block this send:<br>${lint.map(esc).join("<br>")}</div>`;
    html = html.replace(/<body([^>]*)>/, `<body$1>${banner}`);
    text = `PREVIEW ONLY. The content lint would block this send:\n${lint.map((l) => `- ${l}`).join("\n")}\n\n${text}`;
  }
  return { subject, html, text, lint, tiles, firstCall };
}

/** Machine-checkable rules; any failure blocks the send (welcome-send.ts). */
export function lintWelcomeBrief(a: {
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
  mailingAddress: string;
  leagues: DeskLeague[];
}): string[] {
  const out: string[] = [];
  const visible = `${a.subject}\n${visibleText(a.html)}\n${a.text}`;
  for (const [re, what] of BANNED) if (re.test(visible)) out.push(`contains ${what}`);
  if (!a.html.includes(esc(a.unsubscribeUrl)) || !a.text.includes(a.unsubscribeUrl)) out.push("missing unsubscribe link");
  if (!a.mailingAddress.trim() || !a.text.includes(a.mailingAddress)) out.push("missing mailing address");
  // Every league is named somewhere (a row, or the "no read yet" line); nothing silently dropped.
  for (const l of a.leagues) if (!a.text.includes(l.leagueName)) out.push(`league not named: ${l.leagueName}`);
  if (/undefined|NaN|\[object/.test(visible)) out.push("rendered a missing value");
  return out;
}
