/**
 * Coach quality eval: the question bank.
 *
 * Realistic mid-season dynasty questions, written the way a manager types
 * them into a chat box. Placeholders in {braces} are filled per league from
 * the same <current_state> payload Coach receives (see fill.ts), so every
 * question names real players and real opponents in the league under test.
 *
 * `scope: "cross_league"` questions are about the user's WHOLE portfolio of
 * leagues (the founder's "overwhelm" thesis: managers track their own
 * players, not every competitor in every league). Coach is per-league today,
 * so these measure a product gap as much as answer quality; the report
 * scores them separately.
 *
 * Real questions exported from chat_history (export-real-questions.ts) run
 * alongside this bank and are reported as their own slice.
 */

export type QuestionCategory =
  | "direction" // contend or sell, team identity
  | "trade_build" // construct an offer with a named opponent
  | "player_call" // buy / sell / hold one player
  | "lineup" // start/sit, injuries, this week
  | "waivers" // free agents, depth adds
  | "roster_build" // positional needs, depth, age curve
  | "picks_future" // rookie picks, offseason, taxi
  | "league_intel" // opponent reads, who to target
  | "cross_league"; // portfolio-level questions across leagues

export type BankQuestion = {
  id: string;
  category: QuestionCategory;
  scope: "league" | "cross_league";
  text: string;
  /** Opponent placeholders used, so the baseline paste includes those rosters. */
  mentionsOpponents?: Array<"opp_a" | "opp_b">;
};

