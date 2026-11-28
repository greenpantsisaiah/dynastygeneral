/**
 * The multi-league home ("the app is home, the email is the teaser",
 * founder direction 2026-11-26; round-4 mockup on the design canvas).
 *
 * Pure renderer over the shared DecisionItem list in
 * src/lib/decisions/items.ts. It never words anything itself: every
 * sentence comes from the builder, so the home and the weekly emails say
 * the same thing. An email button links to /home?item={id}; that item is
 * rendered opened and highlighted, and the page scrolls to its anchor.
 */

import type { ReactNode } from "react";
import { ClientCopy } from "@/components/decision/client-copy";
import { fmtPct } from "@/lib/email/trade-desk/league-week";
import type {
  DecisionDigest,
  DecisionItem,
  DecisionVoice,
  LeagueCallItem,
  LineupItem,
  RootForItem,
  ShiftItem,
  SwingItem,
  TradeItem,
  WeekRowItem,
} from "@/lib/decisions/items";
import type { Stance, VoiceName } from "@/lib/strategy/verdict/voices";
import type { LineupDesk } from "@/lib/email/game-day/panel";
import type { RoomRead, TeamTile } from "@/lib/decisions/character";

export type { TeamTile };

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

/** One cast everywhere: same names and colors as the email (off the red/green axis). */
export const ANALYST: Record<VoiceName, { name: string; letter: string; color: string }> = {
  strategist: { name: "Strategist", letter: "S", color: "#7C5CC4" },
  moneyball: { name: "Moneyballer", letter: "M", color: "#2A6FB8" },
  gambler: { name: "Gambler", letter: "G", color: "#C76A12" },
};

const COLUMN: Record<Stance, number> = { sell: 0, lean_sell: 1, split: 2, lean_push: 3, push: 4 };
const SCALE_LABELS = {
  sell: ["Sell now", "Lean sell", "Split", "Lean keep", "Keep going"],
  buy: ["Pass", "Lean pass", "Split", "Lean buy", "Buy"],
} as const;

const FOR_YOU_LABEL = { seller: "Seller", buyer: "Buyer", rival: "Rival" } as const;
const FOR_YOU_CLASS = { seller: "text-warning", buyer: "text-accent", rival: "text-danger" } as const;
const RANGE_LABEL = {
  favorite: "Favorite",
  in_the_hunt: "In the hunt",
  bubble: "Bubble",
  long_shot: "Long shot",
  no_chance: "No chance",
} as const;

/** Same rounding as the email (and the trade card tile), so one league shows one number. */
const pct = fmtPct;

/** Items that the home shows in the "Needs you" column, most urgent first. */
export function feedItems(items: DecisionItem[]): Array<TradeItem | LineupItem> {
  return items
    .filter((i): i is TradeItem | LineupItem => (i.kind === "trade" || i.kind === "lineup") && i.delivery.emailed)
    .sort((a, b) => b.priority - a.priority);
}

/** Items worth knowing that did not clear the email bar. */
export function quietItems(items: DecisionItem[]): Array<TradeItem | LineupItem> {
  return items
    .filter((i): i is TradeItem | LineupItem => (i.kind === "trade" || i.kind === "lineup") && !i.delivery.emailed)
    .sort((a, b) => b.priority - a.priority);
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-2">{children}</p>;
}

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "deadline" }) {
  return (
    <span
      className={
        tone === "deadline"
          ? "rounded-full bg-warning/15 px-2.5 py-0.5 text-xs text-warning"
          : "rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-muted"
      }
    >
      {children}
    </span>
  );
}

function AnalystDot({ voice }: { voice: VoiceName }) {
  const a = ANALYST[voice];
  return (
    <span
      aria-hidden
      className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full font-mono text-[11px] font-semibold text-white"
      style={{ background: a.color }}
    >
      {a.letter}
    </span>
  );
}

