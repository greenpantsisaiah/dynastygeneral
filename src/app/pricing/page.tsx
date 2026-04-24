import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getOptionalUser } from "@/lib/auth/session";
import { isBetaOpenMode } from "@/lib/billing/beta-mode";

export const metadata = {
  title: "Pricing",
  description:
    "Dynasty Copilot pricing. AI-powered trade analysis, pick recommendations, strategy coaching, and scout reports for Sleeper dynasty leagues.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const user = await getOptionalUser();
  const isAuthed = Boolean(user);
  const isPro = user?.tier === "pro";
  const beta = isBetaOpenMode();

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16 text-center">
            <Ticker
              label={beta ? "Beta · everything's open" : "Pricing · clear"}
            />
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {beta
                ? "Beta is open. Support us if you can."
                : "Free for one league. Pro for everything else."}
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-lg leading-relaxed text-muted">
              {beta
                ? "Every signed-in user gets the killer features (Coach, Briefings, Multi-pick rollout, Contender Outlook) during alpha/beta. Hosting and our AI engine cost real money. We bill so the lights stay on, not to lock features behind a wall. Pro tier exists for testers who want to support the project and lock in early-bird pricing before we tighten things up post-beta."
                : "14-day free trial of Pro. No card required to start. Cancel anytime in one click."}
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto grid max-w-5xl gap-6 px-6 py-12 lg:grid-cols-2">
            <PlanCard
              tier={beta ? "Free · beta" : "Free"}
              price="$0"
              cadence={beta ? "with you on the journey" : "forever"}
              tagline={
                beta
                  ? "During beta: every killer feature open. Sign in, use the whole app."
                  : "One league. Real verdict. Real scout."
              }
              features={
                beta
                  ? [
                      "Coach chat with full league context + web search",
                      "Intelligence briefings on demand",
                      "5-year Contender Outlook + Decision Quadrant",
                      "Multi-pick draft rollout (Monte Carlo with 500 trials)",
                      "Scout report on any Sleeper username",
                      "Connect multiple leagues",
                    ]
                  : [
                      "1 dynasty league with full hub view",
                      "Scout report on any Sleeper username",
                      "Verdict synthesis on your portfolio",
                      "League Spectrum + opponent characterizations",
                      "Read-only briefings (others' shared takes)",
                    ]
              }
              cta={
                isAuthed ? (
                  <Link
                    href="/account"
                    className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface px-6 text-sm font-medium text-foreground transition hover:border-accent/60"
                  >
                    Manage account →
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong bg-surface px-6 text-sm font-medium text-foreground transition hover:border-accent/60"
                  >
                    Start free
                  </Link>
                )
              }
            />
            <PlanCard
              tier={beta ? "Pro · early support" : "Pro"}
              price="$14"
              cadence="per month, or $99/year (save 41%)"
              tagline={
                beta
                  ? "Same engine as Free during beta. The Pro extras are the persistence + early-bird lock-in."
                  : "Everything. Built for serious dynasty managers."
              }
              accent
              features={
                beta
                  ? [
                      "Help cover hosting + AI engine costs",
                      "Cross-device chat history sync",
                      "War Room: pinned briefings sync across devices",
                      "Lock in current pricing before post-beta tightening",
                      "Direct line on feedback (your account email is on every report)",
                      "Same daily budget cap as Free during beta",
                    ]
                  : [
                      "Unlimited dynasty leagues",
                      "AI Coach chat with full league context + web search",
                      "Generate intelligence briefings on demand",
                      "5-year Contender Outlook with protect-the-window plays",
                      "Decision Quadrant with named candidates per pick",
                      "Multi-pick draft rollout (your full pick schedule synthesized)",
                      "Cross-device chat history",
                      "Pin unlimited briefings to your war room",
                    ]
              }
              cta={
                isPro ? (
                  <Link
                    href="/account"
                    className="inline-flex h-11 w-full items-center justify-center rounded-md bg-success px-6 text-sm font-semibold text-black"
                  >
                    You're on Pro · manage →
                  </Link>
                ) : isAuthed ? (
                  <form action="/api/checkout" method="POST" className="contents">
                    <input
                      type="hidden"
                      name="plan"
                      value="pro_monthly"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
                    >
                      {beta ? "Support the project · 14-day trial" : "Start 14-day Pro trial"}
                    </button>
                  </form>
                ) : (
                  <Link
                    href="/login?next=/pricing"
                    className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
                  >
                    {beta ? "Sign in to support" : "Sign in to start trial"}
                  </Link>
                )
              }
            />
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-16 space-y-8">
            <h2 className="text-2xl font-semibold text-foreground">
              FAQ
            </h2>
            <Faq q="Is the trial really free? No card?">
              Yes. Sign in with your email. The first 14 days unlock all of
              Pro automatically. If you don't add a payment method, your
              account converts to Free at trial end. Nothing is billed.
            </Faq>
            <Faq q="What happens to my data if I downgrade?">
              Nothing is deleted. Your saved chat history, pinned briefings,
              and connected leagues all stay. The Pro features just stop
              working until you re-upgrade.
            </Faq>
            <Faq q="Can I cancel anytime?">
              One click in your account dashboard. We use Stripe's customer
              portal so you cancel without having to email us.
            </Faq>
            <Faq q="Why $14/month and not free forever?">
              {beta
                ? "Beta is open: every signed-in user gets the killer features today. The product calls our AI engine many times per session (verdict, coach, briefings, decision synthesis), and tokens cost real money. We bill so the lights stay on, not to lock features behind a wall. Post-beta, free will tighten and Pro will be the killer-feature tier; supporting now locks in current pricing."
                : "The product calls our AI engine many times per session (verdict, coach, briefings, decision synthesis). Free for one league is sustainable; unlimited free isn't. Pricing reflects actual cost plus the work of building this."}
            </Faq>
            {beta && (
              <Faq q="What changes when beta ends?">
                The killer features (Coach, Briefings, Multi-pick, Contender
                Outlook, Decision Quadrant) move back behind the Pro tier.
                Free will keep the scout report, verdict, and one league.
                Anyone who's on Pro at that point keeps current pricing
                indefinitely; if you sign up today and stay subscribed, you
                lock that in.
              </Faq>
            )}
            <Faq q="Annual discount?">
              $99/year (works out to $8.25/month, 41% off). Cancel anytime;
              we don't refund partial years but you keep Pro until the year
              is up.
            </Faq>
            <Faq q="Is this affiliated with Sleeper?">
              No. Dynasty Copilot is an independent product that reads your
              public Sleeper league data via their API. We are not affiliated
              with, endorsed by, or sponsored by Sleeper or the NFL.
            </Faq>
          </div>
        </section>

        <section className="bg-surface/30">
          <div className="mx-auto max-w-3xl px-6 py-12 text-center">
            <Link
              href="/connect"
              className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Try with your Sleeper account
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function PlanCard({
  tier,
  price,
  cadence,
  tagline,
  features,
  cta,
  accent,
}: {
  tier: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border-2 ${
        accent ? "border-accent/60 bg-accent/5" : "border-border-strong bg-surface"
      } px-6 py-8`}
    >
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        {tier}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-4xl font-semibold text-foreground">{price}</div>
        <div className="text-xs text-muted-2">{cadence}</div>
      </div>
      <p className="mt-3 text-sm text-foreground">{tagline}</p>
      <ul className="mt-6 flex-1 space-y-2 text-sm text-muted">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border-soft pt-6 first:border-0 first:pt-0">
      <h3 className="text-base font-semibold text-foreground">{q}</h3>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}
