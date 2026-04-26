/**
 * Shared league-list UI used on both /connect (after Sleeper username
 * resolution) and /leagues (the signed-in user's saved leagues). One
 * card pattern, one component, so future updates land in one place.
 *
 * The card shows: league name, plus a mono subline of "season · N teams
 * · status" so users can spot which league is mid-draft at a glance.
 * Right side has an "Open →" affordance.
 *
 * Props are normalized: callers pass leagues already shaped to the
 * required fields, plus a buildHref function so each surface can
 * decide which query params to pin (season, username) onto the link.
 */

import Link from "next/link";

export type LeagueListItem = {
  league_id: string;
  name: string | null;
  season: string;
  total_rosters: number | null;
  status: string | null;
};

export function LeagueListGroup({
  title,
  leagues,
  emphasized = false,
  buildHref,
}: {
  title: string;
  leagues: LeagueListItem[];
  emphasized?: boolean;
  buildHref: (leagueId: string) => string;
}) {
  if (leagues.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-2">
          {title}
        </h2>
        <span className="font-mono text-[11px] text-muted-2">
          {leagues.length}
        </span>
      </div>
      <ul className="mt-3 grid gap-2">
        {leagues.map((l) => (
          <li key={l.league_id}>
            <Link
              href={buildHref(l.league_id)}
              className={`flex items-center justify-between rounded-md border px-4 py-3 text-sm transition ${
                emphasized
                  ? "border-border-strong bg-surface hover:border-accent/60"
                  : "border-border-soft bg-surface/60 hover:border-border-strong"
              }`}
            >
              <div>
                <div className="font-medium text-foreground">
                  {l.name ?? l.league_id}
                </div>
                <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
                  {l.season} · {l.total_rosters ?? "?"} teams ·{" "}
                  {l.status ?? "unknown"}
                </div>
              </div>
              <span className="font-mono text-[11px] text-accent">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
