/**
 * Feature flags and experiment switches: the pure evaluator.
 *
 * No IO, no env reads, no cookies. Safe in server and client code and
 * trivially testable. `server.ts` wraps this with the env kill switch.
 *
 * Three rules keep flags safe for agents to ship behind:
 *   1. `defaultValue` is ALWAYS the behavior users have today. A flag
 *      introduces new behavior; it never hides existing behavior by
 *      default. Turning every flag off restores the shipped product.
 *   2. Assignment is deterministic. The same unit id (a Sleeper
 *      username, a league id, a signed-in user id) always lands in the
 *      same bucket, so a user never flips between arms mid-experiment.
 *   3. Overrides beat rollout. `FLAG_OVERRIDES` in the deploy env is the
 *      kill switch: flipping it needs no code change and no revert.
 */

export type FlagVariant = string;

export interface FlagDefinition {
  /** One line: what the flag changes for the user. */
  description: string;
  /** Who decides when it ships or dies (role name, e.g. "product steward"). */
  owner: string;
  /** ISO date the flag was added. */
  created: string;
  /**
   * ISO date after which the flag must be cleaned up (shipped to
   * everyone, or deleted). `evals/flags.test.ts` fails CI on an expired
   * flag so stale experiments cannot pile up.
   */
  expires: string;
  /**
   * Arms. The FIRST entry is the control and must equal today's
   * shipped behavior. A plain on/off flag is `["off", "on"]`.
   */
  variants: readonly [FlagVariant, ...FlagVariant[]];
  /**
   * Share of units (0..100) assigned to each NON-control arm, in
   * `variants` order after the control. Remaining units get the
   * control. `[0]` means nobody sees the new arm yet (dark launch).
   */
  rollout: readonly number[];
}

export type FlagRegistry = Record<string, FlagDefinition>;

/** key -> forced variant, parsed from `FLAG_OVERRIDES`. */
export type FlagOverrides = Record<string, FlagVariant>;

/**
 * 32-bit FNV-1a. Stable across runtimes (Node, Edge, browser), no
 * crypto dependency, uniform enough for 100-bucket assignment.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Bucket 0..9999 for a (flag, unit) pair. Salting by flag key keeps experiments independent. */
export function bucketFor(flagKey: string, unitId: string): number {
  return fnv1a32(`${flagKey}:${unitId}`) % 10000;
}

/**
 * Parse `FLAG_OVERRIDES`, e.g. `"team_card_verdict=on, coach_v2=off"`.
 * Malformed entries are dropped one by one, never the whole string.
 */
export function parseOverrides(raw: string | undefined | null): FlagOverrides {
  const out: FlagOverrides = {};
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k && v) out[k] = v;
  }
  return out;
}

export interface VariantArgs {
  /** Stable id for the unit being assigned. Null means "not assignable": control. */
  unitId: string | null | undefined;
  overrides?: FlagOverrides;
}

/**
 * Which arm does this unit get? Precedence: a valid override, then the
 * deterministic rollout bucket, then the control. An override naming a
 * variant the flag does not declare is ignored (typo safety: a bad
 * override must not take the product down).
 */
export function variantFor(
  key: string,
  def: FlagDefinition,
  args: VariantArgs,
): FlagVariant {
  const control = def.variants[0];
  const forced = args.overrides?.[key];
  if (forced !== undefined && def.variants.includes(forced)) return forced;
  if (!args.unitId) return control;

  const bucket = bucketFor(key, args.unitId);
  let ceiling = 0;
  for (let i = 1; i < def.variants.length; i++) {
    const pct = Math.max(0, Math.min(100, def.rollout[i - 1] ?? 0));
    ceiling += pct * 100;
    if (bucket < ceiling) return def.variants[i]!;
  }
  return control;
}

/** Convenience for on/off flags: true when the unit is in any non-control arm. */
export function isEnabled(
  key: string,
  def: FlagDefinition,
  args: VariantArgs,
): boolean {
  return variantFor(key, def, args) !== def.variants[0];
}

/** Static checks every registered flag must pass. Returns problems, empty when clean. */
export function validateRegistry(
  registry: FlagRegistry,
  today: string,
): string[] {
  const problems: string[] = [];
  for (const [key, def] of Object.entries(registry)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      problems.push(`${key}: key must be snake_case`);
    }
    if (!def.description.trim()) problems.push(`${key}: missing description`);
    if (!def.owner.trim()) problems.push(`${key}: missing owner`);
    if (new Set(def.variants).size !== def.variants.length) {
      problems.push(`${key}: duplicate variant names`);
    }
    if (def.variants.length < 2) {
      problems.push(`${key}: needs a control plus at least one arm`);
    }
    if (def.rollout.length !== def.variants.length - 1) {
      problems.push(
        `${key}: rollout needs one entry per non-control variant (${def.variants.length - 1})`,
      );
    }
    const total = def.rollout.reduce((a, b) => a + b, 0);
    if (def.rollout.some((p) => p < 0 || p > 100) || total > 100) {
      problems.push(`${key}: rollout entries must be 0..100 and sum to at most 100`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(def.created)) {
      problems.push(`${key}: created must be YYYY-MM-DD`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(def.expires)) {
      problems.push(`${key}: expires must be YYYY-MM-DD`);
    } else if (def.expires < today) {
      problems.push(
        `${key}: expired ${def.expires}. Ship it to everyone (delete the flag, keep the code) or delete the experiment.`,
      );
    }
  }
  return problems;
}
