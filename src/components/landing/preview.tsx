import { Ticker } from "@/components/ui/ticker";

export function Preview() {
  return (
    <section className="border-b border-border-soft bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Ticker label="06 · In the moment" />
        <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Three moments. One brain.
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Picks, trades, and negotiation: all answered the same way, with a
          clear recommendation, grounded in your strategy and the timing.
        </p>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <PickCard />
          <TradeCard />
          <NegotiationCard />
        </div>
      </div>
    </section>
  );
}

function PickCard() {
  return (
    <div className="rounded-lg border border-border-strong bg-background p-5">
      <Header label="Pick decision" right="ON THE CLOCK" />
      <div className="mt-3 text-base font-semibold text-foreground">
        Draft Jordan Addison
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        <li>Fits young WR-heavy rebuild</li>
        <li>Holds future flexibility</li>
        <li>Avoids RB age-curve trap</li>
      </ul>
      <div className="mt-4 flex items-center gap-2 border-t border-border-soft pt-3 font-mono text-[11px] text-success">
        <Dot className="bg-success" /> On strategy
      </div>
    </div>
  );
}

function TradeCard() {
  return (
    <div className="rounded-lg border border-border-strong bg-background p-5">
      <Header label="Trade decision" right="COUNTER" />
      <div className="mt-3 text-base font-semibold text-foreground">
        Ask for 2026 2nd, then accept
      </div>
      <div className="mt-4 rounded-md border border-border-soft bg-surface-2 p-3 text-xs text-muted">
        <div className="font-mono uppercase tracking-[0.16em] text-muted-2">
          Opponent
        </div>
        <div className="mt-1.5 text-foreground">Win-now · thin at RB</div>
        <div className="mt-0.5 text-foreground">Bye-week pressure: high</div>
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-border-soft pt-3 font-mono text-[11px] text-accent">
        <Dot className="bg-accent" /> Leverage: strong
      </div>
    </div>
  );
}

function NegotiationCard() {
  return (
    <div className="rounded-lg border border-border-strong bg-background p-5">
      <Header label="Negotiation" right="SEND" />
      <div className="mt-3 rounded-md border border-border-soft bg-surface-2 p-3 text-sm leading-relaxed text-foreground">
        “Like the structure. Given your RB situation this week, I need a bit
        more. Add a 2nd and I&apos;m in.”
      </div>
      <div className="mt-3 flex gap-2 font-mono text-[10px] uppercase tracking-[0.16em]">
        <span className="rounded-sm border border-border-soft px-2 py-1 text-muted-2">
          Softer
        </span>
        <span className="rounded-sm border border-accent/60 px-2 py-1 text-accent">
          Confident
        </span>
        <span className="rounded-sm border border-border-soft px-2 py-1 text-muted-2">
          Pressure
        </span>
      </div>
    </div>
  );
}

function Header({ label, right }: { label: string; right: string }) {
  return (
    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
      <span className="text-muted-2">{label}</span>
      <span className="text-accent">{right}</span>
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${className}`} />;
}
