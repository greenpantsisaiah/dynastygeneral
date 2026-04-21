/**
 * Window weighting. the user's declared bias toward winning this
 * season vs building future value. Drives ranker behavior, target
 * overlay on the meters, and drift detection.
 *
 * Five buckets. Numeric ratios are 0-100 win-now share, e.g.
 * "all-in" = 90 means 90% of decisions should favor win-now.
 */

export type WindowWeightingId =
  | "all-in"
  | "lean-now"
  | "balanced"
  | "lean-future"
  | "rebuild";

export type WindowWeighting = {
  id: WindowWeightingId;
  label: string;
  win_now_share: number; // 0..100
  blurb: string;
};

export const WINDOW_WEIGHTINGS: WindowWeighting[] = [
  {
    id: "all-in",
    label: "All-in this year",
    win_now_share: 90,
    blurb: "Cash every future asset for production. Title or bust.",
  },
  {
    id: "lean-now",
    label: "Lean win-now",
    win_now_share: 65,
    blurb: "Compete this season without torching future value. Iceman default.",
  },
  {
    id: "balanced",
    label: "Balanced",
    win_now_share: 50,
    blurb: "Stay flexible. Move toward whichever window opens.",
  },
  {
    id: "lean-future",
    label: "Lean future",
    win_now_share: 35,
    blurb: "Build the next window. Take this season's wins as bonus.",
  },
  {
    id: "rebuild",
    label: "Full rebuild",
    win_now_share: 10,
    blurb: "Stockpile picks and youth. This year is irrelevant.",
  },
];

export function getWindowWeighting(
  id: WindowWeightingId,
): WindowWeighting {
  const w = WINDOW_WEIGHTINGS.find((x) => x.id === id);
  // Fallback to balanced. id is from a closed enum so this is defensive.
  return w ?? WINDOW_WEIGHTINGS[2];
}
