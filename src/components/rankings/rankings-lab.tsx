"use client";

/**
 * Unified Rankings Lab. Renders all 8 engine dials with tier-gated
 * manipulation, the algorithm/equation centerpiece, and the
 * reranking table on one page.
 *
 * Dial groups:
 *   - Ranking dials (3, always usable): Youth, Bellcow, Continuity.
 *     These directly move the ranking table on this page.
 *   - Engine dials (5, sign-in required): Horizon, Rookie tilt, Risk
 *     tolerance, Trade aggression, Consensus lean. These shape Coach
 *     and Decision-card behavior across the product but do not yet
 *     change the visible ranking on this page.
 *
 * State persistence:
 *   - Signed-in: dial state mirrors the user's JudgmentProfile in
 *     Supabase via debounced POST to /api/soundboard/profile.
 *   - Anonymous: dial state persisted to localStorage in the same
 *     shape so a returning visitor sees their last tune.
 *
 * The algorithm equation reads only the 3 ranking dials (since the
 * other 5 do not affect the table). A small line below the equation
 * tells the signed-in user that the engine dials shape other product
 * surfaces. Locked dials render with a "sign in to unlock" badge for
 * the public tier.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { RankedPlayer, RankedPool } from "@/lib/rankings/build";
import { DIAL_METHODOLOGY } from "@/lib/rankings/methodology";
import { AlgorithmEquation } from "@/components/rankings/algorithm-equation";
import {
  DIAL_SPECS,
  defaultProfile,
  type DialId,
  type DialValue,
  type JudgmentProfile,
} from "@/lib/soundboard/types";
import {
  PRESET_BY_ID,
  PRESETS,
  detectActivePreset,
} from "@/lib/soundboard/presets";
import { deriveDoctrine, formatDoctrineLine } from "@/lib/soundboard/doctrine";

const RANKING_DIAL_IDS: DialId[] = [
  "youth_weight",
  "bellcow_pref",
  "continuity_weight",
];
const ENGINE_DIAL_IDS: DialId[] = [
  "horizon",
  "rookie_tilt",
  "risk_tolerance",
  "trade_aggression",
  "consensus_lean",
];

const DIAL_EMPHASIS_RANGE = 60;
const ANONYMOUS_STORAGE_KEY = "dg_rankings_dials_v1";
const SAVE_DEBOUNCE_MS = 600;

/** Tone color for a position cell in the table. */
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

function asNumberDial(value: DialValue | undefined): number {
  return typeof value === "number" ? value : 0;
}

type ScoredRow = RankedPlayer & {
  raw_score: number;
  dg_index: number;
  dg_rank: number;
  rank_delta: number;
};

function rescore(
  players: RankedPlayer[],
  ranking: { youth: number; bellcow: number; continuity: number },
): ScoredRow[] {
  const youthW = ranking.youth / 100;
  const bellcowW = ranking.bellcow / 100;
  const continuityW = ranking.continuity / 100;
  const withScore = players.map((p) => {
    const adj =
      youthW * p.components.youth +
      bellcowW * p.components.bellcow +
      continuityW * p.components.continuity;
    const raw_score = p.baseline_value + DIAL_EMPHASIS_RANGE * adj;
    return { ...p, raw_score };
  });
  withScore.sort((a, b) => b.raw_score - a.raw_score);
  const top = withScore[0]?.raw_score ?? 1;
  return withScore.map((p, i) => ({
    ...p,
    dg_index: top > 0 ? (p.raw_score / top) * 100 : 0,
    dg_rank: i + 1,
    rank_delta: p.market_rank - (i + 1),
  }));
}

