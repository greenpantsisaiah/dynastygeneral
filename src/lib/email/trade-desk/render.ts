/**
 * Tuesday Trade Desk renderer (approved round 4, BUILD_SPEC PR 1). Lays out
 * a TradeDeskModel as email-safe HTML (tables + inline styles, the
 * mockup's component kit) and a matching plain-text part. No decisions
 * here: the model decides, this file only writes it down once.
 */

import type { BuyerRead } from "@/lib/strategy/verdict/buyers";
import { fmtPct, fmtScore, playoffRange, RANGE_LABEL, ROLE_DEFINITIONS, type LeagueShift, type PlayoffRange, type ShiftRole } from "./league-week";
import {
  playoffDelta,
  round5,
  STANCE_LABEL,
  STANCE_STOP,
  VOICE_COLOR,
  VOICE_NAME,
  type DeskLeague,
  type LeagueKind,
  type TradeCard,
  type TradeDeskModel,
} from "./model";

export interface DeskRenderArgs {
  model: TradeDeskModel;
  appUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string;
  sendDate: Date;
}

const C = {
  bg: "#EFEBE3", card: "#FFFFFF", ink: "#15181D", ink2: "#46505E", mute: "#8A919C", rule: "#E6E0D4",
  amber: "#B8730B", amberBg: "#FFF3DB", green: "#1D7447", greenBg: "#E3F2E8", red: "#AE3823", redBg: "#FBE8E3",
  blue: "#2A5BA3", blueBg: "#E5EDF8", night: "#15181D", gold: "#F2A93B",
};
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";
type Tone = "amber" | "green" | "red" | "blue" | "grey" | "dark";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const valuePts = (n: number) => `${Math.round(n)} value point${Math.round(n) === 1 ? "" : "s"}`;
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
export const KIND_LABEL: Record<LeagueKind, string> = { dynasty: "Dynasty", keeper: "Keeper", redraft: "Redraft", best_ball: "Best ball" };
const RANGE_TONE: Record<PlayoffRange, Tone> = { favorite: "green", in_the_hunt: "green", bubble: "amber", long_shot: "red", no_chance: "grey" };
const ROLE: Record<ShiftRole, [string, Tone]> = { seller: ["Seller", "green"], buyer: ["Buyer", "blue"], rival: ["Rival", "amber"] };
const lastName = (n: string) => n.split(" ").slice(1).join(" ") || n;

// ---------- kit ----------
const kicker = (t: string, color = C.mute) =>
  `<div style="font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${color};">${t}</div>`;
function chip(t: string, tone: Tone = "amber"): string {
  const [fg, bg] = ({ amber: [C.amber, C.amberBg], green: [C.green, C.greenBg], red: [C.red, C.redBg], blue: [C.blue, C.blueBg], grey: [C.ink2, "#EEEBE5"], dark: ["#FFFFFF", C.ink] } as const)[tone];
  return `<span style="display:inline-block;font-family:${SANS};font-size:11px;font-weight:600;line-height:1;padding:5px 8px;border-radius:999px;color:${fg};background:${bg};white-space:nowrap;">${t}</span>`;
}
const h = (t: string, size = 22, mt = 8) =>
  `<h2 style="margin:${mt}px 0 0;font-family:${SERIF};font-size:${size}px;line-height:1.25;font-weight:700;color:${C.ink};">${t}</h2>`;
const p = (t: string, size = 14, color = C.ink2, mt = 8) =>
  `<p style="margin:${mt}px 0 0;font-family:${SANS};font-size:${size}px;line-height:1.55;color:${color};">${t}</p>`;
const card = (inner: string, border?: string) =>
  `<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-radius:10px;${border ? `border-top:4px solid ${border};` : ""}"><tr><td style="padding:22px;">${inner}</td></tr></table></td></tr>`;
