/**
 * Runtime environment helpers for ops guards.
 *
 * `isRealProduction` answers "is this process serving real production
 * traffic." On Vercel we trust VERCEL_ENV because preview deploys
 * report "preview" (not "production"), so preview URLs and local dev
 * are never fail-closed by an ops guard. Off Vercel (self-host, local,
 * CI) we fall back to NODE_ENV.
 */
export function isRealProduction(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}
