import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getOptionalUser } from "@/lib/auth/session";
import { isBetaOpenMode } from "@/lib/billing/beta-mode";

export const metadata = {
  title: "Pricing",
  description:
    "Dynasty General pricing. Decision engine for Sleeper dynasty leagues. Trade analysis, pick recommendations with named-player reasoning, strategy coaching, and scout reports. Free tier, Pro removes daily caps.",
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
                : "Use the engine. Pro removes the daily caps."}
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-lg leading-relaxed text-muted">
              {beta
                ? "Every signed-in user gets the killer features (Coach, Briefings, the 5-deep Decision card, Contender Outlook) during alpha/beta. Hosting and the engine cost real money. We bill so the lights stay on, not to lock features behind a wall. Pro tier exists for testers who want to support the project and lock in early-bird pricing before we tighten things up post-beta."
                : "Free is real free: every killer feature, capped at sensible daily limits so we can keep the lights on for everyone. Pro removes the caps, syncs across devices, and supports the project. No billing during football season if you go annual."}
            </p>
            <p className="mt-4 mx-auto max-w-2xl text-xs text-muted-2">
              We'll always have a meaningful free tier. The post-beta caps
              are based on actual unit cost, not artificial scarcity.
            </p>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto grid max-w-5xl gap-6 px-6 py-12 lg:grid-cols-2">
            {/* Free / starter card */}
            <div className="flex flex-col rounded-lg border-2 border-border-strong bg-surface px-6 py-8">
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                {beta ? "Free · beta" : "Free"}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <div className="text-4xl font-semibold text-foreground">$0</div>
                <div className="text-xs text-muted-2">
                  {beta ? "with you on the journey" : "real free, with caps"}
                </div>
              </div>
              <p className="mt-3 text-sm text-foreground">
                {beta
                  ? "During beta: every killer feature open. Sign in, use the whole app."
                  : "Use the whole engine. Hit a cap, come back tomorrow or upgrade."}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-muted">
                {(beta
                  ? [
                      "Coach chat with full league context + web search",
                      "Intelligence briefings on demand",
                      "Decision card with 5-deep Next Picks Plan + Counter-view",
                      "5-year Contender Outlook + Decision Quadrant",
                      "Scout report on any Sleeper username",
                      "Connect multiple leagues",
                    ]
                  : [
                      "1 dynasty league connected",
                      "5 Coach turns / day",
                      "3 intelligence briefings / day",
                      "Decision card with 5-deep Next Picks Plan",
                      "Scout report on any Sleeper username · always unlimited",
                      "Verdict + League Spectrum + opponent characterizations",
                      "Local-only chat history (no cross-device sync)",
                    ]
                ).map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {isAuthed ? (
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
                )}
              </div>
            </div>

            {/* Pro card · annual-led */}
            <div className="relative flex flex-col rounded-lg border-2 border-accent/60 bg-accent/5 px-6 py-8">
              <div className="absolute -top-3 left-6 rounded-full border border-accent/60 bg-background px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                Save $69 · annual
              </div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                {beta ? "Pro · early support" : "Pro"}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <div className="text-4xl font-semibold text-foreground">$99</div>
                <div className="text-xs text-muted-2">
                  per year · $8.25/mo · no billing during football season
                </div>
              </div>
              <p className="mt-3 text-sm text-foreground">
                {beta
                  ? "Same engine as Free during beta. The Pro extras are the persistence + early-bird lock-in."
                  : "Removes the daily caps, syncs across devices, supports the project."}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-muted">
                {(beta
                  ? [
                      "Help cover hosting + AI engine costs",
                      "Cross-device chat history sync",
                      "War Room: pinned briefings sync across devices",
                      "Lock in current pricing before post-beta tightening",
                      "Direct line on feedback (your account email is on every report)",
                      "Same daily budget cap as Free during beta",
                    ]
                  : [
                      "Unlimited Coach turns and briefings",
                      "Unlimited dynasty leagues connected",
                      "Cross-device chat history + War Room sync",
                      "5-year Contender Outlook + Decision Quadrant",
                      "Lock in early-bird pricing for life",
                      "Direct line on feedback to the founder",
                      "Early access to the Soundboard when it ships",
                    ]
                ).map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* Annual-led CTA. Monthly is a smaller secondary action. */}
              <div className="mt-8 space-y-3">
                {isPro ? (
                  <Link
                    href="/account"
                    className="inline-flex h-11 w-full items-center justify-center rounded-md bg-success px-6 text-sm font-semibold text-black"
                  >
                    You're on Pro · manage →
                  </Link>
                ) : isAuthed ? (
                  <>
                    <form action="/api/checkout" method="POST" className="contents">
                      <input type="hidden" name="plan" value="pro_annual" />
                      <button
                        type="submit"
                        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
                      >
                        {beta ? "Support annual · 14-day trial" : "Get Pro · $99/yr"}
                      </button>
                    </form>
                    <form action="/api/checkout" method="POST" className="contents">
                      <input type="hidden" name="plan" value="pro_monthly" />
                      <button
                        type="submit"
                        className="inline-flex h-9 w-full items-center justify-center rounded-md border border-border-strong bg-background/50 px-6 text-xs font-medium text-muted transition hover:border-accent/60 hover:text-foreground"
                      >
                        Or pay monthly · $14/mo
                      </button>
                    </form>
                  </>
                ) : (
                  <Link
                    href="/login?next=/pricing"
                    className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
                  >
                    {beta ? "Sign in to support" : "Sign in to get Pro"}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-16 space-y-8">
            <h2 className="text-2xl font-semibold text-foreground">FAQ</h2>
            <Faq q="Is the trial really free? No card?">
              Yes. Sign in, hit Get Pro. The first 14 days unlock everything
              automatically. If you don't add a payment method, your account
              converts to Free at trial end. Nothing is billed.
            </Faq>
            <Faq q="What counts as a Coach turn or briefing?">
              A Coach turn is one back-and-forth with the analyst. A briefing
              is one batch of 2-3 generated takes from the Run New Analysis
              button. Free caps are: 5 Coach turns / day, 3 briefings / day.
              Caps reset daily at midnight UTC. The Decision card itself is
              uncapped: it runs locally and costs nothing.
            </Faq>
            <Faq q="What happens to my data if I downgrade?">
              Nothing is deleted. Your saved chat history, pinned briefings,
              and connected leagues all stay. Cross-device sync stops, the
              daily caps come back, and Pro features just stop working until
              you re-upgrade.
            </Faq>
            <Faq q="Can I cancel anytime?">
              One click in your account dashboard. We use Stripe's customer
              portal so you cancel without having to email us. Annual: you
              keep Pro until the year is up.
            </Faq>
            <Faq q="Why pay at all? The engine is free during beta.">
              {beta
                ? "Beta is open: every signed-in user gets the killer features today. The product calls our AI engine many times per session and tokens cost real money. We bill so the lights stay on, not to lock features behind a wall. Post-beta, free stays meaningful but gets sensible daily caps; Pro removes them. Supporting now locks in current pricing for life."
                : "Free is real free: every killer feature, capped at sensible daily limits. Pro removes the caps and syncs across devices. The caps exist because each session calls our AI engine many times and tokens have real cost. We're not trying to bait you into paying; we're trying to keep the lights on."}
            </Faq>
            <Faq q="Why annual over monthly?">
              $99/year works out to $8.25/month, which is 41% off the $14
              monthly rate. The bigger reason: dynasty is a season-long
              commitment, and "no billing during football season" is the
              right shape for this product. Annual is the recommended path
              if you're going to use it at all.
            </Faq>
            <Faq q="What if I just need one heavy day during a draft?">
              Day Pass: a one-shot purchase that removes daily caps for 24
              hours. Surfaces inline when you hit a cap mid-draft so you
              don't have to commit to a full subscription for a single
              draft window. Best fit for a startup draft week or a
              rookie-draft day where you want to stay in the engine
              non-stop. Pro is still better long-term; Day Pass exists for
              the bursty moments.
            </Faq>
            {beta && (
              <Faq q="What changes when beta ends?">
                The post-beta model is volume caps, not feature gates. Free
                keeps every killer feature with sensible daily limits (5
                Coach turns / 3 briefings per day; the Decision card stays
                uncapped); Pro removes the caps and adds cross-device sync.
                Anyone on Pro at beta-end keeps current pricing for life.
                Sign up today to lock that in.
              </Faq>
            )}
            <Faq q="Is this affiliated with Sleeper or the NFL?">
              No. Dynasty General is an independent product that reads your
              public Sleeper league data via their API. We are not
              affiliated with, endorsed by, or sponsored by Sleeper or the
              NFL.
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

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border-soft pt-6 first:border-0 first:pt-0">
      <h3 className="text-base font-semibold text-foreground">{q}</h3>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}
