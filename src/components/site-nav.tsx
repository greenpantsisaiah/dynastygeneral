import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-soft bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
          Dynasty Copilot
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/#waitlist"
            className="hidden text-muted transition hover:text-foreground sm:inline"
          >
            Private beta
          </Link>
          <Link
            href="/connect"
            className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
          >
            Open app →
          </Link>
        </nav>
      </div>
    </header>
  );
}
