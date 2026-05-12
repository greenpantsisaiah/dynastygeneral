/**
 * Opponent characterizations panel. For each opposing team, surface a
 * single-bucket call (win-now / win-future / no clear direction) plus
 * 1-2 supporting observations and a trade implication.
 *
 * The point: don't predict their next pick. Don't infer their intended
 * archetype (which assumes opponent intent + competence). Just describe
 * the team they're actually building, and tell the user how to play it.
 *
 * Confidence grows with picks made. Early in a draft most teams render
 * as "still forming" with low confidence. By R10+ most should bucket.
 */

import type {
  OpponentCharacterization,
  TeamLean,
} from "@/lib/strategy/opponents/characterize";
import type {
  OpponentTradeHistory,
  TradeSignatureLabel,
} from "@/lib/strategy/opponents/trade-history";
import { AskCoachButton } from "./ask-coach-button";
import { LeagueSpectrum } from "./league-spectrum";
import {
  OpponentNotesPanel,
  type OpponentNoteItem,
} from "./opponent-notes-panel";

const TRADE_SIGNATURE_CHIP: Record<
  TradeSignatureLabel,
  { label: string; tone: string; hint: string }
> = {
  pick_flipper: {
    label: "Pick flipper",
    tone: "border-accent/60 bg-accent/10 text-accent",
    hint: "High two-way pick volume. Treats picks as currency; entertain pick swaps.",
  },
  pick_hoarder: {
    label: "Pick hoarder",
    tone: "border-success/60 bg-success/10 text-success",
    hint: "Net pick receiver. Wants one more anchor; offer a pick for production.",
  },
  pick_seller: {
    label: "Pick seller",
    tone: "border-warning/60 bg-warning/10 text-warning",
    hint: "Net pick outflow. Prefers player-for-pick swaps from your side.",
  },
  pick_quiet: {
    label: "Pick quiet",
    tone: "border-border-soft bg-surface text-muted-2",
    hint: "Low pick-trade volume. No strong fingerprint yet.",
  },
};

const LEAN_LABEL: Record<TeamLean, string> = {
  punted_season: "Punted this season",
  win_now: "Win now",
  lean_win_now: "Lean win-now",
  balanced: "Balanced",
  lean_win_future: "Lean win-future",
  win_future: "Win future",
};

const LEAN_TONE: Record<
  TeamLean,
  { border: string; bg: string; chip: string }
> = {
  punted_season: {
    border: "border-2 border-accent/70",
    bg: "bg-accent/10",
    chip: "text-accent",
  },
  win_now: {
    border: "border-success/60",
    bg: "bg-success/5",
    chip: "text-success",
  },
  lean_win_now: {
    border: "border-success/40",
    bg: "bg-success/5",
    chip: "text-success",
  },
  balanced: {
    border: "border-border-soft",
    bg: "bg-surface",
    chip: "text-muted-2",
  },
  lean_win_future: {
    border: "border-accent/40",
    bg: "bg-accent/5",
    chip: "text-accent",
  },
  win_future: {
    border: "border-accent/60",
    bg: "bg-accent/5",
    chip: "text-accent",
  },
};

function confidenceLabel(c: number): string {
  if (c >= 0.75) return "Clear";
  if (c >= 0.5) return "Forming";
  return "Early";
}

export function OpponentCharacterizations({
  items,
  leagueId,
  notesByRoster,
  tradeHistoryByRoster,
  canWriteNotes,
}: {
  items: OpponentCharacterization[];
  /**
   * League id for note POST/DELETE routes. When omitted the notes
   * panel hides entirely.
   */
  leagueId?: string;
  /**
   * Existing manual notes grouped by opponent_roster_id. Each card
   * gets its own slice. Omit on surfaces that don't yet pull notes
   * server-side.
   */
  notesByRoster?: Map<number, OpponentNoteItem[]>;
  /**
   * Per-opponent trade-signature fingerprint (pick_flipper / hoarder
   * / seller / quiet). Renders as a small chip on each card so the
   * user can read counterparty behavior at a glance. Same data Coach
   * gets in its context.
   */
  tradeHistoryByRoster?: Map<number, OpponentTradeHistory>;
  /**
   * False when the viewer is unauthenticated; notes panel renders a
   * "sign in to save" prompt instead of the form.
   */
  canWriteNotes?: boolean;
}) {
  if (items.length === 0) return null;

  // Bucket counts for the header summary.
  const counts = items.reduce(
    (acc, it) => {
      acc[it.lean] = (acc[it.lean] ?? 0) + 1;
      return acc;
    },
    {} as Record<TeamLean, number>,
  );

  return (
    <section className="mt-8">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Opponent characterizations
      </div>
      <p className="mt-1 text-sm text-muted">
        What each team actually IS right now, not what they think they are.
        Drives how you trade with them.
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-2">
        {(counts.punted_season ?? 0) > 0 && (
          <span>
            <span className="text-accent">{counts.punted_season}</span> punted
          </span>
        )}
        <span>
          <span className="text-success">
            {(counts.win_now ?? 0) + (counts.lean_win_now ?? 0)}
          </span>{" "}
          win-now lean
        </span>
        <span>{counts.balanced ?? 0} balanced</span>
        <span>
          <span className="text-accent">
            {(counts.win_future ?? 0) + (counts.lean_win_future ?? 0)}
          </span>{" "}
          win-future lean
        </span>
      </div>

      <LeagueSpectrum items={items} />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((it) => (
          <CharacterizationCard
            key={it.roster_id}
            item={it}
            leagueId={leagueId}
            notes={notesByRoster?.get(it.roster_id) ?? []}
            tradeHistory={tradeHistoryByRoster?.get(it.roster_id) ?? null}
            canWriteNotes={canWriteNotes ?? false}
          />
        ))}
      </div>
    </section>
  );
}


