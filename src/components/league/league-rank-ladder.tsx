/**
 * Variation 1: Rank Ladder. Horizontal bars, all 12 teams ranked by
 * peak score (descending). User's bar in accent gold. Shows "you're
 * 3rd of 12" at a glance even when absolute scores cluster.
 *
 * The point: when raw scores are tight (everyone 75-90), absolute
 * differences look meaningless. Ranking is invariant to absolute
 * scale. "1st of 12" reads sharper than "score 91 vs 89".
 */

import type { LeagueOutlook } from "@/lib/strategy/league-outlook/compute";

const TIER_LABEL: Record<string, string> = {
  contender: "Contender",
  bubble: "Bubble",
  rebuild: "Rebuild",
};

export function LeagueRankLadder({ outlook }: { outlook: LeagueOutlook }) {
  const sorted = [...outlook.teams].sort((a, b) => b.peak_score - a.peak_score);
  const max = Math.max(...sorted.map((t) => t.peak_score), 1);
  const myRank = sorted.findIndex((t) => t.is_me) + 1;
  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Variation 1 · Rank ladder
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Where you stand
          </h2>
        </div>
        <div className="text-xs text-muted">
          {myRank > 0 ? `You're ${myRank} of ${sorted.length}` : ""}
        </div>
      </div>
      <p className="mt-2 max-w-prose text-xs text-muted">
        All 12 teams ranked by peak forecast score. Cluster-resistant: even
        when absolute scores are tight, the rank order is the answer to
        "where do I sit."
      </p>
      <ul className="mt-4 space-y-1.5">
        {sorted.map((t, i) => {
          const widthPct = (t.peak_score / max) * 100;
          return (
            <li key={t.roster_id} className="flex items-center gap-3">
              <span
                className={`w-6 flex-shrink-0 text-right font-mono text-xs ${
                  t.is_me ? "text-accent" : "text-muted-2"
                }`}
              >
                {i + 1}.
              </span>
              <span
                className={`w-32 flex-shrink-0 truncate text-sm ${
                  t.is_me ? "font-semibold text-accent" : "text-foreground"
                }`}
              >
                {t.is_me && <span className="mr-1">▸</span>}
                {t.owner_name ?? "?"}
              </span>
              <div className="relative h-5 flex-1 rounded-sm bg-surface-2">
                <div
                  className={`absolute left-0 top-0 h-full rounded-sm ${
                    t.is_me ? "bg-accent" : "bg-muted-2/40"
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="w-12 flex-shrink-0 text-right font-mono text-xs text-foreground">
                {t.peak_score}
              </span>
              <span className="w-20 flex-shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                {TIER_LABEL[t.peak_tier] ?? t.peak_tier}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
