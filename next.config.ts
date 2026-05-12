import path from "node:path";
import type { NextConfig } from "next";

/**
 * Security headers per security-auditor 2026-04-23 LOW finding.
 * - HSTS pins HTTPS for a year (Vercel serves HTTPS by default; this
 *   tells browsers to refuse downgrade attempts).
 * - X-Frame-Options DENY prevents the app being embedded in an iframe
 *   (clickjacking defense; we never frame ourselves).
 * - Referrer-Policy strict-origin-when-cross-origin: outbound links
 *   send the origin but not the path. Standard tradeoff between
 *   privacy and analytics utility.
 * - X-Content-Type-Options nosniff disables MIME sniffing.
 * - Permissions-Policy disables APIs we never use (camera, mic, etc.).
 *
 * CSP ships in REPORT-ONLY mode first. The enforcing CSP is the
 * eventual goal but enabling it without first observing real
 * violations is how production functionality silently breaks. The
 * report-only header surfaces violations to the console + reporting
 * endpoint without blocking; once we see a clean run for the surfaces
 * we care about (Stripe, Supabase, Vercel Insights, Anthropic web
 * search) we flip it to enforcing in a follow-up.
 *
 * Scoping rationale:
 *   - script-src 'self' + 'unsafe-inline' because Next.js injects
 *     inline hydration scripts. Nonce-based CSP is the right long-term
 *     fix but requires a middleware pass that does not exist yet.
 *   - connect-src includes Sleeper / FantasyCalc / KTC / Anthropic /
 *     Supabase / Vercel telemetry so engine fetches don't trip.
 *   - frame-src 'self' + Stripe so Stripe Checkout iframes work.
 *   - img-src is open because user-supplied content (Sleeper avatars,
 *     team logos) comes from many origins.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.vercel-insights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.sleeper.app https://api.fantasycalc.com https://keeptradecut.com https://api.anthropic.com https://*.supabase.co wss://*.supabase.co https://*.vercel-insights.com https://api.resend.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Cross-Origin-Opener-Policy: stronger isolation against cross-window
  // attacks. "same-origin-allow-popups" keeps Stripe Checkout's popup
  // flow working while denying opener access to other origins.
  // Per security-auditor 2026-04-23 LOW.
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  // CSP in report-only mode (see comment block above). Flip to
  // `Content-Security-Policy` once a clean run is observed.
  {
    key: "Content-Security-Policy-Report-Only",
    value: CSP_REPORT_ONLY,
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
