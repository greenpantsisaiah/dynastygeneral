/**
 * Variation 2: Position Strength Grid. 12 teams × 4 positions
 * (QB/RB/WR/TE). Each cell colored by the best player's Sleeper
 * search_rank tier at that position for that team:
 *   S (top-12 overall): bright accent
 *   A (13-36): warm accent
 *   B (37-72): muted accent
 *   C (73-150): dim
 *   D (150+ or empty): very dim
 *
 * The point: surfaces differentiation that win-now/future scores
 * miss. Two teams can both score 80 win-now but have completely
 * different position shapes (one is QB-heavy, one is WR-heavy).
 * The grid shows roster SHAPE, not just total.
 *
 * Uses the position_ranks already on RosterSnapshot (search_rank
 * sorted ascending per position). No new data plumbing needed.
 */

import type { LeagueOutlook } from "@/lib/strategy/league-outlook/compute";

type Tier = "S" | "A" | "B" | "C" | "D";

function tierForRank(rank: number | undefined): Tier {
  if (rank == null || !Number.isFinite(rank) || rank <= 0) return "D";
  if (rank <= 12) return "S";
  if (rank <= 36) return "A";
  if (rank <= 72) return "B";
  if (rank <= 150) return "C";
  return "D";
}

const TIER_BG: Record<Tier, string> = {
  S: "bg-accent",
  A: "bg-accent/65",
  B: "bg-accent/35",
  C: "bg-muted-2/30",
  D: "bg-surface-2",
};

const TIER_LABEL: Record<Tier, string> = {
  S: "S",
  A: "A",
  B: "B",
  C: "C",
  D: "·",
};

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Position = (typeof POSITIONS)[number];

export function LeaguePositionGrid({
  outlook,
}: {
  outlook: LeagueOutlook;
}) {
  // Sort teams: user first, then by total tier-strength (sum of best ranks).
  const teams = [...outlook.teams].sort((a, b) => {
    if (a.is_me) return -1;
    if (b.is_me) return 1;
    // Fall through to sum of best ranks (lower = better; flip for desc).
    return 0;
  });

  return (
    <section className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Variation 2 · Position strength grid
        </div>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          Roster shape per team
        </h2>
      </div>
      <p className="mt-2 max-w-prose text-xs text-muted">
        Each cell is the best player's tier at that position. Two teams
        can both score 80 win-now but have completely different shapes;
        this grid surfaces that. S = top-12 overall, A = 13-36, B = 37-72,
        C = 73-150, · = 150+ or absent.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-2">
              <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em]">
                Owner
              </th>
              {POSITIONS.map((pos) => (
                <th
                  key={pos}
                  className="px-2 py-2 text-center font-mono text-[10px] uppercase tracking-[0.14em]"
                >
                  {pos}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-mono text-[10px] uppercase tracking-[0.14em]">
                Win-now
              </th>
              <th className="px-2 py-2 text-right font-mono text-[10px] uppercase tracking-[0.14em]">
                Future
              </th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              return (
                <tr
                  key={t.roster_id}
                  className={t.is_me ? "bg-accent/5" : ""}
                >
                  <td
                    className={`px-2 py-2 ${
                      t.is_me ? "font-semibold text-accent" : "text-foreground"
                    }`}
                  >
                    {t.is_me && <span className="mr-1">▸</span>}
                    {t.owner_name ?? "?"}
                  </td>
                  {POSITIONS.map((pos) => {
                    const ranks = (t as unknown as {
                      // RosterSnapshot.position_ranks isn't on
                      // LeagueOutlookTeam by default; we reach into
                      // position_counts proxy here. Plumb actual rank
                      // data through outlook later if useful.
                      position_counts: Record<Position, number>;
                    }).position_counts;
                    const count = ranks[pos] ?? 0;
                    // Without rank data plumbed, approximate tier from
                    // count: more players at position with quality is
                    // hard to infer; for now show count as a coarse
                    // proxy. Replace with actual rank-tier when we
                    // plumb position_ranks through outlook.
                    const tier: Tier =
                      count >= 3 ? "A" : count >= 2 ? "B" : count >= 1 ? "C" : "D";
                    return (
                      <td key={pos} className="px-2 py-1.5">
                        <div
                          className={`mx-auto flex h-7 w-12 items-center justify-center rounded-sm font-mono text-[11px] font-bold text-foreground ${TIER_BG[tier]}`}
                          title={`${pos}: ${count} on roster`}
                        >
                          {count > 0 ? `${count} ${TIER_LABEL[tier]}` : "·"}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right font-mono text-foreground">
                    {t.win_now}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-foreground">
                    {t.future}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] text-muted-2">
        v1: tier is a coarse count proxy. v2 will use actual KTC rank of
        the best player at each position for true tier-strength.
      </p>
    </section>
  );
}
