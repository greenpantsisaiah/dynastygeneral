import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getOptionalUser } from "@/lib/auth/session";
import { RankingsLab } from "@/components/rankings/rankings-lab";
import { buildRankedPool } from "@/lib/rankings/build";

export const metadata: Metadata = {
  title: "Rankings · Dynasty General",
  description:
    "Top dynasty rankings with three live dials that perturb the model. Move a slider, see Bijan move. Every divergence from consensus carries a citation when our internal credibility check passes.",
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

  const pool = await buildRankedPool({ limit: 100 });

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
              The market consensus on the right. Our model on the left.
              Three dials in between that you can drag to perturb the
              weights and watch the ranking redraw. Centered dials
              reproduce the consensus.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
              <Link href="/library" className="hover:text-foreground">
                Methodology library →
              </Link>
              {tier === "public" && (
                <Link href="/login" className="hover:text-foreground">
                  Sign in for the full 100 →
                </Link>
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-5xl px-6 py-10">
            <RankingsLab pool={pool} tier={tier} />
          </div>
        </section>

        <section className="border-t border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-14 text-sm text-muted">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              What the dials actually move
            </div>
            <ul className="mt-3 space-y-3">
              <li>
                <span className="font-semibold text-foreground">Youth.</span>{" "}
                Age-curve gaussian center per position. Centered means
                we score every player on the engine's calibrated peak
                band (RB 23-26, WR 24-29, TE 26-30, QB 23-33). Toward
                100 we push the peak earlier and demote players past
                it; toward 0 we flatten the curve.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Bellcow.
                </span>{" "}
                Workhorse-RB preference. Top-12 RBs in the consensus
                pool get a positive lift; committee and passdown
                shapes get demoted. v1 uses position rank as a proxy
                for role tier; the Library article names the upcoming
                signal-extractor refinement.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  Continuity.
                </span>{" "}
                OC tenure weight. The dial is wired and the math is
                ready; the 32-team signal table is mid-calibration.
                Today the dial is neutral (no effect on the live
                ranking). When the signals land, the same dial will
                start pulling players on stable-OC teams up.
              </li>
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
