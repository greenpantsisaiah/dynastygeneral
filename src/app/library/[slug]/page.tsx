/**
 * Single Library article. Renders the full article shape:
 *   thesis -> hero chart -> beats -> unknowns -> implications.
 *
 * Visual treatment is utilitarian first-cut. Redesign refresh
 * re-skins. Voice A throughout.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllArticles, getArticleBySlug } from "@/lib/library/articles";
import type { HeroChart, LibraryArticle } from "@/lib/library/types";

export async function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return { title: "Library · Dynasty General" };
  return {
    title: `${article.title} · Dynasty General Library`,
    description: article.thesis,
  };
}

export default async function LibraryArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <nav className="mb-8 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
        <Link href="/library" className="hover:text-accent">
          Library
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{article.slug}</span>
      </nav>

      <header className="mb-8 border-b border-border-soft pb-6">
        <div className="flex items-baseline gap-3 text-[10px] uppercase tracking-[0.18em] text-muted-2 font-mono">
          <span>{article.published_at}</span>
          {article.last_updated_at && article.last_updated_at !== article.published_at && (
            <span className="text-accent">
              Updated {article.last_updated_at}: {article.last_update_note}
            </span>
          )}
        </div>
        <h1 className="mt-3 text-3xl font-semibold leading-tight text-foreground">
          {article.title}
        </h1>
      </header>

      <p className="text-base leading-relaxed text-foreground">
        {article.thesis}
      </p>

      <HeroChartRender chart={article.hero_chart} />

      {article.beats.map((b) => (
        <section key={b.heading} className="mt-8">
          <h2 className="text-base font-semibold text-foreground">
            {b.heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{b.body}</p>
        </section>
      ))}

      <section className="mt-10 border-t border-border-soft pt-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
          What we do not know
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {article.unknowns}
        </p>
      </section>

      <section className="mt-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Implications
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {article.implications}
        </p>
      </section>

      <ArticleFooter article={article} />
    </main>
  );
}

function HeroChartRender({ chart }: { chart: HeroChart }) {
  if (chart.kind === "bars") {
    const maxValue = Math.max(1, ...chart.data.map((d) => Math.abs(d.value)));
    return (
      <figure className="mt-6 border border-border-soft rounded-lg bg-surface p-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-2 mb-3">
          {chart.y_unit}
        </div>
        <ul className="space-y-2">
          {chart.data.map((d) => {
            const widthPct = (Math.abs(d.value) / maxValue) * 100;
            const colorClass = colorForTag(d.tag);
            return (
              <li
                key={d.label}
                className="grid grid-cols-[160px_1fr_60px] items-center gap-3 text-[12px] leading-tight"
              >
                <div className="text-foreground">
                  <div className="font-medium">{d.label}</div>
                  {d.secondary && (
                    <div className="font-mono text-[10px] text-muted-2">
                      {d.secondary}
                    </div>
                  )}
                </div>
                <div className="relative h-4 rounded-sm bg-border-soft/30">
                  <div
                    className={`absolute left-0 top-0 h-full rounded-sm ${colorClass}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <div className="font-mono text-right text-foreground">
                  {Math.round(d.value)}%
                </div>
                {d.annotation && (
                  <div className="col-span-3 text-[11px] leading-snug text-muted-2 pl-1">
                    {d.annotation}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <figcaption className="mt-4 text-[12px] leading-relaxed text-muted">
          {chart.caption}
        </figcaption>
      </figure>
    );
  }
  // Scatter: small inline render. Simple grid for now.
  return (
    <figure className="mt-6 border border-border-soft rounded-lg bg-surface p-5">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-2">
        {chart.y_label} vs {chart.x_label}
      </div>
      <ul className="mt-3 space-y-1 text-[11px] leading-tight text-muted">
        {chart.data.map((d) => (
          <li key={d.label}>
            <span className="text-foreground">{d.label}</span>
            <span className="font-mono ml-2 text-muted-2">
              ({d.x}, {d.y})
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-3 text-[12px] leading-relaxed text-muted">
        {chart.caption}
      </figcaption>
    </figure>
  );
}

function colorForTag(tag: string | undefined): string {
  if (tag === "high_pass") return "bg-success/70";
  if (tag === "low_pass") return "bg-accent/70";
  return "bg-foreground/40";
}

function ArticleFooter({ article }: { article: LibraryArticle }) {
  return (
    <footer className="mt-12 border-t border-border-soft pt-6 text-[11px] leading-relaxed text-muted-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {article.tags.map((t) => (
            <span
              key={t}
              className="font-mono text-[9px] uppercase tracking-[0.16em] border border-border-soft rounded-full px-2 py-0.5"
            >
              {t}
            </span>
          ))}
        </div>
        <Link href="/library" className="text-accent hover:underline">
          More articles
        </Link>
      </div>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        dynastygeneral.app/library/{article.slug}
      </p>
    </footer>
  );
}
