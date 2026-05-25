/**
 * Changelog. The full flowing release history, newest first.
 *
 * Data is `src/lib/changelog/releases.ts` (shared with the bottom-left
 * "What's new" ribbon). Voice A throughout.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { getAllReleases } from "@/lib/changelog/releases";

export const metadata: Metadata = {
  title: "What's new · Dynasty General",
  description:
    "Release notes for Dynasty General. What shipped, when, and why it matters to your draft.",
};

export default function ChangelogPage() {
  const releases = getAllReleases();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-10 border-b border-border-soft pb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          What's new
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          Release notes.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          What shipped, when, and why it matters at your next pick.
          Newest first.
        </p>
      </header>

      <ol className="space-y-12">
        {releases.map((r) => (
          <li
            key={r.version}
            className="border-b border-border-soft pb-12 last:border-b-0"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
              {r.version}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              {r.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {r.summary}
            </p>
            <ul className="mt-5 space-y-3">
              {r.changes.map((c) => (
                <li key={c.tag} className="flex items-start gap-3 text-sm leading-snug">
                  <span className="mt-0.5 inline-flex shrink-0 items-center rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
                    {c.tag}
                  </span>
                  <span className="text-foreground">{c.text}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <footer className="mt-12 text-[11px] leading-relaxed text-muted-2">
        <p>
          Every change above traces to shipped code. Numbers carry their
          units and provenance reaches one tap into the product surface
          where the change lives.
        </p>
        <p className="mt-3">
          <Link href="/" className="text-accent hover:underline">
            Back to dynastygeneral.app
          </Link>
        </p>
      </footer>
    </main>
  );
}
