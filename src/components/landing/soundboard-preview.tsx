import { Ticker } from "@/components/ui/ticker";

/**
 * Soundboard preview / "on the workbench" tease. Per founder pitch
 * 2026-04-24: expose the engine's hidden weights as named dials the
 * user can hold. Today the engine has one preset (sharp dynasty
 * intelligence analyst); we're refactoring buried magic numbers into
 * configurable judgment profiles. This section is the slow-tease
 * version: people see the workbench, anticipation builds, no big
 * sales pitch. Status badges differentiate live (window weighting,
 * already shipped) from coming-soon dials.
 */
export function SoundboardPreview() {
  return (
    <section className="border-b border-border-soft py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Ticker label="07 · On the workbench" />
        <h2 className="mt-6 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Soon: take the dials yourself.
        </h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Today the engine ships one preset. Sharp dynasty intelligence
          analyst, calibrated against published research and KTC market
          pricing. We're refactoring the buried weights (gamble vs
          analyst, age preference, tier-cliff sensitivity, trade
          aggression) into named dials you can hold.
        </p>
        <p className="mt-4 max-w-2xl text-base text-muted-2">
          Run a more aggressive gambler. A patient builder. An
          old-school coach who values anchor RBs over young upside.
          Or bolt on your own theory: divisional difficulty, O-line
          tier, coach grades. The engine then weights it into every
          recommendation.
        </p>

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border-strong bg-border-soft md:grid-cols-2 lg:grid-cols-3">
          <Dial
            label="Window weighting"
            left="Win-now"
            right="Future"
            position={48}
            status="live"
          />
          <Dial
            label="Gamble"
            left="Analyst"
            right="Sharp gambler"
            position={32}
            status="coming"
          />
          <Dial
            label="Age preference"
            left="Vets only"
            right="Rookie hunter"
            position={55}
            status="coming"
          />
          <Dial
            label="Trade aggression"
            left="Patient"
            right="Push hard"
            position={40}
            status="coming"
          />
          <Dial
            label="Tier-cliff sensitivity"
            left="Steady"
            right="Reach early"
            position={62}
            status="coming"
          />
          <Dial
            label="Custom criterion"
            left=""
            right=""
            position={null}
            status="coming"
          />
        </div>

        <p className="mt-10 max-w-2xl text-sm text-muted-2 leading-relaxed">
          On the workbench. Not built yet. The dials reflect weights
          the engine already uses; we're refactoring them into knobs
          you can hold. Pro keeps the curated presets. The dials and
          your own criteria expand what Pro is.
        </p>
      </div>
    </section>
  );
}

function Dial({
  label,
  left,
  right,
  position,
  status,
}: {
  label: string;
  left: string;
  right: string;
  position: number | null;
  status: "live" | "coming";
}) {
  const statusLabel = status === "live" ? "Live today" : "Coming soon";
  const statusTone =
    status === "live" ? "text-success" : "text-muted-2";
  return (
    <div className="bg-surface px-5 py-5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
          {label}
        </span>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.14em] ${statusTone}`}
        >
          {statusLabel}
        </span>
      </div>
      {position != null ? (
        <>
          <div className="relative mt-5 h-1 w-full rounded-full bg-border-strong">
            <div
              className="h-1 rounded-full bg-accent"
              style={{ width: `${position}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-accent bg-background"
              style={{ left: `calc(${position}% - 6px)` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted-2">
            <span>{left}</span>
            <span>{right}</span>
          </div>
        </>
      ) : (
        <p className="mt-4 text-xs text-muted leading-snug">
          Add your own theory. Divisional difficulty, O-line tier,
          coach grades, weather adjustments. Whatever you think the
          model misses. The engine then weights it.
        </p>
      )}
    </div>
  );
}
