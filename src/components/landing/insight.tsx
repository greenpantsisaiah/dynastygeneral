import { Ticker } from "@/components/ui/ticker";

const traits = [
  "Stay coherent under pressure",
  "Recognize leverage faster",
  "Act before windows close",
  "Understand what other managers need",
  "Avoid drifting from the team they are actually building",
];

export function Insight() {
  return (
    <section className="border-b border-border-soft bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Ticker label="02 · The insight" />
        <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Winning dynasty players do not just evaluate better.
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          They execute. Under pressure, on timing, with leverage.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {traits.map((t, i) => (
            <div
              key={t}
              className="rounded-md border border-border-strong bg-background px-4 py-5 text-sm leading-snug text-foreground"
            >
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                {String(i + 1).padStart(2, "0")}
              </div>
              {t}
            </div>
          ))}
        </div>
        <p className="mt-10 max-w-2xl text-base text-muted-2">
          We built a system for exactly that.
        </p>
      </div>
    </section>
  );
}
