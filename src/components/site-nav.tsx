import Link from "next/link";
import { getOptionalUser } from "@/lib/auth/session";

export async function SiteNav() {
  const user = await getOptionalUser();

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
            href="/how-it-works"
            className="hidden text-muted transition hover:text-foreground sm:inline"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="hidden text-muted transition hover:text-foreground sm:inline"
          >
            Pricing
          </Link>
          <Link
            href="/scout"
            className="hidden text-muted transition hover:text-foreground sm:inline"
          >
            Scout
          </Link>
          {user ? (
            <Link
              href="/account"
              className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
            >
              Account
              {user.tier === "pro" && (
                <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.16em] text-success">
                  Pro
                </span>
              )}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-muted transition hover:text-foreground sm:inline"
              >
                Sign in
              </Link>
              <Link
                href="/connect"
                className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-foreground transition hover:border-accent/60 hover:text-accent"
              >
                Open app →
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
