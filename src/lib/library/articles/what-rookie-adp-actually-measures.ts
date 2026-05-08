/**
 * Library article: "What rookie ADP actually measures (and what it doesn't)."
 * Voice A. Variant explainer that would have prevented the live-draft 143
 * vs 82 confusion.
 */

import type { LibraryArticle } from "../types";

export const article: LibraryArticle = {
  slug: "what-rookie-adp-actually-measures",
  title: "What rookie ADP actually measures (and what it doesn't)",
  thesis:
    "Jadarian Price's ADP showed up as 82 in a dynasty superflex format and 143 in a 1QB redraft format. Same player, same week, same Sleeper. The 61-pick gap is not a bug. It is what ADP actually measures: where players go IN A FORMAT.",
  hero_chart: {
    kind: "bars",
    y_unit: "Sleeper ADP for Jadarian Price (RB-SEA, age 22)",
    x_label: "ADP variant",
    data: [
      {
        label: "Rookie pool",
        value: 82,
        tag: "high_pass",
        annotation:
          "Rookie startup variant; reflects 'where does this rookie go in a dynasty SF startup?'",
      },
      {
        label: "Dynasty SF",
        value: 95,
        tag: "high_pass",
        annotation: "Veterans + rookies, format-aware. Slightly later than rookie pool.",
      },
      {
        label: "Dynasty 1QB",
        value: 118,
        tag: "low_pass",
        annotation: "1QB dynasty pushes RBs later because RB scarcity inverts.",
      },
      {
        label: "1QB redraft",
        value: 143,
        tag: "low_pass",
        annotation: "Redraft default. No keeper math, no future weight; rookies discount hard.",
      },
    ],
    caption:
      "Same player, four legitimate ADPs. The variant that matches your league's draft is the one to trust.",
  },
  beats: [
    {
      heading: "Format inverts position scarcity",
      body: "Superflex pulls QBs forward, which pushes RB and WR back. TE-premium pulls TEs forward, which pushes RB and WR back. Dynasty pulls young assets forward across every position because keeper math compounds. Rookie-startup ADPs sit between rookie-only and full-veteran startup ADPs because the rookie is competing with the full population but still gets the dynasty premium. Each variant is internally consistent; they tell different truths because they describe different drafts.",
    },
    {
      heading: "The product picks the variant that matches your league",
      body: "Dynasty General reads your league's roster_positions, scoring rules, and league_type, then resolves ADP via the matching variant (adp_dynasty_2qb, adp_dynasty_superflex, adp_dynasty_te_premium, or adp_rookie). The Sleeper UI defaults to the most-trafficked variant, usually 1QB redraft. When the two numbers diverge by 60+ picks, the gap is between two different games; trust the in-format number for the game you are actually playing.",
    },
    {
      heading: "Rookie ADP is a different scale entirely",
      body: "The variant called adp_rookie does not mean 'where this player goes in a rookie-only draft.' It means 'where this rookie goes in a dynasty startup that includes rookies.' Confusing the two is how a 2nd-round NFL RB at 'rookie ADP 82' gets dismissed as 'oh, but he is rookie 82, that is not really 82.' He is 82. In the only context that matters for your startup pick.",
    },
  ],
  unknowns:
    "Variant ADPs update at different cadences. A player with low draft volume in a rare variant may have a stale or noisy number. Pre-NFL-draft rookies (years_exp 0, no team yet) carry the most uncertainty across variants. The product's `pickAdpFromVariants` helper documents the priority order; consult it when a player's ADP looks discontinuous.",
  implications:
    "When the Decision card shows an ADP that disagrees with the Sleeper UI default, it is showing you the format-aware number. The standing-call body lines (\"ADP 82 is N picks past consensus\") use the format-matched value. If you want to verify, the candidate card carries the variant via the `adp_variant` field; tap a number in Sloan mode to see the source variant explicitly.",
  published_at: "2026-05-08",
  last_updated_at: null,
  last_update_note: null,
  tags: ["ADP", "variants", "methodology", "rookies"],
};
