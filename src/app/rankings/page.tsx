import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getOptionalUser } from "@/lib/auth/session";
import { RankingsLab } from "@/components/rankings/rankings-lab";
import { buildRankedPool } from "@/lib/rankings/build";
import { readProfileServer } from "@/lib/lab/profile-storage";
import { defaultProfile } from "@/lib/lab/dial-types";
import { loadRankingsLeagueContext } from "@/lib/rankings/league-context";
import {
  readLeagueDoctrine,
  resolveEffectiveDials,
} from "@/lib/lab/league-doctrine";

export const metadata: Metadata = {
  title: "Rankings · Dynasty General",
  description:
    "Eight dials over our dynasty model. Three change the visible rankings in real time. Five more shape Coach and Decision-card behavior for signed-in users. Plot your roster onto the cohort.",
  alternates: { canonical: "/rankings" },
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ league?: string }>;
};

export default async function RankingsPage({ searchParams }: PageProps) {
  const { league: requestedLeagueId = null } = await searchParams;
  const user = await getOptionalUser();
  const tier: "public" | "signed_in" | "premium" = user
    ? user.tier === "pro"
      ? "premium"
      : "signed_in"
    : "public";

  const [pool, profile, leagueCtx] = await Promise.all([
    buildRankedPool({ limit: 100 }),
    readProfileServer().catch(() => defaultProfile()),
    user
      ? loadRankingsLeagueContext({
          userId: user.id,
          requestedLeagueId,
        })
      : Promise.resolve(null),
  ]);

  // Per-league override row if a league is selected and the user is
  // signed in. Drives the "League-specific tuning" toggle in the
  // Rankings Lab. Null when no league context or no signed-in user.
  const leagueOverride =
    user && leagueCtx
      ? await readLeagueDoctrine(user.id, leagueCtx.selected.league_id)
      : null;

  // Effective doctrine for the selected league. When the override is
  // enabled, overlay its dials onto the global profile so the lab
  // opens on the actual dial state the engine sees for this league.
  // The user's global values are still passed separately so the lab
  // can render a "Global: +N" annotation under each dial.
  const initialDials = leagueOverride
    ? resolveEffectiveDials(profile.dials, leagueOverride)
    : profile.dials;
  const initialProfile = { ...profile, dials: initialDials };

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-5xl px-6 pt-14 pb-10 sm:pt-20">
            <Ticker label="Rankings lab · perturb the model" />
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Dynasty rankings, your way.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              Eight dials over our dynasty model. The first three move
              the table on this page in real time. The other five
              shape Coach and Decision-card behavior across the
              product. {leagueCtx
                ? "Your roster is plotted onto the cohort below."
                : "Centered dials reproduce the consensus market."}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
              <Link href="/methodology" className="hover:text-foreground">
                How this measures up →
              </Link>
              <Link href="/library" className="hover:text-foreground">
                Library →
              </Link>
              {tier === "public" && (
                <Link href="/login" className="hover:text-foreground">
                  Sign in to unlock the engine dials →
                </Link>
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-5xl px-6 py-10">
            <RankingsLab
              pool={pool}
              tier={tier}
              initialProfile={initialProfile}
              globalDials={profile.dials}
              leagueContext={
                leagueCtx
                  ? {
                      options: leagueCtx.options,
                      selectedLeagueId: leagueCtx.selected.league_id,
                      selectedLeagueName: leagueCtx.selected.name,
                      selectedTotalRosters: leagueCtx.selected.total_rosters,
                      myPlayerIds: Array.from(leagueCtx.myPlayerIds),
                      draftedPlayerIds: Array.from(leagueCtx.drafted),
                      override: leagueOverride
                        ? {
                            enabled: Boolean(leagueOverride.enabled_at),
                            dials: leagueOverride.dials,
                          }
                        : null,
                    }
                  : null
              }
            />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
