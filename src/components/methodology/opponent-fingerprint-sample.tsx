/**
 * Sample opponent fingerprint. Renders one opposing manager's pick-
 * trade timeline + the four-state signature classifier + the trade
 * implication that follows. Demonstrates a unique-to-us insight: we
 * read counterparty psychology from `snapshot.draft.traded_picks` and
 * surface it as actionable trade framing.
 *
 * Per founder feedback 2026-05-14: "opponent fingerprint is
 * incredible." This is the methodology-page proof.
 *
 * Static fictional sample. Real product fires on real per-opponent
 * trade history pulled from Sleeper.
 */

type WeekEntry = { week: string; sent: number; received: number };

const TIMELINE: WeekEntry[] = [
  { week: "W1", sent: 0, received: 0 },
  { week: "W2", sent: 2, received: 0 },
  { week: "W3", sent: 1, received: 2 },
  { week: "W4", sent: 3, received: 1 },
  { week: "W5", sent: 1, received: 1 },
  { week: "W6", sent: 2, received: 4 },
  { week: "W7", sent: 1, received: 0 },
  { week: "W8", sent: 4, received: 2 },
  { week: "W9", sent: 2, received: 1 },
  { week: "W10", sent: 1, received: 0 },
];

const SAMPLE = {
  opponent: "Sample Manager",
  signature: "pick_flipper",
  signature_label: "Pick flipper",
  picks_sent: 17,
  picks_received: 11,
  total_volume: 28,
  summary:
    "High two-way pick volume across 10 weeks. Sends and receives almost every week. Treats picks as currency rather than stockpiling them.",
  trade_implication:
    "Lead with a pick swap when proposing a trade. Player-for-player offers from your side will sit. Asymmetric (you pick + you player for their pick + their player) tends to get accepted when the volume matches their pattern.",
};

const W = 540;
const H = 160;
const PAD_X = 30;
const PAD_Y_TOP = 14;
const PAD_Y_BOTTOM = 22;
const BAND_H = (H - PAD_Y_TOP - PAD_Y_BOTTOM) / 2;
const MAX_BAR = Math.max(
  ...TIMELINE.map((e) => Math.max(e.sent, e.received)),
);

function weekX(i: number): number {
  return PAD_X + (i / (TIMELINE.length - 1)) * (W - PAD_X * 2);
}

function barHeight(n: number): number {
  return (n / MAX_BAR) * BAND_H;
}

export function OpponentFingerprintSample() {
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Opponent fingerprint · sample
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {SAMPLE.opponent}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            classified · {SAMPLE.signature_label}
          </div>
        </div>
        <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-warning">
          illustration · sample data
        </span>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
          <span>
            <span className="text-warning">▲</span> {SAMPLE.picks_sent} sent
          </span>
          <span>
            <span className="text-success">▼</span> {SAMPLE.picks_received} received
          </span>
          <span>
            net <span className="text-foreground">{SAMPLE.picks_received - SAMPLE.picks_sent}</span>
          </span>
          <span>volume {SAMPLE.total_volume}</span>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-3 w-full"
          role="img"
          aria-label="Sample opponent's sent and received picks per week across a 10-week window"
        >
          {/* mid axis */}
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={H / 2}
            y2={H / 2}
            stroke="var(--border-soft)"
            strokeWidth={0.5}
          />
          {TIMELINE.map((e, i) => {
            const x = weekX(i);
            const sentH = barHeight(e.sent);
            const recvH = barHeight(e.received);
            return (
              <g key={e.week}>
                <rect
                  x={x - 8}
                  y={H / 2 - sentH}
                  width={16}
                  height={sentH}
                  fill="var(--warning)"
                  fillOpacity={0.75}
                />
                <rect
                  x={x - 8}
                  y={H / 2}
                  width={16}
                  height={recvH}
                  fill="var(--success)"
                  fillOpacity={0.75}
                />
                <text
                  x={x}
                  y={H - 6}
                  fontSize={8}
                  textAnchor="middle"
                  fill="var(--muted-2)"
                  fontFamily="ui-monospace, monospace"
                >
                  {e.week}
                </text>
              </g>
            );
          })}
          <text
            x={4}
            y={PAD_Y_TOP + 4}
            fontSize={8}
            fill="var(--warning)"
            fontFamily="ui-monospace, monospace"
            style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            sent
          </text>
          <text
            x={4}
            y={H - PAD_Y_BOTTOM + 4}
            fontSize={8}
            fill="var(--success)"
            fontFamily="ui-monospace, monospace"
            style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            received
          </text>
        </svg>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-accent/40 bg-accent/5 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            What we read
          </div>
          <p className="mt-2 text-sm leading-snug text-foreground">
            {SAMPLE.summary}
          </p>
        </div>
        <div className="rounded-md border border-[color:#a78bfa]/40 bg-[color:#a78bfa]/5 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:#a78bfa]">
            How to play them
          </div>
          <p className="mt-2 text-sm leading-snug text-foreground">
            {SAMPLE.trade_implication}
          </p>
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        Four signature buckets the engine assigns:{" "}
        <span className="font-semibold text-foreground">pick flipper</span>{" "}
        (high two-way volume, net flat),{" "}
        <span className="font-semibold text-foreground">pick hoarder</span>{" "}
        (net pick receiver),{" "}
        <span className="font-semibold text-foreground">pick seller</span>{" "}
        (net pick sender),{" "}
        <span className="font-semibold text-foreground">pick quiet</span>{" "}
        (low volume, no strong fingerprint). Coach references the
        signature when proposing trades with that opponent so the offer
        shape matches what they actually do, not just what their roster
        looks like.
      </p>
    </div>
  );
}
