/**
 * Server-side flag reads. Wraps the pure evaluator with the deploy-env
 * kill switch (`FLAG_OVERRIDES`). Read flags on the server and pass the
 * resolved variant down to client components as a prop, so the
 * assignment is decided once per request and never flickers.
 */

import {
  isEnabled,
  parseOverrides,
  variantFor,
  type FlagOverrides,
  type FlagVariant,
} from "./evaluate";
import { FLAGS, type FlagKey } from "./registry";

function envOverrides(): FlagOverrides {
  return parseOverrides(process.env.FLAG_OVERRIDES);
}

/** Variant for a unit (Sleeper username, league id, or user id). */
export function flagVariant(
  key: FlagKey,
  unitId: string | null | undefined,
): FlagVariant {
  const def = (FLAGS as Record<string, (typeof FLAGS)[FlagKey]>)[key];
  return variantFor(key, def, { unitId, overrides: envOverrides() });
}

/** True when the unit is in any non-control arm. */
export function flagOn(key: FlagKey, unitId: string | null | undefined): boolean {
  const def = (FLAGS as Record<string, (typeof FLAGS)[FlagKey]>)[key];
  return isEnabled(key, def, { unitId, overrides: envOverrides() });
}
