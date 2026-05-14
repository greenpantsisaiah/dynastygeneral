import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getOptionalUser } from "@/lib/auth/session";
import { RankingsLab } from "@/components/rankings/rankings-lab";
import { buildRankedPool } from "@/lib/rankings/build";
import { readProfileServer } from "@/lib/soundboard/storage";
import { defaultProfile } from "@/lib/soundboard/types";

export const metadata: Metadata = {
  title: "Rankings · Dynasty General",
  description:
    "Eight dials over our dynasty model. Three change the visible rankings in real time. Five more shape Coach and Decision-card behavior for signed-in users. Every dial opens to its statistical methodology on tap.",
  alternates: { canonical: "/rankings" },
};

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  const user = await getOptionalUser();
  const tier: "public" | "signed_in" | "premium" = user
    ? user.tier === "pro"
      ? "premium"
      : "signed_in"
    : "public";

  // Load the user's saved dial profile in parallel with the rankings
  // pool. Signed-in users get Supabase-backed state; anonymous users
  // fall back to the cookie (and ultimately to defaults). The
  // RankingsLab will hydrate from localStorage on mount when
  // anonymous, so the cookie path here is a non-fatal best-effort.
  const [pool, profile] = await Promise.all([
    buildRankedPool({ limit: 100 }),
    readProfileServer().catch(() => defaultProfile()),
  ]);

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
              product. Centered dials reproduce the consensus market.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
              <Link href="/library" className="hover:text-foreground">
                Methodology library →
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
              initialProfile={profile}
            />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