export const QUESTION_BANK: BankQuestion[] = [
  // ── Direction: contend or sell ──────────────────────────────────────
  { id: "dir-01", category: "direction", scope: "league", text: "Am I a real contender this year or should I start selling? Give me a straight answer." },
  { id: "dir-02", category: "direction", scope: "league", text: "The trade deadline is coming. What is the single most important move I should make before it?" },
  { id: "dir-03", category: "direction", scope: "league", text: "If I'm not making the playoffs, which of my players should I sell now while their value is highest?" },
  { id: "dir-04", category: "direction", scope: "league", text: "Is my roster built for this year or for 2027-2028? Be honest about the window." },
  { id: "dir-05", category: "direction", scope: "league", text: "What's the biggest weakness on my team right now, and is it fixable this season?" },
  { id: "dir-06", category: "direction", scope: "league", text: "Should I go all in for a title this year? What would it cost me in future value?" },

  // ── Trade construction with named opponents ─────────────────────────
  { id: "trd-01", category: "trade_build", scope: "league", text: "Give me a realistic trade I could send {opp_a} this week that helps both of us.", mentionsOpponents: ["opp_a"] },
  { id: "trd-02", category: "trade_build", scope: "league", text: "I want {opp_a_top} from {opp_a}. What would it realistically take from my roster?", mentionsOpponents: ["opp_a"] },
  { id: "trd-03", category: "trade_build", scope: "league", text: "{opp_b} offered me their 2027 1st for {my_top}. Should I take it?", mentionsOpponents: ["opp_b"] },
  { id: "trd-04", category: "trade_build", scope: "league", text: "Which manager in my league is the best trade partner for me right now, and what should I offer them?" },
  { id: "trd-05", category: "trade_build", scope: "league", text: "I want to turn {my_old} into younger assets. Who should I shop him to and what's a fair ask?" },
  { id: "trd-06", category: "trade_build", scope: "league", text: "Can you build me a 2-for-1 consolidation trade to upgrade my starting lineup?" },
  { id: "trd-07", category: "trade_build", scope: "league", text: "{opp_a} needs help at RB. What can I get from them if I give up one of my backs?", mentionsOpponents: ["opp_a"] },
  { id: "trd-08", category: "trade_build", scope: "league", text: "Is {my_young} for {opp_b_top} a fair trade? Which side wins?", mentionsOpponents: ["opp_b"] },

  // ── Player calls ────────────────────────────────────────────────────
  { id: "ply-01", category: "player_call", scope: "league", text: "Should I sell {my_old} now or ride it out this season?" },
  { id: "ply-02", category: "player_call", scope: "league", text: "Is {my_young} a buy, sell, or hold in dynasty right now?" },
  { id: "ply-03", category: "player_call", scope: "league", text: "What is {my_top} worth on the trade market today, in terms of picks?" },
  { id: "ply-04", category: "player_call", scope: "league", text: "Which player on my roster is most overvalued by the market right now?" },
  { id: "ply-05", category: "player_call", scope: "league", text: "Which player on my roster is most likely to lose a lot of value by next summer?" },
  { id: "ply-06", category: "player_call", scope: "league", text: "Who on my bench is a breakout candidate I should hold onto?" },
  { id: "ply-07", category: "player_call", scope: "league", text: "Is {my_qb} a long-term starter for me or should I be looking for his replacement?" },
  { id: "ply-08", category: "player_call", scope: "league", text: "Should I be worried about {my_te} long term?" },

  // ── Lineup / this week ──────────────────────────────────────────────
  { id: "lin-01", category: "lineup", scope: "league", text: "Who should I start at flex this week?" },
  { id: "lin-02", category: "lineup", scope: "league", text: "Any of my starters dealing with injuries I should know about right now?" },
  { id: "lin-03", category: "lineup", scope: "league", text: "Am I likely to win my matchup this week?" },
  { id: "lin-04", category: "lineup", scope: "league", text: "I have a bye-week problem coming. How should I plan my lineup around it?" },
  { id: "lin-05", category: "lineup", scope: "league", text: "Rank my receivers for this week's lineup." },

  // ── Waivers ─────────────────────────────────────────────────────────
  { id: "wav-01", category: "waivers", scope: "league", text: "Who is the best free agent I should pick up right now?" },
  { id: "wav-02", category: "waivers", scope: "league", text: "Is there a handcuff available I should stash for my RBs?" },
  { id: "wav-03", category: "waivers", scope: "league", text: "Who should I drop to make room for a waiver add?" },

  // ── Roster construction ─────────────────────────────────────────────
  { id: "ros-01", category: "roster_build", scope: "league", text: "Do I have enough RB depth to survive an injury?" },
  { id: "ros-02", category: "roster_build", scope: "league", text: "Is my roster too old? Which positions are aging out first?" },
  { id: "ros-03", category: "roster_build", scope: "league", text: "Given our league's format, am I valuing QBs correctly on my roster?" },
  { id: "ros-04", category: "roster_build", scope: "league", text: "Where am I strongest relative to the rest of the league, and how do I use that surplus?" },
  { id: "ros-05", category: "roster_build", scope: "league", text: "How does my starting lineup compare to the top teams in this league?" },

  // ── Picks / future ──────────────────────────────────────────────────
  { id: "pck-01", category: "picks_future", scope: "league", text: "Should I trade my 2027 1st for a proven starter?" },
  { id: "pck-02", category: "picks_future", scope: "league", text: "Which of my young players belong on taxi and which should be active?" },
  { id: "pck-03", category: "picks_future", scope: "league", text: "What should my offseason plan be for this roster?" },
  { id: "pck-04", category: "picks_future", scope: "league", text: "How strong is the 2027 rookie class at the positions I need?" },
  { id: "pck-05", category: "picks_future", scope: "league", text: "Who in my league has the most future draft capital, and should that worry me?" },

  // ── League intel ────────────────────────────────────────────────────
  { id: "int-01", category: "league_intel", scope: "league", text: "Who are the real contenders in my league right now?" },
  { id: "int-02", category: "league_intel", scope: "league", text: "Which manager in my league is most likely to overpay in a trade?" },
  { id: "int-03", category: "league_intel", scope: "league", text: "What is {opp_a}'s biggest weakness and how can I exploit it?", mentionsOpponents: ["opp_a"] },
  { id: "int-04", category: "league_intel", scope: "league", text: "Which teams are rebuilding and might sell me veterans cheap?" },
  { id: "int-05", category: "league_intel", scope: "league", text: "Who has QB depth I could pry loose?" },

  // ── Cross-league (portfolio) ────────────────────────────────────────
  { id: "xl-01", category: "cross_league", scope: "cross_league", text: "I'm in {league_count} dynasty leagues ({league_names}). Which one should I push all-in on this year and which should I rebuild?" },
  { id: "xl-02", category: "cross_league", scope: "cross_league", text: "Across all my leagues, which players am I most overexposed to?" },
  { id: "xl-03", category: "cross_league", scope: "cross_league", text: "I only have time for a few trades this week. Across all my leagues, which 3 moves matter most?" },
  { id: "xl-04", category: "cross_league", scope: "cross_league", text: "In which of my leagues is the trade market most favorable to me right now, and why?" },
  { id: "xl-05", category: "cross_league", scope: "cross_league", text: "Is there a player I should be buying in every league I'm in?" },
  { id: "xl-06", category: "cross_league", scope: "cross_league", text: "Which of my leagues needs my attention most urgently right now?" },
];
