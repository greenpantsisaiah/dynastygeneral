import Link from "next/link";
import { Ticker } from "@/components/ui/ticker";
import { BriefSignupForm } from "@/components/landing/brief-signup-form";
import { SampleTradeCard } from "@/components/landing/sample-trade-card";

/**
 * Hero, rebuilt 2026-11-26 around the weekly brief.
 *
 * The product's front door is now the Tuesday email: it is where the
 * value lands without the user opening the app, and capturing an email
 * plus a Sleeper username is what lets us start sending it. The single
 * CTA collects both in one step. The right column is a sample of the
 * email's trade card, labeled as a sample, built from the same shape
 * the real brief renders (three analysts, a verdict, numbers from the
 * season simulator).
 *
 * Replaces the 2026-05-12 chart-led hero (Win-Now Floor lane cohort),
 * which described the retired Strategic Lanes surface.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border-soft">
      <div className="absolute inset-0 bg-grid opacity-50" />
      <div className="absolute inset-0 bg-glow" />
      <div className="relative mx-auto max-w-6xl px-6 pt-8 pb-16 sm:pt-20 sm:pb-24">
        <Ticker label="Weekly brief · Sleeper · all your leagues" />

        <div className="mt-6 grid items-start gap-12 sm:mt-8 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <h1 className="text-3xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
              Every Tuesday: your odds in every league, and the trades worth trying.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Dynasty General simulates each of your Sleeper leagues 5,000
              times, names the managers most likely to deal, and has three
              analysts argue the call. One email covers dynasty, redraft,
              keeper and best ball; leagues past their deadline get the odds,
              not a trade.
            </p>

            <BriefSignupForm />

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
              <Link href="/how-it-works" className="hover:text-foreground">
                How it works →
              </Link>
              <Link href="/scout" className="hover:text-foreground">
                Scout any manager →
              </Link>
              <Link href="/methodology" className="hover:text-foreground">
                Methodology →
              </Link>
            </div>
          </div>

          <div className="lg:pl-2">
            <SampleTradeCard />
          </div>
        </div>
      </div>
    </section>
  );
}
