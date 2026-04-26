import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";

export const metadata = {
  title: "Built By",
  description:
    "The story behind Dynasty General. An intelligence-analyst's take on dynasty fantasy: you are the general; the product is the analyst team.",
  alternates: { canonical: "/built-by" },
};

export default function BuiltByPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
            <Ticker label="Built by · the founder + the philosophy" />
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              You're the general. We're the analyst team.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted">
              Dynasty General is built by a former intelligence analyst who
              spent years briefing generals, CEOs, and Shark Tank investors.
              The job was the same every time: take a flood of raw signals,
              compress them into one clear take, and put the decision in
              front of the person who has to make it.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              That's the product, applied to dynasty fantasy football.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-16">
            <Section title="Why dynasty">
              <p>
                Dynasty rewards the manager who sees a year ahead and acts
                on it before the league catches up. The best dynasty
                players are running an intelligence operation: they read
                opponents, time the market, hold capital for the right
                window, and refuse to chase noise. Most tools treat
                dynasty like redraft with longer ADP windows. It isn't.
              </p>
              <p>
                The hard part of dynasty isn't finding information. It's
                producing conviction in the moment a leverage window
                opens, when you have ninety seconds to send the trade or
                draft the player. Generic AI assistants are too vague.
                Rankings sites are too static. Trade calculators don't
                understand your build.
              </p>
              <p>
                We built the thing that synthesizes everything we know
                about your league, your roster, your opponents, and your
                window into one decision per moment. The product never
                says "it depends" or "here are several factors." It
                makes the call, cites the evidence, and tells you what
                tradeoff you're accepting.
              </p>
            </Section>

            <Section title="The intelligence-analyst frame">
              <p>
                A briefing for a four-star is not a list of every
                possible thing that might happen. It's the one most
                likely outcome, the two leading alternatives, the
                evidence supporting each, and the explicit assumption
                that would have to be wrong for the call to be wrong.
                That's the format because the consumer of the briefing
                has thirty seconds and ten other decisions to make today.
              </p>
              <p>
                Dynasty managers also have thirty seconds and ten other
                decisions to make today. The Decision card is built to
                that brief.
              </p>
            </Section>

            <Section title="What we won't do">
              <p>
                We won't ship a recommendation we can't defend with
                evidence. Every constant in the engine (pick decay
                rates, age curves, archetype thresholds) is audited
                against published research and KTC market pricing. When
                the product is wrong, we say so. When the data isn't
                there to make a call, we say that too.
              </p>
              <p>
                We won't cluttered-dashboard the product. The whole
                point is removing the weight of choosing what to look at.
              </p>
              <p>
                We won't fake personality. The voice is decisive because
                analysts are decisive. We don't soften takes to seem
                friendly.
              </p>
            </Section>

            <Section title="What's on the workbench">
              <p>
                The Soundboard. Today the engine has one preset: the
                sharp dynasty intelligence analyst the founder spent
                two decades being. We're refactoring the buried
                weights (gamble vs analyst, age preference, tier-cliff
                sensitivity, trade aggression) into named dials you
                can hold yourself. Run a more aggressive gambler. A
                patient builder. An old-school coach who values anchor
                RBs over young upside. Or bolt on your own theory of
                divisional difficulty, O-line tier, or coach grades as
                a custom criterion the engine then weights into every
                recommendation.
              </p>
              <p>
                Trade-impact simulator. If you trade these three R1s
                for Bijan, here's what your 2028 contender outlook
                looks like. Class-strength overlays. The engine knows
                the 2027 rookie class is bid up; soon it will know
                which positions in that class.
              </p>
              <p>
                And a long list of things we will not ship until they
                meet the standard.
              </p>
            </Section>
          </div>
        </section>

        <section className="bg-surface/30">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <h2 className="text-3xl font-semibold text-foreground">
              See the engine on your league
            </h2>
            <p className="mt-3 text-muted">
              Sleeper today, MyFantasyLeague next. Connect your Sleeper account
              to see it on real leagues. Free tier covers one league.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Link
                href="/connect"
                className="inline-flex h-12 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110 sm:h-11 sm:w-auto"
              >
                Try with your Sleeper account
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex h-12 w-full items-center justify-center rounded-md border border-border-strong bg-surface px-6 text-sm font-medium text-foreground transition hover:border-accent/60 hover:text-accent sm:h-11 sm:w-auto"
              >
                How the engine works →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border-soft py-8 first:border-0 first:pt-0">
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted sm:text-base">
        {children}
      </div>
    </div>
  );
}
