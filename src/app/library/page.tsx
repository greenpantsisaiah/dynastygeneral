/**
 * Library index. Lists all published articles by published_at desc.
 *
 * Visual treatment is utilitarian first-cut. Redesign refresh
 * re-skins. Voice A throughout.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { getAllArticles } from "@/lib/library/articles";

export const metadata: Metadata = {
  title: "Library · Dynasty General",
  description:
    "Counterintuitive findings, model methodology, and surprising facts from the dynasty data. From the team that built Dynasty General.",
};

export default function LibraryIndexPage() {
  const articles = getAllArticles();
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="mb-10 border-b border-border-soft pb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          Library
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          Counterintuitive findings, model methodology.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Short pieces from inside the model. Each one starts with a
          number that should bother you.
        </p>
      </header>

      <ul className="space-y-8">
        {articles.map((a) => (
          <li
            key={a.slug}
            className="border-b border-border-soft pb-8 last:border-b-0"
          >
            <Link
              href={`/library/${a.slug}`}
              className="block group"
            >
              <div className="flex items-baseline gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-2 font-mono">
                <span>{a.published_at}</span>
                {a.last_updated_at && a.last_updated_at !== a.published_at && (
                  <span className="text-accent">
                    Updated {a.last_updated_at}
                  </span>
                )}
              </div>
              <h2 className="mt-2 text-xl font-semibold text-foreground group-hover:text-accent transition-colors">
                {a.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {a.thesis}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {a.tags.map((t) => (
                  <span
                    key={t}
                    className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 border border-border-soft rounded-full px-2 py-0.5"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <footer className="mt-12 text-[11px] leading-relaxed text-muted-2">
        <p>
          Library articles are short editorials from inside the Dynasty
          General model. The first number in the lede is the claim. The
          chart is the proof. The implications line names the product
          surface where the finding shows up.
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
