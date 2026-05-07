import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { getOptionalUser } from "@/lib/auth/session";
import {
  listSharesForUser,
  publicVerdictUrl,
} from "@/lib/share/trade-verdict-share";
import { SharedVerdictRow } from "./shared-verdict-row";

export const metadata: Metadata = {
  title: "Your shared verdicts",
  description: "Trade verdicts you've shared. View counts, expiration dates, manage your library.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SharedVerdictsPage() {
  const user = await getOptionalUser();
  if (!user) redirect("/login?next=/account/shared-verdicts");

  const shares = await listSharesForUser(user.id, 100);

  const totalViews = shares.reduce((sum, s) => sum + s.view_count, 0);

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 pt-16 pb-10 sm:pt-20">
            <Ticker
              label={`Your shared verdicts · ${shares.length} active · ${totalViews} total views`}
            />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Your shared verdicts
            </h1>
            <p className="mt-4 max-w-2xl text-muted">
              Every trade verdict you've shared with a public URL. View
              counts include both direct page loads and unfurl previews
              (when a chat client fetches the OG card). Shares expire 365
              days after creation; you can delete any of them earlier
              from here.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/account"
                className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-2 hover:text-foreground"
              >
                ← Back to account
              </Link>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-3xl px-6 py-10">
            {shares.length === 0 ? (
              <div className="rounded-md border border-border-soft bg-surface px-6 py-8 text-sm text-muted">
                You haven't shared a verdict yet. Generate a trade
                analysis from any league and click "Share verdict" on
                the result card. The URL appears here with a view
                counter.
              </div>
            ) : (
              <ul className="space-y-3">
                {shares.map((s) => (
                  <SharedVerdictRow
                    key={s.short_code}
                    shortCode={s.short_code}
                    publicUrl={publicVerdictUrl(s.short_code)}
                    mode={s.mode}
                    headline={s.headline}
                    confidence={s.confidence}
                    viewCount={s.view_count}
                    createdAt={s.created_at}
                    expiresAt={s.expires_at}
                    leagueId={s.league_id}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
