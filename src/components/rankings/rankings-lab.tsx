"use client";

/**
 * Rankings Lab. Renders the dial bar + reranking table as one client
 * component. Server hands us a precomputed pool; we apply the dial
 * weights to produce the live ranking. No network calls on dial drag.
 *
 * Public visitors see the top 25 only and lose the "save dials"
 * affordance. Signed-in users see up to 100 and (in a follow-up) get
 * dial-config persistence.
 */

import { useMemo, useState } from "react";
import type { RankedPlayer, RankedPool } from "@/lib/rankings/build";

type DialState = {
  youth: number;
  bellcow: number;
  continuity: number;
};

const DEFAULT_DIALS: DialState = {
  youth: 0.5,
  bellcow: 0.5,
  continuity: 0.5,
};

const DIAL_EMPHASIS_RANGE = 60; // points of score a dial at 1.0 can move

type ScoredRow = RankedPlayer & {
  dg_score: number;
  dg_rank: number;
  rank_delta: number;
};

function rescore(players: RankedPlayer[], dials: DialState): ScoredRow[] {
  const youthW = (dials.youth - 0.5) * 2;
  const bellcowW = (dials.bellcow - 0.5) * 2;
  const continuityW = (dials.continuity - 0.5) * 2;
  const withScore = players.map((p) => {
    const adj =
      youthW * p.components.youth +
      bellcowW * p.components.bellcow +
      continuityW * p.components.continuity;
    const dg_score = p.baseline_value + DIAL_EMPHASIS_RANGE * adj;
    return { ...p, dg_score };
  });
  withScore.sort((a, b) => b.dg_score - a.dg_score);
  return withScore.map((p, i) => ({
    ...p,
    dg_rank: i + 1,
    rank_delta: p.market_rank - (i + 1),
  }));
}

function posTone(position: RankedPlayer["position"]): string {
  switch (position) {
    case "QB":
      return "text-success";
    case "RB":
      return "text-accent";
    case "WR":
      return "text-foreground";
    case "TE":
      return "text-warning";
    default:
      return "text-muted-2";
  }
}

export function RankingsLab({
  pool,
  tier,
}: {
  pool: RankedPool;
  /**
   * "public" caps the visible list at 25 and tags the surface as
   * "unauth." "signed_in" shows the full pool. "premium" is reserved
   * for the future CSV/JSON export tier; treated as "signed_in" for
   * v1 since we don't ship export yet.
   */
  tier: "public" | "signed_in" | "premium";
}) {
  const [dials, setDials] = useState<DialState>(DEFAULT_DIALS);
  const scored = useMemo(() => rescore(pool.players, dials), [pool.players, dials]);
  const visibleLimit = tier === "public" ? 25 : 100;
  const visible = scored.slice(0, visibleLimit);
  const lockedRows = scored.length > visibleLimit ? scored.length - visibleLimit : 0;

  return (
    <div>
      <div className="rounded-lg border border-border-soft bg-surface px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Three dials
            </div>
            <p className="mt-1 text-sm text-muted">
              Each dial moves one specific engine constant. The default
              position (centered) reproduces the consensus market
              ranking. Slide either direction to perturb the model.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDials(DEFAULT_DIALS)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
          >
            Reset
          </button>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <DialControl
            label="Youth"
            hint="Age-curve weight. Pulls younger players up, ages older players down."
            value={dials.youth}
            onChange={(v) => setDials((d) => ({ ...d, youth: v }))}
          />
          <DialControl
            label="Bellcow"
            hint="RB workhorse preference. Top-12 RBs benefit; committee shapes recede."
            value={dials.bellcow}
            onChange={(v) => setDials((d) => ({ ...d, bellcow: v }))}
          />
          <DialControl
            label="Continuity"
            hint="OC tenure weight. Calibration in progress; dial is wired but currently neutral."
            value={dials.continuity}
            onChange={(v) => setDials((d) => ({ ...d, continuity: v }))}
            disabled
          />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border-soft bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2">
            <tr className="text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              <th className="px-4 py-2.5">DG</th>
              <th className="px-2 py-2.5">Δ</th>
              <th className="px-4 py-2.5">Player</th>
              <th className="px-3 py-2.5">Pos</th>
              <th className="px-3 py-2.5">Age</th>
              <th className="px-3 py-2.5 text-right">Score</th>
              <th className="px-3 py-2.5 text-right">Market</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <RankRow key={p.player_id} row={p} />
            ))}
          </tbody>
        </table>
      </div>

      {tier === "public" && lockedRows > 0 && (
        <div className="mt-4 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            {lockedRows} more rows
          </span>{" "}
          unlock when you sign in.{" "}
          <a href="/login" className="text-accent hover:underline">
            Sign in
          </a>
          .
        </div>
      )}

      <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        Source · FantasyCalc dynasty consensus, normalized 0 to 100.
        Generated{" "}
        {new Date(pool.generated_at).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        })}
        . Format · {pool.format.numQbs === 2 ? "Superflex" : "1QB"} ·
        {pool.format.ppr === 1 ? " PPR" : pool.format.ppr === 0.5 ? " Half-PPR" : " Standard"}.
      </div>
    </div>
  );
}

function DialControl({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
          {label}
        </label>
        <span
          className={`font-mono text-[10px] ${disabled ? "text-muted-2" : "text-foreground"}`}
        >
          {disabled ? "neutral" : `${pct}%`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        disabled={disabled}
        className="mt-2 w-full accent-accent"
      />
      <p className="mt-1 text-xs leading-snug text-muted-2">{hint}</p>
    </div>
  );
}

function RankRow({ row }: { row: ScoredRow }) {
  const delta = row.rank_delta;
  const deltaTone =
    delta >= 10
      ? "text-success"
      : delta <= -10
        ? "text-danger"
        : "text-muted-2";
  const deltaLabel =
    delta === 0
      ? "·"
      : delta > 0
        ? `+${delta}`
        : `${delta}`;
  return (
    <tr className="border-t border-border-soft text-sm">
      <td className="px-4 py-2 font-mono text-foreground">{row.dg_rank}</td>
      <td className={`px-2 py-2 font-mono text-xs ${deltaTone}`}>
        {deltaLabel}
      </td>
      <td className="px-4 py-2">
        <span className="font-medium text-foreground">{row.name}</span>
        {row.is_rookie && (
          <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
            R
          </span>
        )}
        <div className="font-mono text-[10px] text-muted-2">
          {row.team ?? "FA"}
        </div>
      </td>
      <td className={`px-3 py-2 font-mono text-xs ${posTone(row.position)}`}>
        {row.position}
      </td>
      <td className="px-3 py-2 font-mono text-xs text-muted-2">
        {row.age ?? "?"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
        {row.dg_score.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs text-muted-2">
        {row.market_rank}
      </td>
    </tr>
  );
}
