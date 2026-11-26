import { analyst, type AnalystKey } from "@/components/landing/analysts";

/**
 * A labeled SAMPLE of the weekly brief's trade card. Illustrative
 * numbers only (no real league, no real managers), in the same shape the
 * real brief renders: deadline chip, three stat tiles, where the three
 * analysts land on one scale, the verdict, and the fallback.
 */

const STANCES = ["Sell now", "Lean sell", "Split", "Lean keep", "Keep going"] as const;

const PLACEMENT: Record<AnalystKey, number> = {
  strategist: 0,
  moneyballer: 1,
  gambler: 4,
};

const LINES: { key: AnalystKey; stance: string; text: string }[] = [
  {
    key: "strategist",
    stance: "Sell now",
    text: "He keeps about half his value through one offseason. A buyer who just lost his WR1 is the best price you will see.",
  },
  {
    key: "moneyballer",
    stance: "Lean sell",
    text: "Keeps about 9 value points and gives up 3 points of title chance. Selling comes out slightly ahead.",
  },
  {
    key: "gambler",
    stance: "Keep going",
    text: "15% beats a fair share of 10%. Don't hand a rival the receiver who beats you in Week 16.",
  },
];

export function SampleTradeCard() {
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Sample · Worth trying · 1 of 2
        </div>
        <span className="rounded-full border border-border-strong px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Closes Thu 7:15 PM CT
        </span>
      </div>
      <p className="mt-3 text-lg font-semibold leading-snug text-foreground">
        Offer your 32-year-old WR1 to the manager who just lost his.
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Tile label="Playoffs" value="70%" note="In the hunt" />
        <Tile label="Win the league" value="15%" note="fair share 10%" />
        <Tile label="Title if you sell" value="12%" note="down 3 points" />
      </div>

      <div className="mt-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          Where the three analysts land
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1 text-center">
          {STANCES.map((label, col) => {
            const here = (Object.keys(PLACEMENT) as AnalystKey[]).filter(
              (k) => PLACEMENT[k] === col,
            );
            return (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="flex min-h-[44px] flex-col items-center justify-end gap-1">
                  {here.map((k) => (
                    <Dot key={k} k={k} />
                  ))}
                </div>
                <div className="h-px w-full bg-border-strong" />
                <span className="text-[10px] leading-tight text-muted-2">{label}</span>
              </div>
            );
          })}
        </div>
        <ul className="mt-4 space-y-2.5">
          {LINES.map((l) => {
            const a = analyst(l.key);
            return (
              <li key={l.key} className="flex gap-2.5 text-sm leading-snug">
                <Dot k={l.key} />
                <span className="text-muted">
                  <span className="font-semibold text-foreground">
                    {a.name.replace("The ", "")} · {l.stance}.
                  </span>{" "}
                  {l.text}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 rounded-md border border-border-strong bg-surface-2 px-3 py-3 text-sm">
        <span className="font-semibold text-foreground">
          2 of 3 lean sell, if the price is right.
        </span>{" "}
        <span className="text-muted">
          Open by asking for full value: about 14 on our 0 to 100 scale. If it doesn&apos;t land, two other
          managers are short a WR.
        </span>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-2">
        Illustrative numbers · real briefs use 5,000 simulated seasons of your
        league
      </p>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-md border border-border-soft bg-surface-2 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-2">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-2">{note}</div>
    </div>
  );
}

function Dot({ k }: { k: AnalystKey }) {
  const a = analyst(k);
  return (
    <span
      aria-label={a.name}
      title={a.name}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: a.color }}
    >
      {a.initial}
    </span>
  );
}
