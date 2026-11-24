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

const pct = (p: number) => `${Math.round(p * 100)}%`;
const pts = (v: number) => `${Math.round(v)}`;

export function moneyball(f: VoiceFacts, titleWorth = DEFAULT_TITLE_WORTH): VoiceRead {
  const cost = titleWorth * Math.max(0, -f.title_delta);
  const gain = f.value_kept_by_selling;
  const scale = Math.max(cost, gain, 1);
  const edge = (gain - cost) / scale;
  const stance: Stance =
    edge > 0.6 ? "sell" : edge > 0.25 ? "lean_sell" : edge < -0.6 ? "push" : edge < -0.25 ? "lean_push" : "split";
  return {
    voice: "moneyball",
    stance,
    line: `Selling keeps about ${pts(gain)} value points and costs ${pct(Math.max(0, -f.title_delta))} of title odds, worth ${pts(cost)} at ${titleWorth} per title.`,
  };
}

const GAMBLER_TAKE: Record<Stance, string> = {
  push: "That is a live ticket; ride it.",
  lean_push: "Close enough to a fair shot to keep playing.",
  split: "Below a fair shot but not dead; only sell for a clear return.",
  lean_sell: "A long shot; start cashing chips.",
  sell: "A long shot; cash the chips.",
};

export function gambler(f: VoiceFacts): VoiceRead {
  const fair = 1 / Math.max(2, f.teams);
  const r = f.title_pct / fair;
  const stance: Stance = r >= 1 ? "push" : r >= 0.6 ? "lean_push" : r >= 0.35 ? "split" : r >= 0.2 ? "lean_sell" : "sell";
  return {
    voice: "gambler",
    stance,
    line: `Title odds ${pct(f.title_pct)} against a fair share of ${pct(fair)}. ${GAMBLER_TAKE[stance]}`,
  };
}

export function strategist(f: VoiceFacts): VoiceRead {
  const fair = 1 / Math.max(2, f.teams);
  const contender = f.title_pct >= fair;
  const aging = f.roster_retained_share < 0.92;
  const young = f.roster_retained_share >= 0.98;
  let stance: Stance;
  if (young) stance = contender ? "push" : "lean_push";
  else if (aging) stance = contender ? "split" : "sell";
  else stance = contender ? "lean_push" : "lean_sell";
  return {
    voice: "strategist",
    stance,
    line: `The roster keeps about ${pct(f.roster_retained_share)} of its value through the offseason${aging ? ", so this core is shrinking" : young ? ", so this core still rises" : ""}. ${contender ? "This is a real window." : "This is not the window."}`,
  };
}

export interface Panel {
  voices: VoiceRead[];
  consensus: boolean;
  /** Mean stance score, -2 (sell) to +2 (push). */
  balance: number;
  headline: Stance;
}

export function convene(f: VoiceFacts, titleWorth = DEFAULT_TITLE_WORTH): Panel {
  const voices = [moneyball(f, titleWorth), gambler(f), strategist(f)];
  const scores = voices.map((v) => STANCE_SCORE[v.stance]);
  const balance = scores.reduce((s, x) => s + x, 0) / scores.length;
  const sides = new Set(scores.map((s) => Math.sign(s)));
  const consensus = sides.size === 1;
  const headline: Stance =
    balance <= -1.5 ? "sell" : balance <= -0.5 ? "lean_sell" : balance >= 1.5 ? "push" : balance >= 0.5 ? "lean_push" : "split";
  return { voices, consensus, balance, headline };
}
