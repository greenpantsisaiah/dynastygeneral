/**
 * Admin debug surface for the new evaluate() engine. Renders the top
 * N players at each position with point estimate, variance band,
 * confidence, arbitrage flags, and full evidence stack. Lets the
 * founder sanity-check the rubric output during a mock draft without
 * breaking production surfaces (which still consume the old scoring
 * path).
 *
 * Per BUILD_PLAN section 0.4: this is the consumer-side test of
 * evaluate(). When the founder validates the output here matches
 * intuition, we wire production surfaces to evaluate() in Phase 1.5.
 *
 * Engine input scope: DYNASTY mode only (FantasyCalc isDynasty=true).
 * Redraft is a separate loss function (see VALIDATION_PLAN section 8)
 * and lands in Phase 2.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import { getAdminUser } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import { __dumpAllPlayers } from "@/lib/players/cache";
import { resolvePlayerValues } from "@/lib/players/values";
import {
  getProjections,
  pickAdpFromVariants,
} from "@/lib/players/projections";
import { getNflState } from "@/lib/sleeper/client";
import { evaluate } from "@/lib/engine/evaluation";
import {
  computeTiers,
  classifyTierScarcity,
  type TierAssignment,
  type TierMetadata,
} from "@/lib/engine/evaluation/tiers";
import type {
  PlayerSignalsRow,
  TeamSignalsRow,
} from "@/lib/signals/schema";

export const metadata: Metadata = {
  title: "Admin · Evaluate",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const POSITIONS = ["RB", "WR", "TE", "QB"] as const;
const PER_POSITION = 30;

type FormatKey = "sf_ppr" | "1qb_ppr" | "1qb_half" | "sf_te_premium";

const FORMAT_LABELS: Record<FormatKey, string> = {
  sf_ppr: "SF PPR",
  "1qb_ppr": "1QB PPR",
  "1qb_half": "1QB Half",
  sf_te_premium: "SF TE Prem",
};

function parseFormat(raw: string | undefined): FormatKey {
  if (raw && (raw === "sf_ppr" || raw === "1qb_ppr" || raw === "1qb_half" || raw === "sf_te_premium")) {
    return raw;
  }
  return "sf_ppr";
}

function formatFlags(f: FormatKey): {
  isSuperflex: boolean;
  isPpr: boolean;
  isHalfPpr: boolean;
  isTePremium: boolean;
} {
  return {
    isSuperflex: f === "sf_ppr" || f === "sf_te_premium",
    isPpr: f !== "1qb_half",
    isHalfPpr: f === "1qb_half",
    isTePremium: f === "sf_te_premium",
  };
}

export default async function AdminEvaluatePage({
  searchParams,
}: {
  searchParams: Promise<{ pos?: string; format?: string }>;
}) {
  const user = await getAdminUser();
  if (!user) redirect("/");

  const { pos = "RB", format } = await searchParams;
  const positionFilter = (
    POSITIONS.includes(pos as (typeof POSITIONS)[number])
      ? pos
      : "RB"
  ) as (typeof POSITIONS)[number];
  const fmt = parseFormat(format);
  const flags = formatFlags(fmt);

  const allPlayers = await __dumpAllPlayers();

  // Pull a generous candidate pool by Sleeper search rank, then
  // filter against FantasyCalc-tracked players so retirees / FAs
  // who happen to be searched (Todd Gurley incident 2026-05-04) get
  // dropped before they hit the engine. Pull 100 then trim to
  // PER_POSITION after the FC filter lands.
  const broadCandidates = allPlayers
    .filter(
      (p) =>
        p.position === positionFilter &&
        typeof p.search_rank === "number" &&
        (p.search_rank as number) > 0 &&
        (p.search_rank as number) < 500,
    )
    .sort((a, b) => (a.search_rank as number) - (b.search_rank as number))
    .slice(0, 100);

  const broadIds = broadCandidates.map((p) => p.player_id);

  const nflState = await getNflState();
  const season = nflState?.season ?? new Date().getFullYear().toString();

  // PRINCIPLED EXCEPTION to the one-value-seam migration: this debug surface
  // FEEDS the raw FantasyCalc value INTO evaluate() as the KTC prior and
  // renders market-vs-rubric divergence side by side. Routing it through
  // `scoringValueByIds` would be CIRCULAR (the rubric reading its own output
  // as its prior) and would destroy the surface's purpose. It stays on raw
  // `resolvePlayerValues` on purpose; the Phase G lockdown lint allowlists
  // this call site (see MODEL_LIVE_PLAN Phase G2).
  const [valuesMap, projectionsEntry, teamSignalsResult] = await Promise.all([
    resolvePlayerValues({
      ids: broadIds,
      isSuperflex: flags.isSuperflex,
      isPpr: flags.isPpr,
      isHalfPpr: flags.isHalfPpr,
      isTePremium: flags.isTePremium,
    }),
    getProjections(season).catch(() => null),
    getAdminClient().from("team_signals").select("*"),
  ]);

  // Keep only players that FantasyCalc actually tracks. If FC has no
  // value for them, they're not part of the dynasty market and should
  // not appear in this view.
  const candidates = broadCandidates
    .filter((p) => valuesMap.has(p.player_id))
    .slice(0, PER_POSITION);
  const ids = candidates.map((p) => p.player_id);

  const playerSignalsResult = await getAdminClient()
    .from("player_signals")
    .select("*")
    .in("player_id", ids);

  // Compute Sleeper-projection ADP for each candidate per the format.
  // Then sort to get the ADP-derived position rank within this set.
  const adpByPlayerId = new Map<string, number | null>();
  for (const p of candidates) {
    const isRookie =
      typeof p.years_exp === "number" && p.years_exp === 0;
    const adpEntry = projectionsEntry?.byPlayerId.get(p.player_id);
    const { value } = pickAdpFromVariants(adpEntry, {
      isSuperflex: flags.isSuperflex,
      isPpr: flags.isPpr,
      isHalfPpr: flags.isHalfPpr,
      isTePremium: flags.isTePremium,
      isRookie,
      position: positionFilter,
    });
    adpByPlayerId.set(p.player_id, value);
  }
  // ADP position rank: lowest ADP among candidates ranks #1.
  const candidatesByAdp = candidates
    .map((p) => ({
      id: p.player_id,
      adp: adpByPlayerId.get(p.player_id) ?? null,
    }))
    .filter((x) => x.adp != null)
    .sort((a, b) => (a.adp as number) - (b.adp as number));
  const adpRankByPlayerId = new Map<string, number>();
  candidatesByAdp.forEach((x, i) => adpRankByPlayerId.set(x.id, i + 1));

  const playerSignalsById = new Map<string, Partial<PlayerSignalsRow>>();
  for (const row of (playerSignalsResult.data ??
    []) as Partial<PlayerSignalsRow>[]) {
    if (typeof row.player_id === "string") {
      playerSignalsById.set(row.player_id, row);
    }
  }

  const teamSignalsByTeam = new Map<string, Partial<TeamSignalsRow>>();
  for (const row of (teamSignalsResult.data ??
    []) as Partial<TeamSignalsRow>[]) {
    if (typeof row.team === "string") {
      teamSignalsByTeam.set(row.team, row);
    }
  }

  const unsortedRows = candidates.map((p) => {
    const fullName =
      p.full_name ??
      (`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.player_id);
    const value = valuesMap.get(p.player_id);
    const playerSignals = playerSignalsById.get(p.player_id);
    const teamSignals = p.team
      ? teamSignalsByTeam.get(p.team)
      : undefined;
    const adpValue = adpByPlayerId.get(p.player_id) ?? null;
    const adpRank = adpRankByPlayerId.get(p.player_id) ?? null;

    const result = evaluate({
      player: (playerSignals as PlayerSignalsRow | undefined) ?? null,
      team: (teamSignals as TeamSignalsRow | undefined) ?? null,
      ktc_value: value?.value ?? null,
      adp: adpValue,
      search_rank: typeof p.search_rank === "number" ? p.search_rank : null,
      position: p.position ?? null,
      age: typeof p.age === "number" ? p.age : null,
      years_exp: typeof p.years_exp === "number" ? p.years_exp : null,
      is_rookie:
        typeof p.years_exp === "number" && p.years_exp === 0,
    });

    return {
      player_id: p.player_id,
      name: fullName,
      team: p.team ?? null,
      age: typeof p.age === "number" ? p.age : null,
      search_rank: typeof p.search_rank === "number" ? p.search_rank : null,
      mkt_rank: value?.position_rank ?? null,
      mkt_normalized: value?.value ?? null,
      mkt_raw: value?.raw_value ?? null,
      adp_value: adpValue,
      adp_rank: adpRank,
      result,
      isCoded:
        playerSignals != null && Object.keys(playerSignals).length > 1,
    };
  });

  // Sort by engine point estimate descending so the FIRST visible row
  // is the engine's #1 at this position. Where the engine disagrees
  // with market (CMC, etc.) the divergence is now visible at a glance
  // instead of buried behind Sleeper's search-rank order.
  const rows = [...unsortedRows].sort(
    (a, b) => b.result.point_estimate - a.result.point_estimate,
  );

  // Tier computation: tiers from variance-band overlap. See
  // tiers.ts for the framework rationale (VBD / VONA / single-linkage).
  const tierResult = computeTiers(
    rows.map((r) => ({
      player_id: r.player_id,
      point_estimate: r.result.point_estimate,
      variance_band: r.result.variance_band,
    })),
  );

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-7xl px-6 py-12">
            <Ticker label="Admin · Evaluate Debug" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              evaluate() output debug
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-muted">
              Top {PER_POSITION} players at each position run through
              the new <code className="text-accent">evaluate()</code>{" "}
              engine. Use this to sanity-check rubric output during a
              mock draft. Production surfaces still use the legacy
              scoring path; this is a side-by-side reality check.
            </p>
            <p className="mt-2 max-w-3xl text-xs text-muted-2">
              <span className="font-mono uppercase tracking-[0.14em] text-accent">
                Dynasty
              </span>{" "}
              mode. Redraft loss function lands in Phase 2 (see
              VALIDATION_PLAN). Mkt column shows raw FantasyCalc
              values so they stay comparable across formats.
            </p>
            <p className="mt-2 max-w-3xl text-xs text-muted-2">
              Each row shows the engine&apos;s 0-100 dynasty-value
              estimate. The shaded segment is the confidence range; the
              vertical marker is the point estimate. Sorted by engine
              point descending, so divergence from market rank is
              visible (e.g. an aging RB who Sleeper ranks high but the
              engine ranks low will drop down the list).
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {POSITIONS.map((p) => (
                <Link
                  key={p}
                  href={`/admin/evaluate?pos=${p}&format=${fmt}`}
                  className={`rounded-md border px-3 py-1 font-mono uppercase tracking-[0.14em] ${
                    p === positionFilter
                      ? "border-accent/60 bg-accent/15 text-accent"
                      : "border-border-soft bg-surface-2 text-muted-2 hover:text-accent"
                  }`}
                >
                  {p}
                </Link>
              ))}
              <span className="rounded-md border border-border-soft bg-surface-2 px-3 py-1 font-mono uppercase tracking-[0.14em] text-muted-2">
                format
              </span>
              {(Object.keys(FORMAT_LABELS) as FormatKey[]).map((k) => (
                <Link
                  key={k}
                  href={`/admin/evaluate?pos=${positionFilter}&format=${k}`}
                  className={`rounded-md border px-3 py-1 font-mono uppercase tracking-[0.14em] ${
                    fmt === k
                      ? "border-accent/60 bg-accent/15 text-accent"
                      : "border-border-soft bg-surface-2 text-muted-2 hover:text-accent"
                  }`}
                >
                  {FORMAT_LABELS[k]}
                </Link>
              ))}
              <Link
                href="/admin/signals/players"
                className="rounded-md border border-border-soft bg-surface-2 px-3 py-1 font-mono uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
              >
                Code signals
              </Link>
            </div>

            {/* Tier summary strip: at-a-glance shape of the position */}
            <div className="mt-6 rounded-md border border-border-soft bg-surface px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                  {positionFilter} tiers (within shown {rows.length})
                </span>
                {tierResult.tiers.map((t) => {
                  const scarcity = classifyTierScarcity(t.count);
                  const tone =
                    scarcity === "critical"
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : scarcity === "scarce"
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : scarcity === "moderate"
                          ? "border-border-soft bg-surface-2 text-foreground"
                          : "border-border-soft bg-surface-2 text-muted-2";
                  return (
                    <span
                      key={t.tier}
                      className={`rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${tone}`}
                      title={`Tier ${t.tier}: ${t.count} players, range ${t.rangeLo.toFixed(0)}-${t.rangeHi.toFixed(0)}. ${scarcity}.`}
                    >
                      T{t.tier}: {t.count} · {scarcity}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {rows.map((r, i) => {
                const assignment = tierResult.assignments.get(r.player_id);
                const showTierHeader =
                  assignment?.isFirstInTier === true && i > 0;
                const tier = assignment
                  ? tierResult.tiers.find((t) => t.tier === assignment.tier)
                  : undefined;
                return (
                  <div key={r.player_id}>
                    {showTierHeader && tier && (
                      <TierDivider tier={tier} />
                    )}
                    <EvaluateRow
                      row={r}
                      engineRank={i + 1}
                      assignment={assignment}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

type Row = {
  player_id: string;
  name: string;
  team: string | null;
  age: number | null;
  search_rank: number | null;
  mkt_rank: number | null;
  mkt_normalized: number | null;
  mkt_raw: number | null;
  adp_value: number | null;
  adp_rank: number | null;
  result: ReturnType<typeof evaluate>;
  isCoded: boolean;
};

function adpToVisualScore(adp: number | null): number | null {
  if (adp == null || !Number.isFinite(adp)) return null;
  return Math.max(0, Math.min(100, 95 - (adp / 200) * 95));
}

function TierDivider({ tier }: { tier: TierMetadata }) {
  const scarcity = classifyTierScarcity(tier.count);
  const tone =
    scarcity === "critical"
      ? "text-danger border-danger/30"
      : scarcity === "scarce"
        ? "text-accent border-accent/30"
        : "text-muted-2 border-border-soft";
  return (
    <div className={`my-3 flex items-center gap-2 ${tone}`}>
      <div className={`h-px flex-1 border-t ${tone}`} />
      <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
        tier {tier.tier} · {tier.count} player{tier.count === 1 ? "" : "s"}{" "}
        · range {tier.rangeLo.toFixed(0)}-{tier.rangeHi.toFixed(0)} ·{" "}
        {scarcity}
      </span>
      <div className={`h-px flex-1 border-t ${tone}`} />
    </div>
  );
}

function EvaluateRow({
  row,
  engineRank,
  assignment,
}: {
  row: Row;
  engineRank: number;
  assignment: TierAssignment | undefined;
}) {
  const r = row.result;
  const point = r.point_estimate;
  const lo = r.variance_band.lo;
  const hi = r.variance_band.hi;
  const conf = r.confidence * 100;

  const rangeLeftPct = lo;
  const rangeWidthPct = Math.max(hi - lo, 1);
  const enginePct = point;
  const mktPct = row.mkt_normalized;
  const adpPct = adpToVisualScore(row.adp_value);

  const ranks = [engineRank, row.mkt_rank, row.adp_rank].filter(
    (x): x is number => x != null,
  );
  const spread =
    ranks.length >= 2 ? Math.max(...ranks) - Math.min(...ranks) : 0;
  let consensusTag: { label: string; tone: string } | null = null;
  if (ranks.length >= 2) {
    if (spread <= 2) {
      consensusTag = { label: "consensus", tone: "text-success" };
    } else if (spread >= 6) {
      consensusTag = { label: "divergence", tone: "text-accent" };
    }
  }

  const fallbackRank = (n: number | null): string =>
    n == null ? "n/a" : `#${n}`;
  const fallbackNum = (n: number | null): string =>
    n == null ? "n/a" : n.toFixed(0);

  return (
    <div className="rounded-md border border-border-soft bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            #{engineRank}
          </span>
          {assignment && (
            <span
              className="rounded-sm border border-border-soft bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted"
              title={`Tier ${assignment.tier}`}
            >
              T{assignment.tier}
            </span>
          )}
          <span className="text-sm font-semibold text-foreground">
            {row.name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            {row.team ?? "FA"}
            {row.age != null ? ` · age ${row.age}` : ""}
          </span>
          {assignment?.isLastInTier === true && (
            <span
              className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent"
              title="Last player in this tier. Tier break (cliff) below."
            >
              last in tier
            </span>
          )}
          {consensusTag && (
            <span
              className={`font-mono text-[9px] uppercase tracking-[0.14em] ${consensusTag.tone}`}
              title={`Engine #${engineRank}, Market ${fallbackRank(row.mkt_rank)}, ADP ${fallbackRank(row.adp_rank)}. Spread ${spread} ranks.`}
            >
              {consensusTag.label}
            </span>
          )}
          {row.isCoded && (
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-success">
              coded
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-3 font-mono text-xs">
          <span title="Engine point estimate (this rubric's call)">
            <span className="text-muted-2">engine </span>
            <span className="font-semibold text-foreground">
              {point.toFixed(0)}
            </span>
            <span className="text-muted-2"> · #{engineRank}</span>
          </span>
          <span
            className="text-muted-2"
            title="FantasyCalc dynasty market value (normalized 0-100) and position rank"
          >
            mkt {fallbackNum(row.mkt_normalized)} ·{" "}
            {fallbackRank(row.mkt_rank)}
          </span>
          <span
            className="text-muted-2"
            title="Sleeper crowd ADP for this format and position rank"
          >
            adp{" "}
            {row.adp_value != null ? row.adp_value.toFixed(1) : "n/a"} ·{" "}
            {fallbackRank(row.adp_rank)}
          </span>
          <span className="text-muted-2">conf {conf.toFixed(0)}%</span>
        </div>
      </div>

      {(() => {
        // Compute spread bar from min to max of the three sources.
        // Bar = disagreement. Long = sources disagree, short = consensus.
        const sourceVals = [
          enginePct,
          ...(mktPct != null ? [mktPct] : []),
          ...(adpPct != null ? [adpPct] : []),
        ];
        const sourceMin = Math.min(...sourceVals);
        const sourceMax = Math.max(...sourceVals);
        const spreadAmt = sourceMax - sourceMin;
        // Tone the spread bar by magnitude: faint when consensus, more
        // visible when divergent. Floors at 4 px so a perfect-consensus
        // row still has a tiny anchor between the markers.
        const spreadVisualWidth = Math.max(spreadAmt, 0.5);
        const spreadFill =
          spreadAmt >= 15
            ? "bg-accent/35 ring-1 ring-accent/40"
            : spreadAmt >= 6
              ? "bg-foreground/20 ring-1 ring-foreground/15"
              : "bg-foreground/10 ring-1 ring-foreground/10";
        return (
          <div
            className="mt-2"
            title={`Engine ${point.toFixed(0)} (conf range ${lo.toFixed(0)}-${hi.toFixed(0)}). Market ${fallbackNum(mktPct)}. ADP-derived ${fallbackNum(adpPct)}. Source spread ${spreadAmt.toFixed(0)}.`}
          >
            <div className="relative h-4 w-full rounded-full bg-surface-2">
              <div className="pointer-events-none absolute inset-y-0 left-1/4 w-px bg-border-soft/60" />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border-soft/60" />
              <div className="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-border-soft/60" />
              {/* Source-spread bar. Stronger fill when divergent. */}
              <div
                className={`absolute inset-y-0 rounded-full ${spreadFill}`}
                style={{
                  left: `${sourceMin}%`,
                  width: `${spreadVisualWidth}%`,
                }}
              />
              {/* Market marker (green dot, render before engine so
                  the larger engine dot stacks on top if they overlap) */}
              {mktPct != null && (
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-success ring-1 ring-background"
                  style={{ left: `${mktPct}%` }}
                  title={`Market: ${mktPct.toFixed(0)}`}
                />
              )}
              {/* ADP marker (white dot, max contrast vs accent) */}
              {adpPct != null && (
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-1 ring-background"
                  style={{ left: `${adpPct}%` }}
                  title={`ADP: ${adpPct.toFixed(0)}`}
                />
              )}
              {/* Engine marker. Largest dot, accent gold, double ring
                  so it reads as the primary call ("our" recommendation)
                  rather than as a structural tick mark. */}
              <div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-background"
                style={{ left: `${enginePct}%` }}
                title={`Engine: ${point.toFixed(0)} (our call)`}
              />
            </div>
            <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
              <span>0</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />{" "}
                  engine
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-success" />{" "}
                  mkt
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-foreground" />{" "}
                  adp
                </span>
                <span
                  className={
                    spreadAmt >= 15
                      ? "text-accent"
                      : spreadAmt >= 6
                        ? "text-foreground/70"
                        : "text-muted-2/70"
                  }
                >
                  spread {spreadAmt.toFixed(0)}
                </span>
              </span>
              <span>100</span>
            </div>
          </div>
        );
      })()}

      {r.arbitrage_flags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {r.arbitrage_flags.map((f) => (
            <span
              key={f}
              className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-accent"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2 hover:text-accent">
          evidence stack ({r.evidence_stack.length})
        </summary>
        <div className="mt-2 grid gap-1 text-[11px] font-mono">
          {r.evidence_stack.map((e, i) => (
            <div
              key={`${e.signal}-${i}`}
              className="flex flex-wrap items-baseline gap-2 rounded-sm border border-border-soft bg-surface-2 px-2 py-1"
            >
              <span className="text-muted-2">[{e.layer}]</span>
              <span className="text-foreground">{e.signal}</span>
              <span className="text-muted-2">
                w={e.weight.toFixed(2)} v={e.value.toFixed(1)} →{" "}
                {e.contribution.toFixed(1)}
              </span>
              <span className="text-muted-2">{e.source}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
