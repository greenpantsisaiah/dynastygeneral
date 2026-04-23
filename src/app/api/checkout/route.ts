/**
 * POST /api/checkout
 *
 * Body (form-encoded or JSON): { plan: "pro_monthly" | "pro_annual" }
 *
 * Creates a Stripe Checkout Session in subscription mode with a 14-day
 * free trial (no card required to start). Redirects the user to the
 * Stripe-hosted checkout. On success they return to /account.
 *
 * Auth required. Anonymous users get bounced to /login?next=/pricing.
 */

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { getStripe, isPlan, priceIdForPlan } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent("/pricing")}`, req.url),
      { status: 303 },
    );
  }

  // Accept either form-encoded (from a <form> POST) or JSON.
  let plan: unknown;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    plan = body.plan;
  } else {
    const form = await req.formData();
    plan = form.get("plan");
  }

  if (!isPlan(plan)) {
    return NextResponse.json(
      { error: "invalid plan" },
      { status: 400 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const stripe = getStripe();

  // Reuse existing Stripe customer if we have one; else let Checkout
  // create one and the webhook will write it to subscriptions.
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
    success_url: `${origin}/account?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=canceled`,
    customer: sub?.stripe_customer_id ?? undefined,
    customer_email: sub?.stripe_customer_id ? undefined : user.email ?? undefined,
    client_reference_id: user.id,
    subscription_data: {
      trial_period_days: 14,
      metadata: { user_id: user.id },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "checkout session missing URL" },
      { status: 502 },
    );
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
