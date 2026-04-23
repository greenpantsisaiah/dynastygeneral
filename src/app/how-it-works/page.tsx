import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";

export const metadata = {
  title: "How It Works · Dynasty Copilot",
  description:
    "How the engine reads your Sleeper league, ranks strategy paths, and produces one decision per pick. Walkthrough of the snapshot, the windows, the Decision card, the contender outlook, and the coach.",
};

export default function HowItWorksPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-4xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
            <Ticker label="How it works · the engine, end to end" />
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              One engine. Five surfaces. One decision per pick.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              The product reads your Sleeper league once per session and turns
              the raw state into one synthesized take. No multi-tab dashboard.
              No tab-flipping. Just the call you needed to make.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-4xl px-6 py-16">
            <Step
              n={1}
              title="The Snapshot"
              kicker="What we read from Sleeper"
            >
              <p>
                Each session pulls your league directly from the Sleeper API:
                rosters, draft state, traded picks, opponent owners, league
                format (1QB / superflex / TE-premium), and the current pick
                schedule. We never store league data on a server. Each pick
                triggers a fresh read; the snapshot lives only as long as the
                page does.
              </p>
              <p>
                Mid-draft, picks live in `/draft/{`{`}draft_id{`}`}/picks`,
                NOT on the roster object. We merge them so your team appears
                with the players you've actually drafted, not the players you
                started the day with.
              </p>
            </Step>

            <Step
              n={2}
              title="The Strategy Engine"
              kicker="Archetypes, drift, win-now vs future"
            >
              <p>
                Seventeen dynasty archetypes (RB Bellcow, Robust RB, QB
                Cartel, WR Stockpiler, TE Premium Anchor, Productive Tank,
                etc.) are scored against your roster shape. Each archetype
                has signals (e.g. "owns 3+ top-12 RBs") and a horizon score.
                The strongest fit becomes your "lean."
              </p>
              <p>
                In parallel, two windows are computed: CAN-WIN-NOW (0-100,
                are you a contender this year) and FUTURE-EARNED-VALUE
                (0-100, what's locked in for next year). You declare a target
                weighting (e.g. 65/35 lean win-now); we show you whether
                each next pick keeps you on plan or drifts you off it.
              </p>
            </Step>

            <Step
              n={3}
              title="The Decision Card"
              kicker="One synthesized take per pick"
            >
              <p>
                When the draft is live and you're approaching a pick, the
                engine produces ONE Decision card. It synthesizes window
                weighting + roster needs + pick density (back-to-back? long
                wait?) + path commitment + scarcity into a single TAKE
                with a primary recommendation, two alternatives, and the
                reasoning that ties them together.
              </p>
              <p>
                We explicitly killed the "show every signal as its own panel"
                pattern. Multi-panel sprawl was the thing we were replacing,
                not extending.
              </p>
            </Step>

            <Step
              n={4}
              title="The Contender Outlook"
              kicker="5-year trajectory in one card"
            >
              <p>
                The killer dynasty insight: it's not "are you good now,"
                it's "does your trajectory land you in a contender window."
                The outlook ages your roster forward year by year using
                position-specific age curves, materializes your future
                picks as expected-value rookies in the year they'll land,
                and scores each future season as Rebuild / Bubble /
                Contender.
              </p>
              <p>
                If you traded current value for a 2027 pick stash, the
                outlook shows you 2026 as Rebuild but 2028 and 2029 as
                Contender. With a single look you know: hold the picks,
                don't trade them away for marginal current production.
              </p>
            </Step>

            <Step
              n={5}
              title="The Coach"
              kicker="Conversational, with full context"
            >
              <p>
                Every chat turn includes a fresh `current_state` block (your
                roster, the system_decision the card just produced, the
                window frame, your pick schedule). The coach is told that
                this block is the authoritative truth for the turn and that
                the system_decision is its OWN standing call, not a separate
                authority. No more "the system recommended X but I think Y."
                The coach IS the system.
              </p>
              <p>
                The coach can also reach the open web (KTC pricing, recent
                injury news, named-pro commentary) when the question
                genuinely requires fresh context. Rate-limited and
                budget-capped so a single conversation can't burn the day.
              </p>
            </Step>

            <Step
              n={6}
              title="Defensibility, by design"
              kicker="The assumption auditor"
            >
              <p>
                Every embedded constant in the product (pick decay rates,
                age curves, archetype thresholds, rookie hit rates) is
                audited against published research and KTC market pricing
                by a four-voice review (538-style statistician, dynasty
                pro, NFL coaching staff, sharp gambler). When a constant
                drifts away from market consensus, we recalibrate and
                document the source.
              </p>
              <p>
                We tell you when we're guessing, when we're anchored, and
                when the model can't see something the question depends on.
                The product would rather say "I don't know that" than
                fabricate.
              </p>
            </Step>
          </div>
        </section>

        <section className="border-b border-border-soft bg-surface/30">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <h2 className="text-3xl font-semibold text-foreground">
              See it on your league
            </h2>
            <p className="mt-3 text-muted">
              Connect your Sleeper username. We pull your dynasty leagues and
              show you the engine's read on each one. No signup, no payment.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/connect"
                className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Try with your Sleeper account
              </Link>
              <Link
                href="/built-by"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface px-6 text-sm font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
              >
                Who built this →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Step({
  n,
  kicker,
  title,
  children,
}: {
  n: number;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid border-t border-border-soft py-8 md:grid-cols-[8rem_1fr] md:gap-8 md:py-10 first:border-0">
      <div className="md:pt-1">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          Step {n}
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {kicker}
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {title}
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted sm:text-base">
          {children}
        </div>
      </div>
    </div>
  );
}
