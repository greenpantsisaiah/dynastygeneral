/**
 * Release notes, single source of truth.
 *
 * Both the bottom-left "What's new" ribbon (surfaces the latest release)
 * and the /changelog page (renders the full flowing history) read from
 * this array. To ship a release: add a new `Release` to the TOP of
 * RELEASES (newest first), dated YYYY-MM-DD. The ribbon re-shows for
 * everyone automatically because LATEST_RELEASE.version changes.
 *
 * Voice A throughout (BRAND_VOICE.md): plainspoken, decisive, numbers
 * carry units, no em dashes, no exclamation points, no hedging openers,
 * no "we" for the product. Write each change for a tester reading the
 * app, not for the commit log.
 */

export interface ReleaseChange {
  /** Short mono uppercase label, e.g. "THE COMPANION". */
  tag: string;
  /** One sentence, what changed and why it matters to the user. */
  text: string;
}

export interface Release {
  /** YYYY-MM-DD. Doubles as the id and the displayed date. */
  version: string;
  /** Short theme for the release. */
  title: string;
  /** One-line framing for the release. */
  summary: string;
  changes: ReleaseChange[];
}

/** Newest first. */
export const RELEASES: Release[] = [
  {
    version: "2026-05-26",
    title: "See the earned role on the board",
    summary:
      "The Call now shows each candidate's earned role, so a proven sophomore's snap-share climb is visible next to the rookies ranked around him.",
    changes: [
      {
        tag: "ROLE ON THE CALL",
        text: "The standing call and every candidate on the board now carry a one-line role read: last season's snap share and targets per game, with a rising or eroding trend arrow. A second-year player whose snap share climbed shows it; an incoming rookie has no NFL role to show, which is the honest tell that one is proven and the other is a projection. Hover the line for the trend detail.",
      },
    ],
  },
  {
    version: "2026-05-25",
    title: "Earned role, read from the box score",
    summary:
      "Aging-cliff cards and Coach now read each player's earned opportunity (snap share and targets), not just his name.",
    changes: [
      {
        tag: "EARNED OPPORTUNITY",
        text: "Aging WR, TE, and RB cards now show a snap-share-plus-targets signal pulled from last season's box score: a rising role argues the player holds up, an eroding one is the cliff's leading edge. The numbers come from the free stats feed already fetched, so no card waits on data it could have shown.",
      },
      {
        tag: "COACH READS ROLE",
        text: "Coach now carries each of your players' prior-season snap share, targets per game, average depth of target, red-zone targets, and drop rate, and grounds every role claim in them. A young player whose role climbed reads as buy-the-trajectory; a featured name whose role slipped reads as the early warning. Opportunity informs the projection, never overrides market value.",
      },
    ],
  },
  {
    version: "2026-05-24",
    title: "One priced pool, sharper signals",
    summary:
      "The board and Coach name the same call from one priced pool, and the aging-RB cards read real workload.",
    changes: [
      {
        tag: "ONE CALL, BOARD + COACH",
        text: "The board and Coach now compute the standing call from one priced pool, so they name the same player. A starter-hole pick weighs player value, not just snipe-risk, so strong fallers stay on the board.",
      },
      {
        tag: "AGING-RB SIGNALS",
        text: "Aging-RB cards now read real prior-season workload and career mileage from carries, not \"data missing.\"",
      },
      {
        tag: "CO-OWNER FIX",
        text: "Co-owned teams resolve to the right roster everywhere. A co-owner no longer sees another manager's read.",
      },
      {
        tag: "COACH POSTURE",
        text: "Coach reads your contender / rebuilder / teardown posture on every recommendation, matching the board.",
      },
      {
        tag: "ONE EV NUMBER",
        text: "Per-pick EV, position, and roster-identity math now run from one source each, so a tune ripples everywhere.",
      },
      {
        tag: "RUNS: WAIT ON DEPTH",
        text: "A backtest on 41 real drafts shows declining a positional run banks a discount on your off-run picks, and waiting on a deep position like WR costs almost nothing. Coach no longer treats a WR run as a reason to chase.",
      },
      {
        tag: "RUN CALL BY LEAGUE SIZE",
        text: "Coach calibrates chase-or-skip to your league. The value edge barely changes with size, so the call reads your recoverability: how many picks remain against your unfilled starters. Deep dynasty rosters skip a run and rebalance later; a shallow redraft acts sooner when a run threatens a starter you still need.",
      },
    ],
  },
  {
    version: "2026-05-23",
    title: "Hardening, honesty, and polish",
    summary:
      "A correctness and trust pass across Coach, the companion, and the hub, plus a site-wide security sweep.",
    changes: [
      {
        tag: "OPPONENTS, FULLY NAMED",
        text: "Coach now enumerates every opponent and grades position depth by startable quality, not raw headcount. Six replacement-level WRs no longer read as deep at WR.",
      },
      {
        tag: "STRAIGHTER COMPANION",
        text: "The debate beat anchors to your first pick after a visit, never chides you for taking the call, and never leaks a raw player id into the copy.",
      },
      {
        tag: "HONEST INFLECTION CARDS",
        text: "When a signal has no live data the card says so once, cleanly, and flags when a read leans on the base rate instead of evidence.",
      },
      {
        tag: "POSITIONAL RUNS, GROUNDED",
        text: "Coach's guidance on chasing a positional run is backed by a tier-depth backtest on real KTC data, not a rule of thumb.",
      },
      {
        tag: "HARDENING",
        text: "A site-wide security pass: legal footer, locked-down admin routes, security.txt, fail-closed guards on the model endpoints, and ops alerts.",
      },
      {
        tag: "POLISH",
        text: "A mobile layout pass across The Call and The League, Draft Position tucked into How you're doing, and the two EV bank reads merged into one.",
      },
    ],
  },
  {
    version: "2026-05-22",
    title: "The companion meets the Decision Board",
    summary:
      "The check-in now reacts to your plays, and The Call and the companion read from one board.",
    changes: [
      {
        tag: "ONE DECISION BOARD",
        text: "The Call and the companion read from the same Decision Board. The pick on your hub and the pick Coach cites are always the same call.",
      },
      {
        tag: "PERSPECTIVES, NOT COLUMNS",
        text: "Each candidate reads through several perspectives at once (win-now, balanced, future, and more). The loud ones lead instead of three fixed columns.",
      },
      {
        tag: "PLAYS REACT",
        text: "When a pick advances one of your active plays, the check-in names the play and shows the next partner's survival odds.",
      },
    ],
  },
  {
    version: "2026-05-21",
    title: "The Companion",
    summary:
      "A check-in at the top of your hub that reacts to what actually happened, grounded in real numbers.",
    changes: [
      {
        tag: "THE CHECK-IN",
        text: "Something is waiting when you come back: vindication when a call lands, a bad beat when you were ahead and variance flipped it, a nudge when you left value on the board.",
      },
      {
        tag: "HONEST-FIRST",
        text: "It commiserates only when you were genuinely ahead, and pushes back only when there was a real edge to capture. No manufactured drama.",
      },
      {
        tag: "TALK IT THROUGH",
        text: "Any beat hands off to Coach in one tap, with the thesis and the numbers already loaded for the conversation.",
      },
    ],
  },
  {
    version: "2026-05-20",
    title: "Plays",
    summary:
      "Multi-pick plans became the strategic frame, on the board and into the season.",
    changes: [
      {
        tag: "PLAYS",
        text: "Track, commit to, or dismiss multi-pick plans like QB Stack or Anchor plus Handcuff. Each play shows per-partner survival odds and a real deadline pick.",
      },
      {
        tag: "URGENCY THAT MEANS SOMETHING",
        text: "A play's urgency comes from its most at-risk partner. An 18% anchor reads act-now even when the fallbacks are comfortable.",
      },
      {
        tag: "DISMISS, FORGIVEN",
        text: "One click sends a play to a collapsed list. Bring it back any time, and the engine still flags it when conditions intensify.",
      },
      {
        tag: "FORMAT-AWARE",
        text: "Plays that do not fit your league no longer surface. No TE-premium plays in a league without TE premium.",
      },
      {
        tag: "STRAIGHTER TRADE ADVICE",
        text: "Coach stopped appending a blanket hold-your-picks caution to mid-draft trades where it did not hold up.",
      },
    ],
  },
  {
    version: "2026-05-16",
    title: "Live-draft trades and pre-draft prep",
    summary:
      "Trades worth making right now, plus a prep surface before the draft starts.",
    changes: [
      {
        tag: "TRADE OPPORTUNITIES",
        text: "An active-draft panel surfaces trades worth making now, currency-matched to each opponent and inside a fair value band.",
      },
      {
        tag: "PATH PROJECTOR",
        text: "Before the draft, see how the board could break across your picks and which paths your slot actually supports.",
      },
      {
        tag: "SURVIVAL, HONEST",
        text: "Survival odds compute to your next genuinely contested pick, so a player with rounds of cushion no longer reads as a coin flip.",
      },
      {
        tag: "BUILD FIT IN PLAIN ENGLISH",
        text: "Your roster build reads as FITS, PARTIAL, or NO FIT with plain descriptions, not cohort jargon.",
      },
    ],
  },
  {
    version: "2026-05-12",
    title: "Rankings Lab, doctrine, and a sharper Coach",
    summary:
      "Tune the model to your league, and a Coach that knows every opponent by name.",
    changes: [
      {
        tag: "RANKINGS LAB",
        text: "Eight dials to perturb the model, with the equation, methodology drawers, and a per-row Why panel behind every ranking.",
      },
      {
        tag: "PER-LEAGUE DOCTRINE",
        text: "Set a global doctrine, then override it per league. Your win-now veterans team and your rookie team can play differently.",
      },
      {
        tag: "NAMED OPPONENTS IN COACH",
        text: "Coach sees every opponent's full named roster with values, so which of their RBs should I target gets a real answer.",
      },
      {
        tag: "METHODOLOGY PAGES",
        text: "A methodology landing page with receipts: opponent fingerprints, doctrine readouts, and the inflection scorecard.",
      },
    ],
  },
  {
    version: "2026-05-08",
    title: "The redesign and The Call",
    summary:
      "The hub became one workspace, led by a single decisive call.",
    changes: [
      {
        tag: "THE CALL",
        text: "One pick, one verdict, with the EV number promoted and the reasoning named. Replaces the old multi-panel decision sprawl.",
      },
      {
        tag: "THE EV BANK",
        text: "A cumulative-EV trajectory chart with confidence bands, plus where you rank against the league by banked EV.",
      },
      {
        tag: "STABLE SHAPE, VISIBLE DELTA",
        text: "A since-your-last-visit digest at the top of the hub, change dots on sections that moved, and a heads-up when a planned target got sniped.",
      },
      {
        tag: "EMPIRICAL AGE CURVES",
        text: "Aging curves refit on 2022 to 2025 production, position by position, replacing rounded rules of thumb.",
      },
      {
        tag: "THE LIBRARY",
        text: "Short pieces from inside the model, each starting with a number that should bother you.",
      },
      {
        tag: "ADP YOU CAN VERIFY",
        text: "Every ADP variant shows on tap, so your numbers and the engine's are never different planets.",
      },
    ],
  },
  {
    version: "2026-05-04",
    title: "The EV bank and the model's foundation",
    summary:
      "Per-pick value tracking arrived, and the model got a published, backtested core.",
    changes: [
      {
        tag: "EV BANK, PER PICK",
        text: "Every pick logs the value it banked against ADP, with a running total and a confidence range.",
      },
      {
        tag: "INFLECTION WINDOWS",
        text: "Players facing a make-or-break season surface as a bimodal read with a signal scorecard, not a single rounded projection.",
      },
      {
        tag: "TEAM IDENTITY",
        text: "A this-is-your-team panel with a comparator narrative, so the shape of your roster reads at a glance.",
      },
      {
        tag: "PUBLISHED SCOREBOARD",
        text: "A backtest harness and a public scoreboard put the model's v1 numbers and aging-cliff curves on the record.",
      },
    ],
  },
  {
    version: "2026-04-26",
    title: "SWOT briefings, value plays, and the After-Action Report",
    summary:
      "The analyst voice landed across the hub, and the draft recap shipped.",
    changes: [
      {
        tag: "SWOT BRIEFING",
        text: "A consulting-framework read of your league with three voices per quadrant: statistician, coach, and gambler. They are allowed to disagree.",
      },
      {
        tag: "AFTER-ACTION REPORT",
        text: "A post-draft recap with grades, the steals and swings of the draft, and an email when it is ready.",
      },
      {
        tag: "VALUE PLAYS",
        text: "Value picks across timeline lanes replaced the old position forks, lifting the players the market mispriced.",
      },
      {
        tag: "CANONICAL ROSTER FIT",
        text: "Roster-room math moved to one source, fixing misreads like a backup QB counted as a starter.",
      },
    ],
  },
];

/** The release the ribbon surfaces and the page leads with. */
export const LATEST_RELEASE: Release = RELEASES[0];

export function getAllReleases(): Release[] {
  return RELEASES;
}
