/**
 * Contend-or-sell card (in-season). Renders the canonical verdict from
 * buildContendOrSellVerdict; it computes nothing. Behind the
 * contend_or_sell_card flag.
 *
 * Layer 1: the headline stance and the odds line. Layer 2: the voice
 * scale and the sell package with buyers. Layer 3: provenance (model,
 * sims, the registered prediction types and their status).
 */

import type { ContendOrSellVerdict } from "@/lib/strategy/verdict/compose";
import { fmtPct } from "@/lib/email/trade-desk/league-week";
import { STANCE_SCORE, type Stance, type VoiceName } from "@/lib/strategy/verdict/voices";

const STANCE_LABEL: Record<Stance, string> = {
  sell: "Sell",
  lean_sell: "Lean sell",
  split: "Split",
  lean_push: "Lean keep",
  push: "Keep going",
};

const VOICE: Record<VoiceName, { label: string; dot: string; text: string }> = {
  // One cast everywhere (2026-11-26): the three analysts keep the same
  // name and color on the hub, in Coach and in the weekly email. Colors
  // sit off the red-sell / green-keep axis so a dot never reads as a stance.
  moneyball: { label: "Moneyballer", dot: "bg-blue-400", text: "text-blue-300" },
  strategist: { label: "Strategist", dot: "bg-violet-400", text: "text-violet-300" },
  gambler: { label: "Gambler", dot: "bg-amber-500", text: "text-amber-400" },
};

