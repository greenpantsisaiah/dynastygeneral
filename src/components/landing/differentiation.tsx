import { Ticker } from "@/components/ui/ticker";

const rows = [
  { from: "Not rankings", to: "Decisions" },
  { from: "Not dashboards", to: "Action" },
  { from: "Not generic advice", to: "Your league, your roster, your moment" },
  { from: "Not just evaluation", to: "Leverage and negotiation" },
];

export function Differentiation() {
  return (
    <section className="border-b border-border-soft py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Ticker label="05 · What makes this different" />
        <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Other tools tell you if something is fair.
          <br />
          <span className="text-accent">
            We tell you the strongest move that protects your strategic
            optionality.
          </span>
        </h2>
        <div className="mt-10 max-w-3xl divide-y divide-border-soft rounded-lg border border-border-soft bg-surface">
          {rows.map((r) => (
            <div
              key={r.from}
              className="flex flex-col gap-1.5 px-5 py-4 text-sm sm:grid sm:grid-cols-[1fr_auto_1.4fr] sm:items-center sm:gap-4 sm:px-6"
            >
              <div className="text-muted-2 line-through decoration-danger/60 decoration-1">
                {r.from}
              </div>
              <div className="font-mono text-xs text-accent">→</div>
              <div className="font-medium text-foreground">{r.to}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