function CharacterizationCard({
  item,
  leagueId,
  notes,
  tradeHistory,
  canWriteNotes,
}: {
  item: OpponentCharacterization;
  leagueId?: string;
  notes: OpponentNoteItem[];
  tradeHistory: OpponentTradeHistory | null;
  canWriteNotes: boolean;
}) {
  const tone = LEAN_TONE[item.lean];
  const conf = confidenceLabel(item.confidence);
  // The user's own card overrides the lean-based color tone with a
  // distinct purple ring + "you" badge so they spot themselves
  // immediately against opponents. The underlying lean still shows
  // in the chip on the right for self-awareness.
  const youCard = item.is_me;

  return (
    <article
      className={`rounded-lg border ${
        youCard
          ? "border-2 border-[color:#a78bfa]/70 bg-[color:#a78bfa]/5"
          : `${tone.border} ${tone.bg}`
      } px-4 py-3`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <div className="font-semibold text-foreground">{item.owner_name}</div>
            {youCard && (
              <span
                className="rounded-sm border px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.16em]"
                style={{
                  borderColor: "#a78bfa",
                  color: "#a78bfa",
                }}
              >
                You
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-muted-2">
            {item.picks_made} picks made
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-mono text-xs uppercase tracking-[0.16em] ${tone.chip}`}
          >
            {LEAN_LABEL[item.lean]}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            {conf} · {Math.round(item.confidence * 100)}%
          </div>
        </div>
      </div>

      {item.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {item.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      )}

      {!youCard && item.recent_picks && item.recent_picks.length > 0 && (
        <div className="mt-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
            Recent picks
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-snug">
            {item.recent_picks.map((p) => (
              <span key={p.pick_label} className="text-foreground">
                <span className="font-mono text-[9px] text-muted-2 mr-1">
                  {p.pick_label}
                </span>
                {p.player_name}
                {p.position && (
                  <span className="ml-1 font-mono text-[9px] text-muted-2">
                    · {p.position}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {!youCard && tradeHistory && tradeHistory.signature !== "pick_quiet" && (
        <div
          className={`mt-2 inline-flex items-baseline gap-2 rounded-md border ${TRADE_SIGNATURE_CHIP[tradeHistory.signature].tone} px-2 py-1`}
          title={TRADE_SIGNATURE_CHIP[tradeHistory.signature].hint}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.16em]">
            {TRADE_SIGNATURE_CHIP[tradeHistory.signature].label}
          </span>
          <span className="font-mono text-[9px] text-muted-2">
            {tradeHistory.picks_sent} sent · {tradeHistory.picks_received}{" "}
            received
          </span>
        </div>
      )}

      {item.trade_implication && !youCard && (
        <div className="mt-3 rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-xs text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            How to play them ·{" "}
          </span>
          {item.trade_implication}
        </div>
      )}

      {!youCard && (
        <AskCoachButton
          prompt={`What's my best trade angle with ${item.owner_name}? They look ${LEAN_LABEL[item.lean].toLowerCase()}. What would I offer and what do I ask for?`}
        />
      )}
      {youCard && (
        <AskCoachButton
          prompt={`Given my team is reading as ${LEAN_LABEL[item.lean].toLowerCase()}, what's the most strategic next move I should think about?`}
        />
      )}

      {!youCard && leagueId && (
        <OpponentNotesPanel
          leagueId={leagueId}
          opponentRosterId={item.roster_id}
          ownerName={item.owner_name}
          initialNotes={notes}
          canWrite={canWriteNotes}
        />
      )}
    </article>
  );
}