export function RankingsLab({
  pool,
  tier,
  initialProfile,
}: {
  pool: RankedPool;
  tier: "public" | "signed_in" | "premium";
  initialProfile: JudgmentProfile;
}) {
  const canEditEngineDials = tier !== "public";
  const isSignedIn = tier !== "public";

  // Hold all 8 dial values plus rendering helpers. Public users mutate
  // the 3 ranking dials only; engine dials are visible but locked.
  const [dials, setDials] = useState<Record<DialId, DialValue>>(
    () => initialProfile.dials,
  );
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Anonymous users: hydrate from localStorage on mount.
  useEffect(() => {
    if (isSignedIn || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ANONYMOUS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const next: Record<DialId, DialValue> = { ...defaultProfile().dials };
      for (const spec of DIAL_SPECS) {
        const v = parsed[spec.id];
        if (typeof v === "number" && Number.isFinite(v)) {
          next[spec.id] = Math.max(-100, Math.min(100, v));
        }
      }
      setDials(next);
    } catch {
      // ignore corrupt localStorage
    }
  }, [isSignedIn]);

  // Debounced persistence. Signed-in users save to Supabase; anonymous
  // to localStorage.
  function scheduleSave(next: Record<DialId, DialValue>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (isSignedIn) {
        setSaveState("saving");
        try {
          const res = await fetch("/api/soundboard/profile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ dials: next }),
          });
          setSaveState(res.ok ? "saved" : "error");
          if (res.ok) {
            window.setTimeout(() => setSaveState("idle"), 1500);
          }
        } catch {
          setSaveState("error");
        }
      } else if (typeof window !== "undefined") {
        try {
          const onlyNumbers: Record<string, number> = {};
          for (const spec of DIAL_SPECS) {
            const v = next[spec.id];
            if (typeof v === "number") onlyNumbers[spec.id] = v;
          }
          window.localStorage.setItem(
            ANONYMOUS_STORAGE_KEY,
            JSON.stringify(onlyNumbers),
          );
          setSaveState("saved");
          window.setTimeout(() => setSaveState("idle"), 1200);
        } catch {
          setSaveState("error");
        }
      }
    }, SAVE_DEBOUNCE_MS);
  }

  function moveDial(id: DialId, value: number, locked: boolean) {
    if (locked) return;
    setDials((prev) => {
      const next = { ...prev, [id]: value };
      scheduleSave(next);
      return next;
    });
  }

  function reset() {
    const next = defaultProfile().dials;
    setDials(next);
    scheduleSave(next);
  }

  function applyPreset(presetId: string) {
    const preset = PRESET_BY_ID.get(presetId as Parameters<typeof PRESET_BY_ID.get>[0]);
    if (!preset) return;
    setDials((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(preset.values)) {
        next[k as DialId] = v as DialValue;
      }
      scheduleSave(next);
      return next;
    });
  }

  const rankingDials = {
    youth: asNumberDial(dials.youth_weight),
    bellcow: asNumberDial(dials.bellcow_pref),
    continuity: asNumberDial(dials.continuity_weight),
  };
  const scored = useMemo(
    () => rescore(pool.players, rankingDials),
    [pool.players, rankingDials.youth, rankingDials.bellcow, rankingDials.continuity],
  );
  const visibleLimit = tier === "public" ? 25 : 100;
  const visible = scored.slice(0, visibleLimit);
  const lockedRows = scored.length > visibleLimit ? scored.length - visibleLimit : 0;

  const activePreset = detectActivePreset(dials);
  const doctrine = deriveDoctrine(dials);

  function toggleDrawer(id: string) {
    setOpenDrawer((curr) => (curr === id ? null : id));
  }

  return (
    <div className="space-y-6">
      {/* Doctrine readout + preset bar */}
      <div className="rounded-lg border border-border-soft bg-surface px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Current doctrine
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">
              {formatDoctrineLine(doctrine)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
              {doctrine.calibrated_count} of {DIAL_SPECS.length} calibrated
              {saveState === "saving" && " · saving"}
              {saveState === "saved" && " · saved"}
              {saveState === "error" && " · save failed"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border-soft bg-surface-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 transition hover:text-accent"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                activePreset === p.id
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border-soft bg-surface-2 text-muted-2 hover:border-accent/60 hover:text-accent"
              }`}
              title={p.blurb}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Ranking dials (always usable) */}
      <div className="rounded-lg border border-border-soft bg-surface px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Ranking dials · 3 of 3
            </div>
            <p className="mt-1 text-sm text-muted">
              These change the table on this page in real time. Default
              (0) reproduces the consensus market. Tap{" "}
              <kbd className="rounded border border-border-soft bg-surface-2 px-1 font-mono text-[10px]">
                ?
              </kbd>{" "}
              for methodology.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {RANKING_DIAL_IDS.map((id) => (
            <DialControl
              key={id}
              id={id}
              value={asNumberDial(dials[id])}
              onChange={(v) => moveDial(id, v, false)}
              onInfoClick={() => toggleDrawer(id)}
              isOpen={openDrawer === id}
              locked={false}
              disabledForCalibration={id === "continuity_weight"}
            />
          ))}
        </div>
        {openDrawer && RANKING_DIAL_IDS.includes(openDrawer as DialId) && (
          <div className="mt-5 border-t border-border-soft pt-5">
            <MethodologyDrawer
              id={openDrawer}
              onClose={() => setOpenDrawer(null)}
            />
          </div>
        )}
      </div>

      <AlgorithmEquation dials={rankingDials} continuityDisabled />

      {/* Engine dials (sign-in gated) */}
      <div className="rounded-lg border border-border-soft bg-surface px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Engine dials · 5 of 5
              {!canEditEngineDials && (
                <span className="ml-2 text-warning">· sign-in required</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              These shape Coach and Decision-card behavior across the
              product. They do not move the table on this page, but
              they do change what Coach says about your team and which
              candidates surface on the Decision card.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {ENGINE_DIAL_IDS.map((id) => (
            <DialControl
              key={id}
              id={id}
              value={asNumberDial(dials[id])}
              onChange={(v) => moveDial(id, v, !canEditEngineDials)}
              onInfoClick={() => toggleDrawer(id)}
              isOpen={openDrawer === id}
              locked={!canEditEngineDials}
            />
          ))}
        </div>
        {!canEditEngineDials && (
          <div className="mt-4 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-foreground">
            Sign in to use the engine dials.{" "}
            <a href="/login" className="text-accent hover:underline">
              Sign in
            </a>{" "}
            (free; no payment until calibration ships).
          </div>
        )}
        {openDrawer && ENGINE_DIAL_IDS.includes(openDrawer as DialId) && (
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
              <th
                className="px-3 py-2.5 text-right"
                title="DG Index: player's raw score normalized so the top of your tuned model = 100.0."
              >
                DG Index
              </th>
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
  value,
  onChange,
  onInfoClick,
  isOpen,
  locked,
  disabledForCalibration = false,
}: {
  id: DialId;
  value: number;
  onChange: (next: number) => void;
  onInfoClick: () => void;
  isOpen: boolean;
  locked: boolean;
  /**
   * Special-case for the Continuity dial today: signal table isn't
   * calibrated, so the slider has no effect on the live ranking. We
   * render it disabled with a "neutral" label so the dial is honest
   * about doing nothing yet.
   */
  disabledForCalibration?: boolean;
}) {
  const spec = DIAL_SPECS.find((s) => s.id === id);
  if (!spec) return null;
  const isDisabled = locked || disabledForCalibration;
  const displayValue = locked
    ? "sign in"
    : disabledForCalibration
      ? "neutral"
      : value === 0
        ? "0"
        : value > 0
          ? `+${value}`
          : `${value}`;
  return (
    <div className={locked ? "opacity-60" : ""}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <label className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            {spec.name}
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
            title={`Methodology behind ${spec.name}`}
          >
            ?
          </button>
          {locked && (
            <span
              className="font-mono text-[8px] uppercase tracking-[0.14em] text-warning"
              title="Sign in to use this dial"
            >
              locked
            </span>
          )}
        </div>
        <span
          className={`font-mono text-[10px] ${isDisabled ? "text-muted-2" : "text-foreground"}`}
        >
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        disabled={isDisabled}
        className="mt-2 w-full accent-accent"
      />
      <p className="mt-1 text-xs leading-snug text-muted-2">{spec.short_blurb}</p>
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
  const headingTone = tone === "warning" ? "text-warning" : "text-accent";
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
        {row.dg_index.toFixed(1)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs text-muted-2">
        {row.market_rank}
      </td>
    </tr>
  );
}
