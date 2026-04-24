/**
 * Beta-mode feature flag. When ON, every signed-in user gets access to
 * the killer features (Coach, Briefings, Multi-pick rollout, Contender
 * Outlook, Decision Quadrant) regardless of tier. The daily Anthropic
 * budget cap remains the true cost ceiling; per-feature gates are
 * about packaging, not safety.
 *
 * Anonymous (signed-out) users still hit the auth gate. We need to
 * know who's spending tokens for budget attribution and abuse
 * tracking.
 *
 * Pro-only PERSISTENCE features (cross-device chat history mirror,
 * War Room server-side mirror, GDPR data export) stay Pro. Those are
 * convenience perks, not core decision-engine value, and they're
 * where the post-beta squeeze lives.
 *
 * EMERGENCY LOCKDOWN (founder note 2026-04-24): the prior version
 * read BETA_OPEN_MODE from env with a default of true. A misset env
 * var (or a tester clicking "support" too early) caused real users
 * to see a paywall before they'd seen a single answer. Per the
 * founder: "I'd rather people be experiencing this cheaply for us
 * right now without that turning off my first friends."
 *
 * Until we ship a tested rollout plan with proper UX flow, this
 * function returns true UNCONDITIONALLY. The env var is ignored.
 * Re-introduce the env-driven toggle when:
 *   1. The pricing/upsell flow is reviewed end-to-end on a dev
 *      server with real test runs
 *   2. The Coach UI preserves in-progress questions across any
 *      sign-in / paywall roundtrip
 *   3. PaywallModal cannot interrupt mid-flow; only fires from an
 *      explicit user action (clicking "Get Pro")
 *   4. Per-user consumption caps have observed enough beta data to
 *      tune the post-beta numbers
 */

export function isBetaOpenMode(): boolean {
  return true;
}
