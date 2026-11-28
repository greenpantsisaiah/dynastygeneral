/**
 * Copy and layout for the Sunday lineup panel (mockup:
 * email-redesign/sunday-lineup-panel.html). The lineup model decides; this
 * file writes each analyst's read, the agree/split box and the action row
 * in kickoff order. Nothing is explained twice: the Strategist owns holes,
 * the Moneyballer owns rate swaps, the Gambler owns the swing game.
 */

import { round5, VOICE_COLOR } from "@/lib/email/trade-desk/model";
import { esc } from "@/lib/email/trade-desk/render";
import { byLock, ctWhen, slotLabel, swingSize, type LeagueLineup, type LineupPanel, type LineupPlayer, type StrategistFix } from "./lineup";

const C = { card: "#FFFFFF", ink: "#15181D", ink2: "#46505E", mute: "#8A919C", rule: "#E6E0D4", goldBg: "#FFF3DB", gold: "#F2A93B" };
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";

/** Swing games smaller than this (playoff-chance points) are not worth naming. */
export const MIN_SWING = 0.05;
/** Most Moneyballer swaps written out; the rest are counted. */
export const MAX_SWAPS_SHOWN = 4;

const fmt1 = (n: number) => n.toFixed(1);
const pct = (p: number) => `${round5(p)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const inLeague = (l: LeagueLineup) => l.leagueName;
const kick = (p: LineupPlayer, asOf: Date) => (p.kickoff ? ctWhen(p.kickoff.at, asOf) : "");
/** "at 3:25 PM" today, "Sun at 12:00 PM" on another day. */
export const atWhen = (d: Date, asOf: Date) => {
  const w = ctWhen(d, asOf);
  return /^[A-Z][a-z]{2} /.test(w) ? `${w.slice(0, 3)} at ${w.slice(4)}` : `at ${w}`;
};
const plays = (p: LineupPlayer, asOf: Date) => (p.kickoff ? atWhen(p.kickoff.at, asOf) : "");
/** League names can end in a period ("12 Man."): never print "12 Man..". */
export const tidy = (t: string) => t.replace(/([^.\s])\.\.(?=\s|$)/g, "$1.");

/** "about 8 in 10" style odds for a chance, capped so it never reads as certain. */
export function inTen(p: number): string {
  if (p >= 0.95) return "better than 9 in 10";
  return `about ${Math.round(p * 10)} in 10`;
}

// ---------- the three reads ----------

export interface VoiceRead {
  title: string;
  lines: string[];
  source: string;
}

function repClause(f: StrategistFix, asOf: Date): string {
  const r = f.replacement;
  if (!r) return "Nobody healthy on that bench fits the slot, so it takes a waiver pickup.";
  const rate = r.ppg && r.ppg.games >= 3 ? ` (${fmt1(r.ppg.raw)} points a game)` : "";
  return `${r.name}${rate} is your best healthy fit on the bench, and he plays ${plays(r, asOf)}.`;
}

/** "A", "A and B", "A, B and C". */
export function andList(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function holeLine(f: StrategistFix, league: string, asOf: Date): string {
  const s = f.starter;
  if (f.kind === "empty") return `Your ${league} lineup has an empty ${slotLabel(f.slot)} slot. ${repClause(f, asOf)}`;
  if (f.kind === "bye") return `${s!.name} is on bye and still in your ${league} lineup. ${repClause(f, asOf)}`;
  const what = s!.injury === "Out" ? "Out" : s!.injury === "IR" ? "on IR" : s!.injury === "Sus" ? "suspended" : s!.injury === "PUP" ? "on the PUP list" : "inactive";
  return `${s!.name} is ${what} and still in your ${league} lineup. ${repClause(f, asOf)}`;
}

type Fx = { f: StrategistFix; l: LeagueLineup };

/** Game-time decisions grouped by kickoff, one player named once across leagues. */
function gameTimeLines(gt: Fx[]): string[] {
  const groups = new Map<string, Fx[]>();
  for (const x of [...gt].sort((a, b) => a.f.inactives!.at.getTime() - b.f.inactives!.at.getTime())) {
    const k = x.f.inactives!.label;
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  const out: string[] = [];
  for (const [label, xs] of groups) {
    const byName = new Map<string, { status: string; leagues: string[] }>();
    for (const { f, l } of xs) {
      const e = byName.get(f.starter!.name) ?? { status: f.starter!.injury ?? "Questionable", leagues: [] };
      e.leagues.push(inLeague(l));
      byName.set(f.starter!.name, e);
    }
    const who = [...byName].map(([n, e]) => `${n}${e.status !== "Questionable" ? ` (${e.status}, ${andList(e.leagues)})` : ` (${andList(e.leagues)})`}`);
    const kickoff = kick(xs[0].f.starter!, xs[0].l.asOf);
    const many = byName.size > 1;
    out.push(`${andList(who)} ${many ? "are" : "is"} Questionable for the ${kickoff} ${many ? "games" : "game"}. Inactives come out ${label} CT, and Sleeper lets you swap ${many ? "each" : "him"} until kickoff.`);
    const steps: string[] = [];
    const none: string[] = [];
    const early: string[] = [];
    for (const { f, l } of xs) {
      const r = f.replacement;
      if (!r) none.push(inLeague(l));
      else if (r.kickoff && r.kickoff.at.getTime() < f.inactives!.at.getTime()) early.push(`${r.name}, your ${inLeague(l)} fallback, plays ${plays(r, l.asOf)}, before those inactives, so that move is a judgment call.`);
      else steps.push(`${r.name} in ${inLeague(l)}`);
    }
    const tail: string[] = [];
    if (steps.length) tail.push(`If ${many ? "one" : "he"} sits, the move is ${andList(steps)}.`);
    tail.push(...early);
    if (none.length) tail.push(`${andList(none)} ${none.length === 1 ? "has" : "have"} no healthy fit on the bench.`);
    out.push(tail.join(" "));
  }
  return out.filter(Boolean);
}

export function strategistRead(leagues: LeagueLineup[]): VoiceRead {
  const all: Fx[] = byLock(leagues).flatMap((l) => l.fixes.map((f) => ({ f, l })));
  const holes = all.filter((x) => x.f.kind !== "game_time").sort((a, b) => (a.f.lock?.getTime() ?? Infinity) - (b.f.lock?.getTime() ?? Infinity));
  const gt = all.filter((x) => x.f.kind === "game_time");
  const lines = [...holes.map(({ f, l }) => holeLine(f, inLeague(l), l.asOf)), ...gameTimeLines(gt)];
  const title = holes.length > 1 ? "Fill the holes first" : holes.length ? "Fill the hole first" : gt.length ? "Watch the inactives" : "No holes to fill";
  return {
    title,
    lines: lines.length ? lines : ["No starter is Out, on IR, on bye or Questionable, and every slot is filled."],
    source: "From Sleeper injury status and this week's kickoff times.",
  };
}

export function moneyballRead(leagues: LeagueLineup[]): VoiceRead {
  const swaps = byLock(leagues).flatMap((l) => l.swaps.map((s) => ({ s, l })));
  const checked = leagues.reduce((n, l) => n + l.checkedSlots, 0);
  const shown = swaps.slice(0, MAX_SWAPS_SHOWN);
  const lines = shown.map(({ s, l }) =>
    `In ${inLeague(l)}, ${s.bench.name} sits at ${fmt1(s.bench.ppg!.raw)} points a game over ${s.bench.ppg!.games} games while ${s.starter.name} starts at ${slotLabel(s.slot)} at ${fmt1(s.starter.ppg!.raw)}. After adjusting for sample size, it is ${inTen(s.p_higher)} that ${s.bench.name}'s rate is the higher one.`,
  );
  if (swaps.length > shown.length) lines.push(`${plural(swaps.length - shown.length, "more swap")} clear${swaps.length - shown.length === 1 ? "s" : ""} the same bar; the buttons below open those lineups.`);
  if (checked > 0) lines.push(`Your other ${plural(checked, "starting slot")} ${checked === 1 ? "holds" : "hold"} up: no healthy bench player clearly outscores the starter.`);
  const title = swaps.length ? `${plural(swaps.length, "slot")} ${swaps.length === 1 ? "leaves" : "leave"} points on the bench` : "Your starters are your best scorers";
  return { title, lines: lines.length ? lines : ["Not enough games played yet to compare starters with the bench."], source: "Points per game from this season's Sleeper scores, shrunk toward the position average. Not a forecast of today: it ignores matchup and role." };
}

