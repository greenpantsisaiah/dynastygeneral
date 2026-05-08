/**
 * Library article types.
 *
 * The Library is the on-demand 538-style explainer layer of the
 * redesigned Dynasty General hub. Per the design spec (Phase D
 * "The Library") and BRAND_VOICE.md longform shape:
 *
 *   1. Counterintuitive thesis (1-2 sentences, numbers in the lede)
 *   2. Hero chart (annotated, not just labeled)
 *   3. 2-3 supporting beats (each tightens the thesis)
 *   4. Acknowledge what is unknown (credibility move)
 *   5. Implications for the user's decision (actionable, ties back
 *      to the product surface where the decision lives)
 *
 * Returning visitors see the auto-collapsed view: thesis + chart
 * only, with "view full article" affordance and an "Updated [date]:
 * [what changed]" line above the thesis when fresh data has shifted
 * the conclusion. (Per principle 11, the hub is a workspace, not a
 * magazine.)
 */

export type HeroChart =
  | {
      kind: "bars";
      // Each bar is one observation. Annotations can flag specific
      // bars to highlight in the visual.
      data: Array<{
        label: string;
        value: number;
        // Optional secondary value rendered next to the primary.
        secondary?: string;
        // Optional tag to color/shape the bar (e.g., "high_pass" vs
        // "low_pass"); the renderer maps tags to color tokens.
        tag?: string;
        // Optional inline annotation rendered to the right of the bar.
        annotation?: string;
      }>;
      // Y-axis unit for the legend ("ROI % vs ADP" / "EV pts").
      y_unit: string;
      // X-axis label.
      x_label?: string;
      // Caption beneath the chart. Voice A: terse, names the reading.
      caption: string;
    }
  | {
      kind: "scatter";
      data: Array<{
        x: number;
        y: number;
        label: string;
        tag?: string;
      }>;
      x_label: string;
      y_label: string;
      caption: string;
    };

export type LibraryArticleBeat = {
  heading: string;
  body: string;
};

export type LibraryArticle = {
  slug: string;
  title: string;
  // Lede: 1-2 sentences with numbers up front. Drives the
  // collapsed-view summary on return visits.
  thesis: string;
  hero_chart: HeroChart;
  beats: LibraryArticleBeat[];
  // What we do not know. Required field; do not skip. This is the
  // credibility move.
  unknowns: string;
  // 2-3 lines naming the product surface where the implication
  // shows up. Voice A: actionable, concrete.
  implications: string;
  // When the article was first published. ISO date string.
  published_at: string;
  // When the article was last updated, if ever. Drives the
  // "Updated [date]: [what changed]" line on return visits.
  last_updated_at: string | null;
  // What changed in the most recent update. Null when never
  // updated.
  last_update_note: string | null;
  // Tags for the contextual recommendation engine. e.g., ["aging",
  // "RB", "dynasty"]. The hub's surface-router uses these to
  // surface "If you're surprised by your standing call, read this."
  tags: string[];
};
