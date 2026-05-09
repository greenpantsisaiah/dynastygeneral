/**
 * /leagues/[id]/intel
 *
 * Intel surface: news, alerts, league-wide inflections, and the
 * Library catalog. Per the redesign architecture, this is the home
 * for "adapt to reality" activity. v1 ships the Library link as the
 * primary content; news + alerts integrate over time.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { SiteNav } from "@/components/site-nav";
import { getAllArticles } from "@/lib/library/articles";

export const metadata: Metadata = {
  title: "Intel",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ username?: string }>;
};

export default async function IntelPage({ params, searchParams }: PageProps) {
  const { leagueId } = await params;
  const { username = "" } = await searchParams;
  const cleaned = username.trim().replace(/^@/, "");

  const back = `/leagues/${leagueId}${
    cleaned ? `?username=${encodeURIComponent(cleaned)}` : ""
  }`;
  const articles = getAllArticles();

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-grid">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                Intel
              </div>
              <h1 className="mt-2 text-3xl font-semibold text-foreground">
                What's changing.
              </h1>
              <p className="mt-2 text-sm text-muted">
                League-wide signal, model methodology, and the surprising
                facts behind the recommendations.
              </p>
            </div>
            <Link
              href={back}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
            >
              ← Hub
            </Link>
          </div>

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                From the Library
              </div>
              <Link
                href="/library"
                className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
              >
                Full catalog →
              </Link>
            </div>
            <ul className="space-y-6">
              {articles.map((a) => (
                <li
                  key={a.slug}
                  className="border-b border-border-soft pb-6 last:border-b-0"
                >
                  <Link
                    href={`/library/${a.slug}`}
                    className="block group"
                  >
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-2 mb-2">
                      {a.published_at}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                      {a.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">
                      {a.thesis}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.tags.map((t) => (
                        <span
                          key={t}
                          className="font-mono text-[8px] uppercase tracking-[0.16em] text-muted-2 border border-border-soft rounded-full px-2 py-0.5"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-12 rounded-lg border border-border-soft px-5 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
              Coming
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Real-time NFL news + injury feeds, league-wide inflection
              alerts (when a player on multiple rosters in your league
              hits a window), and trade-deadline countdown signals
              integrate here in the next phase.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
