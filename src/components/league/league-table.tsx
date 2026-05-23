"use client";

/**
 * League outlook table (Visualization D). Sortable league standings
 * with raw numbers + 5-year sparkline + trajectory shape. Comprehensive
 * detail view that complements the scatter (B) and trajectory (C) charts.
 *
 * Sortable columns: any numeric column. Default sort: peak_score desc.
 * User row highlighted with a left-border accent + bold owner name.
 */

import { useMemo, useState } from "react";
import type { LeagueOutlook, LeagueOutlookTeam } from "@/lib/strategy/league-outlook/compute";
import {
  tierForLeagueRank,
  type RankTier,
} from "@/lib/strategy/league-outlook/rank-tier";

type SortKey =
  | "owner"
  | "win_now"
  | "future"
  | "peak_score"
  | "trajectory"
  | "avg_age"
  | "depth";
type SortDir = "asc" | "desc";

const TRAJECTORY_LABEL: Record<LeagueOutlookTeam["trajectory"], string> = {
  rising: "↑ rising",
  peaking: "◆ peaking",
  declining: "↓ declining",
  flat: "~ flat",
};

const TIER_TONE: Record<RankTier, string> = {
  contender: "text-accent",
  mix: "text-success",
  longshot: "text-muted-2",
};

function compareNum(a: number | null, b: number | null, dir: SortDir): number {
  const av = a ?? -Infinity;
  const bv = b ?? -Infinity;
  return dir === "asc" ? av - bv : bv - av;
}

function compareStr(a: string, b: string, dir: SortDir): number {
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
}

function Sparkline({ team }: { team: LeagueOutlookTeam }) {
  if (team.forecast.length === 0) {
    return <span className="text-muted-2">n/a</span>;
  }
  const w = 80;
  const h = 22;
  const max = 100;
  const min = 0;
  const range = max - min;
  const path = team.forecast
    .map((y, i) => {
      const x = (i / Math.max(1, team.forecast.length - 1)) * w;
      const yPos = h - ((y.score - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${yPos.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <path
        d={path}
        stroke={team.is_me ? "#f59e0b" : "rgba(255,255,255,0.45)"}
        strokeWidth={team.is_me ? 1.75 : 1}
        fill="none"
      />
    </svg>
  );
}

export function LeagueTable({ outlook }: { outlook: LeagueOutlook }) {
  const [sortKey, setSortKey] = useState<SortKey>("peak_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Peak rank is stable across re-sorts of the table: a team's tier
  // label reflects where their peak score lands in the league, not
  // what column the user currently has sorted. Built once from a
  // peak-desc snapshot of the teams.
  const peakRankByTeam = useMemo(() => {
    const byPeak = [...outlook.teams].sort(
      (a, b) => (b.peak_score ?? -Infinity) - (a.peak_score ?? -Infinity),
    );
    const map = new Map<number, number>();
    byPeak.forEach((t, idx) => map.set(t.roster_id, idx + 1));
    return map;
  }, [outlook.teams]);

  const sorted = useMemo(() => {
    const teams = [...outlook.teams];
    teams.sort((a, b) => {
      switch (sortKey) {
        case "owner":
          return compareStr(a.owner_name ?? "", b.owner_name ?? "", sortDir);
        case "win_now":
          return compareNum(a.win_now, b.win_now, sortDir);
        case "future":
          return compareNum(a.future, b.future, sortDir);
        case "peak_score":
          return compareNum(a.peak_score, b.peak_score, sortDir);
        case "avg_age":
          return compareNum(a.avg_age, b.avg_age, sortDir);
        case "depth":
          return compareNum(a.player_ids_count, b.player_ids_count, sortDir);
        case "trajectory":
          return compareStr(a.trajectory, b.trajectory, sortDir);
      }
    });
    return teams;
  }, [outlook.teams, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(k === "owner" ? "asc" : "desc");
    }
  }

  function sortIcon(k: SortKey): string {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    // Desktop-only: this dense sortable table duplicates the standings
    // that LeagueDivergence renders directly above it, which reflows
    // cleanly on phones. On mobile we show the divergence list (visual,
    // tier-labeled) and reserve this many-column sortable view for the
    // width it needs. See REDESIGN_INTENTIONS "The league" section.
    <section className="hidden rounded-lg border border-border-soft bg-surface px-5 py-5 sm:block">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        League standings · all 12 teams
      </div>
      <p className="mt-1 text-xs text-muted">
        Click any column to sort. Your row is highlighted.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border-soft text-muted-2">
              <Th k="owner" sortKey={sortKey} dir={sortDir} onClick={toggleSort}>
                Owner{sortIcon("owner")}
              </Th>
              <Th k="win_now" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right">
                Win-now{sortIcon("win_now")}
              </Th>
              <Th k="future" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right">
                Future{sortIcon("future")}
              </Th>
              <Th k="peak_score" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right">
                Peak{sortIcon("peak_score")}
              </Th>
              <Th k="trajectory" sortKey={sortKey} dir={sortDir} onClick={toggleSort}>
                Shape{sortIcon("trajectory")}
              </Th>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em]">
                5yr
              </th>
              <Th k="avg_age" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right">
                Age{sortIcon("avg_age")}
              </Th>
              <Th k="depth" sortKey={sortKey} dir={sortDir} onClick={toggleSort} align="right">
                Depth{sortIcon("depth")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr
                key={t.roster_id}
                className={`border-b border-border-soft ${
                  t.is_me ? "bg-accent/5" : ""
                }`}
              >
                <td className={`px-3 py-2 ${t.is_me ? "font-semibold text-accent" : "text-foreground"}`}>
                  {t.is_me && <span className="mr-1">▸</span>}
                  {t.owner_name ?? "?"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-foreground">
                  {t.win_now}
                </td>
                <td className="px-3 py-2 text-right font-mono text-foreground">
                  {t.future}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="font-mono text-foreground">
                    {t.peak_score}
                  </span>
                  {(() => {
                    const peakRank =
                      peakRankByTeam.get(t.roster_id) ?? outlook.teams.length;
                    const tier = tierForLeagueRank(
                      peakRank,
                      outlook.teams.length,
                    );
                    return (
                      <span
                        className={`ml-2 font-mono text-[10px] ${TIER_TONE[tier.tone]}`}
                        title={`Peak rank ${peakRank} of ${outlook.teams.length} in this league`}
                      >
                        {tier.label}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted">
                  {TRAJECTORY_LABEL[t.trajectory]}
                </td>
                <td className="px-3 py-2">
                  <Sparkline team={t} />
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted">
                  {t.avg_age != null ? t.avg_age.toFixed(1) : "?"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted">
                  {t.player_ids_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({
  children,
  k,
  sortKey,
  dir,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  k: SortKey;
  sortKey: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      className={`cursor-pointer select-none px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] hover:text-foreground ${
        align === "right" ? "text-right" : "text-left"
      } ${isActive ? "text-accent" : ""}`}
    >
      {children}
    </th>
  );
}
