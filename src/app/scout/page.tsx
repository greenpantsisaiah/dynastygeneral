/**
 * Scout entry page. Form to scout any Sleeper user, with optional
 * claim text the verdict will weigh against.
 *
 * Submitted via standard form GET so the result URL is shareable.
 *   /scout/{username}
 *   /scout/{username}?claim={url-encoded claim}
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";

export const dynamic = "force-dynamic";

async function startScout(formData: FormData) {
  "use server";
  const raw = String(formData.get("username") ?? "").trim().replace(/^@/, "");
  if (!raw) return;
  const claim = String(formData.get("claim") ?? "").trim();
  const params = new URLSearchParams();
  if (claim) params.set("claim", claim);
  const qs = params.toString();
  redirect(`/scout/${encodeURIComponent(raw)}${qs ? `?${qs}` : ""}`);
}

export default function ScoutIndexPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-2xl px-6 py-20 sm:py-28">
          <Ticker label="Scout report · public · shareable" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Scout any dynasty manager.
          </h1>
          <p className="mt-4 max-w-xl text-muted">
            Drop a Sleeper username. We&apos;ll pull every dynasty team they
            run, classify each build (strategy + win-now lean), award
            best-in-class badges across their portfolio, and have the
            analyst team write a verdict.
          </p>

          <form action={startScout} className="mt-10 grid gap-4">
            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                Sleeper username
              </span>
              <input
                name="username"
                required
                autoComplete="off"
                placeholder="e.g. BradyH20"
                className="h-11 rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground outline-none focus:border-accent"
              />
            </label>

            <label className="grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
                Their claim (optional)
              </span>
              <textarea
                name="claim"
                rows={2}
                placeholder='e.g. "this might be the worst team I&apos;ve ever drafted"'
                className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                The verdict confirms or contradicts this with cited evidence
              </span>
            </label>

            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Run scout report →
            </button>
          </form>

          <div className="mt-12 rounded-lg border border-border-soft bg-surface px-5 py-4 text-sm text-muted">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
              Already connected?
            </div>
            <p className="mt-1 text-foreground">
              Scout yourself or look up an opponent to spot trade leverage.{" "}
              <Link
                href="/connect"
                className="text-accent hover:underline"
              >
                Open the app →
              </Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
