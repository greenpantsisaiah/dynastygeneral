/**
 * Open Graph image for the root domain. Used by Slack, iMessage,
 * Twitter/X, Discord, Sleeper, etc. when dynastygeneral.app is shared.
 *
 * Next.js convention: any `opengraph-image.{png,tsx,...}` next to a
 * route renders to /opengraph-image at build, and the framework
 * auto-injects the og:image meta. Generated server-side via @vercel/og.
 *
 * Composition note: many platforms (Sleeper among them) crop OG
 * images aggressively to a near-square or vertical thumbnail. The
 * old version put the headline left-aligned so cropping cut off the
 * leading edge of every line. This version keeps all critical
 * content (mark, tagline, URL) in a centered safe zone roughly
 * 760px wide so a 1:1 or 4:5 crop still shows the brand cleanly.
 * Decorative bleed lives in the outer 220px on each side.
 */

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export const alt = "Dynasty Copilot: Win the decision in front of you.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoData = await readFile(
    join(process.cwd(), "public", "dynasty_copilot_logomark.png"),
  );
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Decorative background. Radial glow + corner accents. Lives
            entirely in the bleed region; safe to be cropped away. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 50% 30%, rgba(245, 158, 11, 0.16), transparent 60%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(245, 158, 11, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(245, 158, 11, 0.04) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            display: "flex",
          }}
        />

        {/* Centered safe zone. All critical content lives here. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "0 auto",
            padding: "70px 40px",
            width: 760,
            height: "100%",
            textAlign: "center",
          }}
        >
          {/* Top: brand mark + wordmark, prominent and centered. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" width={108} height={108} />
            <div
              style={{
                fontSize: 24,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "#f59e0b",
                fontFamily: "monospace",
                display: "flex",
              }}
            >
              Dynasty Copilot
            </div>
          </div>

          {/* Middle: the headline + one-line subhead. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
            }}
          >
            <div
              style={{
                fontSize: 76,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                display: "flex",
                color: "#fafafa",
              }}
            >
              Win the decision
            </div>
            <div
              style={{
                fontSize: 76,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                display: "flex",
                color: "#fafafa",
              }}
            >
              in front of you.
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 26,
                color: "#a3a3a3",
                lineHeight: 1.4,
                display: "flex",
                maxWidth: 680,
              }}
            >
              Decision engine for Sleeper dynasty leagues.
            </div>
          </div>

          {/* Bottom: URL + status, monospace tactical line. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontFamily: "monospace",
              fontSize: 22,
              color: "#737373",
              textTransform: "uppercase",
              letterSpacing: "0.18em",
            }}
          >
            <span>dynastygeneral.app</span>
            <span style={{ color: "#525252" }}>·</span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#22c55e",
              }}
            >
              <span
                style={{
                  display: "flex",
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: "#22c55e",
                }}
              />
              Private beta
            </span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
