/**
 * The three analysts as the homepage presents them. Names and colors
 * match the weekly brief and the hub (advisor thread, PR #132):
 * Strategist #7C5CC4, Moneyballer #2A6FB8, Gambler #C76A12, never
 * red or green so a stance never reads as right or wrong.
 */
export const ANALYSTS = [
  {
    key: "moneyballer",
    initial: "M",
    name: "The Moneyballer",
    color: "#2A6FB8",
    role: "Prices the move. Value kept against title chance given up.",
  },
  {
    key: "strategist",
    initial: "S",
    name: "The Strategist",
    color: "#7C5CC4",
    role: "Builds the roster. Ages, windows, and next season's lineup.",
  },
  {
    key: "gambler",
    initial: "G",
    name: "The Gambler",
    color: "#C76A12",
    role: "Plays the odds. Is your title chance better than a fair share?",
  },
] as const;

export type AnalystKey = (typeof ANALYSTS)[number]["key"];

export function analyst(key: AnalystKey) {
  return ANALYSTS.find((a) => a.key === key)!;
}
