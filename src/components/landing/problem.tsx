import { Ticker } from "@/components/ui/ticker";

const bullets = [
  "You abandon your strategy mid-draft",
  "You accept trades you knew were wrong",
  "You miss the brief window when another manager is desperate",
  "You check multiple tools and still hesitate",
  "Moves that look fine in isolation but break your build",
];

export function Problem() {
  return (
    <section className="border-b border-border-soft py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Ticker label="01 · The real problem" />
        <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          You do not need more rankings.
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          You already know enough to compete. That is not the problem. The
          problem is what happens in the moment:
        </p>
        <ul className="mt-8 grid max-w-3xl gap-px overflow-hidden rounded-lg border border-border-soft bg-border-soft sm:grid-cols-1">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-3 bg-surface px-5 py-4 text-sm text-foreground"
            >
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-danger" />
              {b}
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-2xl text-base text-muted-2">
          You do not need more noise. You need clarity when it matters.
        </p>
      </div>
    </section>
  );
}
