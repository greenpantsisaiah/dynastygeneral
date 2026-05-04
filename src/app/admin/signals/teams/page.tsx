import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getAdminUser } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  NFL_TEAMS,
  type TeamSignalsRow,
} from "@/lib/signals/schema";
import { TeamSignalsRow as TeamRowEditor } from "@/components/admin/signals/team-row";

export const metadata: Metadata = {
  title: "Admin · Team Signals",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminTeamSignalsPage() {
  const user = await getAdminUser();
  if (!user) {
    redirect("/");
  }

  const admin = getAdminClient();
  const { data: rows } = await admin
    .from("team_signals")
    .select("*")
    .order("team", { ascending: true });

  // Build a complete 32-team list, merging the existing rows with
  // empty placeholders for teams that have no row yet.
  const byTeam = new Map<string, Partial<TeamSignalsRow>>();
  for (const row of (rows ?? []) as Partial<TeamSignalsRow>[]) {
    if (typeof row.team === "string") byTeam.set(row.team, row);
  }
  const allTeams: Partial<TeamSignalsRow>[] = NFL_TEAMS.map(
    (team) =>
      byTeam.get(team) ?? {
        team,
        ol_continuity_score: null,
        ol_grade_run: null,
        ol_grade_pass: null,
        rookie_ol_starters_count: 0,
        rookie_ol_position_breakdown: {},
        hc_id: null,
        hc_first_time_flag: null,
        hc_tenure_yrs: null,
        hc_background_tag: null,
        oc_id: null,
        oc_tenure_yrs: null,
        oc_first_year_with_team_flag: null,
        scheme_tag: null,
        staff_novelty_composite: 0,
        scheme_pace: null,
        pass_rate_neutral: null,
        personnel_12_rate: null,
      },
  );

  const filledCount = allTeams.filter(
    (t) => (t.scheme_tag ?? null) != null,
  ).length;

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-7xl px-6 py-12">
            <Ticker label="Admin · Team Signals" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Team signals coding
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-muted">
              One row per team. Manual-coding fields edit inline; saves
              fire to the API and write an audit log entry. Automated
              fields (scheme_pace, pass_rate_neutral, personnel_12_rate,
              ol_continuity_score, ol_grade_run) populate via cron jobs
              (Phase 1.1) and are read-only here.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-md border border-border-soft bg-surface-2 px-3 py-1 font-mono uppercase tracking-[0.14em] text-muted-2">
                {filledCount} of 32 coded
              </span>
              <Link
                href="/admin/signals/players"
                className="rounded-md border border-accent/60 bg-accent/15 px-3 py-1 font-mono uppercase tracking-[0.14em] text-accent hover:bg-accent/25"
              >
                Players →
              </Link>
            </div>

            <div className="mt-8 space-y-2">
              {allTeams.map((row) => (
                <TeamRowEditor
                  key={row.team}
                  initial={row as TeamSignalsRow}
                />
              ))}
            </div>

            <p className="mt-8 max-w-3xl text-xs text-muted-2">
              Scheme tag taxonomy: shanahan / mcvay / reid / air_raid /
              spread / pro_style / west_coast / erhardt_perkins / other.
              HC background: offensive_coordinator / defensive_coordinator /
              college / position_coach / other. Per MODEL_CARD section
              3.9 and RESEARCH_CORPUS v2 cluster 2.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