export function swingLeague(leagues: LeagueLineup[]): LeagueLineup | null {
  const ranked = leagues.filter((l) => l.swing).sort((a, b) => swingSize(b.swing) - swingSize(a.swing));
  return ranked[0] && swingSize(ranked[0].swing) >= MIN_SWING ? ranked[0] : null;
}

function nextLine(top: LeagueLineup, leagues: LeagueLineup[]): string {
  const next = leagues.filter((l) => l !== top && l.swing).sort((a, b) => swingSize(b.swing) - swingSize(a.swing))[0];
  const care = `If you fix one lineup with care, fix ${top.leagueName}.`;
  if (!next || swingSize(next.swing) < MIN_SWING) return `No other game this week moves your playoff chance by 5 percentage points. ${care}`;
  return `The next biggest swing is ${next.leagueName}, about ${round5(swingSize(next.swing))} percentage points. ${care}`;
}

export function gamblerRead(leagues: LeagueLineup[]): VoiceRead {
  const top = swingLeague(leagues);
  const source = "From 5,000 simulated seasons of each league, rerun with this season's scores.";
  if (!top) {
    return { title: "No single game swings it", lines: ["None of this week's games moves your playoff chance by more than 5 percentage points. Set lineups for points, not for any one game."], source };
  }
  const s = top.swing!;
  const lines = [
    `${top.leagueName} is the game that moves your season. You win ${Math.round(s.win_pct * 100)} of 100 simulated games against ${s.opponent}. A win lifts your playoff chance from ${pct(s.playoff_now)} to ${pct(s.playoff_if_win)}, and a loss drops it to ${pct(s.playoff_if_loss)}.`,
    nextLine(top, leagues),
  ];
  return { title: `Play for ${top.leagueName}`, lines, source };
}

