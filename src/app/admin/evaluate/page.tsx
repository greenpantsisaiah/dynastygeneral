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
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getAdminUser } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import { __dumpAllPlayers } from "@/lib/players/cache";
import { resolvePlayerValues } from "@/lib/players/values";
import { evaluate } from "@/lib/engine/evaluation";
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

  const candidates = allPlayers
    .filter(
      (p) =>
        p.position === positionFilter &&
        typeof p.search_rank === "number" &&
        (p.search_rank as number) > 0 &&
        (p.search_rank as number) < 500,
    )
    .sort((a, b) => (a.search_rank as number) - (b.search_rank as number))
    .slice(0, PER_POSITION);

  const ids = candidates.map((p) => p.player_id);

  const [valuesMap, playerSignalsResult, teamSignalsResult] = await Promise.all(
    [
      resolvePlayerValues({
        ids,
        isSuperflex: flags.isSuperflex,
        isPpr: flags.isPpr,
        isHalfPpr: flags.isHalfPpr,
        isTePremium: flags.isTePremium,
      }),
      getAdminClient().from("player_signals").select("*").in("player_id", ids),
      getAdminClient().from("team_signals").select("*"),
    ],
  );

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

  const rows = candidates.map((p) => {
    const fullName =
      p.full_name ??
      (`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.player_id);
    const value = valuesMap.get(p.player_id);
    const playerSignals = playerSignalsById.get(p.player_id);
    const teamSignals = p.team
      ? teamSignalsByTeam.get(p.team)
      : undefined;

    const result = evaluate({
      player: (playerSignals as PlayerSignalsRow | undefined) ?? null,
      team: (teamSignals as TeamSignalsRow | undefined) ?? null,
      ktc_value: value?.value ?? null,
      adp: null,
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
      mkt_normalized: value?.value ?? null,
      mkt_raw: value?.raw_value ?? null,
      result,
      isCoded:
        playerSignals != null && Object.keys(playerSignals).length > 1,
    };
  });

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
            <p className="mt-1 max-w-3xl text-xs text-muted-2">
              <span className="font-mono uppercase tracking-[0.14em] text-accent">
                Dynasty
              </span>{" "}
              mode. Redraft loss function lands in Phase 2 (see
              VALIDATION_PLAN). Mkt column shows raw FantasyCalc
              values so they stay comparable across formats.
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

            <div className="mt-8 space-y-2">
              {rows.map((r) => (
                <EvaluateRow key={r.player_id} row={r} />
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

type Row = {
  player_id: string;
  name: string;
  team: string | null;
  age: number | null;
  search_rank: number | null;
  mkt_normalized: number | null;
  mkt_raw: number | null;
  result: ReturnType<typeof evaluate>;
  isCoded: boolean;
};

function EvaluateRow({ row }: { row: Row }) {
  const r = row.result;
  const point = r.point_estimate;
  const lo = r.variance_band.lo;
  const hi = r.variance_band.hi;
  const conf = r.confidence * 100;
  const delta = r.market_delta;

  // Visual band: percentage positions on a 0-100 scale.
  const bandLeftPct = lo;
  const bandWidthPct = Math.max(hi - lo, 1);
  const pointPct = point;

  const deltaTone =
    delta > 5
      ? "text-success"
      : delta < -5
        ? "text-danger"
        : "text-muted-2";

  return (
    <div className="rounded-md border border-border-soft bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">
            {row.name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            {row.team ?? "FA"}
            {row.age != null ? ` · age ${row.age}` : ""}
            {row.search_rank != null ? ` · rank ${row.search_rank}` : ""}
            {row.mkt_raw != null
              ? ` · mkt ${row.mkt_raw.toFixed(0)}`
              : ""}
          </span>
          {row.isCoded && (
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-success">
              coded
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-3 font-mono text-xs">
          <span>
            <span className="text-muted-2">point </span>
            <span className="font-semibold text-foreground">
              {point.toFixed(0)}
            </span>
          </span>
          <span className="text-muted-2">conf {conf.toFixed(0)}%</span>
          <span className={deltaTone}>
            mkt Δ {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Visual variance band */}
      <div
        className="mt-2"
        title={`Variance band ${lo.toFixed(0)} to ${hi.toFixed(0)} (width ${(hi - lo).toFixed(0)}). Point estimate ${point.toFixed(0)}. Confidence ${conf.toFixed(0)}%.`}
      >
        <div className="relative h-3 w-full rounded-full bg-surface-2">
          {/* 25% / 50% / 75% tick marks for orientation */}
          <div className="pointer-events-none absolute inset-y-0 left-1/4 w-px bg-border-soft/60" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border-soft/60" />
          <div className="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-border-soft/60" />
          {/* The variance band */}
          <div
            className="absolute inset-y-0 rounded-full bg-accent/30"
            style={{
              left: `${bandLeftPct}%`,
              width: `${bandWidthPct}%`,
            }}
          />
          {/* Point-estimate marker */}
          <div
            className="absolute inset-y-0 w-0.5 bg-accent"
            style={{ left: `${pointPct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          <span>0</span>
          <span>
            band {lo.toFixed(0)}-{hi.toFixed(0)}
          </span>
          <span>100</span>
        </div>
      </div>

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
