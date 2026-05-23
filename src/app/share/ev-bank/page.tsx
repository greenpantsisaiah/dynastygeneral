import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";

/**
 * Public share page for an EV bank rank moment. The shareable URL
 * carries the user's rank, league size, and total EV banked in the
 * query string (?rank=4&total=12&ev=87.1&league=name). Anyone with
 * the URL sees the card; the data is whatever the sharer chose to
 * encode.
 *
 * The sibling `opengraph-image.tsx` reads the same query params to
 * generate a 1200x630 OG image so social platforms unfurl with the
 * shareable card preview.
 */

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const sp = await searchParams;
  const rank = pickInt(sp.rank);
  const total = pickInt(sp.total);
  const ev = pickFloat(sp.ev);
  const league = pickString(sp.league) ?? "their dynasty league";
  const title =
    rank != null && total != null
      ? `Ranked ${ordinal(rank)} of ${total} in EV banked · Dynasty General`
      : "EV bank rank · Dynasty General";
  const description =
    rank != null && total != null && ev != null
      ? `${ordinal(rank)} of ${total} in ${league}. ${ev >= 0 ? "+" : ""}${ev.toFixed(1)} EV banked. Scored by the engine: EV = (value/100) × (pick − ADP).`
      : "Dynasty General EV bank rank card.";
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShareEvBankPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rank = pickInt(sp.rank);
  const total = pickInt(sp.total);
  const ev = pickFloat(sp.ev);
  const league = pickString(sp.league);

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 pt-14 pb-10 sm:pt-20">
            <Ticker label="Shared · EV bank rank" />
            {rank != null && total != null && ev != null ? (
              <>
                <h1 className="mt-6 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
                  {ordinal(rank)} of {total}{" "}
                  <span className="text-muted">in EV banked</span>
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
                  {league ? <>League: {league}. </> : null}
                  <span
                    className={
                      ev >= 0 ? "text-success" : "text-danger"
                    }
                  >
                    {ev >= 0 ? "+" : ""}
                    {ev.toFixed(1)} EV
                  </span>{" "}
                  banked. Scored by the Dynasty General engine.
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-2">
                  EV per pick is{" "}
                  <code className="font-mono">(value / 100) × (pick − ADP)</code>
                  . Positive picks bank value the engine thinks the market
                  underpriced. Negative picks are sharp locks the engine
                  thinks paid premium for scarcity.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
                  <a href="/rankings" className="hover:text-foreground">
                    Tune the model →
                  </a>
                  <a href="/methodology" className="hover:text-foreground">
                    Methodology →
                  </a>
                  <a href="/scoreboard" className="hover:text-foreground">
                    Backtest scoreboard →
                  </a>
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
                  No EV bank card here.
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
                  This share link is missing its rank, total, or EV value.
                  Generate a fresh one from the EV bank section of your
                  league hub.
                </p>
              </>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function pickString(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
function pickInt(v: string | string[] | undefined): number | null {
  const s = pickString(v);
  if (s == null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
function pickFloat(v: string | string[] | undefined): number | null {
  const s = pickString(v);
  if (s == null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
