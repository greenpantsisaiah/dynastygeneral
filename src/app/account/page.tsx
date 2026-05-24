import { redirect } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { Ticker } from "@/components/ui/ticker";
import { PrivacyPanel } from "@/components/account/privacy-panel";
import { UsageDetail } from "@/components/billing/usage-meter";
import { getOptionalUser, type AuthUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { PLATFORMS } from "@/lib/leagues/types";
import { isBetaOpenMode } from "@/lib/billing/beta-mode";
import { getStripe } from "@/lib/stripe/client";
import {
  getLeaguesForUser,
  getNflState,
  isDynastyLeague,
} from "@/lib/sleeper";
import { TrackEvent } from "@/components/track-event";

export const metadata = {
  title: "Account",
  description: "Manage your Dynasty General account, subscription, and connected leagues.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ checkout?: string; upgraded?: string; plan?: string }>;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  let user = await getOptionalUser();
  if (!user) redirect("/login?next=/account");

  // When returning from Stripe checkout, the webhook may not have fired
  // yet. Pull the latest subscription state directly from Stripe and
  // sync it to the database, then redirect to /account (without the
  // query param) so SiteNav and all components read the updated tier.
  if (params.checkout === "success" && user.tier !== "pro") {
    const synced = await syncFromStripe(user);
    if (synced && synced.tier === "pro") {
      redirect("/account?upgraded=1");
    }
  }

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
            {user.name && (
              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
                {user.name}
              </h1>
            )}
            <p className={`${user.name ? "mt-1" : "mt-6"} text-lg text-muted`}>
              {user.email}
            </p>

            {(params.checkout === "success" || params.upgraded === "1") && (
              <div className="mt-4 rounded-md border border-success/50 bg-success/10 px-4 py-3 text-sm text-foreground">
                {isPro
                  ? "You\u2019re on Pro! Your subscription is active. Manage billing below anytime."
                  : "Payment received. Your account is being upgraded; refresh in a moment."}
              </div>
            )}
            {params.checkout === "success" && params.plan === "day_pass" && (
              <TrackEvent
                payload={{ event: "day_pass_purchased", value: 5, currency: "USD" }}
              />
            )}
            {params.checkout === "success" && params.plan === "pro_annual" && (
              <TrackEvent
                payload={
                  user.is_trialing
                    ? { event: "trial_started", plan: "pro" }
                    : { event: "pro_subscribed", plan: "pro_annual", value: 99, currency: "USD" }
                }
              />
            )}
            {params.checkout === "success" && params.plan === "pro_monthly" && (
              <TrackEvent
                payload={
                  user.is_trialing
                    ? { event: "trial_started", plan: "pro" }
                    : { event: "pro_subscribed", plan: "pro_monthly", value: 14, currency: "USD" }
                }
              />
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

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {!isPro && (
                  <>
                    <form action="/api/checkout" method="POST" className="contents">
                      <input type="hidden" name="plan" value="pro_annual" />
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-black transition hover:brightness-110"
                      >
                        {beta ? "Support annual · $99/yr" : "Get Pro · $99/yr"}
                      </button>
                    </form>
                    <form action="/api/checkout" method="POST" className="contents">
                      <input type="hidden" name="plan" value="pro_monthly" />
                      <button
                        type="submit"
                        className="inline-flex h-10 items-center rounded-md border border-border-strong bg-background px-4 text-xs font-medium text-muted transition hover:border-accent/60 hover:text-foreground"
                      >
                        Or monthly · $14
                      </button>
                    </form>
                  </>
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

            <UsageDetail />

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
  // Account page no longer renders a full leagues panel; that's the
  // dedicated /leagues page now (one canonical UI, one shared
  // component). Account just shows the saved Sleeper identity and a
  // link out, keeping account focused on billing + identity.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("sleeper_username")
    .eq("id", userId)
    .maybeSingle();
  const savedUsername =
    (profile?.sleeper_username as string | null) ?? null;

  return (
    <div className="mt-8 rounded-lg border border-border-strong bg-surface px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Sleeper identity
        </div>
        <Link
          href={savedUsername ? "/leagues" : "/connect"}
          className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
        >
          {savedUsername ? "View my leagues →" : "Connect Sleeper →"}
        </Link>
      </div>
      {savedUsername ? (
        <p className="mt-2 text-sm text-muted">
          Saved as{" "}
          <span className="font-mono text-foreground">@{savedUsername}</span>.
          Your leagues live at{" "}
          <Link href="/leagues" className="text-accent hover:underline">
            /leagues
          </Link>
          .{" "}
          <Link href="/connect" className="text-accent hover:underline">
            Not me? Re-connect →
          </Link>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Connect your Sleeper account so we know which roster is yours.
          Once saved, your leagues live at{" "}
          <Link href="/leagues" className="text-accent hover:underline">
            /leagues
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/**
 * On checkout success, pull the user's latest subscription from Stripe
 * and write it to the database. This covers the race where the user
 * lands on /account?checkout=success before the webhook fires.
 */
async function syncFromStripe(user: AuthUser): Promise<AuthUser | null> {
  try {
    const stripe = getStripe();
    const admin = getAdminClient();

    // Find the Stripe customer by email, then get their active subscription.
    const customers = await stripe.customers.list({
      email: user.email!,
      limit: 1,
    });
    const customer = customers.data[0];
    if (!customer) return null;

    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 1,
    });
    const rawSub = subs.data[0];
    if (!rawSub) return null;
    const item = rawSub.items.data[0];
    const customerId =
      typeof rawSub.customer === "string" ? rawSub.customer : null;

    // Stripe types are loose on some fields; cast for access.
    const sub = rawSub as unknown as {
      id: string;
      status: string;
      trial_end: number | null;
      current_period_end: number | null;
      cancel_at_period_end: boolean;
    };

    const PRO_STATUSES = new Set(["trialing", "active"]);
    const tier = PRO_STATUSES.has(sub.status) ? "pro" : "free";

    const { error } = await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        tier,
        status: sub.status,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        stripe_price_id: item?.price.id ?? null,
        trial_end: sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: sub.cancel_at_period_end,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("[account:syncFromStripe:upsert]", error.message);
      return null;
    }

    return {
      ...user,
      tier,
      is_trialing: sub.status === "trialing",
      trial_end: sub.trial_end
        ? new Date(sub.trial_end * 1000).toISOString()
        : null,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end,
    };
  } catch (err) {
    console.error("[account:syncFromStripe]", err);
    return null;
  }
}

async function signOutAction() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
