/**
 * POST /api/billing-portal
 *
 * Redirects the authenticated user to the Stripe-hosted Customer Portal
 * to manage their subscription (change plan, update card, cancel).
 * Auth required. 404 if the user has no Stripe customer record.
 */

import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { getStripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  }

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: "no_billing_account" },
      { status: 404 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/account`,
  });

  return NextResponse.redirect(session.url, { status: 303 });
}
