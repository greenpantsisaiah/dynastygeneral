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
  weekly_brief_email: {
    description:
      "Tuesday brief email to every account: contend-or-sell verdict per league; Pro adds who to sell to. Bulk send is red tier: Isaiah approves the first send.",
    owner: "growth",
    created: "2026-11-24",
    expires: "2027-03-31",
    variants: ["off", "on"],
    rollout: [0],
  },
  aar_ready_email: {
    description:
      "Post-draft \"AAR ready\" email from /api/cron/aar-notifications. The cron never sent (wrong profiles columns) until #117; once it works it would email every user with any completed draft, a bulk send. Dark until Isaiah approves; needs unsubscribe + postal address before it goes on.",
    owner: "growth",
    created: "2026-11-24",
    expires: "2027-03-31",
    variants: ["off", "on"],
    rollout: [0],
  },
  multi_league_home: {
    description:
      "Logged-in /home: one decisions feed across all leagues, built from the same DecisionItem builder as the weekly email so every email button lands on its matching item. Admins see it regardless; dark for everyone else until Isaiah previews it.",
    owner: "product steward",
    created: "2026-11-26",
    expires: "2027-03-31",
    variants: ["off", "on"],
    rollout: [0],
  },
  contend_or_sell_verdict: {
    description:
      "In-season contend-or-sell card on the hub (title odds, sell package, buyers, three voices) mirrored to Coach. Dark until the ledger logs it.",
    owner: "trade advisor",
    created: "2026-11-24",
    expires: "2027-03-31",
    variants: ["off", "on"],
    rollout: [0],
  },
  brief_pro_split: {
    description:
      "Free vs Pro split in the weekly brief (locked offer panel, /pricing links, blurred for-you labels). Off = beta: every account gets the full brief, matching the site's \"Free during the beta\". Turn on only after Isaiah makes the free/Pro call and billing is live.",
    owner: "product steward",
    created: "2026-11-26",
    expires: "2027-06-30",
    variants: ["off", "on"],
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
