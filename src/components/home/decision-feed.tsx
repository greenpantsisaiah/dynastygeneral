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
import type {
  DecisionDigest,
  DecisionItem,
  DecisionVoice,
  LineupItem,
  RootForItem,
  ShiftItem,
  SwingItem,
  TradeItem,
  WeekRowItem,
} from "@/lib/decisions/items";
import type { Stance, VoiceName } from "@/lib/strategy/verdict/voices";

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

const pct = (p: number) => `${Math.round(p * 100)}%`;

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
            <span className="min-h-4 text-[11px] text-muted-2">{label}</span>
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
            {item.delivery.emailed && <Chip>In Tuesday&apos;s email</Chip>}
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
        <span className="text-sm text-accent group-open:hidden">Open the analysts and the offer</span>
      </summary>

      <div className="mt-4 flex flex-col gap-3">
        <AnalystScale voices={item.voices} direction={item.direction} />
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
        <div className="flex flex-wrap gap-2.5">
          <Button href={offerHref} primary>
            {item.cta_label}
          </Button>
          <Button href={coachHref}>Talk it through with Coach</Button>
        </div>
        <p className="text-xs text-muted-2">
          Opens this league&apos;s trade view. You send the offer in Sleeper; Dynasty General can&apos;t send trades for
          you.
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

export function WeekTable({
  rows,
  summary,
  week,
  leagueHref,
  recHref,
}: {
  rows: WeekRowItem[];
  summary: string | null;
  week: number;
  leagueHref: (leagueId: string) => string;
  /** Anchor of this league's first card on the home, or the league page. */
  recHref: (leagueId: string) => string;
}) {
  return (
    <section className="rounded-xl border border-border-soft bg-surface p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">
        Week {week} across your {rows.length} league{rows.length === 1 ? "" : "s"}
      </h2>
      {summary && <p className="mt-1 text-sm text-muted">{summary}</p>}
      <ul className="mt-1">
        {rows.map((r) => {
          const change = r.playoffs_change;
          return (
            <li key={r.id} id={r.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-border-soft py-2.5">
              <a href={leagueHref(r.league_id ?? "")} className="min-w-0 text-foreground">
                <span className="block truncate text-sm font-semibold">{r.league_name}</span>
                <span className="text-[11px] text-muted-2">
                  {r.format_record}
                  {r.result ? ` · ${r.result}` : ""}
                </span>
              </a>
              <span className="text-right font-mono text-xs">
                {r.refused_reason ? (
                  <span className="text-muted-2">{r.refused_reason}</span>
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
              ) : (
                <span className="min-w-14 text-right text-xs text-muted-2">0 recs</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-2">Playoff chance, with the change since last week.</p>
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

export function DecisionHome({
  digest,
  items,
  focusId,
  hrefs,
}: {
  digest: DecisionDigest;
  items: DecisionItem[];
  focusId: string | null;
  hrefs: {
    offer: (item: TradeItem) => string;
    coach: (item: TradeItem) => string;
    sleeper: (item: LineupItem) => string;
    league: (leagueId: string) => string;
    item: (item: DecisionItem) => string;
  };
}) {
  const feed = feedItems(items);
  const quiet = quietItems(items);
  const swing = items.find((i): i is SwingItem => i.kind === "swing") ?? null;
  const rows = items.filter((i): i is WeekRowItem => i.kind === "week_row");
  const shifts = items.filter((i): i is ShiftItem => i.kind === "shift");
  const roots = items.filter((i): i is RootForItem => i.kind === "rootfor");
  const focused = focusId ? items.find((i) => i.id === focusId) ?? null : null;
  const firstTrade = feed.find((i) => i.kind === "trade")?.id ?? null;
  const openTrade = focused?.kind === "trade" ? focused.id : firstTrade;

  return (
    <div className="mx-auto grid max-w-6xl gap-7 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <section>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2">{digest.kicker}</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-[42px]">{digest.headline}</h1>
          <p className="mt-3 max-w-2xl text-base text-muted">{digest.subline}</p>
        </section>

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

        <QuietList items={quiet} hrefFor={hrefs.item} />
        <RootForList items={roots} />
      </div>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-4">
        {rows.length > 0 && (
          <WeekTable
            rows={rows}
            summary={digest.week_summary}
            week={rows[0].week}
            leagueHref={hrefs.league}
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
