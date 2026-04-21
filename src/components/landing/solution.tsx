import { Ticker } from "@/components/ui/ticker";

const lines = [
  "Remembers your strategy across leagues",
  "Infers your build if you have not fully defined it",
  "Flags strategy drift before you make the move",
  "Identifies opponent weakness and timing pressure",
  "Helps you structure offers and counters",
  "Gives you a clear move, not just a grade",
];

export function Solution() {
  return (
    <section className="border-b border-border-soft py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Ticker label="03 · The engine" />
        <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          A decision engine for picks, trades, and leverage moments.
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Sync your Sleeper leagues and get just-in-time help on the decisions
          that actually matter.
        </p>
        <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border-soft bg-border-soft sm:grid-cols-2">
          {lines.map((line) => (
            <div
              key={line}
              className="flex items-start gap-3 bg-surface px-5 py-4 text-sm text-foreground"
            >
              <span className="mt-1 font-mono text-[10px] text-accent">→</span>
              <span>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
