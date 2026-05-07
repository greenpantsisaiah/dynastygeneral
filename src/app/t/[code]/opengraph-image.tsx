import { ImageResponse } from "next/og";
import {
  fetchSharedVerdict,
  isValidShortCode,
} from "@/lib/share/trade-verdict-share";
import type {
  TradeIncomingOutput,
  TradeOutboundOutput,
} from "@/lib/engine/schemas";

// Standard OG image dimensions: 1200 x 630.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Dynasty General trade verdict";

type Props = {
  params: Promise<{ code: string }>;
};

// Server-rendered OG image. Triggered by social platforms when they
// fetch the page for unfurl. Self-contained so it can run outside the
// app router (no theme provider, no imports from React component
// tree). Per founder decision 2026-05-07 the methodology link is
// baked into the image so every shared screenshot markets the engine.
export default async function OgImage({ params }: Props) {
  const { code } = await params;

  if (!isValidShortCode(code)) {
    return notFoundImage();
  }
  const record = await fetchSharedVerdict(code);
  if (!record) {
    return notFoundImage();
  }

  const headline =
    record.mode === "incoming"
      ? incomingHeadline(record.output as TradeIncomingOutput)
      : outboundHeadline(record.output as TradeOutboundOutput);

  const verdictLabel =
    record.mode === "incoming"
      ? (record.output as TradeIncomingOutput).action.toUpperCase()
      : "ATTACK";

  const verdictTone =
    record.mode === "incoming"
      ? toneForAction((record.output as TradeIncomingOutput).action)
      : "#f59e0b"; // accent for outbound attack

  const confidence = Math.round(record.confidence ?? 50);
  const teamLine = record.team_display
    ? `for ${record.team_display}`
    : "shared verdict";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0a0b",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "56px 64px",
          justifyContent: "space-between",
        }}
      >
        {/* Top bar: brand + ticker */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 16,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8b8b8b",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#fafafa", fontWeight: 600 }}>
              Dynasty General
            </span>
            <span>·</span>
            <span>{teamLine}</span>
          </div>
          <span>{record.mode === "incoming" ? "Trade verdict" : "Trade attack"}</span>
        </div>

        {/* Verdict badge + headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 18px",
                fontSize: 22,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                color: verdictTone,
                border: `2px solid ${verdictTone}99`,
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              {verdictLabel}
            </span>
            <span
              style={{
                fontSize: 22,
                color: "#a0a0a0",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                letterSpacing: "0.16em",
              }}
            >
              {confidence}% CONFIDENCE
            </span>
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: "#fafafa",
              maxWidth: 1080,
              display: "flex",
            }}
          >
            {headline}
          </div>
        </div>

        {/* Bottom bar: calibration + methodology */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 18,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#8b8b8b",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            paddingTop: 18,
            borderTop: "1px solid #1f1f22",
          }}
        >
          <span>Engine v0 · 0.399 Spearman · beats consensus</span>
          <span>dynastygeneral.app/scoreboard</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

function notFoundImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          backgroundColor: "#0a0a0b",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 48, fontWeight: 600 }}>Verdict not found</div>
        <div style={{ fontSize: 22, color: "#8b8b8b" }}>
          dynastygeneral.app
        </div>
      </div>
    ),
    { ...size },
  );
}

function toneForAction(action: string): string {
  switch (action) {
    case "accept":
      return "#22c55e"; // success green
    case "decline":
      return "#ef4444"; // danger red
    case "wait":
      return "#a0a0a0"; // muted
    case "counter":
    default:
      return "#f59e0b"; // accent amber
  }
}

function incomingHeadline(o: TradeIncomingOutput): string {
  // Trim recommendation to fit the OG card. Avoid mid-word cuts.
  const max = 120;
  if (o.recommendation.length <= max) return o.recommendation;
  return o.recommendation.slice(0, max).replace(/\s+\S*$/, "") + "...";
}

function outboundHeadline(o: TradeOutboundOutput): string {
  const max = 120;
  if (o.attack_angle.length <= max) return o.attack_angle;
  return o.attack_angle.slice(0, max).replace(/\s+\S*$/, "") + "...";
}
