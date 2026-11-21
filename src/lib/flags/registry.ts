/**
 * The ONE list of feature flags and experiments. Canonical: see
 * CANONICAL_SOURCES.md "Feature flags and experiments".
 *
 * Adding a flag:
 *   1. Add an entry below. The first variant is the control and MUST be
 *      the behavior users have today (flags add behavior, they never
 *      hide a feature users rely on by default).
 *   2. Start dark (`rollout: [0]`), verify on a preview deploy with
 *      `FLAG_OVERRIDES=<key>=on`, then raise the rollout.
 *   3. Read it server-side with `flagVariant(key, unitId)` /
 *      `flagOn(key, unitId)` from `@/lib/flags/server`.
 *   4. Set `expires`. CI fails once it passes, forcing cleanup.
 *
 * Kill switch: set `FLAG_OVERRIDES=<key>=off` in Vercel env and
 * redeploy (no code change). Overrides win over rollout.
 *
 * The registry is empty on purpose: no experiment is approved yet.
 */

import type { FlagDefinition } from "./evaluate";

export const FLAGS = {
  // example_experiment: {
  //   description: "Lead the first-run Team Card with the verdict line.",
  //   owner: "product steward",
  //   created: "2026-11-21",
  //   expires: "2027-01-31",
  //   variants: ["off", "on"],
  //   rollout: [0],
  // },
} as const satisfies Record<string, FlagDefinition>;

export type FlagKey = keyof typeof FLAGS;
