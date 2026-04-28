import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { SoundboardPanel } from "@/components/soundboard/panel";
import { readProfileServer } from "@/lib/soundboard/storage";

export const metadata: Metadata = {
  title: "Soundboard",
  description:
    "Tune your doctrine. 16 dials shape the engine across timeline, risk, trade behavior, market alignment, and voice. Load a stock preset or build your own. The doctrine readout synthesizes your settings into one line.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SoundboardPage() {
  const profile = await readProfileServer();
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <Ticker label="War Room · doctrine soundboard" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Soundboard
            </h1>
            <p className="mt-3 max-w-2xl text-muted">
              Pick a doctrine from the library or tune your own dials.
              The doctrine you choose weights the Decision card&rsquo;s
              lanes. Sixteen dials are real engine levers; click ? on
              any tile to see exactly what it touches. Move a dial off
              default and drop a one-line WHY so we know your reasoning.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-md border border-success/40 bg-success/10 px-3 py-1 font-mono uppercase tracking-[0.14em] text-success">
                Horizon dial · wired
              </span>
              <span className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1 font-mono uppercase tracking-[0.14em] text-warning">
                15 dials · pending wiring
              </span>
            </div>

            <div className="mt-8">
              <SoundboardPanel initialProfile={profile} />
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4 text-xs text-muted-2">
              <Link href="/leagues" className="hover:text-accent">
                ← My leagues
              </Link>
              <Link href="/account" className="hover:text-accent">
                Account settings →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
