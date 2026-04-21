import { Ticker } from "@/components/ui/ticker";

const benefits = [
  {
    tag: "Win more decisions",
    body: "Know when to take the player, move the pick, hold, counter, or push for more.",
  },
  {
    tag: "Stay disciplined",
    body: "Stop making moves that contradict the team you are actually trying to build.",
  },
  {
    tag: "Exploit leverage",
    body: "See when another manager is vulnerable, and act before the window closes.",
  },
];

export function Benefits() {
  return (
    <section className="border-b border-border-soft bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Ticker label="04 · What changes for you" />
        <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Three levers, sharper immediately.
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {benefits.map((b, i) => (
            <div
              key={b.tag}
              className="rounded-lg border border-border-strong bg-background p-6"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                {String(i + 1).padStart(2, "0")} / {b.tag}
              </div>
              <p className="mt-4 text-base leading-relaxed text-foreground">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
