import Image from "next/image";
import Link from "next/link";
import { Ticker } from "@/components/ui/ticker";

export function Preview() {
  return (
    <section className="border-b border-border-soft bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Ticker label="06 · The live product" />
        <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Real screenshots. Real Sleeper leagues. Live at dynastygeneral.app.
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Five surfaces, one engine. Each shot is the actual app on a real
          dynasty roster. Sleeper today, MyFantasyLeague next via the same
          engine. Click through to the walkthrough for context.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Shot
            title="Contender Outlook"
            blurb="5-year per-year forecast. Rebuild / Bubble / Contender bands. THE TAKE names your window. PROTECT bullets name the picks that fund it."
            src="/marketing/contender-outlook.png"
            alt="Contender Outlook with peak 2030 contender (81/100) and protect-the-window bullets"
          />
          <Shot
            title="Decision Card · Plays From Here"
            blurb="One synthesized take per pick. Move-level options with window deltas, payoff odds, and what to watch for. Drift-based path tracking below."
            src="/marketing/decision-card.png"
            alt="Decision card showing Plays From Here with move-level options and Live Strategy Board"
          />
          <Shot
            title="Decision Quadrant"
            blurb="Top candidates plotted by win-now horizon × confidence. Inline reasoning per dot. The MY LEAN tag points at the engine's primary call."
            src="/marketing/decision-quadrant.png"
            alt="Decision Quadrant with ranked candidates including Rico Dowdle, Jakobi Meyers, Rhamondre Stevenson"
          />
          <Shot
            title="League Spectrum"
            blurb="Every team in your league plotted by Strategy × Value. Find motivated buyers and sellers at a glance. Dot size = our confidence in the read."
            src="/marketing/opponent-spectrum.png"
            alt="League spectrum showing 12 teams plotted by strategic lean and expected value with izzydabomb (you) at top"
          />
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/connect"
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
          >
            Try with your Sleeper account
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-background px-6 text-sm font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            Full walkthrough →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Shot({
  title,
  blurb,
  src,
  alt,
}: {
  title: string;
  blurb: string;
  src: string;
  alt: string;
}) {
  return (
    <figure className="overflow-hidden rounded-lg border border-border-strong bg-background">
      <div className="border-b border-border-soft bg-surface-2 px-4 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          {title}
        </div>
        <div className="mt-1 text-sm text-muted leading-snug">{blurb}</div>
      </div>
      <Image src={src} alt={alt} width={1400} height={1050} className="w-full" />
    </figure>
  );
}
