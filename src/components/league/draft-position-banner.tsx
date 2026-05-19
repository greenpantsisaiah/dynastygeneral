/**
 * Draft Position Banner. Leads the pre-draft hub. Surfaces three
 * specific things the founder named:
 *   1. Which pick in draft order am I?
 *   2. Which of my picks did I trade away (and to whom)?
 *   3. Which opponent picks did I acquire?
 *
 * Replaces the generic "Plan the build before the clock starts"
 * hero in pre-draft state. Data comes from summarizeUpcomingDraft
 * which reads canonical snapshot data (slot_to_roster_id +
 * traded_picks); no new Sleeper calls.
 */

import type { UpcomingDraftSummary } from "@/lib/strategy/pre-draft/upcoming-draft";

const SEASON_TONE = "text-accent";

export function DraftPositionBanner({
  summary,
  ownerNameByRosterId,
}: {
  summary: UpcomingDraftSummary;
  /** Roster_id → owner display name. Used to render "sent to X". */
  ownerNameByRosterId: Map<number, string>;
}) {
  const {
    season,
    my_slot,
    my_owned,
    traded_away,
    acquired,
    r1_slot_delta,
    rounds,
  } = summary;

  // Rookie drafts run 4-6 rounds; startup drafts run 12-25. Labeling
  // a 12-round startup as "rookie draft" was the 2026-05-19 founder
  // complaint. The rounds heuristic is the same one used by
  // resolveRookieRounds + the active-startup posture suppression.
  const draftKindLabel = rounds > 6 ? "startup draft" : "rookie draft";

  return (
    <section
      className="mt-4 rounded-lg border-2 border-accent/60 bg-accent/5 px-5 py-4"
      aria-label="Draft position"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Draft position
          </span>
          <span className={`font-mono text-[10px] uppercase tracking-[0.18em] ${SEASON_TONE}`}>
            {season} {draftKindLabel}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          {my_owned.length} pick{my_owned.length === 1 ? "" : "s"} owned
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        {my_slot != null ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-foreground">
              {formatLabel(1, my_slot, summary.total_teams)}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
              base slot · round 1
            </span>
          </div>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-warning">
            Slot order not published yet
          </span>
        )}
        {r1_slot_delta !== 0 && (
          <SlotDeltaChip delta={r1_slot_delta} />
        )}
      </div>

      {my_owned.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            Your slot schedule
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {my_owned.map((p) => (
              <span
                key={`${p.round}-${p.slot}-${p.pick_no}`}
                className="rounded-sm border border-accent/40 bg-accent/5 px-2 py-1 font-mono text-[11px] text-foreground"
                title={`Round ${p.round}, slot ${p.slot}, overall pick ${p.pick_no}`}
              >
                {p.pick_label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TradeColumn
          heading={
            traded_away.length > 0
              ? `Traded away · ${traded_away.length}`
              : "Traded away · 0"
          }
          tone="warning"
          rows={traded_away.map((p) => ({
            label: p.pick_label,
            counterparty:
              ownerNameByRosterId.get(p.sent_to_roster_id) ??
              `roster #${p.sent_to_roster_id}`,
            preposition: "to",
          }))}
          emptyText="No picks sent in this draft."
        />
        <TradeColumn
          heading={
            acquired.length > 0
              ? `Acquired · ${acquired.length}`
              : "Acquired · 0"
          }
          tone="success"
          rows={acquired.map((p) => ({
            label: p.pick_label,
            counterparty:
              ownerNameByRosterId.get(p.acquired_from_roster_id) ??
              `roster #${p.acquired_from_roster_id}`,
            preposition: "from",
          }))}
          emptyText="No picks acquired in this draft."
        />
      </div>

      {summary.consecutive_pairs.length > 0 && (
        <div className="mt-4 rounded-md border border-[color:#a78bfa]/40 bg-[color:#a78bfa]/5 px-3 py-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:#a78bfa]">
            Back-to-back · pair strategy in play
          </div>
          <ul className="mt-1 space-y-1 text-[11px] leading-snug text-foreground">
            {summary.consecutive_pairs.map((pair) => (
              <li key={`${pair.first.pick_no}-${pair.second.pick_no}`}>
                <span className="font-mono text-muted-2">
                  {pair.first.pick_label}
                </span>{" "}
                +{" "}
                <span className="font-mono text-muted-2">
                  {pair.second.pick_label}
                </span>
                {pair.length > 2 && (
                  <span className="font-mono text-muted-2">
                    {" "}
                    (+{pair.length - 2} more)
                  </span>
                )}
                <span className="ml-2 text-muted">
                  back-to-back. The field does not pick between these
                  slots: you can pair a target + its natural backup, or
                  reach + wait, without losing tier.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.total_pick_trades_in_draft > 0 && (
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          Pick trades in this draft ·{" "}
          <span className="text-foreground">
            {summary.total_pick_trades_in_draft}
          </span>{" "}
          · early-round trade volume is normal for dynasty startups
        </div>
      )}
    </section>
  );
}

function SlotDeltaChip({ delta }: { delta: number }) {
  if (delta === 0) return null;
  // Negative delta = moved back in R1 (or lost R1 entirely).
  // Positive delta = moved up.
  const movedUp = delta > 0;
  const tone = movedUp ? "text-success" : "text-warning";
  const arrow = movedUp ? "↑" : "↓";
  const magnitude = Math.abs(delta);
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.16em] ${tone}`}
      title="Net change in your round-1 slot after trades. Negative = moved back in R1 or lost it entirely."
    >
      {arrow}
      {magnitude} slot{magnitude === 1 ? "" : "s"} in r1
    </span>
  );
}

function TradeColumn({
  heading,
  tone,
  rows,
  emptyText,
}: {
  heading: string;
  tone: "warning" | "success";
  rows: Array<{ label: string; counterparty: string; preposition: string }>;
  emptyText: string;
}) {
  const headingTone =
    tone === "warning" ? "text-warning" : "text-success";
  return (
    <div>
      <div
        className={`font-mono text-[9px] uppercase tracking-[0.16em] ${headingTone}`}
      >
        {heading}
      </div>
      {rows.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted-2">{emptyText}</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-foreground">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="font-mono text-muted-2">{r.label}</span>{" "}
              {r.preposition}{" "}
              <span className="font-semibold">{r.counterparty}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatLabel(round: number, slot: number, _totalTeams: number): string {
  const within = slot;
  return `${round}.${within < 10 ? `0${within}` : within}`;
}
