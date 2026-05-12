/**
 * EV Bank percentile chip. At-a-glance hub-header summary of the
 * user's standing on banked EV vs. the league.
 *
 * Per REDESIGN_INTENTIONS principle 8 (EV bank as Box 1 of the
 * 3-box row) + the audit's drifted-from-principle item: "user wanted
 * at-a-glance EV bank context BEFORE scrolling to 'How you're doing.'"
 *
 * Renders nothing when there's insufficient league context (only the
 * user has resolved totals, or fewer than 2 ranked rosters). The
 * detail-rich DraftProgressPanel.EvBankSection remains the deep
 * surface; this chip is the bridge-level glance.
 */

import type { LeagueEvBankReadout } from "@/lib/strategy/ev-bank/league";

export type EvBankPercentileChipProps = {
  leagueBank: LeagueEvBankReadout | null;
  /**
   * The user's banked EV total (from DraftProgress.ev_bank.total_ev).
   * Optional; rendered alongside the rank text when present.
   */
  total_ev: number | null;
};

export function EvBankPercentileChip({
  leagueBank,
  total_ev,
}: EvBankPercentileChipProps) {
  if (!leagueBank || leagueBank.ranked_count < 2 || leagueBank.my_rank == null) {
    return null;
  }
  const rank = leagueBank.my_rank;
  const count = leagueBank.ranked_count;
  const pct = leagueBank.my_percentile;
  const totalText =
    total_ev != null
      ? `${total_ev >= 0 ? "+" : ""}${total_ev.toFixed(1)} EV`
      : null;
  const isContender = rank === 1 || (pct != null && pct >= 75);
  const isMidPack = !isContender && pct != null && pct >= 25;
  const tone = isContender
    ? "border-success/60 bg-success/5 text-success"
    : isMidPack
      ? "border-border-strong bg-surface text-foreground"
      : "border-warning/40 bg-warning/5 text-warning";

  return (
    <div
      className={`mt-4 inline-flex flex-wrap items-baseline gap-3 rounded-md border ${tone} px-3 py-2`}
      aria-label="EV bank standing"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
        EV bank
      </span>
      {totalText && (
        <span className="font-mono text-[14px] font-semibold leading-none">
          {totalText}
        </span>
      )}
      <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
        rank {rank} of {count}
        {pct != null && ` · ${Math.round(pct)}th pct`}
      </span>
    </div>
  );
}