// ---------- agree / split, headline ----------

export function agreeLine(leagues: LeagueLineup[]): string {
  const holes = leagues.flatMap((l) =>
    l.fixes.filter((f) => f.kind !== "game_time").map((f) => (f.kind === "empty" ? `filling the empty ${slotLabel(f.slot)} slot in ${l.leagueName}` : `benching ${f.starter!.name} in ${l.leagueName}`)),
  );
  const swaps = leagues.flatMap((l) => l.swaps.map(() => l.leagueName));
  const top = swingLeague(leagues);
  const parts: string[] = [];
  if (holes.length) parts.push(`All 3 agree on ${holes.length > 3 ? `the ${holes.length} holes the Strategist named` : andList(holes)}.`);
  if (swaps.length && top) {
    parts.push(swaps.includes(top.leagueName)
      ? `They split on the rest: the Moneyballer would make ${plural(swaps.length, "swap")}, and the Gambler backs the one in ${top.leagueName}.`
      : `They split on the rest: the Moneyballer would make ${plural(swaps.length, "swap")}, while the Gambler only cares about ${top.leagueName}.`);
  } else if (swaps.length) {
    parts.push(`The Moneyballer adds ${plural(swaps.length, "swap")}; no single game moves your season enough for the Gambler to pick one.`);
  } else if (top) {
    parts.push(`Nothing on your benches clearly beats a starter, so the Gambler's ${top.leagueName} game is where to spend your care.`);
  }
  return tidy(parts.length ? parts.join(" ") : "All 3 agree: your lineups are set.");
}

/** Fix (a hole or swap), Check (only inactives to watch) or Open (the swing game). */
export function actionVerb(l: LeagueLineup): "Fix" | "Check" | "Open" {
  if (l.swaps.length || l.fixes.some((f) => f.kind !== "game_time")) return "Fix";
  return l.fixes.length ? "Check" : "Open";
}

