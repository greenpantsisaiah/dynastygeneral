import { ImageResponse } from "next/og";

/**
 * Shareable EV bank rank card. Stateless: the data is encoded in the
 * query string of the page URL (?rank=4&total=12&ev=87.1&league=name),
 * so when a social platform fetches the page for unfurl, the OG image
 * route reads those params and renders the user's "Nth of N in EV
 * banked" moment as a 1200x630 PNG.
 *
 * Per REDESIGN_INTENTIONS principle 9: shareable artifacts are
 * screenshot-optimized and carry the dynastygeneral.app footnote.
 * Founder direction 2026-05-15 audit: this is the missing piece of
 * the EV bank surface so every shared image markets the engine.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Dynasty General EV bank rank";
// Force dynamic rendering. The image content depends on query
// params from the share URL, so we can't prerender at build time.
export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OgImage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const rank = parseIntSafe(asString(sp.rank));
  const total = parseIntSafe(asString(sp.total));
  const ev = parseFloatSafe(asString(sp.ev));
  const league = asString(sp.league) ?? "Dynasty league";
  if (rank == null || total == null || ev == null) {
    return notFoundImage();
  }

  const evDisplay = (ev >= 0 ? "+" : "") + ev.toFixed(1);
  const evColor = ev >= 0 ? "#22c55e" : "#ef4444";
  const rankTier =
    rank === 1
      ? "Top of the league"
      : rank <= Math.ceil(total / 4)
        ? "Top quartile"
        : rank <= Math.ceil(total / 2)
          ? "Above the median"
          : "Below the median";
  const ordinal = ordinalSuffix(rank);

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
            <span>{league}</span>
          </div>
          <span>EV bank rank</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span
              style={{
                fontSize: 220,
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: "-0.04em",
                color: "#fafafa",
                display: "flex",
              }}
            >
              {rank}
            </span>
            <span
              style={{
                fontSize: 72,
                color: "#a0a0a0",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                letterSpacing: "-0.02em",
              }}
            >
              {ordinal} of {total}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
              fontSize: 36,
              color: "#a0a0a0",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              letterSpacing: "0.04em",
            }}
          >
            <span style={{ color: "#fafafa" }}>{rankTier}</span>
            <span>·</span>
            <span style={{ color: evColor, fontWeight: 600 }}>
              {evDisplay} EV
            </span>
            <span>banked</span>
          </div>
        </div>

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
          <span>EV = (value/100) × (pick − ADP)</span>
          <span>dynastygeneral.app</span>
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
        <div style={{ fontSize: 48, fontWeight: 600 }}>EV bank card</div>
        <div style={{ fontSize: 22, color: "#8b8b8b" }}>
          dynastygeneral.app
        </div>
      </div>
    ),
    { ...size },
  );
}

function asString(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function parseIntSafe(s: string | null): number | null {
  if (s == null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatSafe(s: string | null): number | null {
  if (s == null) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
