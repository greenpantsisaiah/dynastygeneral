/**
 * The three voices. Same registered facts, different objectives, so they
 * can disagree in the open (product principle, 2026-11-23: never a bare
 * verdict). Each voice is a POLICY, not a fact: its thresholds are its
 * personality, and its logged track record (prediction ledger) is what
 * tells the user how much to trust it. No voice may cite a number that is
 * not in VoiceFacts.
 *
 * - Moneyball: risk-neutral. Sell when the value you keep by selling now
 *   beats the title odds you give up, priced at `title_worth` value points
 *   per title (the user dial; default below).
 * - Gambler: chases the title. Pushes whenever the title odds are at or
 *   near a fair share, sells only a long shot.
 * - Strategist: plays the multi-year window. Reads how fast the core is
 *   aging; keeps a young core even in a lost season, sells an old core
 *   that is not a real contender.
 */

export type Stance = "sell" | "lean_sell" | "split" | "lean_push" | "push";
export type VoiceName = "moneyball" | "gambler" | "strategist";

export const STANCE_SCORE: Record<Stance, number> = {
  sell: -2,
  lean_sell: -1,
  split: 0,
  lean_push: 1,
  push: 2,
};

export interface VoiceFacts {
  teams: number;
  title_pct: number;
  playoff_pct: number;
  /** P(title | sell package) minus P(title | hold), as a probability (negative when selling hurts). */
  title_delta: number;
  /** Value points kept by selling before the offseason (sum of package decay). */
  value_kept_by_selling: number;
  /** Value-weighted share of the whole roster's value kept through the offseason. */
  roster_retained_share: number;
}

export interface VoiceRead {
  voice: VoiceName;
  stance: Stance;
  line: string;
}

/** Value points one title is worth to the Moneyball voice. The user dial
 * (lambda in the contend-or-sell rule). INTERNAL_HEURISTIC default: one
 * title is worth one elite player (value 100). */
export const DEFAULT_TITLE_WORTH = 100;

// Clamp the ends so no voice prints "0%" or "100%" (BUILD_SPEC content lint).
const pct = (p: number) => (p < 0.02 ? "under 2%" : p > 0.98 ? "over 98%" : `${Math.round(p * 100)}%`);
const pts = (v: number) => `${Math.round(v)}`;

/**
 * Optional per-card context. With it, every sentence a voice says names
 * the player and the league's own record, so two cards in one email never
 * share a sentence (desk1 review, 2026-11-26: identical analyst lines
 * across leagues read as boilerplate). The stance logic is identical with
 * or without it; only the phrasing changes.
 */
export interface VoiceContext {
  player: string;
  /** "4-7" or "4-7-1". */
  record: string;
}

export function moneyball(f: VoiceFacts, titleWorth = DEFAULT_TITLE_WORTH, ctx?: VoiceContext): VoiceRead {
  const cost = titleWorth * Math.max(0, -f.title_delta);
  const gain = f.value_kept_by_selling;
  const scale = Math.max(cost, gain, 1);
  const edge = (gain - cost) / scale;
  const stance: Stance =
    edge > 0.6 ? "sell" : edge > 0.25 ? "lean_sell" : edge < -0.6 ? "push" : edge < -0.25 ? "lean_push" : "split";
  const lost = Math.max(0, -f.title_delta);
  // Never print "costs 0%, worth 0": say the odds barely move instead.
  const oddsClause =
    Math.round(lost * 100) < 1
      ? "barely moves your chance to win the league (under 1 point)"
      : `costs ${Math.round(lost * 100)} points of league-win chance, worth ${pts(cost)} value points at ${titleWorth} per title`;
  const keptClause = Math.round(gain) < 1 ? "keeps almost no value" : `keeps about ${pts(gain)} value point${Math.round(gain) === 1 ? "" : "s"}`;
  return {
    voice: "moneyball",
    stance,
    line: `Selling ${ctx ? `${ctx.player} ` : ""}${keptClause} and ${oddsClause}.`,
  };
}

const GAMBLER_TAKE: Record<Stance, string> = {
  push: "That is a live ticket; ride it.",
  lean_push: "Close enough to a fair shot to keep playing.",
  split: "Below a fair shot but not dead; only sell for a clear return.",
  lean_sell: "A long shot; start cashing chips.",
  sell: "A long shot; cash the chips.",
};
const GAMBLER_CARD_TAKE: Record<Stance, (p: string) => string> = {
  push: (p) => `a live ticket, so ride ${p}`,
  lean_push: (p) => `close enough to a fair shot to keep ${p}`,
  split: (p) => `below a fair shot but not dead, so move ${p} only for a clear return`,
  lean_sell: (p) => `a long shot, so start shopping ${p}`,
  sell: (p) => `a long shot, so cash in ${p} while the price holds`,
};

