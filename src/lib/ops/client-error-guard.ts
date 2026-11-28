/**
 * Abuse guards for the public client-error beacon (/api/ops/client-error).
 * The route is public because the browser calls it, so these keep a bot
 * from flooding the incident log (issue #162):
 *
 *   1. Same-origin only: a cross-site page cannot fire beacons at us.
 *   2. Per-IP rate limit (bucket "client-error" in lib/ratelimit.ts).
 *   3. Route keys collapse to a bounded shape, so ids and junk paths
 *      cannot mint new incidents.
 *   4. New client fingerprints per hour are capped (admitClientIncident in
 *      lib/ops/incidents.ts); the excess folds into one overflow incident.
 */

/**
 * True when the request comes from one of our own pages. A browser sends
 * Origin on POST and Sec-Fetch-Site on modern engines; when either is
 * present it must say same-origin. A request with neither (curl, an old
 * browser) passes this check and is bounded by the rate limit instead.
 */
export function isSameOriginBeacon(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = headers.get("origin");
  if (!origin) return true;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

const SEGMENT = /^[a-z0-9_-]{1,40}$/;

/**
 * Collapse a reported path to its route shape: numeric ids become [id],
 * anything that does not look like a route segment becomes [x], and only
 * the first three segments count. "/leagues/1315790476086878208/trade"
 * and "/leagues/1183924497274310656/trade" are one key.
 */
export function routeKeyFor(path: string | null): string {
  if (!path || !path.startsWith("/")) return "unknown";
  const segs = path.split("?")[0].split("/").filter(Boolean).slice(0, 3);
  if (segs.length === 0) return "/";
  return (
    "/" +
    segs
      .map((s) => {
        const low = s.toLowerCase();
        if (/^\d{3,}$/.test(low)) return "[id]";
        return SEGMENT.test(low) ? low : "[x]";
      })
      .join("/")
  );
}
