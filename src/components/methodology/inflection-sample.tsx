/**
 * Sample inflection scorecard. Shows the bimodal-forecast framework
 * that Dynasty General publishes per player at a high-variance moment.
 *
 * The reference image: a 28-year-old workhorse RB approaching the
 * aging-RB cliff. Two stories, calibrated probabilities, a six-signal
 * scorecard with confidence labels, and two named historical
 * comparators per story. None of this exists in KTC or FantasyCalc;
 * both publish one number and move on.
 *
 * Per founder feedback 2026-05-14: methodology page needs unique
 * insights we generate, called out inflection windows specifically.
 *
 * The sample is fictional but plausible. Real product fires on real
 * roster + cohort signals. Disclaimer band makes the "illustration"
 * status explicit.
 */

type SignalConfidence = "validated" | "partial" | "weak";
type SignalDirection = "story_a" | "story_b" | "neutral" | "data_missing";

type Signal = {
  name: string;
  description: string;
  observation: string;
  confidence: SignalConfidence;
  direction: SignalDirection;
};

type Comparator = {
  player: string;
  year: number;
  story: "a" | "b";
  outcome: string;
};

const SAMPLE = {
  player: "Sample RB · age 28",
  window: "aging cliff · RB",
  story_a: { label: "Continued bellcow", p: 0.42 },
  story_b: { label: "Cliff inside one offseason", p: 0.58 },
  headline:
    "The model leans Story B (cliff) at 58% based on the 1,650 career carry load + team adding a young RB in the draft. YPC stability and pass-down share keep Story A alive at 42%. Single-point estimate would land in the valley.",
  signals: [
    {
      name: "Career carries",
      description: "Cumulative regular-season + playoff carries",
      observation: "1,650 (top decile for age 28 RBs)",
      confidence: "validated",
      direction: "story_b",
    },
    {
      name: "YPC trend",
      description: "Yards per carry, last 2 seasons vs prime",
      observation: "4.6 → 4.4 (stable)",
      confidence: "validated",
      direction: "story_a",
    },
    {
      name: "Team RB draft",
      description: "Team drafted a young RB within last 18 months",
      observation: "Yes, pick 53 (round 2)",
      confidence: "validated",
      direction: "story_b",
    },
    {
      name: "Pass-down share",
      description: "Share of team passing-down RB snaps",
      observation: "62% (locked in for now)",
      confidence: "partial",
      direction: "story_a",
    },
    {
      name: "OL continuity",
      description: "Offensive line returning starters",
      observation: "4 of 5 returning",
      confidence: "partial",
      direction: "story_a",
    },
    {
      name: "Injury history",
      description: "Major-injury count past 3 seasons",
      observation: "data not in pipeline yet",
      confidence: "weak",
      direction: "data_missing",
    },
  ] satisfies Signal[],
  comparators: [
    {
      player: "Adrian Peterson",
      year: 2017,
      story: "a",
      outcome: "rushing title at 32 after ACL recovery",
    },
    {
      player: "Frank Gore",
      year: 2018,
      story: "a",
      outcome: "continued bellcow workload at 35",
    },
    {
      player: "Le'Veon Bell",
      year: 2019,
      story: "b",
      outcome: "career fell apart at 27 post-holdout",
    },
    {
      player: "DeMarco Murray",
      year: 2016,
      story: "b",
      outcome: "1,287 yards age 28, then cliff at 29",
    },
  ] satisfies Comparator[],
};

const CONFIDENCE_TONE: Record<SignalConfidence, string> = {
  validated: "border-success/60 bg-success/10 text-success",
  partial: "border-warning/60 bg-warning/10 text-warning",
  weak: "border-muted-2/60 bg-surface-2 text-muted-2",
};

const DIRECTION_TONE: Record<SignalDirection, string> = {
  story_a: "text-accent",
  story_b: "text-[color:#a78bfa]",
  neutral: "text-muted-2",
  data_missing: "text-muted-2",
};

