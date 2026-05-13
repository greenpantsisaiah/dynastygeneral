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
    "Perturb the model. Eight dials wire into the engine across timeline, risk, trade behavior, and market alignment. Three of them mirror the public /rankings sliders so the same knobs move both surfaces.",
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
            <Ticker label="Soundboard · perturb the model" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Soundboard
            </h1>
            <p className="mt-3 max-w-2xl text-muted">
              Eight dials, each tied to a specific engine constant. The
              first three (Youth, Bellcow, Continuity) mirror the
              public{" "}
              <Link href="/rankings" className="text-foreground underline">
                /rankings
              </Link>{" "}
              page so the same knobs move the same model. The other
              five layer in for Decision-card synthesis and trade
              behavior. Move a dial off default and drop a one-line
              WHY so we know your reasoning.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-md border border-success/40 bg-success/10 px-3 py-1 font-mono uppercase tracking-[0.14em] text-success">
                Horizon · wired
              </span>
              <span className="rounded-md border border-accent/40 bg-accent/5 px-3 py-1 font-mono uppercase tracking-[0.14em] text-accent">
                3 dials · wired on /rankings
              </span>
              <span className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1 font-mono uppercase tracking-[0.14em] text-warning">
                4 dials · soundboard mirror pending
              </span>
            </div>

            <div className="mt-8">
              <SoundboardPanel initialProfile={profile} />
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-4 text-xs text-muted-2">
              <Link href="/leagues" className="hover:text-accent">
                ← My leagues
              </Link>
              <Link href="/rankings" className="hover:text-accent">
                Rankings lab →
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
