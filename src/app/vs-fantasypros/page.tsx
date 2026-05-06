import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";

export const metadata = {
  title: "Dynasty General vs FantasyPros",
  description:
    "Dynasty General is a calibrated dynasty intelligence engine. We publish our backtest accuracy. We synthesize one decision per pick. We respect your league format. Comparison page reflecting public product observation.",
  alternates: { canonical: "/vs-fantasypros" },
};

export default function VsFantasyProsPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
            <Ticker label="Comparison · public product observation as of 2026-05-06" />
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              FantasyPros gives you a hundred opinions. Dynasty General gives you one decision.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
              FantasyPros is a content and tools platform. Dynasty General is
              an intelligence engine. Different categories. Different
              philosophies. If you're picking between us, here's what the
              two products actually do.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              We publish our accuracy. They don't.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Calibrated prediction is the moat. We backtest against named
              industry baselines and publish the result. Engine v0 (no
              signal codes loaded yet) achieves a Spearman rank correlation
              of 0.399 averaged across 2022-2024 dynasty cumulative
              outcomes. The named consensus baselines we tested against
              landed at 0.346 to 0.365 in the same window.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              FantasyPros has internal expert-accuracy data (we can see it
              in their experts dropdown: "2024 Draft Accuracy Top 20",
              "2025 In-Season Accuracy Top 20"). They use it to filter
              their consensus blend. They never publish the per-expert
              calibration scores or the blend's accuracy.
            </p>
            <p className="mt-4 text-base">
              <Link
                href="/scoreboard"
                className="underline text-foreground"
              >
                See the scoreboard
              </Link>
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              One decision per pick. Not four tabs.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              FantasyPros' DraftWizard exposes Suggestions, Cheat Sheets,
              Draft Board, and Pick Predictor as four separate tabs. Each
              tab shows a different angle on the same pick. The user does
              the synthesis.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Dynasty General delivers one Decision Card per pick. The
              card synthesizes window, density, format constraints, roster
              fit, and three-source consensus (engine + market + ADP) into
              one TAKE with WHY and TRADEOFF. The reasoning is shown; the
              decision is decisive.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Format-aware. Down to keeper count.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              FantasyPros does not publish dynasty Superflex ADP. Their
              dynasty ADP is a 2-source consensus. Their cheat sheet tier
              breaks are CSS styling, not data. Their "Should I Trade"
              tool ranks 4 selected players by expert opinion but does not
              accept a "what I give vs what I get" trade as posed.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Dynasty General reads your league format off Sleeper
              automatically. Superflex, keeper count, max keepers, scoring
              type, roster shape: all first-class inputs. The Coach honors
              format-rules constraints in every analysis. Trade math
              respects the format multiplier on picks.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Coach won't make things up.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              When our LLM Coach doesn't have the data to answer, it tells
              you. Then it asks for what's missing. That refusal IS the
              feature. The system prompt has explicit context contracts:
              format rules, pricing blocks, named-roster grounding,
              three-layer guards against hallucinated trade math. If the
              guards trip, the Coach injects a [GUARD] notice rather than
              guess.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Generic chatbots optimize for fluent answers. Calibrated
              prediction optimizes for honest answers. We chose the second.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              No browser extension required.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              FantasyPros' DraftWizard recommends installing a browser
              extension to sync with Sleeper drafts. Dynasty General reads
              Sleeper directly via their public API. One Sleeper username,
              done.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Where they win
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              FantasyPros has a content and SEO footprint we won't try to
              match: news, articles, podcasts, weekly notes by position,
              waiver advice, sleeper picks, bust calls, draft kit. Every
              fantasy tool you'd want exists somewhere on their site. If
              breadth is the priority, they're the right pick.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              We compete on depth, decisive synthesis, and calibrated
              prediction. If you've already decided you want an analyst on
              your dynasty league, not a content library, we're built for
              you.
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-3xl px-6 py-12">
            <div className="rounded-lg border border-border-soft bg-surface px-6 py-5 text-xs leading-relaxed text-muted-2">
              <p>
                Updated 2026-05-06. Dynasty General is not affiliated
                with, endorsed by, or sponsored by FantasyPros or Marzen
                Media LLC. Comparative product claims on this page reflect
                public product observation made on 2026-05-05 from a paid
                FantasyPros 3-day trial; product behavior may have changed
                since that date. Backtest accuracy figures cite{" "}
                <Link href="/scoreboard" className="underline">
                  /scoreboard
                </Link>{" "}
                methodology. FantasyPros is a trademark of Marzen Media
                LLC, used here for comparative reference under nominative
                fair use.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
