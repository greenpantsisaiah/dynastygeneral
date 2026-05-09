/**
 * Library teaser for the triage hub. Surfaces 1 article based on
 * what's relevant to the user's current state. Per the redesign:
 * "you get to / see recommended rather than yelling at you on the
 * UI all the time."
 *
 * Recommendation logic (v1): pick the most-recently-published article
 * that has a tag matching one of the user's current state cues.
 * Future iterations can incorporate read history and surface
 * unread-first.
 */

import Link from "next/link";
import { getAllArticles } from "@/lib/library/articles";

export type LibraryTeaserProps = {
  // Current state cues: tags relevant to what the user is doing
  // right now. Examples: "RB" if they have an RB hole, "ADP" if
  // they're surprised by an ADP, "EV" mid-draft.
  contextTags: string[];
};

export function LibraryTeaser({ contextTags }: LibraryTeaserProps) {
  const articles = getAllArticles();
  const matched =
    articles.find((a) =>
      a.tags.some((t) => contextTags.includes(t)),
    ) ?? articles[0];
  if (!matched) return null;
  return (
    <section className="mt-8 rounded-lg border border-border-soft bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          From the Library
        </div>
        <Link
          href="/library"
          className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
        >
          All articles →
        </Link>
      </div>
      <Link href={`/library/${matched.slug}`} className="block mt-2 group">
        <h3 className="text-base font-semibold text-foreground group-hover:text-accent transition-colors">
          {matched.title}
        </h3>
        <p className="mt-1 text-[12px] leading-snug text-muted">
          {matched.thesis}
        </p>
      </Link>
    </section>
  );
}