export function panelHeadline(p: LineupPanel): string {
  const n = p.leagues.reduce((s, l) => s + l.fixes.filter((f) => f.kind !== "game_time").length + l.swaps.length, 0);
  // The headline's clock is the first hole or swap, not a game-time fallback.
  const locks = p.leagues.flatMap((l) => [...l.fixes.filter((f) => f.kind !== "game_time").map((f) => f.lock), ...l.swaps.map((x) => x.lock)].filter((d): d is Date => !!d).map((d) => ({ d, asOf: l.asOf })));
  const first = locks.sort((x, y) => x.d.getTime() - y.d.getTime())[0];
  const top = swingLeague(p.leagues);
  const a = n ? (first ? `${plural(n, "lineup fix", "lineup fixes")} before ${ctWhen(first.d, first.asOf)}.` : `${plural(n, "lineup fix", "lineup fixes")} to make.`) : "Your lineups are set.";
  if (!top) return a;
  const coin = top.swing!.win_pct >= 0.4 && top.swing!.win_pct <= 0.6;
  return tidy(`${a} ${top.leagueName} is ${coin ? "your coin flip" : "the game that moves your season"}.`);
}

// ---------- layout ----------

const kicker = (t: string) => `<div style="font-family:${MONO};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.mute};">${t}</div>`;
const VOICES = [
  { key: "strategist" as const, name: "The Strategist", letter: "S" },
  { key: "moneyball" as const, name: "The Moneyballer", letter: "M" },
  { key: "gambler" as const, name: "The Gambler", letter: "G" },
];

export interface PanelArgs {
  panel: LineupPanel;
  /** Sleeper lineup link for a league. */
  lineupHref: (leagueId: string) => string;
}

export function reads(p: LineupPanel): VoiceRead[] {
  return [strategistRead(p.leagues), moneyballRead(p.leagues), gamblerRead(p.leagues)].map((r) => ({ ...r, title: tidy(r.title), lines: r.lines.map(tidy) }));
}

/** Leagues with something to do, in the order they lock; the Gambler's league joins even if set. */
export function actionLeagues(p: LineupPanel): LeagueLineup[] {
  const top = swingLeague(p.leagues);
  return byLock(p.leagues).filter((l) => l.fixes.length || l.swaps.length || l === top);
}

export function renderPanelHtml(a: PanelArgs): string {
  const rs = reads(a.panel);
  const rows = VOICES.map((v, i) => {
    const r = rs[i];
    const color = VOICE_COLOR[v.key];
    const body = r.lines.map((t) => `<p style="margin:5px 0 0;font:14px/1.55 ${SANS};color:${C.ink2};">${esc(t)}</p>`).join("");
    return `<tr><td valign="top" width="40" style="padding:14px 12px 14px 0;border-top:1px solid ${C.rule};"><div style="width:32px;height:32px;border-radius:16px;background:${color};color:#fff;font:700 13px/32px ${SANS};text-align:center;">${v.letter}</div></td>
<td style="padding:14px 0;border-top:1px solid ${C.rule};"><div style="font:700 14px ${SANS};color:${C.ink};">${v.name} <span style="font-weight:400;color:${C.mute};">·</span> <span style="color:${color};">${esc(r.title)}</span></div>${body}<p style="margin:5px 0 0;font:11px/1.4 ${SANS};color:${C.mute};">${esc(r.source)}</p></td></tr>`;
  }).join("");
  const agree = agreeLine(a.panel.leagues);
  const [lead, ...rest] = agree.split(/(?<=\.) /);
  const box = `<table role="presentation" width="100%" style="margin-top:12px;background:${C.goldBg};border-radius:8px"><tr><td style="padding:12px 14px;font:13px/1.5 ${SANS};color:${C.ink2};"><b style="color:${C.ink}">${esc(lead)}</b>${rest.length ? ` ${esc(rest.join(" "))}` : ""}</td></tr></table>`;
  const acts = actionLeagues(a.panel);
  // Inline blocks, not table cells, so seven leagues wrap on a phone.
  const buttons = acts.length
    ? `<div style="margin-top:14px">${kicker("Open each lineup in Sleeper, in kickoff order")}</div><div style="margin-top:8px">${acts
        .map((l) => {
          const verb = actionVerb(l);
          const sub = l.lock ? `locks ${ctWhen(l.lock, l.asOf)}` : "nothing to fix";
          return `<div style="display:inline-block;vertical-align:top;margin:0 8px 10px 0;"><a href="${esc(a.lineupHref(l.leagueId))}" style="display:inline-block;font:700 12px ${SANS};color:#fff;background:${C.ink};padding:8px 11px;border-radius:7px;text-decoration:none;white-space:nowrap;">${verb} ${esc(l.leagueName)} &rarr;</a><div style="font:11px ${SANS};color:${C.mute};margin-top:3px;">${sub}</div></div>`;
        })
        .join("")}</div>`
    : "";
  return `<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-radius:10px;"><tr><td style="padding:22px;">${kicker("The three analysts on your lineups")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${rows}</table>${box}${buttons}</td></tr></table></td></tr>`;
}

