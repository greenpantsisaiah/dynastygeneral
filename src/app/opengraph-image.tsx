/**
 * Open Graph image for the root domain. Used by Slack, iMessage,
 * Twitter/X, Discord, etc. when dynastygeneral.app is shared.
 *
 * Next.js convention: any `opengraph-image.{png,tsx,...}` next to a
 * route renders to /opengraph-image at build, and the framework
 * auto-injects the og:image meta. Generated server-side via @vercel/og
 * (already a Next.js peer dep).
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
          flexDirection: "column",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          padding: "80px",
          backgroundImage:
            "radial-gradient(circle at 20% 0%, rgba(245, 158, 11, 0.18), transparent 50%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 18,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#f59e0b",
            fontFamily: "monospace",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="" width={48} height={48} />
          Dynasty Copilot
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 88,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            display: "flex",
            maxWidth: 1000,
          }}
        >
          Win the decision in front of you.
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 32,
            color: "#a3a3a3",
            lineHeight: 1.3,
            display: "flex",
            maxWidth: 980,
          }}
        >
          Dynasty fantasy football decision engine. Sleeper today,
          MyFantasyLeague next.
        </div>

        <div style={{ marginTop: "auto", display: "flex", gap: 24 }}>
          <Tag>One Decision per pick</Tag>
          <Tag>5-year Contender Outlook</Tag>
          <Tag>League Spectrum</Tag>
        </div>

        <div
          style={{
            marginTop: 32,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontFamily: "monospace",
            fontSize: 18,
            color: "#737373",
            textTransform: "uppercase",
            letterSpacing: "0.16em",
          }}
        >
          <span>dynastygeneral.app</span>
          <span style={{ color: "#22c55e" }}>Live private beta</span>
        </div>
      </div>
    ),
    size,
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 18px",
        fontSize: 22,
        color: "#fafafa",
        border: "1px solid #404040",
        borderRadius: 8,
        backgroundColor: "rgba(38, 38, 38, 0.6)",
      }}
    >
      {children}
    </div>
  );
}
