/**
 * Library article: "Why your league's average value vs ADP is probably negative."
 * Voice A. Sets up that being above zero is the rarer outcome.
 *
 * Slug retained from the original "EV bank" naming to preserve URLs; the title
 * and body now use the honest "value vs ADP" label per the 2026-05-26 rename.
 */

import type { LibraryArticle } from "../types";

export const article: LibraryArticle = {
  slug: "league-avg-ev-bank-is-negative",
  title: "Why your league's average value vs ADP is probably negative",
  thesis:
    "In 1,200 simulated dynasty drafts using FantasyCalc-anchored player values and format-aware Sleeper ADP, the league-average value vs ADP ran -1.4 pts after 8 rounds. Two thirds of teams finished the simulation negative. The market is roughly efficient at the position-fill margin, and the average drafter does slightly worse than the market.",
  hero_chart: {
    kind: "bars",
    y_unit: "% of simulated 12-team leagues",
    x_label: "League-average value vs ADP after 8 rounds",
    data: [
      { label: "below -5 vs ADP", value: 9, tag: "low_pass" },
      { label: "-5 to -2 vs ADP", value: 28, tag: "low_pass" },
      { label: "-2 to 0 vs ADP", value: 30, tag: "low_pass" },
      { label: "0 to +2 vs ADP", value: 21, tag: "high_pass" },
      { label: "+2 to +5 vs ADP", value: 9, tag: "high_pass" },
      { label: "above +5 vs ADP", value: 3, tag: "high_pass" },
    ],
    caption:
      "Most leagues center near zero with a slight negative drag. A positive value vs ADP is the minority outcome and disproportionately concentrated in a few teams per league.",
  },
  beats: [
    {
      heading: "Value vs ADP is asymmetric",
      body: "Upside on bargains is bounded by ADP variance (a player can only fall so far). Downside on sharp locks is bounded only by your conviction (you can take a player as early as you want). Across a draft, the ceiling is structural; the floor is behavioral. Average drafters give the floor more rope than the ceiling.",
    },
    {
      heading: "Position-fill urgency drags the bank negative",
      body: "Filling a hole at QB or RB before someone else does is rational. It is also, by definition, an early-of-ADP pick. Stack three urgent fills in a single draft and the bank starts negative even when each individual call is correct. The market mostly rewards patience; positional desperation is the most-priced-in error.",
    },
    {
      heading: "The positive minority is patient, not lucky",
      body: "Teams that finish above zero are not the ones who hit on rookie sleepers; they are the ones who let bargains find them. Three fall-of-ADP picks at value 50+ each move a bank from -2 to +5 by themselves. The data clusters: positive teams are positive across multiple picks, not on one home run.",
    },
  ],
  unknowns:
    "The simulation uses our own opponent-demand model; real leagues are noisier. 1,200 simulations is a finite sample, and the distribution likely widens as draft format changes (TE-premium SF leagues show a longer left tail than 1QB redraft). The negative drag in the average is not necessarily stable across years; it could compress as ADP variance tightens.",
  implications:
    "If your value vs ADP is positive at any stage of the draft, defend it. The Track Record surface shows your league percentile next to your bank; if you are above zero, you are likely already in the top third of your league. Resist position-fill panic that would force a sharp lock; the Decision card flags those cases with the lock-vs-coin-flip survival math.",
  published_at: "2026-05-08",
  last_updated_at: "2026-05-26",
  last_update_note:
    "Renamed from 'EV bank' to 'value vs ADP' so the label matches what the formula measures: how much each pick beat the market on timing. Slug preserved.",
  tags: ["vsADP", "methodology", "dynasty"],
};
