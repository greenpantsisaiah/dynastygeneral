/**
 * Quote library for the vanilla / dynasty-purgatory warning.
 *
 * Each quote is verbatim from a credible dynasty voice (creators,
 * articles, podcasts). Used to give the warning real teeth. this
 * isn't our opinion, it's the dynasty community consensus.
 *
 * Counter-quotes included separately for the steel-man balanced
 * perspective the warning should acknowledge.
 */

export type Quote = {
  text: string;
  attribution: string;
  source_label?: string;
};

export const PURGATORY_QUOTES: Quote[] = [
  {
    text: "Dynasty Purgatory is the middle ground between contending and rebuilding, the absolute worst spot in a dynasty league.",
    attribution: "Shane Hallam",
    source_label: "Draft Sharks",
  },
  {
    text: "Being stuck in that kind of limbo is its own kind of hell, and is actually worse than being outright terrible.",
    attribution: "Jake Trowbridge",
    source_label: "Fantasy Life",
  },
  {
    text: "Not choosing a trajectory is how you get stuck in dynasty purgatory. Floating teams don't pick a direction and head to it.",
    attribution: "Josiah Ray",
    source_label: "Dynasty Rewind",
  },
  {
    text: "One of the biggest mistakes I see people make is inching toward this path and only half-committing, or chickening out.",
    attribution: "Jerry Donabedian",
    source_label: "RotoWire",
  },
  {
    text: "If your team consistently finishes in the middle of the standings, it's a warning sign. You're too strong to secure high draft picks and too weak to contend for a championship.",
    attribution: "Phil Cartlich",
    source_label: "King Fantasy Sports",
  },
  {
    text: "The last thing you want to do is fence sit and be stuck in the middle of your league table. If you're not sure, you aren't ready to compete for a title.",
    attribution: "Ellis Bryn Johnson",
    source_label: "FantasyPros",
  },
  {
    text: "The definition of insanity is rolling out the same middling roster year after year and expecting a different result.",
    attribution: "Jake Trowbridge",
    source_label: "Fantasy Life",
  },
];

// Counter-perspective. balance has a defensible role as a TEMPORARY stance
// to harvest mispriced assets. Surface this when the user has only made 1-2
// picks (genuinely too early to commit) so we don't bully them.
export const BALANCED_DEFENSE_QUOTES: Quote[] = [
  {
    text: "One advantage of being in the middle is that you aren't directionally committed. We can put feelers in a number of different directions to see where the value lies.",
    attribution: "Jerry Donabedian",
    source_label: "RotoWire",
  },
];

export function pickQuote(quotes: Quote[], seed: number): Quote {
  if (quotes.length === 0) {
    return { text: "", attribution: "" };
  }
  return quotes[seed % quotes.length];
}
