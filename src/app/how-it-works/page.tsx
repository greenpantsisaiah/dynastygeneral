import Image from "next/image";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";

export const metadata = {
  title: "How It Works",
  description:
    "How Dynasty General reads your Sleeper league, ranks strategy paths, and produces one decision per pick. Walkthrough of the snapshot, windows, Decision card, Contender Outlook, and the coach.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
            <Ticker label="How it works · the engine, end to end" />
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              One engine. One decision per pick. Five years of trajectory.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">
              The product reads your league once per session and turns the raw
              state into one synthesized take. No multi-tab dashboard. No
              tab-flipping. Sleeper today, MyFantasyLeague next; the engine
              under the hood is the same. The screenshots below are the live
              app on real dynasty leagues.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 py-16 space-y-20">
            <Step
              n={1}
              title="The Snapshot"
              kicker="What we read from your fantasy host"
              imageSrc="/marketing/league-hub.png"
              imageAlt="League hub showing Do or Dynasty league with snapshot, windows, and contender outlook"
            >
              <p>
                Each session pulls your league directly from the host's API:
                rosters, draft state, traded picks, opponent owners, league
                format (1QB / superflex / TE-premium), and your full pick
                schedule. Sleeper is live today; MyFantasyLeague support is
                shipping next via the same engine. We never store league data
                on a server. Each pick triggers a fresh read; the snapshot
                lives only as long as the page does.
              </p>
              <p>
                Mid-draft, picks live on the host's draft endpoint, NOT on the
                roster object. We merge them so your team appears with what
                you've actually drafted, not what you started the day with.
              </p>
            </Step>

            <Step
              n={2}
              title="Windows + Contender Outlook"
              kicker="Direction this year, trajectory five years out"
              imageSrc="/marketing/contender-outlook.png"
              imageAlt="Contender Outlook showing 5-year forecast with 2030 peak and protect-the-window bullets"
              reverse
            >
              <p>
                Two windows are computed: CAN-WIN-NOW and FUTURE-EARNED-VALUE,
                both 0-100. You declare a target weighting (e.g. 65/35 lean
                win-now); we show you whether each next pick keeps you on plan
                or drifts you off it.
              </p>
              <p>
                Below it, the killer dynasty insight: the Contender Outlook.
                Your roster aged forward year by year using position-specific
                age curves (RB cliff at 27, WR through 30, TE through 33, QB
                into late 30s), with future picks materialized as expected-
                value rookies in the year they'll land. Each year banded as
                Rebuild / Bubble / Contender. The TAKE names your contender
                window. The PROTECT bullets name the picks that fund it.
              </p>
            </Step>

            <Step
              n={3}
              title="The Decision Card"
              kicker="One synthesized take per pick, with PLAYS FROM HERE"
              imageSrc="/marketing/decision-card.png"
              imageAlt="Decision card with Plays From Here move-level options and Live Strategy Board paths"
            >
              <p>
                When the draft is live, the engine produces ONE Decision
                card. PLAYS FROM HERE shows move-level options at this exact
                moment with window deltas, payoff odds, and what to watch
                for. Below it, the Live Strategy Board: every dynasty
                archetype scored against your roster shape, with your
                drift toward each path updating pick-by-pick.
              </p>
              <p>
                We explicitly killed the "show every signal as its own panel"
                pattern. Multi-panel sprawl was the thing we were replacing,
                not extending.
              </p>
            </Step>

            <Step
              n={4}
              title="The Decision Quadrant"
              kicker="Top candidates by win-now × confidence"
              imageSrc="/marketing/decision-quadrant.png"
              imageAlt="Decision Quadrant with ranked candidates by win-now horizon and confidence"
              reverse
            >
              <p>
                For each pick, the top 12+ candidates plotted on a 2D map:
                horizon (win-now vs future) on one axis, confidence on the
                other. Top-left = take if you're chasing this year. Top-right
                = take if you're building. Bottom = lower confidence, real
                risk.
              </p>
              <p>
                Each candidate carries the reasoning inline: "Best available
                RB," "Horizon anchor: youngest reasonable available," "Real
                risk." The MY LEAN tag points at the engine's primary call.
                You can disagree; the quadrant shows you exactly what you're
                trading off.
              </p>
            </Step>

            <Step
              n={5}
              title="Opponent Characterizations"
              kicker="The League Spectrum"
              imageSrc="/marketing/opponent-spectrum.png"
              imageAlt="League Spectrum showing all 12 teams plotted by strategy lean and expected value"
            >
              <p>
                Every team in your league plotted on Strategy × Value. Punted
                rebuilders bottom-left. Stockpiled-future leaning teams
                middle-left. Win-now contenders top-right. Dot size = our
                confidence in the read. You see at a glance which managers
                are buyers, which are sellers, and where you sit relative to
                the room.
              </p>
              <p>
                Click a team to see what they actually IS right now (not what
                they think they are), with named trade angles based on the
                gap between their build and yours.
              </p>
            </Step>

            <Step
              n={6}
              title="The Coach + Defensibility"
              kicker="Conversational, with full context, audited assumptions"
            >
              <p>
                Every chat turn includes a fresh context block (your roster,
                the system_decision the card just produced, the window
                frame, your pick schedule). The coach IS the system. No
                "the system recommended X but I think Y" splits.
              </p>
              <p>
                The coach can also reach the open web (KTC, recent injury
                news, named-pro commentary) when the question genuinely
                requires fresh context. Every embedded constant in the
                product (pick decay rates, age curves, archetype thresholds,
                rookie hit rates) is audited against published research and
                KTC market pricing by a four-voice review (statistician,
                dynasty pro, NFL coaching staff, sharp gambler) before it
                ships. We tell you when we're guessing, when we're anchored,
                and when the model can't see something the question
                depends on.
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
              Connect your Sleeper account today (MyFantasyLeague support
              ships next). We pull your dynasty leagues and show you the
              engine's read on each one. Free tier covers one league.
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
    </>
  );
}

function Step({
  n,
  kicker,
  title,
  children,
  imageSrc,
  imageAlt,
  reverse,
}: {
  n: number;
  kicker: string;
  title: string;
  children: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={`grid gap-8 lg:grid-cols-2 lg:items-start ${
        reverse ? "lg:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div className="lg:max-w-xl">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          Step {n}
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {kicker}
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
          {title}
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted sm:text-base">
          {children}
        </div>
      </div>
      {imageSrc && imageAlt && (
        <div className="overflow-hidden rounded-lg border border-border-soft bg-surface/30">
          <Image
            src={imageSrc}
            alt={imageAlt}
            width={1200}
            height={900}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
