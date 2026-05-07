/**
 * Trade Strategy Panel. Surfaces the league-read synthesis on the
 * league hub: top trade-leverage opportunities by named opponent,
 * structural-constraint guardrails on the user's roster, and trade-
 * window timing. This is the chat-gap closure: founder repeatedly
 * went to Coach for this analysis; it's now a first-class UI.
 *
 * Per founder direction (2026-05-07): UI redesign is its own focused
 * phase. This component is intentionally restrained (not the final
 * design), but visible enough that the chat-prompt requirement
 * disappears for casual users.
 */

import type { LeagueRead } from "@/lib/strategy/league-read";

export function TradeStrategyPanel({ data }: { data: LeagueRead | null }) {
  if (!data) return null;
  const { top_leverage_opportunities, structural_constraints, trade_window, headline } = data;
  const activeGuardrails = structural_constraints.filter((c) => c.is_active);

  // Don't render the panel when there's nothing to surface (no
  // opportunities AND no active constraint AND no window message).
  if (
    top_leverage_opportunities.length === 0 &&
    activeGuardrails.length === 0 &&
    !trade_window
  ) {
    return null;
  }

  return (
    <section
      className="mt-6 overflow-hidden rounded-lg border border-border-soft bg-surface"
      aria-label="Trade strategy panel"
    >
      <div className="flex items-baseline justify-between border-b border-border-soft px-5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          League read · trade leverage
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          v1 prototype
        </span>
      </div>

      <div className="px-5 py-3 text-sm leading-snug text-foreground">
        {headline}
      </div>

      {top_leverage_opportunities.length > 0 && (
        <div className="border-t border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Top leverage targets
          </div>
          <ul className="mt-3 space-y-3">
            {top_leverage_opportunities.map((op) => (
              <li
                key={op.opponent_roster_id}
                className="rounded-md border border-border-soft bg-background p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-foreground">
                    {op.opponent_name}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                    leverage {op.leverage_score}/100
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted">{op.opponent_panic_label}</div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                      Send
                    </div>
                    <div className="mt-0.5 text-foreground">{op.send_asset_hint}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                      Ask for
                    </div>
                    <div className="mt-0.5 text-foreground">{op.receive_asset_hint}</div>
                  </div>
                </div>
                {op.opponent_softness_signals.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-2">
                    {op.opponent_softness_signals.slice(0, 3).map((s, i) => (
                      <li key={i}>· {s}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 text-xs leading-snug text-muted">
                  {op.framing_one_liner}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeGuardrails.length > 0 && (
        <div className="border-t border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
            Structural guardrail
          </div>
          {activeGuardrails.map((g, i) => (
            <p key={i} className="mt-2 text-xs leading-snug text-foreground">
              {g.guardrail_message}
            </p>
          ))}
        </div>
      )}

      {trade_window && (
        <div className="border-t border-border-soft px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Trade window
          </div>
          <p className="mt-2 text-xs leading-snug text-foreground">{trade_window.message}</p>
        </div>
      )}
    </section>
  );
}