const DIRECTION_LABEL: Record<SignalDirection, string> = {
  story_a: "→ Story A",
  story_b: "→ Story B",
  neutral: "neutral",
  data_missing: "missing",
};

export function InflectionSample() {
  const aWidth = SAMPLE.story_a.p * 100;
  const bWidth = SAMPLE.story_b.p * 100;

  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Inflection scorecard · sample
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {SAMPLE.player}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
            window · {SAMPLE.window}
          </div>
        </div>
        <span className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-warning">
          illustration · fictional player
        </span>
      </div>

      {/* Bimodal distribution bar */}
      <div className="mt-4 flex gap-1 overflow-hidden rounded-md text-[10px]">
        <div
          className="flex h-9 items-center justify-center bg-accent/20 px-2 font-mono uppercase tracking-[0.14em] text-accent"
          style={{ flex: aWidth }}
        >
          {Math.round(aWidth)}% · {SAMPLE.story_a.label}
        </div>
        <div
          className="flex h-9 items-center justify-center bg-[color:#a78bfa]/25 px-2 font-mono uppercase tracking-[0.14em] text-[color:#a78bfa]"
          style={{ flex: bWidth }}
        >
          {Math.round(bWidth)}% · {SAMPLE.story_b.label}
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground">
        {SAMPLE.headline}
      </p>

      {/* Signal scorecard */}
      <div className="mt-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Signal scorecard
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-border-soft text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
                <th className="px-2 py-2">Signal</th>
                <th className="px-2 py-2">Observation</th>
                <th className="px-2 py-2">Confidence</th>
                <th className="px-2 py-2">Points to</th>
              </tr>
            </thead>
            <tbody>
              {SAMPLE.signals.map((s) => (
                <tr key={s.name} className="border-b border-border-soft">
                  <td className="px-2 py-2">
                    <div className="font-semibold text-foreground">
                      {s.name}
                    </div>
                    <div className="text-[10px] leading-snug text-muted-2">
                      {s.description}
                    </div>
                  </td>
                  <td className="px-2 py-2 leading-snug text-foreground">
                    {s.observation}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-sm border px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.14em] ${CONFIDENCE_TONE[s.confidence]}`}
                    >
                      {s.confidence}
                    </span>
                  </td>
                  <td
                    className={`px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${DIRECTION_TONE[s.direction]}`}
                  >
                    {DIRECTION_LABEL[s.direction]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparators */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {(["a", "b"] as const).map((story) => {
          const tone =
            story === "a"
              ? "border-accent/40 bg-accent/5"
              : "border-[color:#a78bfa]/40 bg-[color:#a78bfa]/5";
          const labelTone =
            story === "a"
              ? "text-accent"
              : "text-[color:#a78bfa]";
          const storyLabel =
            story === "a" ? SAMPLE.story_a.label : SAMPLE.story_b.label;
          const comps = SAMPLE.comparators.filter((c) => c.story === story);
          return (
            <div
              key={story}
              className={`rounded-md border px-4 py-3 ${tone}`}
            >
              <div
                className={`font-mono text-[10px] uppercase tracking-[0.18em] ${labelTone}`}
              >
                Comparators · {storyLabel}
              </div>
              <ul className="mt-2 space-y-1.5 text-xs">
                {comps.map((c) => (
                  <li key={`${c.player}-${c.year}`}>
                    <span className="font-semibold text-foreground">
                      {c.player}
                    </span>
                    <span className="font-mono text-[10px] text-muted-2"> · {c.year}</span>
                    <div className="text-[11px] leading-snug text-muted">
                      {c.outcome}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        Per the calibration architecture: predicting a single point at
        a high-variance moment puts the estimate in the valley between
        modes, where no actual player ends up. The scorecard surfaces
        both stories, the signals that distinguish them with their
        confidence levels, and named historical comparators. The user
        reads the evidence and makes the call. The engine does not
        pretend to collapse a bimodal distribution into a point.
      </p>
    </div>
  );
}
