import Link from "next/link";

export function WipCard({
  title,
  tag,
  lines,
  backHref,
}: {
  title: string;
  tag: string;
  lines: string[];
  backHref: string;
}) {
  return (
    <div className="rounded-lg border border-border-strong bg-surface p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          {tag}
        </span>
        <Link
          href={backHref}
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
        >
          ← Back to hub
        </Link>
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <ul className="mt-6 space-y-2 text-sm text-muted">
        {lines.map((l) => (
          <li key={l}>· {l}</li>
        ))}
      </ul>
      <div className="mt-6 rounded-md border border-dashed border-border-strong bg-background px-4 py-3 text-xs text-muted-2">
        Phase 2 · decision engine wiring. The data plumbing and strategy memory
        behind this screen are live. The model-driven recommendation is next
        up.
      </div>
    </div>
  );
}
