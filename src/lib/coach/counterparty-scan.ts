/**
 * Counterparty scan: the per-opponent facts every trade read must check
 * before it proposes a verdict or a counter.
 *
 * Founder report 2026-11-25 (Dynasty Disasters, izzydabomb vs jwatts0723):
 * three rounds of trade advice on a C.J. Stroud offer never mentioned that
 * the counterparty's own Drake Maye (valued above Stroud) had just fractured
 * his ankle. That injury was WHY the manager was desperate, and Stroud for
 * Maye beat every counter the advice produced. The miss was structural: the
 * opponent roster Coach read carried no injury status and no record, so a
 * "worthless to a contender now, full value to a rebuilder" asset was
 * invisible.
 *
 * This module owns three reads, all pure:
 *   - normalizeInjuryStatus / isUnavailableNow: Sleeper `injury_status`
 *     into a stable label and a "cannot play for them now" boolean.
 *   - injuredNow: the counterparty's unavailable players, value-descending.
 *     No value threshold (rank-ordered, per the no-absolute-threshold rule);
 *     the consumer reads the top of the list.
 *   - standingsRanks / counterpartyRecord: W-L-T plus standing rank so a
 *     reader can tell a contender pushing for the playoffs from a seller.
 */

/** Sleeper statuses that mean the player cannot help his manager this week. */
const UNAVAILABLE = new Set(["IR", "OUT", "PUP", "SUS", "NFI"]);

/**
 * Normalize Sleeper's `injury_status` (e.g. "Questionable", "Out", "IR",
 * "PUP", "Sus"). Returns null for a healthy player or an empty value.
 */
export function normalizeInjuryStatus(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length === 0) return null;
  return t;
}

/** True when the status means the player is out now (not merely questionable). */
export function isUnavailableNow(status: string | null | undefined): boolean {
  const s = normalizeInjuryStatus(status);
  return s != null && UNAVAILABLE.has(s.toUpperCase());
}

export interface CounterpartyPlayer {
  name: string;
  pos: string | null;
  team: string | null;
  age: number | null;
  value: number | null;
  position_rank: number | null;
  overall_rank: number | null;
  injury_status: string | null;
}

/**
 * The counterparty's players who cannot play for them now, highest value
 * first (null values last). This is the buy-low leverage list: an injured
 * star is near-worthless to a manager chasing the playoffs this season and
 * keeps most of its dynasty value for a manager whose window is later.
 */
export function injuredNow(roster: readonly CounterpartyPlayer[]): CounterpartyPlayer[] {
  return roster
    .filter((p) => isUnavailableNow(p.injury_status))
    .slice()
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

export interface RecordRow {
  roster_id: number;
  wins: number;
  losses: number;
  ties: number;
}

/**
 * Standing rank per roster (1 = best), by win percentage with ties counted
 * as half a win. Equal records share a rank. Returns an empty map when no
 * games have been played (a rank would be noise).
 */
export function standingsRanks(rows: readonly RecordRow[]): Map<number, number> {
  const out = new Map<number, number>();
  const games = rows.reduce((n, r) => n + r.wins + r.losses + r.ties, 0);
  if (games === 0) return out;
  const pct = (r: RecordRow) => {
    const g = r.wins + r.losses + r.ties;
    return g === 0 ? 0 : (r.wins + r.ties / 2) / g;
  };
  const sorted = rows.slice().sort((a, b) => pct(b) - pct(a));
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    const rank = prev && pct(prev) === pct(r) ? (out.get(prev.roster_id) as number) : i + 1;
    out.set(r.roster_id, rank);
  });
  return out;
}

export interface CounterpartyRecord {
  wins: number;
  losses: number;
  ties: number;
  /** null when no games have been played. */
  standing_rank: number | null;
  of: number;
}

export function counterpartyRecord(
  row: RecordRow,
  ranks: Map<number, number>,
  totalTeams: number,
): CounterpartyRecord {
  return {
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    standing_rank: ranks.get(row.roster_id) ?? null,
    of: totalTeams,
  };
}
