/**
 * Stripe singleton + price-id helpers. Server-only.
 *
 * Falls back to a clear error when STRIPE_SECRET_KEY isn't set so dev
 * without Stripe configured fails loudly instead of silently sending
 * users to a broken checkout.
 */

import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Configure Stripe in Vercel project settings.",
    );
  }
  // Pin to the SDK's default API version. Bumping this is a deliberate
  // act (read Stripe's migration guide; some events change shape).
  cached = new Stripe(key);
  return cached;
}

export type Plan = "pro_monthly" | "pro_annual" | "day_pass";

export function priceIdForPlan(plan: Plan): string {
  const map: Record<Plan, string | undefined> = {
    pro_monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    pro_annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
    // Day Pass: 24-hour unlimited consumption. One-shot purchase
    // matching dynasty's bursty draft-week usage pattern. Set
    // STRIPE_PRICE_ID_DAY_PASS to a one-time price (~$3-5) in
    // Stripe dashboard.
    day_pass: process.env.STRIPE_PRICE_ID_DAY_PASS,
  };
  const id = map[plan];
  if (!id) {
    throw new Error(
      `Stripe price id missing for plan "${plan}". Configure STRIPE_PRICE_ID_${plan.toUpperCase()} in Vercel.`,
    );
  }
  return id;
}

export function isPlan(value: unknown): value is Plan {
  return value === "pro_monthly" || value === "pro_annual" || value === "day_pass";
}

export function isOneShotPlan(plan: Plan): boolean {
  return plan === "day_pass";
}
