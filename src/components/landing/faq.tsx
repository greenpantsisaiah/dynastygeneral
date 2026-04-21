import { Ticker } from "@/components/ui/ticker";

const qa = [
  { q: "What sites does this support?", a: "Sleeper first." },
  {
    q: "Is this a trade calculator?",
    a: "No. It is a decision copilot built for live picks, trades, and negotiation moments.",
  },
  { q: "Is this for redraft?", a: "No. This is built for dynasty." },
  {
    q: "Will this help during startup and rookie drafts?",
    a: "Yes. Draft season is one of the main use cases.",
  },
  {
    q: "How is this different from rankings tools?",
    a: "It is built around what you should do right now, not just who is ranked where.",
  },
];

export function FAQ() {
  return (
    <section className="border-b border-border-soft bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <Ticker label="08 · FAQ" />
        <h2 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Direct answers.
        </h2>
        <div className="mt-10 divide-y divide-border-soft rounded-lg border border-border-soft bg-background">
          {qa.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4 open:bg-surface-2">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium text-foreground">
                <span>{q}</span>
                <span className="font-mono text-xs text-accent transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
