"use client";

/**
 * League switcher dropdown. Replaces the static league-name <h1> in the
 * league hub header with a button that drops a list of the user's
 * other dynasty leagues. One click to swap, no round-trip through the
 * connect page.
 *
 * Server fetches the league list once and passes it in. We filter +
 * sort client-side (cheap) so user sees the active league at top with
 * the rest below.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type LeagueSwitcherItem = {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number | null;
  status: string | null;
  is_dynasty: boolean;
};

export function LeagueSwitcher({
  current,
  leagues,
  username,
  season,
}: {
  current: LeagueSwitcherItem;
  leagues: LeagueSwitcherItem[];
  username: string;
  season: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const buildHref = (leagueId: string) => {
    const params = new URLSearchParams();
    if (username) params.set("username", username);
    if (season) params.set("season", season);
    const qs = params.toString();
    return `/leagues/${leagueId}${qs ? `?${qs}` : ""}`;
  };

  const others = leagues
    .filter((l) => l.league_id !== current.league_id)
    .sort((a, b) => {
      // Dynasty first, then drafting/active state, then alpha.
      if (a.is_dynasty !== b.is_dynasty) return a.is_dynasty ? -1 : 1;
      const statusRank = (s: string | null) =>
        s === "drafting" ? 0 : s === "in_season" ? 1 : s === "pre_draft" ? 2 : 3;
      const sa = statusRank(a.status);
      const sb = statusRank(b.status);
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });

  const allLeaguesHref = `/connect?username=${encodeURIComponent(username)}${
    season ? `&season=${season}` : ""
  }`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="group flex items-baseline gap-2 text-left transition hover:text-accent"
      >
        <span className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl group-hover:text-accent">
          {current.name}
        </span>
        {others.length > 0 && (
          <span
            className={`font-mono text-sm text-muted-2 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            ▾
          </span>
        )}
      </button>

      {open && others.length > 0 && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 w-80 rounded-lg border border-border-strong bg-surface shadow-2xl"
        >
          <div className="border-b border-border-soft px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            Switch league
          </div>
          <ul className="max-h-96 overflow-auto py-1">
            {others.map((l) => (
              <li key={l.league_id}>
                <Link
                  href={buildHref(l.league_id)}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition hover:bg-surface-2"
                  role="menuitem"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">
                      {l.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                      {l.season} · {l.total_rosters ?? "?"} teams ·{" "}
                      {l.status ?? "unknown"}
                    </div>
                  </div>
                  {!l.is_dynasty && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                      Redraft
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={allLeaguesHref}
            onClick={() => setOpen(false)}
            className="block border-t border-border-soft px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent transition hover:bg-surface-2"
            role="menuitem"
          >
            All leagues →
          </Link>
        </div>
      )}
    </div>
  );
}
