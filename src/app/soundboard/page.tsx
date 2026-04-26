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
    "Shape the engine. Tune dials for horizon, rookie tilt, risk tolerance, trade aggression, position bias, and roster age preference. Argue with any dial that doesn't match your judgment.",
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
          <div className="mx-auto max-w-3xl px-6 py-12">
            <Ticker label="Soundboard · shape the engine" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Soundboard
            </h1>
            <p className="mt-3 max-w-2xl text-muted">
              The dials below are the engine&rsquo;s judgment surface.
              Each one tells you exactly what it consults, and lets you
              argue when the weighting feels wrong. Suggestions go to
              the founder. Today the dials store; engine wiring lands in
              a guided migration so we don&rsquo;t break what works.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1 font-mono uppercase tracking-[0.14em] text-warning">
                Scaffold · engine wiring pending
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