/** Five columns; analysts who share a column stack vertically, never overlap. */
export function AnalystScale({ voices, direction }: { voices: DecisionVoice[]; direction: "sell" | "buy" }) {
  const labels = SCALE_LABELS[direction];
  return (
    <div>
      <p className="text-xs text-muted-2">Where the three analysts land</p>
      <div className="mt-1 grid grid-cols-5 border-t-2 border-border-strong pt-2 text-center">
        {labels.map((label, col) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span className="min-h-4 px-0.5 text-[10px] leading-tight text-muted-2 sm:text-[11px]">{label}</span>
            {voices
              .filter((v) => COLUMN[v.stance] === col)
              .map((v) => (
                <span key={v.voice} title={`${ANALYST[v.voice].name}: ${v.stance_label}`}>
                  <AnalystDot voice={v.voice} />
                </span>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Button({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      className={
        primary
          ? "inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-semibold text-background"
          : "inline-flex min-h-11 items-center rounded-lg border border-border-strong px-4 text-foreground"
      }
    >
      {children}
    </a>
  );
}

export function TradeCard({
  item,
  open,
  focused,
  offerHref,
  coachHref,
}: {
  item: TradeItem;
  open: boolean;
  focused: boolean;
  offerHref: string;
  coachHref: string;
}) {
  return (
    <details
      id={item.id}
      open={open}
      className={`group scroll-mt-4 rounded-xl bg-surface p-5 ${
        focused ? "border-2 border-accent ring-4 ring-accent/15" : "border border-border-strong"
      }`}
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Kicker>{item.kicker}</Kicker>
          <span className="flex flex-wrap gap-2">
            {item.emailed_at ? (
              <Chip>As emailed {emailedDay(item.emailed_at)}</Chip>
            ) : (
              item.delivery.emailed && <Chip>In Tuesday&apos;s email</Chip>
            )}
            {item.deadline_label && <Chip tone="deadline">{item.deadline_label}</Chip>}
          </span>
        </div>
        <h3 className="font-serif text-2xl font-semibold leading-tight sm:text-[28px]">{item.title}</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {item.stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-surface-2 p-3">
              <p className="text-xs text-muted-2">{s.label}</p>
              <p className="mt-0.5 font-mono text-xl">{s.value}</p>
              {s.sub && <p className="text-xs text-muted">{s.sub}</p>}
            </div>
          ))}
        </div>
        <span className="text-sm text-accent group-open:hidden">{item.voices.length > 0 ? "Open the analysts and the offer" : "Open the offer"}</span>
      </summary>

      <div className="mt-4 flex flex-col gap-3">
        {item.voices.length > 0 && <AnalystScale voices={item.voices} direction={item.direction} />}
        <ul className="space-y-2 text-sm">
          {item.voices.map((v) => (
            <li key={v.voice} className="flex gap-2.5">
              <AnalystDot voice={v.voice} />
              <span>
                <b style={{ color: ANALYST[v.voice].color }}>
                  {ANALYST[v.voice].name} · {v.stance_label}.
                </b>{" "}
                <span className="text-muted">{v.line}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-border-strong bg-background/40 p-3.5">
          <p className="font-semibold">{item.verdict}</p>
          <p className="mt-1.5 text-sm text-muted">
            <b className="text-foreground">If it doesn&apos;t land:</b> {item.if_it_doesnt_land}
          </p>
          {item.package_note && <p className="mt-1.5 text-sm text-muted-2">{item.package_note}</p>}
        </div>
        {item.offer && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">Message to {item.manager}</p>
              <ClientCopy text={item.offer.message} variant="prominent" label="Copy message" />
            </div>
            <p className="mt-2 text-sm text-foreground">{item.offer.message}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2.5">
          <Button href={offerHref} primary>
            {item.cta_label}
          </Button>
          <Button href={coachHref}>Talk it through with Coach</Button>
        </div>
        <p className="text-xs text-muted-2">
          {item.offer
            ? `Opens this deal in the trade check. When ${item.manager} answers, change it to their counter and check it again: you get take it, counter or pass, and a reply to send. `
            : "Opens this league's trade view. "}
          You send the offer in Sleeper; Dynasty General can&apos;t send trades for you.
        </p>
      </div>
    </details>
  );
}

export function LineupCard({ item, focused, sleeperHref }: { item: LineupItem; focused: boolean; sleeperHref: string }) {
  return (
    <article
      id={item.id}
      className={`scroll-mt-4 flex flex-col gap-2.5 rounded-xl bg-surface p-5 ${
        focused ? "border-2 border-accent ring-4 ring-accent/15" : "border border-border-strong"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Kicker>Lineup fix · {item.league_name}</Kicker>
        {item.deadline_label && <Chip tone="deadline">{item.deadline_label}</Chip>}
      </div>
      <h3 className="font-serif text-xl font-semibold leading-snug sm:text-2xl">{item.detail}</h3>
      <p className="text-sm text-muted">{item.options_line}</p>
      <div>
        <Button href={sleeperHref} primary>
          {item.cta_label}
        </Button>
      </div>
      <p className="text-xs text-muted-2">
        Bench options are ranked by season average, not a weekly projection. Status comes from Sleeper&apos;s injury
        report. Dynasty General can&apos;t change Sleeper lineups for you.
      </p>
    </article>
  );
}

export function QuietList({ items, hrefFor }: { items: Array<TradeItem | LineupItem>; hrefFor: (i: DecisionItem) => string }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-border-soft bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">Only in the app</h2>
        <span className="text-xs text-muted-2">Worth knowing, not worth an email</span>
      </div>
      <ul>
        {items.map((i) => (
          <li key={i.id} id={i.id} className="flex scroll-mt-4 gap-3 border-t border-border-soft py-3 first:mt-2">
            <span className="w-24 flex-none font-mono text-[11px] uppercase text-muted-2">
              {i.kind === "trade" ? "Trade idea" : "Lineup"} · {i.league_name}
            </span>
            <span className="flex-1 text-sm">{i.title}</span>
            <a href={hrefFor(i)} className="flex-none text-sm text-accent">
              Open
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** App only: one compact call per league with no trade card, so every league says what to do and why. */
export function LeagueCallCard({
  item,
  focused,
  leagueHref,
}: {
  item: LeagueCallItem;
  focused: boolean;
  /** null on the league's own page, where a link back to it is noise. */
  leagueHref: string | null;
}) {
  return (
    <article
      id={item.id}
      className={`rounded-xl border bg-surface p-4 ${focused ? "border-accent" : "border-border-soft"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Kicker>{item.league_name}</Kicker>
        <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-foreground">{item.stance_label}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug text-foreground">{item.title}</h3>
      <p className="mt-1 font-mono text-[11px] text-muted-2">{item.context}</p>
      <p className="mt-2 text-sm text-muted">{item.reason}</p>
      {item.voices.length > 0 && (
        <details className="mt-2 group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-2 hover:text-foreground">
            <span className="flex -space-x-1">
              {item.voices.map((v) => (
                <AnalystDot key={v.voice} voice={v.voice} />
              ))}
            </span>
            What the three analysts say
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {item.voices.map((v) => (
              <li key={v.voice} className="text-sm text-muted">
                <span className="font-semibold" style={{ color: ANALYST[v.voice].color }}>
                  {ANALYST[v.voice].name} · {v.stance_label}.
                </span>{" "}
                {v.line}
              </li>
            ))}
          </ul>
        </details>
      )}
      {leagueHref && (
        <a href={leagueHref} className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">
          Open {item.league_name} →
        </a>
      )}
    </article>
  );
}

export function WeekTable({
  rows,
  summary,
  week,
  leagueHref,
  recHref,
  calls,
  allLeaguesHref,
}: {
  rows: WeekRowItem[];
  /** The app-only call per league, so a league with no rec still says what to do. */
  calls: LeagueCallItem[];
  allLeaguesHref: string;
  summary: string | null;
  week: number;
  leagueHref: (leagueId: string) => string;
  /** Anchor of this league's first card on the home, or the league page. */
  recHref: (leagueId: string) => string;
}) {
  return (
    <section className="rounded-xl border border-border-soft bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">
          Week {week} across your {rows.length} league{rows.length === 1 ? "" : "s"}
        </h2>
        <a href={allLeaguesHref} className="shrink-0 text-xs text-accent hover:underline">
          All my leagues →
        </a>
      </div>
      {summary && <p className="mt-1 text-sm text-muted">{summary}</p>}
      <ul className="mt-1">
        {rows.map((r) => {
          const change = r.playoffs_change;
          const call = calls.find((c) => c.league_id === r.league_id) ?? null;
          return (
            <li key={r.id} id={r.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-border-soft py-2.5">
              <a href={leagueHref(r.league_id ?? "")} className="group min-w-0 text-foreground">
                <span className="block truncate text-sm font-semibold group-hover:underline">
                  {r.league_name} <span className="text-muted-2">›</span>
                </span>
                <span className="text-[11px] text-muted-2">
                  {r.format_record}
                  {r.result ? ` · ${r.result}` : ""}
                </span>
              </a>
              <span className="text-right font-mono text-xs">
                {r.refused_reason ? (
                  <span className="text-muted-2">No read</span>
                ) : r.playoffs != null ? (
                  <>
                    {pct(r.playoffs)}
                    {change != null && change !== 0 && (
                      <span className={`block text-[11px] ${change > 0 ? "text-success" : "text-danger"}`}>
                        {change > 0 ? "▲" : "▼"} {Math.abs(change)}
                      </span>
                    )}
                  </>
                ) : null}
              </span>
              {r.recs > 0 ? (
                <a href={recHref(r.league_id ?? "")} className="min-w-14 rounded-full bg-foreground px-2.5 py-1 text-center text-xs font-semibold text-background">
                  {r.recs} rec{r.recs === 1 ? "" : "s"} →
                </a>
              ) : call ? (
                <a href={`#${call.id}`} className="min-w-14 rounded-full border border-border-strong px-2.5 py-1 text-center text-xs text-foreground hover:border-foreground">
                  {call.stance_label}
                </a>
              ) : (
                <span className="min-w-14" aria-hidden />
              )}
              {r.refused_reason && <p className="col-span-3 text-xs text-muted">{r.refused_reason}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-2">Playoff chance, with the change since last week. Tap a league to open it.</p>
    </section>
  );
}

export function ShiftList({ shifts, summary }: { shifts: ShiftItem[]; summary: string | null }) {
  if (shifts.length === 0 || !summary) return null;
  return (
    <section className="rounded-xl border border-border-soft bg-surface p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">League shifts since last Tuesday</h2>
      <p className="mt-1 text-sm text-muted">{summary}</p>
      <ShiftRows shifts={shifts.filter((s) => s.delivery.emailed)} />
      {shifts.some((s) => !s.delivery.emailed) && (
        <details className="border-t border-border-soft pt-2">
          <summary className="cursor-pointer text-sm text-accent">
            {shifts.filter((s) => !s.delivery.emailed).length} more teams moved
          </summary>
          <ShiftRows shifts={shifts.filter((s) => !s.delivery.emailed)} />
        </details>
      )}
      <p className="mt-2 text-[11px] text-muted-2">
        Ranges: Favorite 80%+ playoffs, In the hunt 50-80, Bubble 25-50, Long shot 2-25, No chance under 2%.
      </p>
    </section>
  );
}

function ShiftRows({ shifts }: { shifts: ShiftItem[] }) {
  return (
      <ul className="mt-1">
        {shifts.map((s) => (
          <li key={s.id} id={s.id} className="scroll-mt-4 border-t border-border-soft py-2.5 text-sm">
            <div className="flex justify-between gap-2">
              <span>
                <b>{s.manager}</b> <span className="text-muted-2">{s.league_name}</span>
              </span>
              {s.for_you && (
                <span className={`text-xs font-semibold ${FOR_YOU_CLASS[s.for_you]}`}>{FOR_YOU_LABEL[s.for_you]}</span>
              )}
            </div>
            <p className="font-mono text-[11px] text-muted">
              {s.range_from && s.range_to && s.range_from !== s.range_to
                ? `${RANGE_LABEL[s.range_from]} → ${RANGE_LABEL[s.range_to]}`
                : "Key injury"}
            </p>
            <p className="text-muted">{s.cause}</p>
          </li>
        ))}
      </ul>
  );
}

export function SwingCard({ item }: { item: SwingItem }) {
  const max = Math.max(1, ...item.margin_bins);
  const half = item.margin_bins.length / 2;
  return (
    <section id={item.id} className="scroll-mt-4 rounded-xl border border-border-strong bg-surface p-5">
      <Kicker>Your swing game · {item.league_name}</Kicker>
      <h3 className="mt-1 font-serif text-2xl font-semibold leading-tight">{item.title}</h3>
      <div className="mt-3 flex h-16 items-end gap-0.5" aria-hidden>
        {item.margin_bins.map((b, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t-sm ${i >= half ? "bg-success" : "bg-surface-2"}`}
            style={{ height: `${(b / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-2">
        <span>you lose · {100 - item.win_of_100} of 100</span>
        <span className="text-success">you win · {item.win_of_100} of 100</span>
      </div>
    </section>
  );
}

export function RootForList({ items }: { items: RootForItem[] }) {
  if (items.length === 0) return null;
  const call = { root_for: "Root for", root_against: "Root against", wash: "Wash" } as const;
  const tone = { root_for: "text-success", root_against: "text-danger", wash: "text-muted" } as const;
  return (
    <section className="rounded-xl border border-border-soft bg-surface p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">Root for, root against</h2>
      <ul className="mt-1">
        {items.map((r) => (
          <li key={r.id} id={r.id} className="grid grid-cols-[64px_1fr_auto] items-baseline gap-2 border-t border-border-soft py-2 text-sm">
            <span className="font-mono text-[11px] text-muted-2">{r.deadline_label}</span>
            <span>
              <b>{r.player_name}</b>{" "}
              <span className="text-[11px] text-muted-2">
                you start {r.you_start}, they start {r.they_start}
              </span>
            </span>
            <span className={`text-xs font-semibold ${tone[r.call]}`}>{call[r.call]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * This week's lineups: the Game Day panel (three analysts on every lineup),
 * the same copy the Sunday email prints, with a button per league that
 * opens the lineup in Sleeper. Lineups are the decision that comes back
 * every week, so on a week with no trade worth trying this leads the page.
 */
export function LineupDeskCard({ desk, sleeperHref }: { desk: LineupDesk; sleeperHref: (leagueId: string) => string }) {
  return (
    <section id="lineups" className="scroll-mt-4 flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Kicker>Week {desk.week} lineups · the three analysts</Kicker>
        {desk.hasFix && <Chip tone="deadline">Fix before kickoff</Chip>}
      </div>
      <ul className="flex flex-col">
        {desk.reads.map((r) => (
          <li key={r.voice} className="flex gap-3 border-t border-border-soft py-3 first:border-t-0 first:pt-0">
            <AnalystDot voice={r.voice} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {ANALYST[r.voice].name} <span className="font-normal text-muted-2">·</span>{" "}
                <span style={{ color: ANALYST[r.voice].color }}>{r.title}</span>
              </p>
              {r.lines.map((t, i) => (
                <p key={i} className="mt-1 text-sm text-muted">
                  {t}
                </p>
              ))}
              <p className="mt-1 text-xs text-muted-2">{r.source}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-foreground">{desk.agree}</p>
      {desk.actions.length > 0 && (
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">Open each lineup in Sleeper, in kickoff order</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {desk.actions.map((a) => (
              <div key={a.leagueId} className="flex flex-col gap-1">
                <Button href={sleeperHref(a.leagueId)} primary={a.verb === "Fix"}>
                  {a.verb} {a.leagueName} →
                </Button>
                <span className="text-xs text-muted-2">{a.when}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {desk.skipped && <p className="text-xs text-muted-2">{desk.skipped}</p>}
      <p className="text-xs text-muted-2">Dynasty General can&apos;t change Sleeper lineups for you; each button opens that lineup.</p>
    </section>
  );
}

/**
 * Leagues where the call is "nothing to do this week", one line each
 * (Isaiah 2026-11-28: a home full of do-nothing cards reads as nothing to
 * do). Each row keeps the call's reason and the three analysts one tap
 * away, and keeps its item id so email links and the week table land here.
 */
export function QuietCalls({ calls, focusId, leagueHref, heading }: { calls: LeagueCallItem[]; focusId: string | null; leagueHref: (id: string) => string; heading: string }) {
  if (calls.length === 0) return null;
  return (
    <section className="rounded-xl border border-border-soft bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">{heading}</h2>
        <span className="text-xs text-muted-2">Tap a league for the reason and the analysts</span>
      </div>
      <ul className="mt-2">
        {calls.map((c) => (
          <li key={c.id} className="border-t border-border-soft">
            <details id={c.id} open={c.id === focusId} className={`group scroll-mt-4 py-3 ${c.id === focusId ? "rounded-md ring-2 ring-accent/40" : ""}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-foreground">{c.league_name}</span>
                <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs text-foreground">{c.stance_label}</span>
                <span className="font-mono text-[11px] text-muted-2">{c.context}</span>
              </summary>
              <p className="mt-2 text-sm text-foreground">{c.title}</p>
              <p className="mt-1 text-sm text-muted">{c.reason}</p>
              {c.voices.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {c.voices.map((v) => (
                    <li key={v.voice} className="text-sm text-muted">
                      <span className="font-semibold" style={{ color: ANALYST[v.voice].color }}>
                        {ANALYST[v.voice].name} · {v.stance_label}.
                      </span>{" "}
                      {v.line}
                    </li>
                  ))}
                </ul>
              )}
              <a href={leagueHref(c.league_id ?? "")} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
                Open {c.league_name} →
              </a>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One team's character on /home (built by src/lib/decisions/character.ts). */
/** Width for a probability bar: never zero, so a "<2%" still shows a sliver. */
const barWidth = (p: number) => `${Math.max(3, Math.min(100, p * 100))}%`;

function OddsMeter({ label, value, tone }: { label: string; value: { pct: number; label: string }; tone: "accent" | "success" }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-3xl font-semibold leading-none tabular-nums text-foreground">{value.label}</span>
      <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">{label}</span>
      <div className="h-1.5 rounded-full bg-surface-2" role="img" aria-label={`${label} ${value.label}`}>
        <div className={`h-1.5 rounded-full ${tone === "success" ? "bg-success" : "bg-accent"}`} style={{ width: barWidth(value.pct) }} />
      </div>
    </div>
  );
}

/** A position group's league rank as a strip of one dot per team, yours marked. */
function RoomMeter({ label, room, tone }: { label: string; room: RoomRead; tone: "success" | "warning" }) {
  const dots = Array.from({ length: Math.min(room.total, 20) }, (_, i) => i + 1);
  const mark = tone === "success" ? "bg-success" : "bg-warning";
  return (
    <div className="flex items-center gap-2 text-xs" aria-label={`${label}: ${room.position}, ${ordinal(room.rank)} of ${room.total}`}>
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-2">{label}</span>
      <span className="w-7 shrink-0 font-semibold text-foreground">{room.position}</span>
      <span className="flex min-w-0 flex-1 items-center justify-between" aria-hidden>
        {dots.map((d) => (
          <span key={d} className={d === room.rank ? `h-2.5 w-2.5 rounded-full ${mark}` : "h-1.5 w-1.5 rounded-full bg-border-strong"} />
        ))}
      </span>
      <span className="w-12 shrink-0 text-right tabular-nums text-muted">
        {ordinal(room.rank)}/{room.total}
      </span>
    </div>
  );
}

function RivalRow({ r }: { r: NonNullable<TeamTile["rival"]> }) {
  const gb = r.gamesBack;
  const badge =
    gb > 0
      ? { text: `${gb} GB`, cls: "border-warning/50 text-warning" }
      : gb < 0
        ? { text: `${-gb} up`, cls: "border-success/50 text-success" }
        : { text: "Level", cls: "border-border-strong text-muted" };
  const row = (who: string, record: string, pct: number, label: string, mine: boolean) => (
    <div className="flex items-center gap-2 text-xs">
      <span className={`min-w-0 flex-1 truncate ${mine ? "font-semibold text-foreground" : "text-foreground"}`}>{who}</span>
      <span className="w-10 shrink-0 whitespace-nowrap tabular-nums text-muted">{record}</span>
      <span className="h-1.5 w-16 shrink-0 rounded-full bg-surface-2 sm:w-24">
        <span className={`block h-1.5 rounded-full ${mine ? "bg-accent" : "bg-muted-2"}`} style={{ width: barWidth(pct) }} />
      </span>
      <span className="w-10 shrink-0 text-right tabular-nums text-foreground">{label}</span>
    </div>
  );
  return (
    <div className="mt-3 rounded-lg border border-border-soft bg-background/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {r.favorite ? "Title favorite · top threat" : "Top rival · title race"}
        </span>
        <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] tabular-nums ${badge.cls}`}>{badge.text}</span>
      </div>
      <div className="flex flex-col gap-1">
        {row("You", r.myRecord, r.myTitlePct, r.myTitleLabel, true)}
        {row(r.manager, r.record, r.titlePct, r.titleLabel, false)}
      </div>
    </div>
  );
}

/** Teams shown before "Show N more": the best title odds first, so the races that matter lead. */
const TEAMS_SHOWN = 3;

function TeamTileCard({ t, href }: { t: TeamTile; href: string }) {
  return (
    <li className="rounded-xl border border-border-soft bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <a href={href} className="min-w-0 font-semibold text-foreground hover:text-accent">
          {t.leagueName}
        </a>
        {t.chip && <span className="shrink-0 rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-foreground">{t.chip}</span>}
      </div>
      {t.note && <p className="mt-1 text-xs text-muted">{t.note}</p>}
      {(t.playoff || t.title) && (
        <div className="mt-3 grid grid-cols-2 gap-4">
          {t.playoff && <OddsMeter label="Playoffs" value={t.playoff} tone="success" />}
          {t.title && <OddsMeter label="Win it all" value={t.title} tone="accent" />}
        </div>
      )}
      {(t.best || t.thinnest) && (
        <div className="mt-3 flex flex-col gap-1.5">
          {t.best && <RoomMeter label="Best" room={t.best} tone="success" />}
          {t.thinnest && <RoomMeter label="Thinnest" room={t.thinnest} tone="warning" />}
        </div>
      )}
      {t.rival && <RivalRow r={t.rival} />}
    </li>
  );
}

/**
 * "Your teams": who each team is and who it is chasing, numbers first. The
 * app's origin is characterizing your teams; the decisions below read as the
 * next step for a team you can see. Tiles are built by `teamTile`
 * (`src/lib/decisions/character.ts`); this only draws them.
 */
export function YourTeams({ teams, leagueHref }: { teams: TeamTile[]; leagueHref: (id: string) => string }) {
  if (teams.length === 0) return null;
  return (
    <section id="your-teams" className="flex flex-col gap-2">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">Your teams · who they are, who they chase</h2>
      <ul className="grid gap-2">
        {teams.slice(0, TEAMS_SHOWN).map((t) => (
          <TeamTileCard key={t.leagueId} t={t} href={leagueHref(t.leagueId)} />
        ))}
      </ul>
      {teams.length > TEAMS_SHOWN && (
        <details className="group">
          <summary className="cursor-pointer list-none py-1 text-sm text-accent">
            <span className="group-open:hidden">Show {teams.length - TEAMS_SHOWN} more {teams.length - TEAMS_SHOWN === 1 ? "team" : "teams"}</span>
            <span className="hidden group-open:inline">Show fewer teams</span>
          </summary>
          <ul className="mt-2 grid gap-2">
            {teams.slice(TEAMS_SHOWN).map((t) => (
              <TeamTileCard key={t.leagueId} t={t} href={leagueHref(t.leagueId)} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function DecisionHome({
  digest,
  items,
  focusId,
  hrefs,
  lineups = null,
  teams = [],
}: {
  digest: DecisionDigest;
  items: DecisionItem[];
  focusId: string | null;
  /** This week's lineup panel (the Game Day email's three-analyst read), when one could be built. */
  lineups?: LineupDesk | null;
  /** Each team's character line and top rival, shown before the decisions. */
  teams?: TeamTile[];
  hrefs: {
    offer: (item: TradeItem) => string;
    coach: (item: TradeItem) => string;
    sleeper: (item: LineupItem) => string;
    league: (leagueId: string) => string;
    item: (item: DecisionItem) => string;
    allLeagues: string;
  };
}) {
  const feed = feedItems(items);
  const quiet = quietItems(items);
  const swing = items.find((i): i is SwingItem => i.kind === "swing") ?? null;
  const rows = items.filter((i): i is WeekRowItem => i.kind === "week_row");
  const shifts = items.filter((i): i is ShiftItem => i.kind === "shift");
  const roots = items.filter((i): i is RootForItem => i.kind === "rootfor");
  const calls = items
    .filter((i): i is LeagueCallItem => i.kind === "league_call")
    .sort((a, b) => b.priority - a.priority);
  const actCalls = calls.filter((c) => c.actionable);
  const quietCalls = calls.filter((c) => !c.actionable);
  const focused = focusId ? items.find((i) => i.id === focusId) ?? null : null;
  // With no trade card, the week's lineups are the decision: they lead the
  // page and own the headline. The digest's trade headline moves under it.
  const lineupsLead = !!lineups && feed.length === 0;
  const headline = lineupsLead ? lineups!.headline : digest.headline;
  const subline = lineupsLead ? `${lineups!.sub} ${digest.headline}` : digest.subline;
  const lineupCard = lineups ? <LineupDeskCard desk={lineups} sleeperHref={(id) => `https://sleeper.com/leagues/${encodeURIComponent(id)}/team`} /> : null;
  const firstTrade = feed.find((i) => i.kind === "trade")?.id ?? null;
  const openTrade = focused?.kind === "trade" ? focused.id : firstTrade;

  return (
    <div className="mx-auto grid max-w-6xl gap-7 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">{digest.kicker}</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-[42px]">{headline}</h1>
          <p className="mt-3 max-w-2xl text-base text-muted">{subline}</p>
        </section>

        <YourTeams teams={teams} leagueHref={hrefs.league} />

        {lineupsLead && lineupCard}

        {swing && <SwingCard item={swing} />}

        {feed.length > 0 && (
          <h2 className="-mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">
            Needs you · soonest deadline first
          </h2>
        )}
        {feed.map((i) =>
          i.kind === "trade" ? (
            <TradeCard
              key={i.id}
              item={i}
              open={i.id === openTrade}
              focused={i.id === focusId}
              offerHref={hrefs.offer(i)}
              coachHref={hrefs.coach(i)}
            />
          ) : (
            <LineupCard key={i.id} item={i} focused={i.id === focusId} sleeperHref={hrefs.sleeper(i)} />
          ),
        )}

        {!lineupsLead && lineupCard}

        <QuietList items={quiet} hrefFor={hrefs.item} />

        {actCalls.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">
              {feed.length > 0 ? "Your other leagues · the analysts' call" : "Your leagues · the analysts' call"}
            </h2>
            {actCalls.map((c) => (
              <LeagueCallCard key={c.id} item={c} focused={c.id === focusId} leagueHref={hrefs.league(c.league_id ?? "")} />
            ))}
          </section>
        )}
        <QuietCalls
          calls={quietCalls}
          focusId={focusId}
          leagueHref={hrefs.league}
          heading={actCalls.length + feed.length > 0 ? "No trade move this week in your other leagues" : "No trade move this week"}
        />
        <RootForList items={roots} />
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-4">
        {rows.length > 0 && (
          <WeekTable
            rows={rows}
            summary={digest.week_summary}
            week={rows[0].week}
            leagueHref={hrefs.league}
            calls={calls}
            allLeaguesHref={hrefs.allLeagues}
            recHref={(leagueId) => {
              const first = feed.find((i) => i.league_id === leagueId);
              return first ? `#${first.id}` : hrefs.league(leagueId);
            }}
          />
        )}
        <ShiftList shifts={shifts} summary={digest.shifts_summary} />
      </aside>
    </div>
  );
}

/** "Tue Nov 24" in Central time, for the "As emailed" chip. */
function emailedDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" });
}