export function gambler(f: VoiceFacts, ctx?: VoiceContext): VoiceRead {
  const fair = 1 / Math.max(2, f.teams);
  const r = f.title_pct / fair;
  const stance: Stance = r >= 1 ? "push" : r >= 0.6 ? "lean_push" : r >= 0.35 ? "split" : r >= 0.2 ? "lean_sell" : "sell";
  return {
    voice: "gambler",
    stance,
    line: ctx
      ? `At ${ctx.record}, your chance to win the league is ${pct(f.title_pct)} against a fair share of ${pct(fair)}: ${GAMBLER_CARD_TAKE[stance](ctx.player)}.`
      : `Chance to win the league ${pct(f.title_pct)} against a fair share of ${pct(fair)}. ${GAMBLER_TAKE[stance]}`,
  };
}

/** Below this playoff chance the season is over for the Strategist. */
const SEASON_OVER_PLAYOFF = 0.02;

export function strategist(f: VoiceFacts, ctx?: VoiceContext): VoiceRead {
  const fair = 1 / Math.max(2, f.teams);
  const contender = f.title_pct >= fair;
  const aging = f.roster_retained_share < 0.92;
  // "Holds its value" is about value retention, not age: a 0-11 roster can
  // hold its value and still be old (desk1 review: "the core is young" on a
  // 0-11 team read as wrong).
  const holds = f.roster_retained_share >= 0.98;
  const over = f.playoff_pct < SEASON_OVER_PLAYOFF;
  const kept =
    f.roster_retained_share > 0.98
      ? "The roster keeps nearly all of its value through the offseason"
      : `The roster keeps about ${pct(f.roster_retained_share)} of its value through the offseason`;
  const keptLower = kept.charAt(0).toLowerCase() + kept.slice(1);
  // One sentence per case, so the line always agrees with the stance
  // (2026-11-25: "this core still rises. This is not the window." read as
  // a contradiction next to a lean-push stance).
  let stance: Stance;
  let line: string;
  if (holds && contender) {
    stance = "push";
    line = ctx
      ? `At ${ctx.record} this is a real window and ${keptLower}, so keep ${ctx.player} and keep going.`
      : `${kept}, and this is a real window. Keep going now; the core holds its value either way.`;
  } else if (holds) {
    stance = "lean_push";
    line = ctx
      ? over
        ? `At ${ctx.record} this season is over, but ${keptLower}, so there is no rush to move ${ctx.player} in a quick sale.`
        : `At ${ctx.record} this is not the window, but ${keptLower}, so hold ${ctx.player} for next season unless the offer is strong.`
      : over
        ? `${kept}. This season is over, but the core holds its value, so keep it for next season rather than selling cheap.`
        : `${kept}. This year is not the window, but the core holds its value, so keep it for next season rather than selling.`;
  } else if (aging && contender) {
    stance = "split";
    line = ctx
      ? `${kept}, so ${ctx.player} loses value by August, but at ${ctx.record} this is a real window: keep going only if you accept selling later for less.`
      : `${kept}, so the core is shrinking, but this is a real window. Keep going only if you accept selling later at a lower price.`;
  } else if (aging) {
    stance = "sell";
    line = ctx
      ? `${kept} and at ${ctx.record} this is not the window: sell ${ctx.player} before the value drops.`
      : `${kept}, so the core is shrinking and this is not the window. Sell the aging pieces before they lose more.`;
  } else if (contender) {
    stance = "lean_push";
    line = ctx
      ? `At ${ctx.record} this is a real window and ${keptLower}, so lean toward keeping ${ctx.player}.`
      : `${kept} and this is a real window. Lean toward keeping going.`;
  } else {
    stance = "lean_sell";
    line = ctx
      ? `At ${ctx.record} this is not the window and ${keptLower}, so lean toward selling ${ctx.player}.`
      : `${kept}, but this is not the window. Lean toward selling.`;
  }
  return { voice: "strategist", stance, line };
}

export interface Panel {
  voices: VoiceRead[];
  consensus: boolean;
  /** Mean stance score, -2 (sell) to +2 (push). */
  balance: number;
  headline: Stance;
}

export function convene(f: VoiceFacts, titleWorth = DEFAULT_TITLE_WORTH, ctx?: VoiceContext): Panel {
  const voices = [moneyball(f, titleWorth, ctx), gambler(f, ctx), strategist(f, ctx)];
  const scores = voices.map((v) => STANCE_SCORE[v.stance]);
  const balance = scores.reduce((s, x) => s + x, 0) / scores.length;
  const sides = new Set(scores.map((s) => Math.sign(s)));
  const consensus = sides.size === 1;
  const headline: Stance =
    balance <= -1.5 ? "sell" : balance <= -0.5 ? "lean_sell" : balance >= 1.5 ? "push" : balance >= 0.5 ? "lean_push" : "split";
  return { voices, consensus, balance, headline };
}