export function renderPanelText(a: PanelArgs): string {
  const rs = reads(a.panel);
  const out: string[] = ["THE THREE ANALYSTS ON YOUR LINEUPS"];
  VOICES.forEach((v, i) => {
    out.push(`${v.name} · ${rs[i].title}`);
    for (const l of rs[i].lines) out.push(`  ${l}`);
    out.push(`  (${rs[i].source})`);
  });
  out.push("", agreeLine(a.panel.leagues), "");
  const acts = actionLeagues(a.panel);
  if (acts.length) {
    out.push("OPEN EACH LINEUP IN SLEEPER, IN KICKOFF ORDER");
    for (const l of acts) out.push(`  ${actionVerb(l)} ${l.leagueName}${l.lock ? ` (locks ${ctWhen(l.lock, l.asOf)})` : ""}: ${a.lineupHref(l.leagueId)}`);
  }
  return out.join("\n");
}

// ---------- the app's copy of the panel (/home) ----------

/**
 * The same lineup panel the Game Day email renders, as plain data for the
 * app. Every sentence comes from the functions above, so /home and the
 * email never word a lineup call differently.
 */
export interface LineupDesk {
  week: number;
  headline: string;
  sub: string;
  reads: Array<VoiceRead & { voice: "strategist" | "moneyball" | "gambler"; name: string; letter: string }>;
  agree: string;
  /** Leagues to open in Sleeper, in kickoff order. */
  actions: Array<{ leagueId: string; leagueName: string; verb: "Fix" | "Check" | "Open"; when: string }>;
  /** True when a hole or a swap is on the table (not just a swing game to watch). */
  hasFix: boolean;
  skipped: string | null;
}

/** The line under the headline, shared by the Game Day email and /home. */
export function heroSubLine(p: LineupPanel): string {
  const n = p.leagues.length;
  const top = swingLeague(p.leagues);
  const fixes = p.leagues.some((l) => l.fixes.length || l.swaps.length);
  if (!fixes && !top) return `Your three analysts read all ${n} lineups. Nothing to change before kickoff.`;
  return `Your three analysts read all ${n} lineups as they stand now. They agree on the holes and split on what matters most.`;
}

export function buildLineupDesk(p: LineupPanel): LineupDesk | null {
  if (p.leagues.length === 0) return null;
  const rs = reads(p);
  return {
    week: p.week,
    headline: panelHeadline(p),
    sub: heroSubLine(p),
    reads: VOICES.map((v, i) => ({ ...rs[i], voice: v.key, name: v.name, letter: v.letter })),
    agree: agreeLine(p.leagues),
    actions: actionLeagues(p).map((l) => ({
      leagueId: l.leagueId,
      leagueName: l.leagueName,
      verb: actionVerb(l),
      when: l.lock ? `locks ${ctWhen(l.lock, l.asOf)}` : "nothing to fix",
    })),
    hasFix: p.leagues.some((l) => l.swaps.length || l.fixes.some((f) => f.kind !== "game_time")),
    skipped: p.skipped.length ? `Not read: ${p.skipped.map((s) => `${s.leagueName} (${s.reason})`).join(", ")}.` : null,
  };
}
