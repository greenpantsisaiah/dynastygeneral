import Link from "next/link";
import { ProofCharts } from "@/components/landing/home-charts";

/**
 * The proof section. Three small annotated charts sit under one line
 * of framing copy. Each chart proves a single thesis the homepage
 * makes elsewhere: roster shape needs more than one number, opponent
 * behavior is readable, percentile placement requires a cohort.
 *
 * Follows REDESIGN_INTENTIONS principle 3 (statistical credibility
 * surfaced, not yelled) and principle 10 (Tufte: scan, focus,
 * consume).
 */
export function ProofSection() {
  return (
    <section className="border-b border-border-soft">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Three things we read
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            That a KTC value sum cannot tell you.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Every claim ships with a chart. Every chart ships with its
            sample size and source. Methodology lives in the Library.
          </p>
        </div>

        <div className="mt-10">
          <ProofCharts />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
          <Link
            href="/library"
            className="font-mono uppercase tracking-[0.16em] hover:text-accent"
          >
            Read the methodology →
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Honesty block. Short, declarative. Decisive about what the product
 * is NOT so the visitor doesn't bring the wrong expectations to the
 * "type your username" form above.
 */
export function ContrarianSection() {
  return (
    <section className="border-b border-border-soft">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              What this isn't
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              The lanes we deliberately don't run.
            </h2>
          </div>
          <ul className="space-y-4 text-sm text-foreground">
            <li>
              <span className="font-semibold">No picks of the week.</span>{" "}
              The product is dynasty intelligence, not redraft content.
              Weekly start/sit and waiver lists are solved problems.
            </li>
            <li>
              <span className="font-semibold">No vibes-only verdicts.</span>{" "}
              Every claim has a number behind it. Every number has a
              source.
            </li>
            <li>
              <span className="font-semibold">
                No ad slots, no affiliate banners.
              </span>{" "}
              Pricing lands when calibration ships. Alpha is free for
              every signed-in tester. The incentive points one way: be
              useful.
            </li>
            <li>
              <span className="font-semibold">
                No predicting the future.
              </span>{" "}
              The model reads the room you are about to trade into. It
              tells you what your opponents have done, not what they
              will do.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
