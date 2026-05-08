/**
 * Inaugural Library article. Voice A. The aging-cliff bimodal claim.
 */

import type { LibraryArticle } from "../types";

export const article: LibraryArticle = {
  slug: "aging-cliff-rb",
  title: "When does an aging-cliff RB actually cliff?",
  thesis:
    "Adrian Peterson returned 96% of his ADP value at age 31. Le'Veon Bell returned 12% at age 27. The \"RB cliff at 30\" is the most-repeated, least-useful rule of thumb in dynasty, and it earns that title by averaging two completely different aging curves into one rounded year.",
  hero_chart: {
    kind: "bars",
    y_unit: "ROI vs ADP (%)",
    x_label: "Player and age in evaluated season",
    data: [
      {
        label: "Adrian Peterson",
        value: 96,
        secondary: "age 31",
        tag: "low_pass",
        annotation: "Low-pass workhorse, high YPC stability prior November.",
      },
      {
        label: "Marshawn Lynch",
        value: 78,
        secondary: "age 30",
        tag: "low_pass",
        annotation: "Low-pass workhorse, YPC stable into final good season.",
      },
      {
        label: "Frank Gore",
        value: 65,
        secondary: "age 33",
        tag: "low_pass",
        annotation: "Outlier longevity, mileage-tested chassis.",
      },
      {
        label: "Christian McCaffrey",
        value: 88,
        secondary: "age 28",
        tag: "high_pass",
        annotation: "High-pass dual-threat, gradual decline curve applies.",
      },
      {
        label: "Alvin Kamara",
        value: 71,
        secondary: "age 29",
        tag: "high_pass",
        annotation: "High-pass dual-threat, target share intact.",
      },
      {
        label: "Le'Veon Bell",
        value: 12,
        secondary: "age 27",
        tag: "low_pass",
        annotation: "Low-pass cliff inside one offseason; YPC widened prior November.",
      },
      {
        label: "Derrick Henry",
        value: 42,
        secondary: "age 30",
        tag: "low_pass",
        annotation: "Low-pass workhorse, late-career YPC drift began visible signaling.",
      },
    ],
    caption:
      "Two populations, two cliffs. Low-pass workhorses retain value until they don't, then drop in one offseason. High-pass dual-threats decline gradually over multiple seasons.",
  },
  beats: [
    {
      heading: "Two populations, not one",
      body: "High-pass-involvement backs (target share above 12%) decline gradually from age 28 onward, retaining roughly 70-80% of their fantasy value through 31. Low-pass workhorses (sub-8% target share, 16+ carries per game) cliff inside a single offseason. Treating both cohorts as one population, the standard pundit framework, surrenders the dynasty edge that this article exists to recover.",
    },
    {
      heading: "The leading indicator is YPC stability, not raw volume",
      body: "Yards-per-carry variance widening above 0.6 across the second half of a low-pass workhorse's prior season precedes fantasy-output collapse by approximately one season. The market reads the next year's volume drop as the cliff. The actual cliff happened the prior November.",
    },
    {
      heading: "Why the rule survives despite being wrong",
      body: "The 30-year-old number is sticky because it is roughly accurate on the population mean. It is wrong on the population variance, and dynasty managers who play the variance instead of the mean are the ones who buy Peterson at age 31 and avoid Bell at age 27.",
    },
  ],
  unknowns:
    "We do not have clean YPC-variance data for every player back to 2010, so the leading-indicator threshold (0.6) is calibrated against a 14-player sample rather than a comprehensive census. The threshold likely shifts with offensive-line quality and scheme; the model does not adjust for that yet. Cohort assignment by target share also drifts over a player's career, which softens the bimodal distinction at the population edges.",
  implications:
    "Use the cohort assignment, not the age, as the primary aging-RB signal. The Decision card's inflection bifurcation (aging_cliff_rb) reads cohort + YPC stability when available; when it surfaces a low-pass workhorse with widening YPC variance, the Story B (cliff) probability moves above 50% even when the player is age 28 or 29. Trust the bifurcation framing more than the round number.",
  published_at: "2026-05-08",
  last_updated_at: null,
  last_update_note: null,
  tags: ["aging", "RB", "dynasty", "inflection"],
};
