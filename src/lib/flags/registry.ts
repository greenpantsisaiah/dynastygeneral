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
 */

import type { FlagDefinition } from "./evaluate";

export const FLAGS = {
  coach_state_cache: {
    description:
      "Coach prompt-cache layout: the <current_state> snapshot rides in a cached system block, with a [STATE] recency pointer in the user turn. Cuts repeat-turn input cost. Off = original layout.",
    owner: "engineer",
    created: "2026-11-24",
    expires: "2027-03-31",
    variants: ["off", "on"],
    // Dark first. Verify on a preview with FLAG_OVERRIDES=coach_state_cache=on
    // (check the [coach:usage] log shows cache_read > 0 on a follow-up turn
    // and the answer still cites the live pick label), then raise to 100.
    rollout: [0],
  },
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
