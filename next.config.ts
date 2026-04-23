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
 * CSP is intentionally NOT here yet. A correct CSP requires scoping
 * for Stripe + Supabase + Vercel insights + the Anthropic web search
 * tool; one bad rule kills production functionality. Tracked separately
 * as a follow-up; see SECURITY.md.
 */
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
