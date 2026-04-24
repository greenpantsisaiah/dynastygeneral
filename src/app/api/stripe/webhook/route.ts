/**
 * POST /api/stripe/webhook
 *
 * Stripe → app event handler. Verifies the signature with
 * STRIPE_WEBHOOK_SECRET, then mirrors subscription state into
 * public.subscriptions via the admin (service-role) client.
 *
 * Events handled:
 * - checkout.session.completed: customer + subscription created
 * - customer.subscription.created / updated: tier/status sync
 * - customer.subscription.deleted: revert to free
 * - customer.subscription.trial_will_end: nothing today; could trigger email
 *
 * The service-role client bypasses RLS. Webhook signature is the only
 * trust boundary. NEVER touch Supabase admin without verifying the sig.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// Stripe webhooks need raw body for signature verification.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "missing signature or webhook secret" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe:webhook:signature]", err);
    return NextResponse.json(
      { error: "invalid signature" },
      { status: 400 },
    );
  }

  // Idempotency: Stripe retries 5xx for up to 3 days. The webhook_events
  // table records each event id we've seen so the handler runs at most
  // once. ON CONFLICT DO NOTHING returns a row only on first insert; we
  // skip processing on duplicate. Per security-auditor 2026-04-23 MEDIUM.
  const admin = getAdminClient();
  const insert = await admin
    .from("webhook_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
    })
    .select("event_id")
    .maybeSingle();
  if (!insert.data) {
    // Distinguish a genuine duplicate (Postgres unique_violation 23505,
    // safe to 200 because we already processed this event) from a
    // transient Supabase outage (any other error code). For outages we
    // return 500 so Stripe retries; otherwise a Supabase blip during a
    // checkout silently drops a paying customer's tier upgrade.
    // Per security-auditor 2026-04-23 LOW.
    const code = (insert.error as { code?: string } | null)?.code;
    if (code === "23505") {
      return NextResponse.json({ received: true, deduped: true });
    }
    if (insert.error) {
      console.error("[stripe:webhook:dedup]", event.id, insert.error.message);
      return NextResponse.json(
        { error: "dedup_check_failed" },
        { status: 500 },
      );
    }
    // No data + no error shouldn't happen; treat as a soft duplicate
    // rather than failing closed against Stripe.
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await revertToFree(event.data.object as Stripe.Subscription);
        break;
      // Other events ignored for v1.
    }
    // Stamp processed_at so incident review can spot stuck events.
    await admin
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
  } catch (err) {
    console.error("[stripe:webhook]", event.type, err);
    return NextResponse.json(
      { error: "handler failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // client_reference_id is the Supabase user id we set when creating
  // the checkout session. If missing, we can't link the customer.
  const userId = session.client_reference_id;
  if (!userId) {
    console.error("[stripe:webhook] missing client_reference_id on checkout session");
    // Throw so the webhook returns 500 and Stripe retries. A missing
    // client_reference_id means we can't link the customer; silently
    // returning would orphan the subscription.
    throw new Error("missing client_reference_id");
  }
  const customerId =
    typeof session.customer === "string" ? session.customer : null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  if (!customerId || !subscriptionId) return;

  // Pull the subscription so we can sync the full state in one place.
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertSubscription(userId, customerId, subscription);
}

async function syncSubscription(subscription: Stripe.Subscription) {
  // Subscription metadata.user_id was set at checkout-session creation.
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.error("[stripe:webhook] missing user_id in subscription metadata");
    throw new Error("missing user_id in subscription metadata");
  }
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null;
  if (!customerId) return;
  await upsertSubscription(userId, customerId, subscription);
}

async function revertToFree(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) return;
  const admin = getAdminClient();
  await admin
    .from("subscriptions")
    .update({
      tier: "free",
      status: "canceled",
      stripe_subscription_id: null,
      stripe_price_id: null,
      trial_end: null,
      current_period_end: null,
      cancel_at_period_end: false,
    })
    .eq("user_id", userId);
}

// Statuses that grant Pro access. Everything else (incomplete,
// incomplete_expired, past_due, unpaid, paused) keeps the user on free
// until payment succeeds. Per security audit 2026-04-24: writing
// tier="pro" unconditionally let incomplete/unpaid users access Pro.
const PRO_STATUSES = new Set(["trialing", "active"]);

// Known price IDs. Reject anything else so a compromised Stripe key
// can't insert rogue prices into our billing records.
function knownPriceId(id: string | null): string | null {
  if (!id) return null;
  const known = new Set([
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
  ]);
  return known.has(id) ? id : null;
}

async function upsertSubscription(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription,
) {
  const admin = getAdminClient();
  // The first item is the plan we're tracking. We only sell one item per
  // subscription in v1 so this is unambiguous.
  const item = subscription.items.data[0];
  const priceId = knownPriceId(item?.price.id ?? null);

  // The Stripe types are loose on these; cast through unknown.
  const sub = subscription as unknown as {
    status: string;
    trial_end: number | null;
    current_period_end: number | null;
    cancel_at_period_end: boolean;
  };

  // Only grant Pro for statuses that represent a valid, paid (or
  // trialing) subscription. All other states fall to free.
  const tier = PRO_STATUSES.has(sub.status) ? "pro" : "free";

  await admin.from("subscriptions").upsert({
    user_id: userId,
    tier,
    status: sub.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  });
}
