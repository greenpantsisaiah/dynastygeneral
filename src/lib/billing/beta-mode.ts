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
 * Toggled via the BETA_OPEN_MODE env var. Default ON. Set to "false"
 * to flip to the production tier-gated posture without a redeploy.
 */

export function isBetaOpenMode(): boolean {
  const raw = process.env.BETA_OPEN_MODE;
  if (raw == null) return true;
  return raw.toLowerCase() === "true";
}
