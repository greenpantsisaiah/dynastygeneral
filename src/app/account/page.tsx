import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Ticker } from "@/components/ui/ticker";
import { PrivacyPanel } from "@/components/account/privacy-panel";
import { getOptionalUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PLATFORMS } from "@/lib/leagues/types";
import { isBetaOpenMode } from "@/lib/billing/beta-mode";

export const metadata = {
  title: "Account",
  description: "Manage your Dynasty Copilot account, subscription, and connected leagues.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ checkout?: string }>;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const user = await getOptionalUser();
  if (!user) redirect("/login?next=/account");

  const isPro = user.tier === "pro";
  const beta = isBetaOpenMode();
  const trialDaysLeft =
    user.is_trialing && user.trial_end
      ? Math.max(
          0,
          Math.ceil(
            (new Date(user.trial_end).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <section className="border-b border-border-soft">
          <div className="mx-auto max-w-3xl px-6 py-12">
            <Ticker label="Account · billing + leagues" />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
              {user.email}
            </h1>

            {params.checkout === "success" && (
              <div className="mt-4 rounded-md border border-success/50 bg-success/10 px-4 py-3 text-sm text-foreground">
                You're on Pro. Your 14-day trial starts now. Add a payment
                method anytime before it ends to keep going.
              </div>
            )}

            <div className="mt-8 rounded-lg border border-border-strong bg-surface px-5 py-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Subscription
              </div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-xl font-semibold text-foreground">
                  {isPro ? "Pro" : "Free"}
                  {user.is_trialing && (
                    <span className="ml-2 font-mono text-xs uppercase tracking-[0.16em] text-accent">
                      Trialing
                    </span>
                  )}
                </div>
                {trialDaysLeft != null && (
                  <div className="font-mono text-xs text-muted-2">
                    {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left
                    in trial
                  </div>
                )}
                {user.cancel_at_period_end && user.current_period_end && (
                  <div className="font-mono text-xs text-muted-2">
                    Cancels{" "}
                    {new Date(user.current_period_end).toLocaleDateString()}
                  </div>
                )}
              </div>

              {beta && !isPro && (
                <p className="mt-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-foreground">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                    Beta is open ·
                  </span>{" "}
                  You already have full access to Coach, Briefings,
                  Multi-pick rollout, and Contender Outlook. The Pro upgrade
                  adds cross-device sync (chat history + War Room) and
                  supports hosting + AI engine costs.
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                {!isPro && (
                  <form action="/api/checkout" method="POST" className="contents">
                    <input
                      type="hidden"
                      name="plan"
                      value="pro_monthly"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-black transition hover:brightness-110"
                    >
                      {beta ? "Support the project · 14-day trial" : "Start 14-day Pro trial"}
                    </button>
                  </form>
                )}
                {isPro && (
                  <form
                    action="/api/billing-portal"
                    method="POST"
                    className="contents"
                  >
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center rounded-md border border-border-strong bg-background px-4 text-sm font-medium text-foreground transition hover:border-accent/60"
                    >
                      Manage billing →
                    </button>
                  </form>
                )}
                <Link
                  href="/pricing"
                  className="inline-flex h-10 items-center text-sm text-muted hover:text-foreground"
                >
                  See pricing
                </Link>
              </div>
            </div>

            <ConnectedPlatforms />

            <ConnectedLeagues userId={user.id} />

            <PrivacyPanel />

            <div className="mt-8 rounded-lg border border-border-soft bg-surface px-5 py-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
                Sign out
              </div>
              <p className="mt-2 text-sm text-muted">
                Signs you out of your account on this device. Local chat
                history and declared-window preferences remain in this
                browser; clear site data in your browser settings to
                remove them.
              </p>
              <form action={signOutAction} className="mt-3">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center rounded-md border border-border-strong bg-background px-4 text-xs font-medium text-foreground transition hover:border-danger hover:text-danger"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function ConnectedPlatforms() {
  return (
    <div className="mt-8 rounded-lg border border-border-strong bg-surface px-5 py-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Connected platforms
      </div>
      <p className="mt-2 text-xs text-muted">
        We support multiple fantasy hosts. Your Sleeper username drives the
        league list below. MFL ships next.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {PLATFORMS.map((p) => {
          const live = p.status === "live";
          return (
            <li
              key={p.id}
              className="flex items-baseline justify-between gap-2 rounded-md border border-border-soft bg-surface-2 px-3 py-2"
            >
              <span className="font-medium text-foreground">{p.name}</span>
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                  live ? "text-success" : "text-muted-2"
                }`}
              >
                {live ? "Connected via /connect" : "Coming soon"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function ConnectedLeagues({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leagues")
    .select("sleeper_league_id, name, season")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const leagues = data ?? [];

  return (
    <div className="mt-8 rounded-lg border border-border-strong bg-surface px-5 py-5">
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Connected leagues
        </div>
        <Link
          href="/connect"
          className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
        >
          Add league →
        </Link>
      </div>
      {leagues.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No leagues yet.{" "}
          <Link href="/connect" className="text-accent hover:underline">
            Connect your Sleeper account
          </Link>{" "}
          to pull them in.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {leagues.map((l) => (
            <li
              key={l.sleeper_league_id}
              className="flex items-baseline justify-between gap-2"
            >
              <Link
                href={`/leagues/${l.sleeper_league_id}`}
                className="text-foreground hover:text-accent"
              >
                {l.name ?? l.sleeper_league_id}
              </Link>
              <span className="font-mono text-[10px] text-muted-2">
                {l.season}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function signOutAction() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
