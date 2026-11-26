/**
 * In-season Coach quick prompts, by league kind and trade window. A prompt
 * the user cannot act on is noise: no sell or buy prompt once trades are
 * closed, no offseason or rookie-draft prompt in redraft (rosters reset),
 * no lineup prompt in best ball (lineups set themselves). The trade window
 * comes from the canonical `tradeWindow`; the kind from `leagueKind`.
 */

import type { LeagueKind } from "@/lib/email/trade-desk/model";

export function seasonQuickPrompts(args: { kind: LeagueKind; tradeOpen: boolean }): string[] {
  const { kind, tradeOpen } = args;
  if (kind === "best_ball") {
    return [
      "What are my real chances this season, and what would change them?",
      "Which of my players are carrying my weekly best-ball scores?",
      "What should I do differently in next year's draft?",
    ];
  }
  if (kind === "redraft") {
    return tradeOpen
      ? [
          "What are my real chances this season, and what would change them?",
          "Which trade would add the most weekly points to my lineup?",
          "Who in the league is buying, and what do they need that I have?",
          "Where is my lineup thinnest, and who could fix it?",
        ]
      : [
          "What are my real chances this season, and what would change them?",
          "Where is my lineup thinnest, and which free agent could fix it?",
          "Who should I start this week?",
        ];
  }
  const draft = kind === "dynasty" ? "next year's rookie draft" : "next year's draft";
  return tradeOpen
    ? [
        "Should I keep going for the title or sell? Walk me through the three analysts.",
        "Which of my players should I sell before the offseason, and to whom?",
        "Who in the league is buying, and what do they need that I have?",
        "Where is my lineup thinnest, and who could fix it?",
        `What is my plan for ${draft}?`,
      ]
    : [
        "Trades are closed. What should my offseason plan be?",
        "Which of my players lose the most value by August?",
        "Where is my lineup thinnest for the rest of the season?",
        `What is my plan for ${draft}?`,
      ];
}
