import type {
  PickOutput,
  StrategyClarifyOutput,
  TradeIncomingOutput,
  TradeOutboundOutput,
} from "@/lib/engine/schemas";
import { ClientCopy } from "./client-copy";
import { ShareVerdictButton } from "./share-verdict-button";

/**
 * Render structured engine outputs. Keep these presentational. Logic
 * lives in the engine module.
 */

function ActionBadge({
  label,
  tone = "accent",
}: {
  label: string;
  tone?: "accent" | "success" | "danger" | "muted";
}) {
  const map: Record<string, string> = {
    accent: "border-accent/60 text-accent",
    success: "border-success/60 text-success",
    danger: "border-danger/60 text-danger",
    muted: "border-border-strong text-muted-2",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${map[tone]}`}
    >
      {label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border-soft px-5 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
        {label}
      </div>
      <div className="mt-2 text-sm text-foreground">{children}</div>
    </div>
  );
}

function StrategyBadge({ fit }: { fit: "on_strategy" | "drift" | "unclear" }) {
  if (fit === "on_strategy") return <ActionBadge label="On strategy" tone="success" />;
  if (fit === "drift") return <ActionBadge label="Strategy drift" tone="danger" />;
  return <ActionBadge label="Strategy unclear" tone="muted" />;
}

function LeverageBadge({ level }: { level: "none" | "moderate" | "strong" }) {
  const tone = level === "strong" ? "accent" : level === "moderate" ? "accent" : "muted";
  const label = `Leverage: ${level}`;
  return <ActionBadge label={label} tone={tone as "accent" | "muted"} />;
}

// ── Pick ──────────────────────────────────────────────────────────────────

export function PickResult({
  result,
  mode,
}: {
  result: PickOutput;
  mode: "live" | "stub";
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-strong bg-surface">
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <StrategyBadge fit={result.strategy_fit} />
          {mode === "stub" && <ActionBadge label="Dev stub" tone="muted" />}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          {Math.round(result.confidence * 100)}% confidence
        </span>
      </div>
      <div className="px-5 pb-5 pt-3 text-xl font-semibold leading-tight text-foreground">
        {result.recommendation}
      </div>
      <Row label="Why">
        <ul className="space-y-1.5">
          {result.reasoning.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      </Row>
      <Row label="Opportunity cost">{result.opportunity_cost}</Row>
      {result.drift_note && <Row label="Drift">{result.drift_note}</Row>}
      {result.leverage_note && <Row label="Leverage">{result.leverage_note}</Row>}
      {result.alternative && (
        <Row label="Alternative">
          <div className="text-foreground">{result.alternative.path}</div>
          <div className="mt-1 text-muted-2">
            When: {result.alternative.when_to_choose}
          </div>
        </Row>
      )}
    </div>
  );
}

// ── Trade: incoming ───────────────────────────────────────────────────────

export function TradeIncomingResult({
  result,
  mode,
  shareContext,
}: {
  result: TradeIncomingOutput;
  mode: "live" | "stub";
  // When present, shows the Share button. Omitted on the public
  // viewing page (/t/[code]) so a re-share of an already-shared
  // verdict isn't a thing in v1.
  shareContext?: {
    leagueId: string | null;
    input?: Record<string, unknown> | null;
    teamDisplay?: string | null;
  };
}) {
  const actionTone: Record<string, "accent" | "success" | "danger" | "muted"> = {
    accept: "success",
    counter: "accent",
    decline: "danger",
    wait: "muted",
  };
  const verdictText = formatIncomingVerdict(result);
  const confidencePct = Math.round(result.confidence * 100);
  return (
    <div className="overflow-hidden rounded-lg border border-border-strong bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <ActionBadge label={result.action} tone={actionTone[result.action]} />
          <StrategyBadge fit={result.strategy_fit} />
          <LeverageBadge level={result.leverage} />
          {mode === "stub" && <ActionBadge label="Dev stub" tone="muted" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            {confidencePct}% confidence
          </span>
          <VerdictCopyButton text={verdictText} />
          {shareContext && (
            <ShareVerdictButton
              mode="incoming"
              leagueId={shareContext.leagueId}
              output={result as unknown as Record<string, unknown>}
              input={shareContext.input ?? null}
              teamDisplay={shareContext.teamDisplay ?? null}
              confidencePct={confidencePct}
            />
          )}
        </div>
      </div>
      <div className="px-5 pb-5 pt-3 text-xl font-semibold leading-tight text-foreground">
        {result.recommendation}
      </div>
      <Row label="Why">
        <ul className="space-y-1.5">
          {result.reasoning.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      </Row>
      <Row label="Opponent read">{result.opponent_read}</Row>
      <Row label="Opportunity cost">{result.opportunity_cost}</Row>
      {result.action === "counter" && result.counter_offer && (
        <Row label="Counter offer">
          <CounterOfferBlock counter={result.counter_offer} />
        </Row>
      )}
      {result.stronger_ask && !result.counter_offer && (
        <Row label="Stronger ask">{result.stronger_ask}</Row>
      )}
      <Row label="Walk-away floor">{result.walk_away_floor}</Row>
      {result.negotiation_message && (
        <Row label="Message">
          <CopyableMessage text={result.negotiation_message} />
        </Row>
      )}
      <CalibrationFooter />
    </div>
  );
}

// Structured counter offer block. Renders the engine's specific
// counter as a tiered package (matching the visual language of
// outbound packages) with per-asset breakdown plus a copy button
// for the assets list. The user can paste straight into Sleeper or
// remix the counter via the outbound flow later.
function CounterOfferBlock({
  counter,
}: {
  counter: NonNullable<TradeIncomingOutput["counter_offer"]>;
}) {
  const counterText = formatCounterOffer(counter);
  return (
    <div className="group relative rounded-md border border-border-soft bg-background p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
          Suggested counter
        </span>
        <ClientCopy text={counterText} variant="prominent" label="Copy counter" />
      </div>
      <div className="mt-2 text-foreground">
        <span className="text-muted-2">You send:</span>{" "}
        {counter.you_send.join(", ")}
      </div>
      <div className="mt-1 text-foreground">
        <span className="text-muted-2">You receive:</span>{" "}
        {counter.you_receive.join(", ")}
      </div>
      <div className="mt-2 text-muted">{counter.rationale}</div>
    </div>
  );
}

function formatCounterOffer(
  counter: NonNullable<TradeIncomingOutput["counter_offer"]>,
): string {
  return [
    `Counter offer:`,
    `You send: ${counter.you_send.join(", ")}`,
    `You receive: ${counter.you_receive.join(", ")}`,
    counter.rationale,
  ].join("\n");
}

// ── Trade: outbound ───────────────────────────────────────────────────────

export function TradeOutboundResult({
  result,
  mode,
  shareContext,
}: {
  result: TradeOutboundOutput;
  mode: "live" | "stub";
  shareContext?: {
    leagueId: string | null;
    input?: Record<string, unknown> | null;
    teamDisplay?: string | null;
  };
}) {
  const verdictText = formatOutboundVerdict(result);
  const confidencePct = Math.round(result.confidence * 100);
  return (
    <div className="overflow-hidden rounded-lg border border-border-strong bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2">
          <LeverageBadge level={result.leverage} />
          {mode === "stub" && <ActionBadge label="Dev stub" tone="muted" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            {confidencePct}% confidence
          </span>
          <VerdictCopyButton text={verdictText} />
          {shareContext && (
            <ShareVerdictButton
              mode="outbound"
              leagueId={shareContext.leagueId}
              output={result as unknown as Record<string, unknown>}
              input={shareContext.input ?? null}
              teamDisplay={shareContext.teamDisplay ?? null}
              confidencePct={confidencePct}
            />
          )}
        </div>
      </div>
      <div className="px-5 pb-5 pt-3 text-xl font-semibold leading-tight text-foreground">
        {result.attack_angle}
      </div>
      <Row label="Opponent read">{result.opponent_read}</Row>
      <Row label="Packages">
        <ul className="space-y-3">
          {result.packages.map((p, i) => (
            <li key={i} className="rounded-md border border-border-soft bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                  {p.tier}
                </span>
              </div>
              <div className="mt-2 text-sm text-foreground">
                <span className="text-muted-2">You send:</span> {p.you_send.join(", ")}
              </div>
              <div className="mt-1 text-sm text-foreground">
                <span className="text-muted-2">You get:</span> {p.you_receive.join(", ")}
              </div>
              <div className="mt-2 text-sm text-muted">{p.rationale}</div>
            </li>
          ))}
        </ul>
      </Row>
      <Row label="Opening message">
        <CopyableMessage text={result.opener_message} />
      </Row>
      <Row label="Walk-away floor">{result.walk_away_floor}</Row>
      <Row label="Opportunity cost">{result.opportunity_cost}</Row>
      <CalibrationFooter />
    </div>
  );
}

// ── Strategy ──────────────────────────────────────────────────────────────

export function StrategyResult({
  result,
  mode,
}: {
  result: StrategyClarifyOutput;
  mode: "live" | "stub";
}) {
  const stateTone: Record<string, "success" | "accent" | "muted"> = {
    contender: "success",
    rebuild: "accent",
    balanced: "muted",
    undetermined: "muted",
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border-strong bg-surface">
      <div className="flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2">
          <ActionBadge label={result.state} tone={stateTone[result.state]} />
          {mode === "stub" && <ActionBadge label="Dev stub" tone="muted" />}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
          {Math.round(result.confidence * 100)}% confidence
        </span>
      </div>
      <div className="px-5 pb-5 pt-3 text-xl font-semibold leading-tight text-foreground">
        Current build: {result.state}
      </div>
      <Row label="Signals">
        <ul className="space-y-1.5">
          {result.signals.map((s, i) => (
            <li key={i}>· {s}</li>
          ))}
        </ul>
      </Row>
      <Row label="Strengths">
        <ul className="space-y-1">
          {result.strengths.map((s, i) => (
            <li key={i}>· {s}</li>
          ))}
        </ul>
      </Row>
      {result.drift_risks.length > 0 && (
        <Row label="Drift risks">
          <ul className="space-y-1">
            {result.drift_risks.map((s, i) => (
              <li key={i}>· {s}</li>
            ))}
          </ul>
        </Row>
      )}
      <Row label="Next moves">
        <ul className="space-y-1">
          {result.next_moves.map((s, i) => (
            <li key={i}>→ {s}</li>
          ))}
        </ul>
      </Row>
      {result.closed_strategies.length > 0 && (
        <Row label="Closed paths (don't drift into these)">
          <ul className="space-y-1 text-muted-2">
            {result.closed_strategies.map((s, i) => (
              <li key={i}>× {s}</li>
            ))}
          </ul>
        </Row>
      )}
      {result.league_clusters && result.league_clusters.length > 0 && (
        <Row label="League clusters">
          <ul className="space-y-2">
            {result.league_clusters.map((c, i) => (
              <li key={i}>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                  {c.name}
                </div>
                <div className="mt-1 text-foreground">{c.teams.join(", ")}</div>
                <div className="mt-1 text-muted">{c.dynamic}</div>
              </li>
            ))}
          </ul>
        </Row>
      )}
      {result.execution_pivot && (
        <Row label="Execution note">{result.execution_pivot}</Row>
      )}
    </div>
  );
}

// ── Copyable message ──────────────────────────────────────────────────────

function CopyableMessage({ text }: { text: string }) {
  return (
    <div className="group relative rounded-md border border-border-soft bg-background p-3 text-sm leading-relaxed text-foreground">
      <div className="whitespace-pre-wrap">{text}</div>
      <CopyButton text={text} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  return <ClientCopy text={text} />;
}

// Prominent copy button for the entire trade verdict. Sits in the
// header next to confidence so the user can grab a screenshot-ready
// summary in one click without hunting for it.
function VerdictCopyButton({ text }: { text: string }) {
  return <ClientCopy text={text} variant="prominent" label="Copy verdict" />;
}

// Calibration footer. Builds trust on every shared trade screenshot
// by anchoring the verdict in the engine's published backtest. The
// number is a stable claim per MODEL_CARD section 9.7. If the
// scoreboard updates (e.g., v1 with full signal coverage), bump
// the digit here at the same time.
function CalibrationFooter() {
  return (
    <div className="flex items-center justify-between border-t border-border-soft px-5 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
        Engine v0 · 0.399 Spearman · beats consensus
      </span>
      <a
        href="/scoreboard"
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2 transition hover:text-accent"
      >
        Methodology →
      </a>
    </div>
  );
}

// ── Verdict text formatters (for league-chat sharing) ─────────────────────

function formatIncomingVerdict(r: TradeIncomingOutput): string {
  const conf = Math.round(r.confidence * 100);
  const lines: string[] = [
    `Trade verdict via Dynasty General`,
    ``,
    `${r.action.toUpperCase()} (${conf}% confidence · ${r.leverage} leverage · ${r.strategy_fit.replace(/_/g, " ")})`,
    ``,
    r.recommendation,
    ``,
    `Why:`,
    ...r.reasoning.map((s) => `  · ${s}`),
    ``,
    `Opponent read: ${r.opponent_read}`,
    `Opportunity cost: ${r.opportunity_cost}`,
  ];
  if (r.action === "counter" && r.counter_offer) {
    lines.push(
      ``,
      `Counter offer:`,
      `  You send: ${r.counter_offer.you_send.join(", ")}`,
      `  You receive: ${r.counter_offer.you_receive.join(", ")}`,
      `  ${r.counter_offer.rationale}`,
    );
  } else if (r.stronger_ask) {
    lines.push(`Stronger ask: ${r.stronger_ask}`);
  }
  lines.push(`Walk-away floor: ${r.walk_away_floor}`);
  if (r.negotiation_message) {
    lines.push(``, `Suggested message:`, r.negotiation_message);
  }
  lines.push(
    ``,
    `Engine v0: 0.399 Spearman, beats consensus. Methodology: dynastygeneral.app/scoreboard`,
  );
  return lines.join("\n");
}

function formatOutboundVerdict(r: TradeOutboundOutput): string {
  const conf = Math.round(r.confidence * 100);
  const lines: string[] = [
    `Trade attack via Dynasty General`,
    ``,
    `${r.attack_angle} (${conf}% confidence · ${r.leverage} leverage)`,
    ``,
    `Opponent read: ${r.opponent_read}`,
    ``,
    `Packages:`,
  ];
  for (const p of r.packages) {
    lines.push(
      `  [${p.tier.toUpperCase()}]`,
      `    You send: ${p.you_send.join(", ")}`,
      `    You get:  ${p.you_receive.join(", ")}`,
      `    ${p.rationale}`,
    );
  }
  lines.push(
    ``,
    `Opener:`,
    r.opener_message,
    ``,
    `Walk-away floor: ${r.walk_away_floor}`,
    `Opportunity cost: ${r.opportunity_cost}`,
    ``,
    `Engine v0: 0.399 Spearman, beats consensus. Methodology: dynastygeneral.app/scoreboard`,
  );
  return lines.join("\n");
}