const MIN_VALUE_SAVED = 2;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const pp = (d: number) => `${Math.abs(d * 100).toFixed(1)} pts`;
const valuePts = (n: number) => `${Math.round(n)} value point${Math.round(n) === 1 ? "" : "s"}`;
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function ContendOrSellCard({ verdict }: { verdict: ContendOrSellVerdict }) {
  const v = verdict;
  // Trades closed (best ball, past the deadline): show the odds and why
  // there is no move, never sell advice the user cannot act on.
  if (!v.trade_window.open) {
    return (
      <section className="rounded-lg border border-border-strong bg-surface p-4">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-2">
          Where you stand · hypothesis, not yet scored
        </p>
        <h3 className="mt-1 text-lg font-semibold">
          Win the league {fmtPct(v.odds.title_pct)}, {ordinal(v.league.rank_by_title_odds)}-best chance of {v.league.teams}
        </h3>
        <p className="text-sm text-muted">
          Playoffs {fmtPct(v.odds.playoff_pct)} · fair share {pct(v.league.fair_title_share)}.
        </p>
        <p className="mt-2 text-sm text-muted">{v.trade_window.label}</p>
      </section>
    );
  }
  const headline = STANCE_LABEL[v.panel.headline];
  // A sell candidate earns a line only if selling changes something: at
  // least 2 value points saved by August, half a point a week, or a
  // visible move in the chance to win the league. Bench filler that
  // changes nothing is left out (design-qa, PR #142).
  const worthListing = v.candidates.filter(
    (c) =>
      c.decay.value_lost >= MIN_VALUE_SAVED ||
      c.weekly_points_lost >= 0.5 ||
      Math.abs(c.title_delta) >= 0.005,
  );
  const consensus = v.panel.consensus ? "The voices agree" : "The voices disagree";
  return (
    <section className="rounded-lg border border-border-strong bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-2">
            Keep going or sell · hypothesis, not yet scored
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            {headline}: win the league {fmtPct(v.odds.title_pct)}, {ordinal(v.league.rank_by_title_odds)}-best chance of {v.league.teams}
          </h3>
          <p className="text-sm text-muted">
            Playoffs {fmtPct(v.odds.playoff_pct)} · fair share {pct(v.league.fair_title_share)} · {consensus}.
          </p>
        </div>
      </div>

      {/* Scale: -2 sell to +2 push, one dot per voice. */}
      <div className="mt-4">
        <div className="relative h-2 rounded-full bg-surface-2">
          {v.panel.voices.map((vr, i) => {
            const left = ((STANCE_SCORE[vr.stance] + 2) / 4) * 100;
            return (
              <span
                key={vr.voice}
                title={`${VOICE[vr.voice].label}: ${STANCE_LABEL[vr.stance]}`}
                className={`absolute top-1/2 h-3 w-3 rounded-full border border-surface ${VOICE[vr.voice].dot}`}
                style={{ left: `${left}%`, transform: `translate(-50%, ${-50 + (i - 1) * 40}%)` }}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-2">
          <span>Sell to contenders</span>
          <span>Keep going for the title</span>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 text-sm">
        {v.panel.voices.map((vr) => (
          <li key={vr.voice}>
            <span className={`font-semibold ${VOICE[vr.voice].text}`}>
              {VOICE[vr.voice].label} · {STANCE_LABEL[vr.stance]}.
            </span>{" "}
            <span className="text-muted">{vr.line}</span>
          </li>
        ))}
      </ul>

      {v.candidates.length > 0 && worthListing.length === 0 && (
        <p className="mt-4 border-t border-border-soft pt-3 text-sm text-muted">
          {v.panel.headline === "sell" || v.panel.headline === "lean_sell"
            ? "The odds say sell, but no sale here saves enough value by August, or moves your chance to win the league enough, to force a deal. Hold the roster into the offseason."
            : "No player here loses enough value by August, or moves your chance to win the league enough, to be worth selling."}
        </p>
      )}
      {worthListing.length > 0 && (
        <div className="mt-4 border-t border-border-soft pt-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-2">
            If you sell · who loses value by August, who should buy
          </p>
          <ul className="mt-2 space-y-3 text-sm">
            {worthListing.map((c) => (
              <li key={c.player.player_id}>
                <p>
                  <span className="font-semibold">{c.player.name}</span>{" "}
                  <span className="text-muted-2">
                    {c.player.position}
                    {c.player.age != null ? ` · ${c.player.age}` : ""} · value {Math.round(c.player.value)}
                  </span>
                </p>
                <p className="text-muted">
                  Age curve expects about {valuePts(c.decay.value_lost)} gone by August.{" "}
                  {c.weekly_points_lost >= 0.05
                    ? `Selling him costs ${c.weekly_points_lost.toFixed(1)} pts per week`
                    : "Selling him costs your lineup almost nothing each week"}
                  {Math.abs(c.title_delta) < 0.005
                    ? " and barely moves your chance to win the league"
                    : ` and ${pp(c.title_delta)} of your chance to win the league${c.title_delta > 0 ? " (a gain: his replacement scores more)" : ""}`}
                  .
                </p>
                {c.buyers.length > 0 && (
                  <p className="text-muted-2">
                    Buyers: {c.buyers.map((b) => `${b.label} (${b.reason})`).join("; ")}.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {worthListing.length === v.candidates.length && v.candidates.length > 1 && (
          <p className="mt-2 text-xs text-muted-2">
            Selling {v.candidates.map((c) => c.player.name.split(" ").slice(-1)[0]).join(" and ")} together: chance to win the league {fmtPct(v.odds.title_pct)} to {fmtPct(v.package.title_pct_if_sold)},
            about {valuePts(v.package.value_kept_by_selling)} kept. Contender premium is unknown and priced
            at 0, so ask for market value, not more.
          </p>
          )}
        </div>
      )}

      <details className="mt-3 text-xs text-muted-2">
        <summary className="cursor-pointer">How this is computed</summary>
        <p className="mt-1">
          {v.provenance.sims.toLocaleString()}{" "}simulated seasons from this season&apos;s weekly scores. Each team&apos;s
          weekly mean is shrunk {v.provenance.shrink_games} games toward the league average of{" "}
          {v.provenance.league_mean.toFixed(1)} pts; weekly luck sd {v.provenance.weekly_sd.toFixed(1)} pts;{" "}
          {v.provenance.weeks_remaining} regular-season weeks left; {v.provenance.playoff_teams}-team bracket.{" "}
          {v.horizon === "this_season"
            ? "Redraft rosters reset after the season, so the call reads only this season's odds; no offseason value is counted."
            : "Value decay reads the position age curve."}{" "}
          Voices weigh the same numbers differently; the Moneyballer prices a title at{" "}
          {v.title_worth} value points.
        </p>
        <p className="mt-1">
          Registered predictions (all hypotheses until the ledger scores them): {v.provenance.prediction_types.join(", ")}.
          No injuries, byes, or two-week playoff rounds are modeled yet.
        </p>
      </details>
    </section>
  );
}
