import Link from "next/link";
import { SiteNav } from "@/components/site-nav";

export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main className="flex flex-1 items-center justify-center bg-grid px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            404
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Page not found
          </h1>
          <p className="mt-4 text-sm text-muted">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-md bg-accent px-5 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Go home
            </Link>
            <Link
              href="/connect"
              className="inline-flex h-10 items-center rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-foreground transition hover:border-accent/60"
            >
              Open app
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
