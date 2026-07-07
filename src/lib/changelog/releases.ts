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
    version: "2026-07-07",
    title: "The companion reckons with your week, honestly",
    summary:
      "The check-in no longer goes quiet after the draft. Each week it logs your matchup, then tells you the truth when it resolves: a win it called, a bad beat you did not deserve, and nothing manufactured in between.",
    changes: [
      {
        tag: "IT REMEMBERS THE WEEK",
        text: "Before your games kick off, the companion logs the matchup with a grounded read of whether your roster went in favored, based on your season scoring against your opponent's. No fabricated win probability, just the record. It writes one bet per week, keyed to the week, so it never double-logs.",
      },
      {
        tag: "AND RECKONS WHEN IT RESOLVES",
        text: "Once the week is final, the companion reads the score and reacts honestly. Won a game you were favored in: it calls it. Lost a close one you should have won: a bad beat, named with the margin, with nothing in the call second-guessed. Lost a game you were the underdog in: no beat, because there is no drama to manufacture in an expected result. This is the same honest-first discipline the draft companion uses, now live all season.",
      },
      {
        tag: "NO ALWAYS-ON GUILT TRIP",
        text: "A weekly matchup is not a decision you made, so the companion never critiques you for losing one. It commiserates only when you were genuinely ahead and variance took it, and it celebrates only a result you can own. The reckoning shows up on the hub check-in and hands off to Coach when you want to talk it through.",
      },
    ],
  },
  {
    version: "2026-06-19",
    title: "The board value now runs on the engine, and it tells you when it is leaning on the market",
    summary:
      "Every value you see on the board, on The Call, in trade math, and in Coach now comes through one door: the position rubrics blended with the market price. The number moved only slightly, on purpose, and each read that leans on the market instead of its own signal now says so.",
    changes: [
      {
        tag: "ONE VALUE, ONE DOOR",
        text: "Until now the value on every surface was the raw FantasyCalc market price. It now runs through the engine: the four position rubrics (age, role, situation) blended with that market price as the anchor. The board, The Call candidate cards, trade pricing, and Coach all read the same one number, so they can no longer disagree with each other. The blend is deliberately market-anchored, so most values moved only a point or two; nothing on your board should look unfamiliar.",
      },
      {
        tag: "IT SAYS WHEN IT IS GUESSING",
        text: "When the engine has real signal on a player, it uses it. When it does not, it leans on the market price rather than inventing a number, and now it tells you: a candidate whose read is carried by the market wears a quiet 'leaning on the market' note instead of posing as a confident independent call. Honest-first, the same rule the companion follows. This is the opposite of a black box that always sounds certain.",
      },
      {
        tag: "REVERSIBLE BY DESIGN",
        text: "The whole value pipe is one switch. If a blended value ever looks wrong in the wild, the engine flips back to the exact market price it showed before, to the decimal. That safety net is why the change could ship without risking your board.",
      },
    ],
  },
  {
    version: "2026-05-28",
    title: "Coach knows your taxi squad, and it stops guessing at things it cannot see",
    summary:
      "Coach now reasons about which players belong on your taxi squad versus your active roster, and it refuses to speculate about Sleeper surfaces it has not actually read instead of confidently making something up.",
    changes: [
      {
        tag: "TAXI, THE FOOTBALL QUESTION",
        text: "Coach separates two different questions: is a player taxi-ELIGIBLE by your league rules, and SHOULD he sit on the taxi squad. A rookie whose role is rising or already established is a contributor this year, so Coach keeps him active rather than telling you to stash him. Eligible-but-ascending players steer to your active roster, not the taxi.",
      },
      {
        tag: "NO CONFIDENT GUESSING",
        text: "When Coach has not read a specific Sleeper surface, it now says so plainly instead of fabricating a confident answer. Paired with a fix to how your named roster is built, so Coach reliably has your actual players in front of it. Fewer 'I do not have that' dead ends, and no more made-up specifics.",
      },
    ],
  },
  {
    version: "2026-05-27",
    title: "Plays remember on your account, and they show what you have built",
    summary:
      "Tracked plays now persist to your account so they survive a new browser or a fresh device, and each active play card reads the pieces you have already built off your roster instead of going quiet when no follow-through target is on the board.",
    changes: [
      {
        tag: "TRACKED PLAYS REMEMBER",
        text: "Track a play once and the choice persists on your account: open the league on a different browser or device and the same plays are still tracked, the same suggestions are still dismissed. Anonymous use still works the same way; signing in pushes any plays you tracked anonymously up to your account in one shot. No more clicking Track again every time you open the hub.",
      },
      {
        tag: "BUILT VS MISSING ON EVERY PLAY",
        text: "Active play cards now show what is already on your roster toward the play, with values. A QB Stack you already have the anchor and the same-team WR for reads 'Built: Lamar Jackson (val 85), Mark Andrews (val 60) · covered' with a green covered chip. A Bridge QB with the bridge starter but no young dev yet reads 'Built: Rodgers (val 20) · still need the dev QB' with a partial chip. A QB Hoard with 4 QBs in a 1QB league reads 'Built: Mahomes, Burrow, Herbert, Richardson · three flippable past the one-starter mark.' A build lane shows its lane contributors when the roster fits the lane and the lane's named gap when it does not. The 'no target on the board yet' empty fallback now fires only when nothing is built and nothing is on the board.",
      },
      {
        tag: "SNIPED, WITH A TRADE ANGLE",
        text: "When someone else drafts the named partner on a play you are tracking, the card no longer says 'thin' as if it were still waiting on the board. It says 'sniped' in red, names the manager who holds the piece, and surfaces a trade angle: the holder's thin position and the surplus pieces on your roster that fit it. A handcuff sniped to lincolnenglish reads 'sniped: Pierre Strong (val 18) drafted by lincolnenglish' with the second line 'Trade angle: lincolnenglish is light at WR. Your surplus there: Brandon Aiyuk (val 45).' No fabricated lever: when the holder is full at every position you have surplus at, the angle line stays off.",
      },
    ],
  },
  {
    version: "2026-05-26",
    title:
      "Kill the bare 'EV' label, plus draft capital and rubric reads on rookies",
    summary:
      "The check-in, the share card, the trajectory chart, and the sort column on The Call now read 'Value vs ADP' for what the math actually measures. Rookie cards stop saying 'data missing' for draft capital, and the rubric pipeline now surfaces a projection footer on each rookie-debut card.",
    changes: [
      {
        tag: "VS ADP, NOT EV",
        text: "Every chrome that read 'EV bank' or 'EV banked' now reads 'Value vs ADP' or 'value banked vs ADP'. The check-in's checkpoint reads 'Value vs ADP +N.N, Mth of N.' The share card, the trajectory chart, the sort column on The Call, and the share button match. The math is unchanged. The label now matches what the formula does: measure how much each pick beat the market on timing. The names 'Forward Value' and 'Forward Production' are reserved for surfaces that need data and backtests before they earn them.",
      },
      {
        tag: "ROLE ON THE CALL",
        text: "The standing call and every candidate on the board now carry a one-line role read: last season's snap share and targets per game, with a rising or eroding trend arrow. A second-year player whose snap share climbed shows it; an incoming rookie has no NFL role to show, which is the honest tell that one is proven and the other is a projection. Hover the line for the trend detail.",
      },
      {
        tag: "DRAFT CAPITAL ON ROOKIES",
        text: "Rookie-debut inflection cards now show each rookie's actual NFL overall pick: pick 1 to 15 reads as the high hit-rate tier and argues breakout, Day 3 picks read as the low hit-rate tier and argue caution. The row used to render 'data missing' on every rookie card because no draft-capital source was wired. The signal earned its wiring: a marginal-projection backtest on 626 player-seasons showed draft pick predicts next-year production beyond last year's points (correlation -0.10 overall, -0.40 for players under 25).",
      },
      {
        tag: "MARKET GAPS ON THE CALL",
        text: "Two markets price each player: the draft market (ADP, where consensus picks) and the trade market (overall trade-value rank). When they disagree by 15 picks or more, each candidate on The Call now carries a one-line read of the gap, showing both numbers and which market is earlier. Adonai Mitchell sits at ADP 196 but value rank 242: drafted 46 picks earlier than the trade market ranks him. The framing is neutral, both numbers visible; the user decides whether ADP is overpaying or the trade market is sleeping on him.",
      },
      {
        tag: "RUBRIC PROJECTION ON ROOKIES",
        text: "The parked rubric pipeline now runs live on every rookie on your roster, surfacing a projection footer on the inflection rookie-debut card: point estimate, variance range, confidence, and the top contributions from the evidence stack. When the rubric has too little signal to read for a player, the footer wears a warning-tone caveat instead of pretending to a confident call. The wiring is projection-only and never feeds value scoring; the larger value-scale rubric wiring stays parked until the backtest evidence supports it.",
      },
    ],
  },
  {
    version: "2026-05-25",
    title: "Earned role, and a companion that shows up in-season",
    summary:
      "Aging-cliff cards and Coach now read each player's earned opportunity, and the companion check-in stays with you after the draft.",
    changes: [
      {
        tag: "EARNED OPPORTUNITY",
        text: "Aging WR, TE, and RB cards now show a snap-share-plus-targets signal pulled from last season's box score: a rising role argues the player holds up, an eroding one is the cliff's leading edge. The numbers come from the free stats feed already fetched, so no card waits on data it could have shown.",
      },
      {
        tag: "COACH READS ROLE",
        text: "Coach now carries each of your players' prior-season snap share, targets per game, average depth of target, red-zone targets, and drop rate, and grounds every role claim in them. A young player whose role climbed reads as buy-the-trajectory; a featured name whose role slipped reads as the early warning. Opportunity informs the projection, never overrides market value.",
      },
      {
        tag: "COMPANION IN-SEASON",
        text: "The check-in at the top of the hub used to go quiet once the draft ended. It now leads with where you sit by record, and it remembers the picks you took over the call: while a value race is close it keeps the running story, and once the gap is decisive it tells you the gamble cashed or names the gap you left. Every line traces to a real number, the same honest-first rule the draft companion already follows.",
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
