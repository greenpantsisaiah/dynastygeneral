import Link from "next/link";
import { getOptionalUser } from "@/lib/auth/session";
import { UserMenu } from "@/components/nav/user-menu";
import { DynastyGeneralLogo } from "@/components/dynasty-general-logo";

export async function SiteNav() {
  const user = await getOptionalUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border-soft bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2"
        >
          <DynastyGeneralLogo
            size={28}
            className="h-7 w-7 text-accent"
            aria-label="Dynasty General"
          />
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground">
            Dynasty General
          </span>
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
          <Link
            href="/scoreboard"
            className="hidden text-muted transition hover:text-foreground sm:inline"
          >
            Scoreboard
          </Link>
          {user ? (
            <UserMenu
              name={user.name}
              email={user.email}
              avatarUrl={user.avatar_url}
              tier={user.tier}
            />
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
