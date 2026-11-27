/**
 * Client-side: send a crashed page's error to the incident log
 * (/api/ops/client-error). Best effort, never throws, at most once per
 * page load per message.
 */
const sent = new Set<string>();

export function reportClientError(error: Error & { digest?: string }, boundary: string): void {
  try {
    if (typeof window === "undefined") return;
    const message = (error?.message || "unknown client error").slice(0, 300);
    if (sent.has(message)) return;
    sent.add(message);
    const body = JSON.stringify({
      boundary,
      message,
      digest: error?.digest ?? null,
      path: window.location.pathname,
      stack: (error?.stack ?? "").split("\n").slice(0, 4).join(" | ").slice(0, 300),
    });
    const url = "/api/ops/client-error";
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* never let reporting break the error page */
  }
}
