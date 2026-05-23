import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import { getAdminUser } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import { __dumpAllPlayers } from "@/lib/players/cache";
import type { PlayerSignalsRow } from "@/lib/signals/schema";
import { PlayerSignalsRowEditor } from "@/components/admin/signals/player-row";

export const metadata: Metadata = {
  title: "Admin · Player Signals",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const POSITIONS_TO_CODE = ["RB", "WR", "TE", "QB"] as const;
const POSITION_LIMITS: Record<string, number> = {
  RB: 64,
  WR: 80,
  TE: 32,
  QB: 32,
};

export default async function AdminPlayerSignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ pos?: string }>;
}) {
  const user = await getAdminUser();
  if (!user) {
    redirect("/");
  }

  const { pos = "RB" } = await searchParams;
  const positionFilter = (
    POSITIONS_TO_CODE.includes(pos as (typeof POSITIONS_TO_CODE)[number])
      ? pos
      : "RB"
  ) as (typeof POSITIONS_TO_CODE)[number];

  const admin = getAdminClient();
  const allPlayers = await __dumpAllPlayers();

  // Filter to skill-position players with reasonable rank, sort by
  // search_rank ascending (best players first), cap at the position
  // limit. This is the "top N at this position" coding queue.
  const limit = POSITION_LIMITS[positionFilter] ?? 32;
  const candidates = allPlayers
    .filter(
      (p) =>
        p.position === positionFilter &&
        typeof p.search_rank === "number" &&
        (p.search_rank as number) > 0 &&
        (p.search_rank as number) < 500,
    )
    .sort(
      (a, b) =>
        (a.search_rank as number) - (b.search_rank as number),
    )
    .slice(0, limit);

  const ids = candidates.map((p) => p.player_id);
  const { data: existing } = await admin
    .from("player_signals")
    .select("*")
    .in("player_id", ids);

  const byId = new Map<string, Partial<PlayerSignalsRow>>();
  for (const row of (existing ?? []) as Partial<PlayerSignalsRow>[]) {
    if (typeof row.player_id === "string") byId.set(row.player_id, row);
  }

  const rows: Array<{
    player_id: string;
    name: string;
    team: string | null;
    age: number | null;
    rank: number;
    signals: PlayerSignalsRow;
  }> = candidates.map((p) => {
    const combined = [p.first_name, p.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const name = p.full_name ?? (combined || p.player_id);
    const existingRow = byId.get(p.player_id);
    const signals: PlayerSignalsRow = {
      player_id: p.player_id,
      position: p.position ?? null,
      team: p.team ?? null,
      age: typeof p.age === "number" ? p.age : null,
      rb_role_tier: (existingRow?.rb_role_tier as PlayerSignalsRow["rb_role_tier"]) ?? null,
      rb_traded_offseason_flag:
        (existingRow?.rb_traded_offseason_flag as boolean | null) ?? null,
      rb_role_at_new_team_projected:
        (existingRow?.rb_role_at_new_team_projected as PlayerSignalsRow["rb_role_at_new_team_projected"]) ?? null,
      rb_passdown_share_prior_year:
        (existingRow?.rb_passdown_share_prior_year as number | null) ?? null,
      compounding_news_count:
        (existingRow?.compounding_news_count as number | undefined) ?? 0,
      contract_years_remaining:
        (existingRow?.contract_years_remaining as number | null) ?? null,
      recent_extension_flag:
        (existingRow?.recent_extension_flag as boolean | null) ?? null,
      contract_year_flag:
        (existingRow?.contract_year_flag as boolean | null) ?? null,
      weight_lb: (existingRow?.weight_lb as number | null) ?? null,
      height_in: (existingRow?.height_in as number | null) ?? null,
      last_updated: (existingRow?.last_updated as string) ?? "",
      updated_by: (existingRow?.updated_by as string | null) ?? null,
    };
    return {
      player_id: p.player_id,
      name,
      team: p.team ?? null,
      age: typeof p.age === "number" ? p.age : null,
      rank: p.search_rank as number,
      signals,
    };
  });

  const filledCount = rows.filter(
    (r) => r.signals.rb_role_tier != null,
  ).length;

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-7xl px-6 py-12">
            <Ticker label="Admin · Player Signals" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Player signals coding
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-muted">
              Top-N players per position by Sleeper search rank. Most
              fields here are RB-specific (the v2 corpus drove the
              richest RB role-tier signals); other positions code
              compounding-news and contract flags only. Automated
              fields populate via cron jobs (Phase 1.1).
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {POSITIONS_TO_CODE.map((p) => (
                <Link
                  key={p}
                  href={`/admin/signals/players?pos=${p}`}
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
                {filledCount} of {rows.length} coded
              </span>
              <Link
                href="/admin/signals/teams"
                className="rounded-md border border-border-soft bg-surface-2 px-3 py-1 font-mono uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
              >
                ← Teams
              </Link>
            </div>

            <div className="mt-8 space-y-2">
              {rows.map((r) => (
                <PlayerSignalsRowEditor
                  key={r.player_id}
                  player={{
                    player_id: r.player_id,
                    name: r.name,
                    position: positionFilter,
                    team: r.team,
                    age: r.age,
                    rank: r.rank,
                  }}
                  initial={r.signals}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
