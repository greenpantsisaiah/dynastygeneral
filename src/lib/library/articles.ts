/**
 * Library article catalog. Lookup by slug, list by tag, list all.
 *
 * Adding articles: drop a `LibraryArticle` export in
 * `src/lib/library/articles/<slug>.ts` and add it to the array here.
 * The Library route auto-renders.
 */

import { article as agingCliffRb } from "./articles/aging-cliff-rb";
import type { LibraryArticle } from "./types";

const ALL_ARTICLES: LibraryArticle[] = [agingCliffRb];

export function getAllArticles(): LibraryArticle[] {
  return [...ALL_ARTICLES].sort((a, b) =>
    b.published_at.localeCompare(a.published_at),
  );
}

export function getArticleBySlug(slug: string): LibraryArticle | null {
  return ALL_ARTICLES.find((a) => a.slug === slug) ?? null;
}

export function getArticlesByTag(tag: string): LibraryArticle[] {
  return getAllArticles().filter((a) => a.tags.includes(tag));
}