const button = (t: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${C.ink};border:1px solid ${C.ink};border-radius:6px;"><a href="${esc(href)}" style="display:inline-block;padding:11px 16px;font-family:${SANS};font-size:13px;font-weight:600;color:#fff;text-decoration:none;">${t}</a></td></tr></table>`;

function scale(card: TradeCard): string {
  const stops = ["Sell now", "Lean sell", "Split", "Lean keep", "Keep going"];
  const rail = ["#C9573F", "#E0A08F", "#D9D3C7", "#9CCAAE", "#3F8F63"];
  let cols = "";
  stops.forEach((s, i) => {
    const here = card.panel.voices.filter((v) => STANCE_STOP[v.stance] === i);
    const dots =
      here.map((v) => `<div style="margin:0 auto 4px;width:26px;height:26px;border-radius:13px;background:${VOICE_COLOR[v.voice]};color:#fff;font-family:${SANS};font-size:11px;font-weight:700;line-height:26px;text-align:center;">${VOICE_NAME[v.voice][0]}</div>`).join("") ||
      '<div style="height:26px;">&nbsp;</div>';
    cols += `<td width="20%" valign="bottom" style="text-align:center;padding:0 2px;">${dots}<div style="height:4px;background:${rail[i]};"></div><div style="font-family:${SANS};font-size:10px;color:${C.mute};padding-top:5px;">${s}</div></td>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cols}</tr></table>`;
}

// ---------- shared copy (HTML and text use the same sentences) ----------
function buyerReason(b: BuyerRead, pos: string): string {
  return b.startable_at_pos < b.starters_at_pos
    ? `is short a starting ${pos}`
    : `has no ${pos} depth behind their starters`;
}
export function cardTitle(c: TradeCard): string {
  return `Offer ${c.lead.player.name} to ${c.buyer.label}, who ${buyerReason(c.buyer, c.lead.player.position)}.`;
}
export function sellingLabel(c: TradeCard): string {
  return `If you sell ${lastName(c.lead.player.name)}`;
}
/** The titled move only: this player's odds change and decay (desk1 review). */
export function sellEffect(c: TradeCard): { big: string; sub: string; tone: string } {
  const d = Math.round(c.lead.title_delta * 100);
  const kept = Math.round(c.lead.decay.value_lost);
  const keptLine = `avoids a ${kept}-point offseason drop`;
  if (d <= -1) return { big: `&minus;${-d} pts`, sub: `league-win chance to ${fmtPct(c.lead.title_pct_if_sold)}, ${keptLine}`, tone: C.red };
  if (d >= 1) return { big: `+${d} pts`, sub: `the replacement scores more; ${keptLine}`, tone: C.green };
  return { big: "&lt;1 pt", sub: `barely moves it; ${keptLine}`, tone: C.ink };
}
export function verdictLine(c: TradeCard): string {
  const d = c.lead.decay;
  return `${c.sellLeaning} of 3 lean sell, if the price is right. Open by asking for full value for ${c.lead.player.name}: about ${valuePts(d.value_now)} on our 0 to 100 scale. By August that drops to about ${Math.round(d.value_later)}.`;
}
export function fallbackLine(c: TradeCard): string {
  const pos = c.lead.player.position;
  const keeper = c.panel.voices.find((v) => v.stance === "push" || v.stance === "lean_push");
  const keepNote = keeper ? ` The ${VOICE_NAME[keeper.voice]} would keep ${lastName(c.lead.player.name)} anyway.` : "";
  if (c.fallbackBuyers.length > 0) {
    const names = c.fallbackBuyers.map((b) => b.label);
    return `${names.join(" and ")} ${names.length > 1 ? "are" : "is"} also short at ${pos}. If nobody pays full value, keeping ${lastName(c.lead.player.name)} is a fine outcome.${keepNote}`;
  }
  return `No other manager is short at ${pos}. Keeping ${lastName(c.lead.player.name)} costs about ${valuePts(c.lead.decay.value_lost)} by August, which is a fine outcome.${keepNote}`;
}
export function deadlineChip(c: TradeCard): string {
  if (c.deadlineWeek == null) return "No trade deadline";
  return c.tradeBy ? `Trade before ${c.tradeBy.label}` : `Deadline: Week ${c.deadlineWeek}`;
}
/** The earliest trade-by moment across the cards, named in the hero. */
function firstTradeBy(m: TradeDeskModel): TradeCard["tradeBy"] {
  return m.cards.map((c) => c.tradeBy).filter((t): t is NonNullable<typeof t> => t != null).sort((a, b) => a.day.getTime() - b.day.getTime())[0] ?? null;
}
export function heroHeadline(m: TradeDeskModel): string {
  if (m.leagues.length === 0) return "Connect a Sleeper league and this brief fills in.";
  const k = m.cards.length;
  if (k === 0) return "No trades worth trying this week.";
  const n = k === 1 ? "1 trade" : `${k} trades`;
  const first = firstTradeBy(m);
  if (!first) {
    const dls = new Set(m.cards.map((c) => c.deadlineWeek));
    const one = dls.size === 1 ? [...dls][0] : undefined;
    return `${n} worth trying${one != null ? ` before the Week ${one} trade deadline` : " this week"}.`;
  }
  const same = m.cards.every((c) => c.tradeBy?.label === first.label);
  return same ? `${n} worth trying before ${first.label}.` : `${n} worth trying. The first must go before ${first.label}.`;
}
const NUDGE = "Add your Sleeper username and every Tuesday you get each league's playoff chance, the trades worth trying, and who in your leagues is buying or selling.";
export function heroSub(m: TradeDeskModel): string {
  const n = m.leagues.length;
  if (n === 0) return NUDGE;
  const k = m.cards.length;
  const sims = `Every number below comes from ${fmtInt(m.sims)} simulated seasons of each league, rerun with Week ${m.resultsWeek}'s scores.`;
  const safe = firstTradeBy(m)
    ? " Trade-by times are the first kickoff of each league's deadline week, the safe time to finish a deal."
    : "";
  if (k > 0) {
    const rest = n - new Set(m.cards.map((c) => c.leagueId)).size;
    return `${rest > 0 ? `Your other ${plural(rest, "league")} need${rest === 1 ? "s" : ""} nothing from you this week. ` : ""}${sims}${safe}`;
  }
  // Only claim "no sale worth trying" where a read exists (desk1 review).
  const closed = m.leagues.filter((l) => l.verdict && !l.verdict.trade_window.open).length;
  const read = m.leagues.filter((l) => l.verdict && l.verdict.trade_window.open).length;
  const noRead = m.leagues.filter((l) => !l.verdict).length;
  const parts: string[] = [];
  if (closed > 0) parts.push(closed === n ? `${n === 1 ? "Your 1 league is" : `All ${n} leagues are`} past the trade deadline or best ball.` : `${closed} of your ${plural(n, "league")} ${closed === 1 ? "is" : "are"} past the trade deadline or best ball.`);
  if (read > 0) parts.push(read === n ? `In all ${plural(n, "league")} the analysts see no sale worth trying.` : `In the ${read === 1 ? "1 league" : `${read} leagues`} with a read, the analysts see no sale worth trying.`);
  if (noRead > 0) parts.push(noRead === n ? `No league has a read yet this week; the table says why.` : `${plural(noRead, "league")} had no read this week; the table says why.`);
  return `${parts.join(" ")}${read + closed > 0 ? ` ${sims}` : ""}`;
}
/** null when no league has a result: never a "0-0 last week" recap. */
export function weekHeadline(m: TradeDeskModel): string | null {
  if (!m.leagues.some((l) => l.week?.result)) return null;
  const r = m.record;
  const rec = `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""} last week.`;
  if (m.rose === 0 && m.fell === 0) return `${rec} Your playoff chances held in every league.`;
  const parts = [m.rose ? `rose in ${plural(m.rose, "league")}` : null, m.fell ? `fell in ${plural(m.fell, "league")}` : null].filter(Boolean);
  return `${rec} Your playoff chances ${parts.join(", ")}.`;
}
export function biggestSwing(m: TradeDeskModel): string | null {
  let best: DeskLeague | null = null;
  let bd = 0;
  for (const l of m.leagues) {
    const d = playoffDelta(l.week);
    if (d != null && Math.abs(d) > Math.abs(bd)) { bd = d; best = l; }
  }
  if (!best || Math.abs(bd) < 5 || !best.week) return null;
  const r = best.week.result;
  const how = r?.kind === "h2h" && r.won != null ? ` after a ${fmtScore(r.my)}-${fmtScore(r.opp)} ${r.won ? "win" : "loss"}` : "";
  return `The biggest swing: ${best.leagueName}, where your playoff chance went from ${fmtPct(best.week.playoff_before!)} to ${fmtPct(best.week.playoff_now!)}${how}.`;
}
export const MAX_SHIFT_ROWS = 8;
const ORDER: PlayoffRange[] = ["no_chance", "long_shot", "bubble", "in_the_hunt", "favorite"];
export function allShifts(m: TradeDeskModel, limit = MAX_SHIFT_ROWS): Array<LeagueShift & { league: string; leagueId: string }> {
  const carded = new Set(m.cards.map((c) => c.leagueId));
  const size = (s: LeagueShift) => (s.from && s.to ? Math.abs(ORDER.indexOf(s.to) - ORDER.indexOf(s.from)) : 0);
  return m.leagues
    .flatMap((l) => (l.week?.shifts ?? []).map((s) => ({ ...s, league: l.leagueName.trim(), leagueId: l.leagueId, carded: carded.has(l.leagueId) })))
    .sort((a, b) => Number(b.carded) - Number(a.carded) || Number(!!b.injury) - Number(!!a.injury) || size(b) - size(a))
    .slice(0, limit);
}
export function shiftsHeadline(rows: LeagueShift[]): string {
  const sellers = rows.filter((r) => r.role === "seller").length;
  return `${plural(rows.length, "team")} changed ${rows.length === 1 ? "its" : "their"} season.${sellers ? ` ${sellers} ${sellers === 1 ? "is" : "are"} now ${sellers === 1 ? "a seller" : "sellers"}.` : ""}`;
}
export const RANGES_LEGEND = "Ranges: Favorite 80%+ playoffs, In the hunt 50 to 80, Bubble 25 to 50, Long shot 2 to 25, No chance under 2%.";
export const ROLES_LEGEND = `For you: ${ROLE_DEFINITIONS.seller}. ${ROLE_DEFINITIONS.buyer}. ${ROLE_DEFINITIONS.rival}. Blank where none applies or trading is closed.`;
export function founderAsk(m: TradeDeskModel): string {
  if (m.leagues.length === 0) return "What would make this brief worth connecting a league for? Reply now.";
  if (m.cards.length === 0) return "What would you want this email to tell you next Tuesday? Reply now.";
  return m.cards.length === 1
    ? "Will you make this trade? Reply now with yes, no, or what is stopping you."
    : "Will you make any of these trades? Reply now with yes, no, or what is stopping you.";
}
const METHOD = (m: TradeDeskModel) =>
  `Chances come from ${fmtInt(m.sims)} simulated seasons of each league from this season's scores, rounded to 5 points. They are model estimates with no graded track record yet.`;

export function deskSubject(m: TradeDeskModel): string {
  const c = m.cards[0];
  if (m.leagues.length === 0) return "Connect your Sleeper leagues for next Tuesday's brief";
  if (!c) return `Week ${m.resultsWeek} is in: ${m.record.wins}-${m.record.losses} across your ${plural(m.leagues.length, "league")}`;
  // Subject rule (Isaiah, 2026-11-26): lead with the decision, never with
  // "Brief". The first card sets the deadline day and the offer.
  const k = m.cards.length;
  const by = c.tradeBy ? ` before ${c.tradeBy.label.split(",")[0]}` : "";
  return `${k} ${k === 1 ? "trade" : "trades"} worth trying${by}: offer ${c.lead.player.name} to ${c.buyer.label}`;
}
const headerRight = (m: TradeDeskModel, d: Date) =>
  `WEEK ${m.aheadWeek} AHEAD · ${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" }).format(d).toUpperCase().replace(",", "")}`;

// ---------- HTML ----------
function tradeCardHtml(c: TradeCard, i: number, m: TradeDeskModel, appUrl: string): string {
  const v = c.verdict;
  const eff = sellEffect(c);
  const tile = (a: string, b: string, d: string, col = C.ink) =>
    `<td width="33%" valign="top">${kicker(a)}<div style="font:700 24px ${SERIF};color:${col};margin-top:4px;">${b}</div><div style="font:12px ${SANS};color:${C.mute};">${esc(d)}</div></td>`;
  const tiles =
    tile("Playoffs", RANGE_LABEL[playoffRange(c.playoffPct)], `${fmtPct(c.playoffPct)} · ${ordinal(v.league.rank_by_title_odds)} of ${v.league.teams} by odds`) +
    tile("Win the league", fmtPct(v.odds.title_pct), `fair share is ${Math.round(v.league.fair_title_share * 100)}%`) +
    tile(esc(sellingLabel(c)), eff.big, eff.sub.replace("&minus;", "-"), eff.tone);
  const voices = c.panel.voices
    .map((x) => `<tr><td valign="top" width="26" style="padding:8px 10px 8px 0;"><div style="width:22px;height:22px;border-radius:11px;background:${VOICE_COLOR[x.voice]};color:#fff;font:700 10px/22px ${SANS};text-align:center;">${VOICE_NAME[x.voice][0]}</div></td><td style="padding:8px 0;border-top:1px solid ${C.rule};font-family:${SANS};font-size:13px;line-height:1.5;color:${C.ink2};"><b style="color:${C.ink};">${VOICE_NAME[x.voice]} · ${STANCE_LABEL[x.stance]}.</b> ${esc(x.line)}</td></tr>`)
    .join("");
  const offerUrl = `${appUrl}/leagues/${c.leagueId}/trade`;
  const action =
    m.tier === "pro"
      ? `<div style="margin-top:14px;">${button(`Open the offer to ${esc(c.buyer.label)}`, offerUrl)}</div>`
      : locked(appUrl);
  return card(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>${kicker(`Worth trying · ${i + 1} of ${m.cards.length} · ${esc(c.leagueName)}`, C.amber)}</td><td align="right">${chip(deadlineChip(c), "red")}</td></tr></table>
${h(esc(cardTitle(c)), 21, 10)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;"><tr>${tiles}</tr></table>
<div style="margin-top:18px;">${kicker("Where the three analysts land")}</div><div style="margin-top:10px;">${scale(c)}</div>
<div style="margin-top:10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${voices}</table></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;background:${C.amberBg};border-radius:8px;"><tr><td style="padding:12px 14px;font:14px/1.5 ${SANS};color:${C.ink};"><b>${esc(verdictLine(c).split(". ")[0])}.</b> ${esc(verdictLine(c).split(". ").slice(1).join(". "))}<div style="margin-top:8px;font:13px/1.5 ${SANS};color:${C.ink2};"><b style="color:${C.ink};">If it doesn't land:</b> ${esc(fallbackLine(c))}</div></td></tr></table>
${action}`,
    C.amber,
  );
}
function locked(appUrl: string): string {
  const rows = [["A message ready to paste", 130], ["Fallback ask if they say no", 90]] as const;
  const r = rows.map(([a, w]) => `<tr><td style="padding:7px 0;border-top:1px solid ${C.rule};font-family:${SANS};font-size:13px;color:${C.ink2};">${a}</td><td align="right" style="padding:7px 0;border-top:1px solid ${C.rule};"><span style="display:inline-block;width:${w}px;height:10px;border-radius:5px;background:#E2DCCF;"></span></td></tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#F7F4EE;border:1px dashed #CFC6B4;border-radius:8px;"><tr><td style="padding:14px 16px;">${kicker("Pro · The offer", C.amber)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">${r}</table><p style="margin:10px 0 0;font-family:${SANS};font-size:13px;"><a href="${esc(appUrl)}/pricing" style="color:${C.amber};font-weight:600;text-decoration:none;">Get the offer and the message &rarr;</a></p></td></tr></table>`;
}
function resultCell(l: DeskLeague): string {
  const r = l.week?.result;
  if (!r) return `<span style="color:${C.mute};">No result</span>`;
  if (r.kind === "points_rank") return `${ordinal(r.rank)} in pts of ${r.teams}`;
  const strong = (t: string) => `<b style="font-weight:700;color:${C.ink};">${t}</b>`;
  const light = (t: string) => `<span style="font-weight:400;color:${C.mute};">${t}</span>`;
  if (r.won == null) return `T ${fmtScore(r.my)}-${fmtScore(r.opp)}`;
  // Your score first; the winning score bold, the losing score light.
  const tag = `<span style="color:${r.won ? C.green : C.red};">${r.won ? "W" : "L"}</span>`;
  return r.won
    ? `${tag} ${strong(fmtScore(r.my))}${light(`-${fmtScore(r.opp)}`)}`
    : `${tag} ${light(`${fmtScore(r.my)}-`)}${strong(fmtScore(r.opp))}`;
}
function playoffCell(l: DeskLeague): string {
  const w = l.week;
  if (!w || w.playoff_now == null) return `<span style="font:12px ${SANS};color:${C.mute};">${esc(w?.odds_note ? "No odds yet" : l.note ? "No odds" : "No odds")}</span>`;
  const d = playoffDelta(w) ?? 0;
  const arrow = d === 0
    ? `<span style="font:11px ${SANS};color:${C.mute};">no change</span>`
    : `<span style="font:600 11px ${SANS};color:${d > 0 ? C.green : C.red};">${d > 0 ? "&#9650;" : "&#9660;"} ${Math.abs(d)}</span>`;
  return `<span style="font:700 14px ${SANS};color:${C.ink};">${fmtPct(w.playoff_now)}</span> ${arrow}`;
}
function recsCell(n: number, href: string): string {
  if (n === 0) return `<span style="font:12px ${SANS};color:${C.mute};">0 recs</span>`;
  return `<a href="${esc(href)}" style="display:inline-block;font:700 12px ${SANS};color:#fff;background:${C.ink};padding:5px 9px;border-radius:999px;text-decoration:none;white-space:nowrap;">${n} rec${n > 1 ? "s" : ""} &rarr;</a>`;
}
function weekHtml(m: TradeDeskModel, appUrl: string): string {
  const td = (x: string, extra = "") => `<td style="padding:9px 6px 9px 0;border-top:1px solid ${C.rule};${extra}">${x}</td>`;
  const rows = m.leagues
    .map((l) => {
      const rec = l.week ? `${l.week.record.wins}-${l.week.record.losses}${l.week.record.ties ? `-${l.week.record.ties}` : ""}` : "";
      return `<tr>${td(`<div style="font:600 13px/1.3 ${SANS};color:${C.ink};">${esc(l.leagueName)}</div><div style="font:11px ${SANS};color:${C.mute};">${KIND_LABEL[l.kind]}${rec ? ` · ${rec}` : ""}</div>`)}${td(resultCell(l), `font:600 12px ${SANS};color:${C.ink2};white-space:nowrap;`)}${td(playoffCell(l))}<td align="right" style="padding:9px 0;border-top:1px solid ${C.rule};">${recsCell(m.recsByLeague[l.leagueId] ?? 0, `${appUrl}/leagues/${l.leagueId}`)}</td></tr>`;
    })
    .join("");
  const notes = m.leagues.filter((l) => !l.week && l.note).map((l) => `${esc(l.leagueName)}: ${esc(l.note!)}`);
  const swing = biggestSwing(m);
  return card(`${kicker(`Week ${m.resultsWeek} across your ${plural(m.leagues.length, "league")}`)}
${weekHeadline(m) ? h(esc(weekHeadline(m)!), 20, 8) : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;"><tr><td style="padding-bottom:6px;">${kicker("League")}</td><td style="padding:0 6px 6px 0;">${kicker(`Week ${m.resultsWeek}`)}</td><td style="padding:0 6px 6px 0;">${kicker("Playoffs")}</td><td align="right" style="padding-bottom:6px;">${kicker("This week")}</td></tr>${rows}</table>
${swing ? p(esc(swing), 13, C.mute, 10) : ""}${notes.length ? p(notes.join("<br>"), 12, C.mute, 8) : ""}`);
}
function shiftsHtml(m: TradeDeskModel, appUrl: string): string {
  const rows = allShifts(m);
  if (rows.length === 0) return "";
  const body = rows
    .map((s) => {
      const mv = s.from && s.to
        ? `${chip(RANGE_LABEL[s.from], RANGE_TONE[s.from])}<span style="color:${C.mute};font:12px ${SANS};padding:0 3px;">&rarr;</span>${chip(RANGE_LABEL[s.to], RANGE_TONE[s.to])}`
        : chip("Key injury", "red");
      const role = s.role == null ? "" : m.tier === "pro" ? chip(...ROLE[s.role]) : `<span style="display:inline-block;width:52px;height:10px;border-radius:5px;background:#E2DCCF;"></span>`;
      return `<tr><td style="padding:8px 8px 8px 0;border-top:1px solid ${C.rule};"><div style="font:600 13px/1.3 ${SANS};color:${C.ink};">${esc(s.manager)}</div><div style="font:11px/1.3 ${SANS};color:${C.mute};">${esc(s.league)}</div></td><td style="padding:8px 8px 8px 0;border-top:1px solid ${C.rule};line-height:2;">${mv}</td><td style="padding:8px 8px 8px 0;border-top:1px solid ${C.rule};font:12px/1.4 ${SANS};color:${C.ink2};">${esc(s.why)}</td><td align="right" style="padding:8px 0;border-top:1px solid ${C.rule};">${role}</td></tr>`;
    })
    .join("");
  const freeLink = m.tier === "free" ? `<p style="margin:10px 0 0;font:13px ${SANS};"><a href="${esc(appUrl)}/pricing" style="color:${C.amber};font-weight:600;text-decoration:none;">See who is a seller or buyer for you &rarr;</a></p>` : "";
  return card(`${kicker("League shifts since last week")}
${h(esc(shiftsHeadline(rows)), 20, 8)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;"><tr><td style="padding-bottom:6px;">${kicker("Manager")}</td><td style="padding-bottom:6px;">${kicker("Range")}</td><td style="padding-bottom:6px;">${kicker("Why")}</td><td align="right" style="padding-bottom:6px;">${kicker("For you")}</td></tr>${body}</table>
${p(RANGES_LEGEND, 11, C.mute, 10)}${m.tier === "pro" ? p(esc(ROLES_LEGEND), 11, C.mute, 4) : ""}${freeLink}`);
}

export function renderDeskHtml(a: DeskRenderArgs): string {
  const m = a.model;
  const hero = card(`${kicker([m.ownerName, `Week ${m.resultsWeek} is in`, `Week ${m.aheadWeek} ahead`].filter(Boolean).map(esc).join(" · "))}
${h(esc(heroHeadline(m)), 27)}
${p(esc(heroSub(m)), 15)}${m.leagues.length === 0 ? `<div style="margin-top:14px;">${button("Connect Sleeper", `${a.appUrl}/connect`)}</div>` : ""}`, C.gold);
  const cards = m.cards.map((c, i) => tradeCardHtml(c, i, m, a.appUrl)).join("");
  const founder = card(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top" width="46"><div style="width:38px;height:38px;border-radius:19px;background:${C.ink};color:${C.gold};font:700 14px/38px ${SERIF};text-align:center;">I</div></td><td valign="top">${p(`<b style="color:${C.ink};">${esc(founderAsk(m))}</b>`, 15, C.ink2, 0)}${p("Hit reply. One word is fine. I read every reply myself, and the next brief gets built from them.", 13)}${p("Isaiah, founder", 13, C.mute, 8)}</td></tr></table>`);
  const body = hero + cards + (m.leagues.length ? weekHtml(m, a.appUrl) + shiftsHtml(m, a.appUrl) : "") + founder;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Dynasty General weekly brief</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(deskSubject(m))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:20px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.night};border-radius:10px;"><tr><td style="padding:14px 20px;font-family:${MONO};font-size:11px;letter-spacing:.16em;color:${C.gold};font-weight:700;">DYNASTY GENERAL <span style="color:#7E8794;font-weight:400;">· WEEKLY BRIEF · BETA</span></td><td align="right" style="padding:14px 20px;font-family:${MONO};font-size:11px;color:#AEB6C2;">${headerRight(m, a.sendDate)}</td></tr></table></td></tr>
${body}
<tr><td style="padding:6px 4px 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${C.mute};">${esc(METHOD(m))}<br>You get this because you have a Dynasty General account. <a href="${esc(a.unsubscribeUrl)}" style="color:${C.mute};">Unsubscribe</a><br>Dynasty General · ${esc(a.mailingAddress)}</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------- text ----------
export function renderDeskText(a: DeskRenderArgs): string {
  const m = a.model;
  const out: string[] = [];
  out.push(`DYNASTY GENERAL WEEKLY BRIEF (BETA) · ${headerRight(m, a.sendDate)}`, "");
  out.push([m.ownerName, `Week ${m.resultsWeek} is in`, `Week ${m.aheadWeek} ahead`].filter(Boolean).join(" · "));
  out.push(heroHeadline(m), heroSub(m), "");
  if (m.leagues.length === 0) out.push(`Connect Sleeper: ${a.appUrl}/connect`, "");
  m.cards.forEach((c, i) => {
    const v = c.verdict;
    const eff = sellEffect(c);
    out.push(`WORTH TRYING ${i + 1} OF ${m.cards.length} · ${c.leagueName} · ${deadlineChip(c)}`);
    out.push(cardTitle(c));
    out.push(`Playoffs: ${RANGE_LABEL[playoffRange(c.playoffPct)]} (${fmtPct(c.playoffPct)}, ${ordinal(v.league.rank_by_title_odds)} of ${v.league.teams} by odds). Win the league ${fmtPct(v.odds.title_pct)} (fair share is ${Math.round(v.league.fair_title_share * 100)}%). ${sellingLabel(c)}: ${eff.big.replace("&minus;", "-").replace("&lt;", "<")}, ${eff.sub}.`);
    for (const x of c.panel.voices) out.push(`  ${VOICE_NAME[x.voice]} · ${STANCE_LABEL[x.stance]}. ${x.line}`);
    out.push(verdictLine(c), `If it doesn't land: ${fallbackLine(c)}`);
    out.push(m.tier === "pro" ? `Open the offer to ${c.buyer.label}: ${a.appUrl}/leagues/${c.leagueId}/trade` : `Pro: the ready-to-send offer and message. ${a.appUrl}/pricing`, "");
  });
  if (m.leagues.length) out.push(`WEEK ${m.resultsWeek} ACROSS YOUR ${plural(m.leagues.length, "LEAGUE").toUpperCase()}`);
  const wh = weekHeadline(m);
  if (m.leagues.length && wh) out.push(wh);
  for (const l of m.leagues) {
    const w = l.week;
    const r = w?.result;
    const res = !r ? "no result" : r.kind === "points_rank" ? `${ordinal(r.rank)} in pts of ${r.teams}` : `${r.won == null ? "T" : r.won ? "W" : "L"} ${fmtScore(r.my)}-${fmtScore(r.opp)}`;
    const po = w?.playoff_now != null ? `playoffs ${fmtPct(w.playoff_now)}${(playoffDelta(w) ?? 0) !== 0 ? ` (${(playoffDelta(w) ?? 0) > 0 ? "up" : "down"} ${Math.abs(playoffDelta(w) ?? 0)})` : ""}` : "no odds yet";
    const recs = m.recsByLeague[l.leagueId] ?? 0;
    out.push(`  ${l.leagueName} (${KIND_LABEL[l.kind]}${w ? `, ${w.record.wins}-${w.record.losses}` : ""}): ${res}, ${po}, ${plural(recs, "rec")}${!w && l.note ? `. ${l.note}` : ""}`);
  }
  const swing = biggestSwing(m);
  if (swing) out.push(swing);
  const shifts = allShifts(m);
  if (shifts.length) {
    out.push("", "LEAGUE SHIFTS SINCE LAST WEEK", shiftsHeadline(shifts));
    for (const s of shifts) {
      const mv = s.from && s.to ? `${RANGE_LABEL[s.from]} to ${RANGE_LABEL[s.to]}` : "Key injury";
      out.push(`  ${s.manager} (${s.league}): ${mv}. ${s.why}.${m.tier === "pro" && s.role ? ` For you: ${ROLE[s.role][0]}.` : ""}`);
    }
    out.push(RANGES_LEGEND);
    if (m.tier === "pro") out.push(ROLES_LEGEND);
  }
  out.push("", founderAsk(m), "Hit reply. One word is fine. I read every reply myself, and the next brief gets built from them.", "Isaiah, founder", "");
  out.push(METHOD(m), `Unsubscribe: ${a.unsubscribeUrl}`, `Dynasty General · ${a.mailingAddress}`);
  return out.join("\n");
}

export { round5 };
