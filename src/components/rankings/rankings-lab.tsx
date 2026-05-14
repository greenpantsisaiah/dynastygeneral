"use client";

/**
 * Rankings Lab. Renders the algorithm/equation display + dial bar +
 * reranking table as one client component. Server hands us a
 * precomputed pool; we apply the dial weights to produce the live
 * ranking. No network calls on dial drag.
 *
 * Public visitors see the top 25 only and lose the "save dials"
 * affordance. Signed-in users see up to 100 and (in a follow-up) get
 * dial-config persistence.
 *
 * Each dial has a "?" button that toggles an inline methodology drawer
 * with the deep explanation (definition, why, statistical model,
 * engine surfaces, v1 limits). The drawers live in
 * src/lib/rankings/methodology.ts so the same content can be reused
 * by /soundboard.
 */

import { useMemo, useState } from "react";
import type { RankedPlayer, RankedPool } from "@/lib/rankings/build";
import { DIAL_METHODOLOGY } from "@/lib/rankings/methodology";
import { AlgorithmEquation } from "@/components/rankings/algorithm-equation";

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

const DIAL_EMPHASIS_RANGE = 60;

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
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const scored = useMemo(() => rescore(pool.players, dials), [pool.players, dials]);
  const visibleLimit = tier === "public" ? 25 : 100;
  const visible = scored.slice(0, visibleLimit);
  const lockedRows = scored.length > visibleLimit ? scored.length - visibleLimit : 0;

  function toggleDrawer(id: string) {
    setOpenDrawer((curr) => (curr === id ? null : id));
  }

  return (
    <div className="space-y-6">
      <AlgorithmEquation dials={dials} continuityDisabled />

      <div className="rounded-lg border border-border-soft bg-surface px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Three dials
            </div>
            <p className="mt-1 text-sm text-muted">
              Each dial moves one specific engine constant. Centered
              reproduces the consensus market ranking. Tap the{" "}
              <kbd className="rounded border border-border-soft bg-surface-2 px-1 font-mono text-[10px]">
                ?
              </kbd>{" "}
              on a dial to see what it actually does.
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
            id="youth_weight"
            label="Youth"
            hint="Age-curve weight. Pulls younger players up, ages older players down."
            value={dials.youth}
            onChange={(v) => setDials((d) => ({ ...d, youth: v }))}
            onInfoClick={() => toggleDrawer("youth_weight")}
            isOpen={openDrawer === "youth_weight"}
          />
          <DialControl
            id="bellcow_pref"
            label="Bellcow"
            hint="RB workhorse preference. Top-12 RBs benefit; committee shapes recede."
            value={dials.bellcow}
            onChange={(v) => setDials((d) => ({ ...d, bellcow: v }))}
            onInfoClick={() => toggleDrawer("bellcow_pref")}
            isOpen={openDrawer === "bellcow_pref"}
          />
          <DialControl
            id="continuity_weight"
            label="Continuity"
            hint="OC tenure weight. Calibration in progress; dial is wired but currently neutral."
            value={dials.continuity}
            onChange={(v) => setDials((d) => ({ ...d, continuity: v }))}
            onInfoClick={() => toggleDrawer("continuity_weight")}
            isOpen={openDrawer === "continuity_weight"}
            disabled
          />
        </div>
        {openDrawer && (
          <div className="mt-5 border-t border-border-soft pt-5">
            <MethodologyDrawer
              id={openDrawer}
              onClose={() => setOpenDrawer(null)}
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-soft bg-surface">
        <table className="w-full min-w-[680px] text-sm">
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
        <div className="rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-foreground">
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

      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
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
  id,
  label,
  hint,
  value,
  onChange,
  onInfoClick,
  isOpen,
  disabled = false,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (next: number) => void;
  onInfoClick: () => void;
  isOpen: boolean;
  disabled?: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            {label}
          </label>
          <button
            type="button"
            onClick={onInfoClick}
            aria-expanded={isOpen}
            aria-controls={`dial-drawer-${id}`}
            className={`flex h-4 w-4 items-center justify-center rounded-full border font-mono text-[9px] transition ${
              isOpen
                ? "border-accent bg-accent text-black"
                : "border-border-soft bg-surface-2 text-muted-2 hover:border-accent hover:text-accent"
            }`}
            title={`Methodology behind ${label}`}
          >
            ?
          </button>
        </div>
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

function MethodologyDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const m = DIAL_METHODOLOGY[id];
  if (!m) return null;
  return (
    <article
      id={`dial-drawer-${id}`}
      className="rounded-md border border-accent/30 bg-accent/5 px-5 py-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Methodology · {m.title}
          </div>
          <p className="mt-1 text-sm text-foreground">{m.definition}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <DrawerBlock heading="Why it exists" items={m.why_it_exists} />
        <DrawerBlock heading="Statistical model" items={m.statistical_model} />
        <DrawerBlock heading="What it touches" items={m.engine_surfaces} />
        <DrawerBlock heading="Limitations" items={m.limitations} tone="warning" />
      </div>

      {m.library_slug && (
        <div className="mt-5 border-t border-accent/20 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Deep dive · Library article in progress
        </div>
      )}
    </article>
  );
}

function DrawerBlock({
  heading,
  items,
  tone = "default",
}: {
  heading: string;
  items: string[];
  tone?: "default" | "warning";
}) {
  const headingTone =
    tone === "warning" ? "text-warning" : "text-accent";
  return (
    <div>
      <div
        className={`font-mono text-[10px] uppercase tracking-[0.16em] ${headingTone}`}
      >
        {heading}
      </div>
      <ul className="mt-2 space-y-1.5 text-sm leading-snug text-foreground">
        {items.map((line, i) => (
          <li key={i}>· {line}</li>
        ))}
      </ul>
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

  const signals: Array<{ label: string; tone: string; hint: string }> = [];
  if (row.is_rookie) {
    signals.push({
      label: "R",
      tone: "border-accent/60 text-accent",
      hint: "Rookie. Year-one production has no NFL track record yet.",
    });
  }
  if (row.position === "RB" && row.components.bellcow >= 0.5) {
    signals.push({
      label: "BELLCOW",
      tone: "border-success/60 text-success",
      hint: "Top-12 RB by consensus market. Workhorse-shaped in v1.",
    });
  }
  if (row.position === "RB" && row.components.bellcow <= -0.3) {
    signals.push({
      label: "CMTE",
      tone: "border-warning/60 text-warning",
      hint: "Committee or rotational role. Lower workload than the bellcow tier.",
    });
  }
  if (row.components.youth >= 0.7) {
    signals.push({
      label: "PRIME",
      tone: "border-accent/60 text-accent",
      hint: "Young end of the position's peak band. Age-curve component scores at or near max.",
    });
  }
  if (row.components.youth <= -0.5) {
    signals.push({
      label: "AGING",
      tone: "border-warning/60 text-warning",
      hint: "Past the position's peak band. Age-curve component pulls negative.",
    });
  }

  return (
    <tr className="border-t border-border-soft text-sm">
      <td className="px-4 py-2 font-mono text-foreground">{row.dg_rank}</td>
      <td className={`px-2 py-2 font-mono text-xs ${deltaTone}`}>
        {deltaLabel}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{row.name}</span>
          {signals.map((s) => (
            <span
              key={s.label}
              title={s.hint}
              className={`rounded-sm border bg-surface px-1.5 py-0 font-mono text-[8px] uppercase tracking-[0.14em] ${s.tone}`}
            >
              {s.label}
            </span>
          ))}
        </div>
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
