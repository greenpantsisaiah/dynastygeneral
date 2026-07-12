# Dynasty General · Redesign Intentions (locked)

This file is the canonical record of what we agreed to build during
the UI redesign sprint that began 2026-05-08. It survives compression,
session boundaries, and pull requests.

If a future session is about to make a structural decision, READ THIS
FIRST. If a fix doesn't trace to one of the principles or the IA
spec below, it is drift and should be questioned.

The protocol when this file disagrees with my intent: re-read this
file, ask the founder, do not ship the drift.

## Core principles (locked, numbered)

### 0. MIT-grade statistical floor (NEW principle, locked 2026-05-08)

ADDED 2026-05-08 PM. Per founder direction: "NOTHING we say or do
here should depart from our hard-earned, MIT-grade statistics model."

Every quantitative claim in product chrome carries:
- A defensible source (FantasyCalc, Sleeper variant, KTC, our
  computed EV math, etc.)
- A confidence band / margin of error visible inline by default
  (not behind a toggle)
- Provenance reachable on tap (variant name, sample size, model
  component, methodology link)

Hand-wavy claims do not ship. If we can't cite the source, we don't
publish the number. This is the floor; it sits above every other
principle.

### 1. Bottom-up redesign that reuses what works

Old panels stay only when we choose them for their value. The redesign
is not "pile the old onto a new layout"; it is "rebuild the page
around the activity, keep the components that earn their keep."

### 2. Underlying value: rational + emotional + journey + adaptive

The product is a combination of:
- **Rational just-in-time judgment** at decision moments
- **Emotional ROI** for research, what-ifs, exploration
- **Being there for the journey** (the system thinks WITH the user,
  not at them)
- **Format / stage adaptation** (it never feels generic; pre-draft,
  active draft, mid draft, late draft, post draft, in-season, and
  playoffs each render the right primary surfaces)

### 3. Statistical credibility surfaced, not yelled

We make bold statistical claims. Those claims need to show up with
credibility-style numbers, charts, and commentary, in the spirit of
FiveThirtyEight (the Messi article). The Library is the on-demand
explainer layer; users find it when relevant rather than getting
yelled at on the UI.

Every quantitative claim in product chrome must have provenance
reachable on tap (variant name, source, methodology link).

### 4. UX information architecture matches user activity

Logical groupings, clear sections, matched tone per activity.

### 5. Casual user feels easy, elevating, like a genius

Default surface is plainspoken. Numbers come with units. Color used
sparingly. The user's first 1.5 seconds on any surface land them on
the answer, not on a metric they have to interpret.

### 6. Sloan-level always on (UPDATED 2026-05-08)

UPDATED 2026-05-08 PM per founder direction: "Let's drop the sloan
toggle and sloan it all for now, then decide to show it later or
not."

Sloan-level rigor is now the default state of the entire UI. CIs
appear inline next to every number. Methodology citations sit one
tap away. Signal scorecards are visible (not hidden behind a
toggle). The toggle is dropped; we revisit later whether to add a
"casual lite" mode that hides some of this for a less-rigorous
reader.

Voice A is still the default register (plainspoken, decisive); the
density of the math is what changes when "Sloan-on" was previously
toggled. That density is now permanent.

Numbers always carry their CI in parentheses by default:
- "+8.4 EV (+3 to +14)" not "+8.4 EV"
- "21% survives (CI 14-29%)" not "21% survives"
- "value 39 (range 35-43)" not "value 39"
- "rank 1 of 12 (top 8% CI)" not "rank 1 of 12"

### 7. Knows the question emotionally + cognitively

Every surface and every Coach response answers the literal cognitive
question AND names the underlying emotional / strategic question
underneath. "Should I trade for X?" carries the underlying "do I
have enough now?" The product surfaces both.

### 8. The Value vs ADP row, second from the top (renamed 2026-05-26)

The 3-box row second-from-the-top of the hub is still locked. Its
labels are updated to honest names. See `FORWARD_EV_PLAN.md` for the
full naming dictionary; the bare word "EV" is retired from chrome.

- **Box 1: Your Value vs ADP.** Today's per-pick bars + total +
  confidence band. Measures draft-timing arbitrage:
  `(value / 100) * (pickNo - adp)` summed across your picks.
- **Box 2: League value vs ADP by team.** Per-team summary bars
  (mine highlighted). Click a team to open a modal showing their
  per-pick bars in the same shape as Box 1.
- **Box 3: The in-season surface (target shape, not shipped).**
  Originally framed as "upcoming events that recalculate EV." Under
  the 2026-05-26 plan, this becomes the Forward Production surface:
  per-week banked vs market-projected production, rolled up across
  the roster, with upcoming events that move the projection
  (training camp landing, weekly post-game recalc, injury news,
  bye-week effects). It is gated on the Stage 3 build in
  `FORWARD_EV_PLAN.md`; until then, Box 3 stays dark in-season.

The range envelope (confidence band) renders for every number in
every box.

Founder vocabulary rule (locked 2026-05-26 after the "EV is fluff"
epiphany): Box 1 and Box 2 use "Value vs ADP" or "vsADP" wherever
their old "EV bank" / "EV banked" labels lived. New surfaces that
project forward production label themselves "Forward Production."
"Forward Value" remains reserved and data-gated. The bare word "EV"
does not appear in chrome.

### 9. Cool conversations + screenshots

The product is designed for sharing. Comparator narratives, value
vs ADP ranks, decisive locks, opponent reads each render as
screenshot-optimized artifacts with unobtrusive `dynastygeneral.app` footnote
branding. We are the primary source.

### 10. Tufte: scan, focus, consume

Layer 1 = headline (number + verdict). Layer 2 = chart + 2-3
sentences. Layer 3 = provenance + math + methodology. Default view
is layer 1; tap reveals layer 2; cmd-tap reveals layer 3. The user
is never overwhelmed.

### 11. Stable shape, variable content, visible delta

The hub is a workspace, not a magazine. The user returns again and
again; the changing information must be findable in 1.5 seconds
without re-reading the story. Box-score muscle memory: layout
stable, numbers variable, deltas marked.

Implementation pieces:
- Per-league last-visit fingerprint cookie (shipped, write side)
- "Since [time]: ..." digest line at top of hub (data shipped,
  rendering MISSING)
- Per-section change dots when the underlying data has moved
  (rendering MISSING)
- Plan-disruption acknowledgment when a planned target gets sniped
  (data shipped, rendering MISSING)
- Within-surface delta marks (rendering MISSING)

### 12. Plays are the cornerstone strategic frame (NEW principle, locked 2026-05-20)

ADDED 2026-05-20. Per founder direction reviewing the "Your active
plays" surface (commit d698d0d): "I think this surface finally nails
the lanes concept so I'd like to see what happens if this surface
becomes the cornerstone."

Plays are the strategic frame the engine and user share across the
draft AND in-season. Every multi-pick or multi-week plan is a Play.
A play has a thesis ("Genius IF X, Otherwise Y"), named partners
with per-partner survival math, a follow-through, and a state.

Plays survive the season. A draft-phase play morphs into its
in-season variant rather than dying. QB Stack (draft) becomes QB
Flip Window (week 8-12). Anchor + Handcuff (draft) becomes Handcuff
Watch + FA Priority (week 1+). 2027 1st Sniping is in-season-only;
Multi-Handcuff Lottery spans both.

A play does not require commitment to be ACTIVE. The engine
auto-detects when conditions are met (4 QBs in a 1QB league means
QB Hoard is auto-active) and surfaces governance without forcing a
checkbox.

The plays panel has NO noise cap. Multi-play tracking is the norm
during a season. The user commits to some, tracks many, dismisses
few.

Dismissed plays are forgiven. One click to dismiss; dismissed plays
go to a collapsed section and can be un-dismissed in one click.
Dismissed plays still receive engine updates: when conditions
intensify, the dismissed card surfaces a small "Engine sees this
again. Un-dismiss?" chip rather than auto-resurfacing.

Per-partner survival math is canonical. Each partner card shows
`survivalPctFor` to the user's next pick with CI, NOT a generic
"next 4 picks" window. The play's overall urgency comes from the
urgent EV-weighted partner: an 18% anchor with 70% fallbacks
renders `act_now`; all-70%+ partners renders `no_rush`. This is
what reflects "Tank Bigsby goes in two picks" being different from
"Jalen McMillan is in zero danger."

Format gates are declarative. Every play type declares which
`format_rules` fields enable / disable it
(`forbid_te_premium: true` suppresses TE-Premium Double-Up in
non-TEP leagues, etc.). The engine MUST NOT emit a play whose
format gates are unsatisfied.

Best Value collapses into the Standing Call. The standing call IS
the best-EV available with format-aware suppressions and
play-aware lift. When the standing call IS the best-EV available,
the card carries a `Best EV available` badge. When the engine
suppresses or lifts away (TE suppressed in non-TEP, saturation,
active-play lift), the standing call shows a transparency line
("Best raw EV: X (+N). Standing call diverges because Y") with
tap-to-elevate to override the suppression.

Play activation badges replace The Call's lanes mini-section.
Every candidate in The Call (standing call + alternatives) carries
badges where applicable: `Activates: QB Hoard` (suggested flips to
auto-active), `Advances: Lamar + BAL Stack (Andrews +6 EV)` (named
partner in a tracked / committed play), `Breaks: WR Stable (-4 EV)`
(undermines an active play). Badges are the bridge from the moment
(the pick) to the future (the plays panel).

### 13. Companionship is the emotional ROI loop (NEW principle, locked 2026-05-21)

ADDED 2026-05-21. Per founder direction: in long multi-day
dynasty drafts and across the season, the user comes back "kind
of hoping for some thoughts," the way you would banter with a
friend who asked "how is it going." Fantasy is a solo sport, like
poker. The companionship a poker rail provides is not praise. It
is honest shared stakes plus memory plus presence. "Bad beat"
lands because the rail watched you get your money in good. "You
were out of position there" lands because the rail respects you
enough to say it. "Folded, just like we called it" lands because
there was a real call.

The companion is the existing intelligence analyst gaining three
capabilities, NOT a new gushy persona:
1. Memory of what it expected (the expectation ledger).
2. Reaction to what actually happened (the reconciliation pass).
3. Something waiting when the user checks in (the push check-in
   surface).

The loop is Nir Eyal's Hooked cycle, run honestly:
- Trigger (internal): boredom, the solo-hobby loneliness. The
  user checks in.
- Action: one glance at the check-in surface.
- Variable reward: the grounded beat waiting. The variability is
  the SPORT'S (football is genuinely unpredictable), never a
  manufactured slot machine.
- Investment: the user co-authors expectations, reacts to beats,
  names bets. Each investment loads the next trigger and
  personalizes the next reward. Over a season the ledger compounds
  into a shared history.

Eyal's Manipulation Matrix is the ethics test: the founder would
use it (yes, it is the origin) and it materially improves the
user's experience of a solo hobby (yes). That is the Facilitator
quadrant. The one rule that keeps it there: every beat traces to a
real computed signal. Same discipline as Principle 0 (the
MIT-grade statistical floor) and the no-hardcoded-numbers
invariant, applied to emotion. No fabricated drama, no manufactured
urgency, no engagement bait.

Honest-first calibration. The companion commiserates only when it
was genuinely a bad beat (the user was ahead in expectation and
lost to variance), and critiques only when there was a real EV gap
the user could have captured. Always-commiserate is the rejected
arm-candy. Always-critique is exhausting. The classifier earns
trust by getting that call right, and it can, because it holds the
expectation at decision time.

Surface: a PUSH check-in (something waiting when you arrive) at the
top of the hub, distinct from Coach (PULL). It hands off to Coach
for any beat the user wants to talk through. See the "Companion
panel" section below for the canonical data shape and beat catalog.

Voice: scoped "we" exception. The companion may use "we" inside
grounded shared-stakes beats ("we called it," "we were a 78%
favorite at kickoff"). This is a deliberate, bounded carve-out from
BRAND_VOICE hard rule 4, valid ONLY in companion beats that carry a
real source provenance, never in general product chrome. The "we"
is the analyst-plus-general rail; it earns the word only when there
was a real shared call.

## Voice (locked)

### Voice A: default brand
Plainspoken, decisive, evidence-cited, sophisticated. Reader is a
sharp adult who came for a verdict. The voice does not perform.

### Voice B: Sloan-mode register
Drier, more clinical, same data. Confidence intervals stated inline,
model provenance cited explicitly. Used only when toggle is on.

### Voice C: REJECTED
"Quiet part out loud," "here's the thing nobody says," buckle-up
energy. AI-coded and dated. Do not write this voice anywhere, ever,
even in marketing.

### Hard rules (both registers)

1. **No em dashes anywhere.** Enforced by PreToolUse hook + check:em-dashes script. Enforced in markdown, code, copy, every voice.
2. **No hedging openers.** "It depends" / "There are several factors" / "Honestly" / "Look" / "Buckle up." When uncertain, name the specific uncertainty (a range, a probability, a missing fact).
3. **Numbers always have units and reachable provenance.**
4. **No second-person plural "we" for the model.** System is "the engine" / "Dynasty General." "We" is the user + founder. Scoped exception: the Companion register (Principle 13) may use "we" inside grounded beats; see BRAND_VOICE.md.
5. **No exclamation points in product chrome.** Decisive, not enthusiastic.
6. **Headlines lead with the number.** "+12.3 EV pts banked" before "You are doing well."
7. **Acknowledge the unknown by name.** Specific uncertainty beats generic "uncertain at this stage."

See `BRAND_VOICE.md` for fuller microcopy + longform shape guidance.

## Information architecture: the dashboard hub

The hub is a single page with collapsible sections (NOT separate
routes; that pivot was wrong, rolled back 2026-05-08). Each section
mirrors the Coach panel's chrome: small mono uppercase label +
larger title + tagline + collapse toggle.

The route split (`/team`, `/intel`) was rolled back. The Library
catalog at `/library` stays as a separate browse-and-share
destination. Other routes (`/pick`, `/trade`, `/strategy`, `/coach`)
keep their existing focused content for users who deep-link.

### Stage-adaptive section ordering

Section order and default open / collapsed varies by stage. The
selection lives in the hub render and uses
`selectSurfaceLayout` for the data primitive.

| Stage | Lead surface | Open by default |
|---|---|---|
| Pre-draft | Pre-draft prep (emphasized) | Pre-draft prep, Your team, The league |
| Active drafting | The Call | The Call, How you're doing |
| Late draft | Track Record + The Field | How you're doing, The league |
| Post-draft | The League (emphasized; trade leverage IS the activity) | How you're doing, Your team, The league |
| In-season | The Field | The league, Your team |
| Playoffs | Your team (ContenderOutlook) | Your team, The league |

### Section inventory (locked)

1. **Pre-draft prep** (pre-draft only)
   - Team Identity preview, Library articles for prep
2. **The Call** (active draft only; single-pick verdict)
   - Disclaimer band when present
   - Standing call hero with EV number, plus `Best EV available`
     badge when the standing call IS the best-EV pick on the board,
     OR a transparency line ("Best raw EV: X (+N). Standing call
     diverges because Y") with tap-to-elevate when the engine has
     suppressed or lifted away from raw best-EV
   - Opponent gap line
   - Scarcity callout when present
   - Counter view when present
   - Candidate badges: each candidate (standing call + near-call
     alternatives) carries `Activates` / `Advances` / `Breaks` chips
     linking to plays
   - RETIRED 2026-05-20: Lanes mini-section, Why landscape, Next
     picks plan. The strategic frame lives in Plays (section 3).
3. **Plays** (active draft + in-season cornerstone; new 2026-05-20)
   - State sections in priority order: Committed → Auto-active →
     Tracking → Suggested → Dismissed (collapsed) → Recently
     achieved / dead (collapsed history)
   - Each play card: type badge + anchor + Genius IF / Otherwise
     thesis + per-partner survival math (canonical `survivalPctFor`
     with CI) + follow-through with deadline pick number + state
     chip + urgency chip + one-click dismiss
   - No noise cap. Multi-play tracking is the norm.
   - In-season variant morphs draft plays into week-window plays
     (QB Flip Window week 8-12, Handcuff Watch + FA Priority week
     1+, 2027 1st Sniping week 6+, Buy-the-Dip rolling,
     Multi-Handcuff Lottery spans both)
4. **How you're doing** (during + post-draft)
   - DraftProgressPanel: position diagnostic + watch the board +
     league rank + sharp positioning + wins/gaps
   - RETIRED 2026-05-20: best value chip in this panel. The
     standing call carries the `Best EV available` badge now;
     divergence cases render the transparency line on the call.
   - EV bank section INSIDE DraftProgressPanel: per-pick bars + total
     + range + collapsible "see how the league stands" expander
   - WindowsBar (next to EV bank per founder direction 2026-05-08)
5. **Your team** (always)
   - Team Identity (build, comparator, risk, lineup talent)
   - Inflection panel (player-relevant variance windows)
   - Contender outlook
6. **The league** (default-open varies by stage)
   - TradeStrategyPanel
   - OpponentCharacterizations
   - SamePathThreatsCard
   - LeagueOutlook + SwotCard + LeagueDivergence + LeagueTable
7. **Intel** (collapsed by default)
   - Library teaser
   - Briefing feed
8. **Coach** (sticky right column, unchanged)

### Components retired (do not bring back without revisiting the spec)

- StrategicForks: covered by The Call's lanes (until 2026-05-20);
  now covered by Plays.
- Strategic Lanes mini-section inside The Call: RETIRED 2026-05-20
  in favor of Plays-as-cornerstone (Principle 12). The "Your active
  plays" surface (commit d698d0d) finally landed the multi-pick
  reasoning Strategic Lanes was reaching for, with named partners,
  per-partner survival math, commitment memory, format gates, and
  in-season lifecycle. Per-candidate `Activates` / `Advances` /
  `Breaks` badges in The Call link to the dedicated Plays panel; the
  lanes mini-section no longer renders on the hub.
- Best Value (as a separate widget in DraftProgressPanel): RETIRED
  2026-05-20. The standing call carries `Best EV available` badging;
  divergence cases render an inline transparency line on the call
  with tap-to-elevate.
- TierMap: covered by The Call's candidate context.
- DecisionQuadrant: parked at `the-call/decision-quadrant.tsx`,
  reserved for a future `/pick` deep-dive page where it can live
  with a real interpretation headline. NOT rendered on the hub.
- PlaysFromHere, LiveStrategyBoard, DraftJournal: deprecated.

## What's shipped vs. drifted vs. missing (audit, last updated 2026-05-15)

### Shipped + working
- Voice A locked + BRAND_VOICE.md
- Last-visit fingerprint write-side (cookie) + read-side digest
  rendering (`LastVisitDigest` at the top of the hub)
- Plan-disruption acknowledgment (rendered inside `LastVisitDigest`
  when a planned target was sniped between visits)
- EV bank at-a-glance "where do I rank" read (Principle 8) lives in
  the companion "Checkpoint" milestone beat at the top of the hub
  ("EV bank +10.8, 1st of 12", percentile in provenance). The
  standalone `EvBankPercentileChip` that previously carried this read
  was RETIRED 2026-05-23 as a duplicate (see Retired section)
- Companion in-season loop wired (Principle 13, 2026-05-25). The
  check-in is no longer draft-only: a record-based standing milestone
  (`classifySeasonStandingBeat` over `calcStanding`) keeps it alive
  post-draft for any league; the expectation ledger is now read AND
  written from the hub (open bets surface as non-destructive `callback`
  running-story beats; a decisive value separation reconciles into
  vindication / critique and persists; a divergent pick is logged as a
  bet). Migration 0016 adds `alternative_player_id` for the head-to-head
- Stage-adaptation function (`selectSurfaceLayout`)
- Comparator team narrative rendered inline in Team Identity panel
  (`team-identity-panel.tsx`)
- League EV bank data layer (`analyzeLeagueEvBank`)
- What-if counterfactual data layer (`computeWhatIfReadout`)
- Plan-disruption detection (data layer)
- Library route + 3 inaugural articles in Voice A
- Counterintuitive disclaimers (sharp lock + value-side)
- "What the user is really asking" Coach rule
- "When the standing call feels unconventional, name it" Coach rule
- "When citing ADP, always name the variant + cross-reference" Coach
  rule
- ADP variants surfaced on candidate cards (tap-to-reveal)
- The Call component (standing call hero with promoted EV number,
  lanes, disclaimer, opponent gap line, what-if delta inline,
  footer with dynastygeneral.app footnote)
- Coach payload self-consistency (Swift fix)
- Coach context: league_read, inflections, opponent_trade_history,
  opponent_notes, opponents[i].roster (named) plumbed
- Counterparty-stated-plans schema (migration 0012, API route,
  storage helpers)
- Dashboard sections: Pre-draft prep, How you're doing, Your team,
  The league, Intel
- DraftProgressPanel.EvBankSection with collapsible league
  comparison expander
- BriefingFeed restored to Intel section
- LeagueOutlook + SwotCard + LeagueDivergence + LeagueTable +
  OpponentCharacterizations + SamePathThreatsCard restored to
  The League section
- Rankings Lab: 7 wired dials + global vs. per-league override
  routing with inline "Saving to: ..." indicator and per-dial
  "Global: +N" annotation
- League doctrines override cascade (migration 0013) +
  resolveEffectiveDials canonical resolver consumed by both /rankings
  and Coach
- Per-section change dots (Principle 11): `DashboardSection` carries
  `hasChanges` + `changeHint`; "How you're doing", "Your team", and
  "The league" all light up when their underlying data moved since
  last visit, with hover hint naming the change
- Per-row "Why" panel on /rankings + standing-call dial-influence
  chip on The Call. `computeWhyBreakdown` is the canonical helper;
  the chip carries a "See full breakdown →" deep link that lands on
  the expanded /rankings row via `?player=X`. Echoes the inflection
  panel's signal-scorecard register
- Within-surface delta marks: `PositionCard` shows "+N since last
  visit" when a position count moved; `MetricCard` shows "↑N since
  last visit" on league rank when it changed. Cookie fingerprint
  carries `my_position_counts` + `my_league_rank` (optional fields,
  older cookies degrade gracefully)
- EV bank rank screenshot artifact: `/share/ev-bank` shareable page
  with proper OpenGraph + a sibling `opengraph-image.tsx` that
  renders a 1200×630 PNG. Share button on the EV bank section
  uses Web Share API with clipboard fallback. Stateless: card data
  lives in the URL's query string. Every shared image carries the
  dynastygeneral.app footnote
- EV bank prominence inside DraftProgressPanel: hoisted to lead the
  panel above position_diagnostic so the user reads the headline
  number first
- Public standings table tier labels: switched to relative rank
  tiers (`tierForLeagueRank`) so compressed leagues no longer
  label 9 of 10 rosters "Contender". Both the in-app and public
  surfaces consume the same canonical labeler

### Retired (was listed; intentionally removed)
- **`EvBankPercentileChip` (standalone top-of-hub chip).** Retired
  2026-05-23. The companion "Checkpoint" milestone beat (Principle
  13, shipped 2026-05-21) leads the hub with the same EV bank
  rank-of-N read ("EV bank +10.8, 1st of 12", percentile carried in
  provenance), and it fires under the identical condition the chip
  did (`my_rank != null && ranked_count >= 2`). Two surfaces stating
  "EV bank +10.8, 1 of 12" within one screen was the duplicate the
  founder flagged. The at-a-glance read survives in the companion
  beat; the deep per-pick EV bank survives in
  `DraftProgressPanel.EvBankSection`. The component file was deleted.
  Do not re-add a standalone EV bank chip at the top without first
  resolving the overlap with the companion checkpoint beat.
- **Sloan-mode register switch.** Retired 2026-05-12 in favor of
  always-on Sloan density. The toggle + cookie + register switch
  on The Call + Coach register fork were deleted. Any future
  "casual lite" mode is a fresh decision, not a revival.
- **Binary starter-gap "hold pick equity" guardrail.** Retired
  2026-05-20 after dynasty-canon-keeper DEBUNK and dynasty-
  assumption-auditor verdicts both ruled the prior implementation
  INDEFENSIBLE. The check (any position below starter_max fires a
  prescriptive "don't trade picks" sentence) was severity-blind,
  round-blind, and trade-shape-blind. It fired for nearly every
  roster in early/mid draft and contradicted the EV-arbitrage
  thesis of Principle 8. Research grounding: Massey-Thaler 2013
  ("The Loser's Curse," Mgmt Sci 59(7)) puts pick value on a
  steeply convex curve, so equity at round 9+ is near-zero; KTC
  FAQ documents repricing latency in days, not multi-round panic
  windows; Stuart (Football Perspective) AV-based draft chart
  confirms the convex decay. The structural_constraints object is
  now DATA (positions_unfilled, starter_gap_by_position,
  total_starter_gap, picks_remaining, unrecoverable_severity,
  early_round_pick_equity, is_active). The Coach system prompt
  reads the structured fields and fires the cautious read ONLY
  when (unrecoverable_severity AND early_round_pick_equity AND a
  real gap) all hold. Do not reintroduce a binary prescriptive
  guardrail without explicit founder go-ahead.

### Drifted from the principle (genuinely open, ranked by leverage)

- **Principle 11 within-surface delta marks.** Not implemented.
  Small "+2" / "▲" markers next to numbers that moved (position
  counts, league rank, EV bank total, opponent position rooms).
  Requires a per-number diff source; cookie fingerprint covers
  total picks + standing call + EV bank but not position counts
  or league rank deltas. Either widen the fingerprint or render
  only the deltas the cookie already supports.
- **Principle 7 visual rendering of underlying question.** Coach
  system-prompt rule shipped; UI surface (a small "underneath: ..."
  line above the answer in Coach replies) not implemented.
- **Principle 9 EV bank rank screenshot artifact.** No dedicated
  shareable card / OG-image generator for a "3rd of 12 in EV
  banked" moment. Would touch the OG-image route plus a client
  share button on the EV bank section.
- **Principle 3 statistical-claims chart on the hub.** No hub-
  visible chart that surfaces a bold methodology claim with
  annotated provenance. The Library has the long-form articles;
  the HUB has nothing that says "here's the claim, here's the
  chart that proves it." Candidate claims: age curves, bellcow
  workload bimodality, KTC-vs-FantasyCalc divergence.

### Parked (not built; reserved for future)

- `/pick` deep-dive route with Decision Quadrant + interpretation
  headline
- Player-trade history (via `getTransactions` per-week) for the
  opponent dossier
- Counterparty-stated-plans UI control (the schema is shipped; no
  client UI to add notes from inside the product)
- "Argue with the mixer" / Soundboard adversarial feedback
  (parked until engine wiring lands)
- Player-trade visual breakdown by position

### Specific founder feedback log (chronological)

| Date | Feedback | Resolution |
|---|---|---|
| 2026-05-08 | "Lean" doesn't make sense intuitively | Renamed to "the call" everywhere |
| 2026-05-08 | Decision Quadrant tells me nothing | Stripped from hub; parked at the-call/decision-quadrant.tsx for future /pick deep-dive |
| 2026-05-08 | Page is too long, weather-page metaphor | First built triage + route splits (WRONG); rolled back to dashboard with collapsible sections |
| 2026-05-08 | Windows belongs near EV bank | WindowsBar renders inside "How you're doing" next to DraftProgressPanel |
| 2026-05-08 | Want full league EV with confidence bands | Built standalone widget (REDUNDANT); merged into DraftProgressPanel.EvBankSection as collapsible expander |
| 2026-05-08 | "Hear me out" is Voice C drift | Killed; disclaimer band now renders just the body text |
| 2026-05-08 | Engine rule chip ("FILL STARTER URGENT") leaks vocab | Hidden |
| 2026-05-08 | EV number too small | Promoted to 24px adjacent to player name on standing-call hero |
| 2026-05-08 | "Build" line is jargon | Dropped from The Call's Bridge |
| 2026-05-08 | Counterintuitive value (Tyson 47 picks past ADP) needs language | New disclaimer trigger when standing call has fallen 15+ picks past ADP |
| 2026-05-08 | "Your ADP and the ADP I'm used to seeing are different planets" | Surface every ADP variant on candidate cards via tap-to-reveal; Coach context includes adp_alternatives; system_prompt rule mandates variant + cross-reference |
| 2026-05-08 | Forgot a ton of stuff in the rebuild | Brought back OpponentCharacterizations + SamePathThreatsCard + LeagueOutlook + SwotCard + LeagueDivergence + LeagueTable + BriefingFeed |
| 2026-05-08 | Lanes is still here / can't locate EV | Partially resolved: EvBankPercentileChip at top of hub gives at-a-glance read; inside DraftProgressPanel the bank still renders after position_diagnostic (open) |
| 2026-05-15 | "Bring up the parked items"; audit was stale | Audit refresh sweep: confirmed LastVisitDigest, plan-disruption ack, EV percentile chip, comparator narrative all shipped; Sloan-mode toggle moved to retired bucket; genuinely-open work ranked by leverage |
| 2026-05-15 | "I can't even locate EV on the page" | Hoisted EvBankSection to lead DraftProgressPanel, directly after the headline. Position diagnostic + rest now follow as supporting cast |
| 2026-05-20 | "Your active plays" finally nails lanes; "next 4 picks" is data-blind; no harmony with broader strategies | Plays-as-cornerstone spec amendment (Principle 12). Per-partner survival math via canonical `survivalPctFor`. In-season lifecycle (QB Flip Window, Handcuff Watch, 2027 1st Sniping, Buy-the-Dip, Multi-Handcuff Lottery). Declarative format gates per play type. Strategic Lanes retired in favor of Plays. Best Value collapsed into standing call (badge or transparency line). Candidate badges (`Activates` / `Advances` / `Breaks`) replace The Call's lanes mini-section. Coach gets `active_plays` context + hard rule. New states: `auto_active`, `dismissed` (forgiven). No noise cap. |
| 2026-05-21 | "I come back to the page hoping for thoughts, like bantering with a friend; fantasy is a solo sport like poker; deliver companionship (bad beat / out-of-position / called-it) without being slimy, across pre-draft, dynasty draft, in-season, and fast redraft" | Companion / emotional-ROI loop (Principle 13). Grounded beat taxonomy (vindication, bad beat, critique, debate, anticipation, callback, milestone) via a deterministic classifier over existing canonicals plus an expectation ledger. Push check-in surface at the top of the hub + Coach handoff for the debate. Scoped 'we' brand exception. Honest-first calibration (commiserate only when genuinely ahead; critique only on a real EV gap). Anti-slime guarantees locked as invariants. Stage-adaptive cadence. |
| 2026-05-23 | "Draft Position section I continuously scroll past, put it much further down in one of the sections; two EV bank things should be merged" | During an active draft the `DraftPositionBanner` moved from the top of the hub into the "How you're doing" section, below `DraftProgressPanel` (slot schedule + traded picks read as reference, not the headline). Pre-draft keeps it as the lead hero (intended pre-draft surface; "How you're doing" does not render then). EV bank merge: the standalone `EvBankPercentileChip` was retired because the companion "Checkpoint" beat already states the same EV bank rank-of-N at the top; deep per-pick EV bank stays in `DraftProgressPanel`. |
| 2026-05-23 | "All the 'data missing' words on the inflection scorecard make me think it's a bug, not genuine info" | Half right. The data IS genuinely absent (v1 pipeline lacks usage data; 4 of 5 RB signals, 3 of 3 QB signals are structurally blind on the live hub), but the presentation had two real bugs. (1) A blind row still wore its intrinsic `[VALIDATED]`/`[PARTIAL]` trust badge next to "data missing", a self-contradiction that disagreed with the header summary (which already excluded blind rows from the validated count). Fix: a `data_missing` row now shows one `[data missing]` badge and drops the redundant arrow; badges and summary agree. (2) A 64/36 split built from one live signal read as evidence-backed. Fix: engine-derived `evidence_basis` (`prior_driven`/`mixed`/`evidence_backed`) + `calibration_note` on `confidence_summary`; the panel renders a warning-tone "Mostly prior-driven: 1 of 5 signals live, base-rate lean, not yet evidence-backed" caveat when the read leans on the prior. Computation in `inflection/resolve.ts`, render in `inflection-panel.tsx`, locked by `evals/inflection.test.ts`. Note flows to Coach automatically (context passes the full resolution). Founder chose badge + honest framing over suppression or plumbing the v2 data. |
| 2026-05-23 | "I picked Elijah because it was the call, then I felt chided for it. Additionally, no idea who 13320 is." | Debate beat was reconstructed from the last-visit cookie's `standing_call_id` (the call at the user's last render, here 12h / 9 picks stale) compared against the user's most-recent pick, so it chided a user who took the live call. The undrafted standing call also leaked its raw Sleeper id ("13320") into the headline + Coach seed because the name lookup (`playersMap`) covered only rostered + drafted players. Fix: new canonical `reconstructPickDebate` (`companion/debate.ts`) gates the beat honest-first: anchor to the FIRST post-visit pick, require freshness (`COMPANION_DEBATE_FRESH_PICKS`) + corroboration by the current Decision Board candidates, and resolve both names through a pool-aware lookup or suppress. This lands follow-up item 2 of the "Companion <-> Plays/Call integration" plan (re-point the debate beat at the new Decision Board). `classifyDebateBeat` carries a raw-id backstop. Locked by `evals/companion.test.ts`. |
| 2026-05-25 | "I'm having trouble detecting evidence of the Companionship work in-season" (screenshot was a post-draft hub, no companion beat visible) | Diagnosis: the companion code shipped and renders at the top of the hub, but it returns null when no beat fires, and every wired beat was draft-gated. The one stage-agnostic beat (milestone) was fed by `analyzeLeagueEvBank`, which is built from `draft.picks_made` (empty in-season), so it suppressed. The expectation ledger (the signature vindication / bad-beat / critique loop) was built but never read OR written from the app. Fix (wire the in-season loop): (1) `classifySeasonStandingBeat` over `calcStanding` gives a grounded in-season milestone so the check-in is never empty post-draft, for any league, with no ledger history needed; (2) the hub now reads the ledger and surfaces OPEN bets as non-destructive `callback` running-story beats (`classifyCallbackBeats`, current value via the FantasyCalc map); (3) `buildPickResolutions` + `reconcileExpectations` + `persistResolved` resolve a bet only on a decisive value separation, firing vindication / critique; (4) the write side logs a divergent pick (`expectationFromPickDeviation` + `upsertExpectation`, idempotent, RLS-scoped). Migration 0016 adds `alternative_player_id` for the head-to-head. Locked by `evals/companion.test.ts`. |

## Strategic Lanes (RETIRED 2026-05-20, see Plays panel below)

RETIRED 2026-05-20 in favor of Plays-as-cornerstone (Principle 12).
The "Your active plays" surface (commit d698d0d) finally lands the
multi-pick reasoning Strategic Lanes was reaching for, with named
partners + per-partner survival math + commitment memory + format
gates + in-season lifecycle. See the "Plays panel" section below
for the canonical spec.

The historical Strategic Lanes spec is preserved below for
compression survival and as a record of intent. The lane card
chrome (mini path diagram + sparkline + horizon meter + EV chips +
hover detail) is preserved inside the Plays panel's play-card
chrome.

---

UPDATED 2026-05-08 PM per founder direction: "I preferred some
earlier panels that had 3 picks if going this way, that way, the
other way. Really helped me think." The drift was that The Call
became "THE ONE PICK" with alternatives in lanes; the user wants
multiple paths shown side-by-side as first-class options.

Strategic Lanes mixes timeline horizon AND archetype paths in a
format-aware way:

**Dynasty leagues** (max_keepers >= 5 OR is_dynasty):
- Time horizon (Win-Now / Balanced / Future) is huge because
  keeper math compounds forever.
- 3 lanes, each is a (horizon × archetype) pairing.
- Examples: "Win-Now via QB Cartel" / "Balanced via Zero-RB
  Recovery" / "Future via WR Stable."

**Redraft + low-keeper** (max_keepers <= 4):
- Time horizon mostly collapses to Win-Now (everyone is
  win-now).
- 3 lanes are archetype-primary.
- Examples: "Anchor RB" / "Zero-RB" / "WR Stable."

**Late-draft (round 10+)** during ANY format:
- TierMap takes over from Strategic Lanes as the lead surface.
- Tier ladder per position with drops named.
- See visualization map below.

Each lane card carries:
- Header: archetype name + drift % (engine's read of how committed
  user's roster is to this path) + horizon tag
- Mini path diagram: 3 picks shown as connected nodes; each node
  is candidate name + EV chip with CI
- Lane sparkline: cumulative EV trajectory if user follows path
- Horizon meter: stacked bar showing now-value vs future-value
- "Why this path" one line of prose
- One lane carries "THE CALL" badge for the engine's overall lean
- Hover any node: full candidate detail (ADP variant, value with
  range, survival CI)

Color: archetype-tinted hue per lane.

EV and Future-Trade Stock surface as chips inside each lane, not as
separate lanes themselves.

## Plays panel (THE strategic frame, cornerstone locked 2026-05-20)

The plays panel is the cornerstone strategic frame (Principle 12).
Every multi-pick or multi-week plan is a Play. Plays survive the
draft → in-season transition with lifecycle variants.

### Play state model

```ts
type PlayState =
  | "suggested"     // engine sees the opening; user has not opted in
  | "tracking"      // user said "watch this" without committing
  | "auto_active"   // engine detects conditions met without explicit commit
  | "committed"     // user explicitly chose to govern decisions by this
  | "dismissed"     // user dismissed; forgiven, one-click un-dismiss
  | "achieved"      // anchor + 50%+ partners locked in
  | "dead"          // anchor or critical partner unreachable AND window expired
  | "morphed";      // transitioned across stage (draft → in-season)

type Urgency = "act_now" | "this_round" | "two_round_cushion" | "no_rush";
```

State transitions:
- Engine sees a play type matching roster signals → `suggested`
- User clicks "track" → `tracking`
- User clicks "commit" → `committed`
- Conditions met without commit (e.g., `position_count.QB ≥ starter
  + 2` in 1QB format) → `auto_active`
- User clicks "dismiss" from any state → `dismissed`
- User clicks "un-dismiss" → re-enters appropriate prior state
- Anchor + 50%+ partners locked in → `achieved`
- Anchor unreachable OR critical partner unreachable AND window
  expired → `dead`
- Stage transition (draft → in-season) → `morphed`; display the
  variant, preserve prior form in history

### Per-partner survival math (canonical)

Each partner card consumes `survivalPctFor` (the canonical from
`decision-synthesis/synthesize.ts`) to the user's next pick by
default, with CI inline. A tap reveals survival to the pick after.

The play's headline urgency = the urgent EV-weighted partner's
urgency:

```
For each partner:
  partner_urgency = urgencyFromSurvival(survival_pct_to_next_pick)
  // act_now if <25%, this_round if 25-50%,
  // two_round_cushion if 50-75%, no_rush if 75%+

play_urgency = urgency of the partner with the highest
  (ev_contribution × urgencyScalar)
```

A high-EV anchor surviving at 18% pulls the play to `act_now`
regardless of how comfortable the fallbacks are. This is what
reflects "Tank Bigsby goes next two picks" (act_now) being
different from "Jalen McMillan is in zero danger of going in the
next four picks" (no_rush).

NO hardcoded "next N picks" windows in copy. The follow-through
line names a specific deadline pick number ("before pick 7.04 if
Andrews; otherwise Sarratt / Lane sit comfortably at 7+").

### Play card chrome

- Type badge (small mono uppercase: `QB STACK`, `ANCHOR + HANDCUFF`,
  `QB HOARD FLIP`, etc.)
- Anchor + partners headline
- Genius IF / Otherwise thesis (Voice A, no em dashes, no hedging)
- Partners table: name + position + EV contribution with CI +
  survival pct with CI + per-partner urgency
- Follow-through line: deadline pick number + named action
- State chip
- Urgency chip (graduated from math)
- One-click dismiss affordance with forgiveness (re-enters via
  un-dismiss)
- Source-signals tooltip naming the engine fields that produced
  the play (for transparency + Coach citation)
- For committed / auto_active plays: a small "next planned" chip
  pointing at the next partner to take

### Format gates

Every play type declares its gates:

```ts
interface FormatGates {
  requires_te_premium?: boolean;
  forbid_te_premium?: boolean;          // for non-TEP suppression
  requires_superflex?: boolean;
  requires_1qb_starter?: boolean;       // for QB-Hoard-Flip
  requires_deep_bench_min?: number;     // for Multi-Handcuff Lottery
  requires_dynasty?: boolean;           // for 2027-Pick-Sniping
}
```

The engine MUST NOT emit a play whose gates are unsatisfied. Lint
candidate: enumerate every PlayType in a format-gate matrix and
verify the matrix at engine boundary.

Known suppression: TE-Premium Double-Up requires `te_premium: true`.
This is the non-TEP TE overweighting bug class (founder report
2026-05-20). The bug also lives in `decision-synthesis/synthesize.ts`
scoring where TE EV gets over-weighted in non-TEP standing calls;
separate fix tracked outside this spec via the debug workflow.

### Play type catalog (initial)

Draft-phase:
- **QB Stack** (anchor QB + correlated WR/TE pass-catcher)
- **Anchor + Handcuff** (workhorse RB + their backup)
- **Bridge QB** (bridge starter + dev QB)
- **RB Bellcow** (collect verified 15+ touch RBs; lane-matched)
- **Zero-RB Recovery** (early WR-heavy + thin RB room; late-round
  RB committee bets)
- **WR Stable** (5+ WRs with stable 18%+ target share)
- **Future Stock** (2026+ rookies + young roster + picks held)
- **TE Premium Double-Up** (TEP only; 2 TE1s where the gap is
  biggest)
- **Multi-Handcuff Lottery** (bench depth low + 2+ high-injury-risk
  anchors; collect 3 high-upside backups)

In-season morphs (draft play → in-season play):
- **QB Hoard → QB Flip Window** (week 8-12, trigger: ≥3 leaguewide
  QB1 injuries, action: flip one QB at +30% markup)
- **Anchor + Handcuff → Handcuff Watch + FA Priority** (week 1+,
  trigger: snap-count anomaly / beat-writer note / active injury on
  anchor, action: claim named handcuff via FA before the league
  reads the tea leaves)

In-season only:
- **2027 1st Sniping** (week 6+, trigger: bottom-3 EV rank + 1-win
  + old core opponent, action: offer win-now veterans for 2027 1sts
  at 15%+ discount to KTC)
- **Buy-the-Dip** (rolling, trigger: top-30 KTC player + 2-game
  cold streak + sub-10% market dip, action: offer dip-discounted
  bundle)

### Coach contract for plays

Context fields shipped to Coach:
- `active_plays: Play[]` (every play in committed / auto_active /
  tracking states)
- `recently_dead_plays: Play[]` (for honest mention of moved-past
  paths)
- `play_state_summary: { committed_count, auto_active_count,
  tracking_count, suggested_count }`

System prompt hard rule (Coach):

> The user is operating with named active plays. Treat them as the
> strategic frame. Before recommending any pick, trade, or roster
> move, check whether it ADVANCES, BREAKS, or is NEUTRAL to each
> active play. If it BREAKS a play, name the breach by play type
> and explain the cost in EV. If it ADVANCES, name the play and
> the survival math that makes the move time-sensitive. NEVER
> recommend a move silently inconsistent with an active play.

### Hand-off from The Call (active draft)

When The Call's standing call breaks a committed play, The Call's
disclaimer band carries the breach note: "Standing call (Player X)
breaks your committed QB Hoard. Cost: -4 EV vs the alternative
that advances QB Hoard. Take Player X anyway if you want to break
the play; otherwise the alternative is named below."

This is the active-play strip's full surface. It lives inside The
Call, not as a separate strip, and only renders on breach.

## Companion panel (the emotional ROI loop, locked 2026-05-21)

The companion is the check-in surface that delivers Principle 13.
It is a PUSH surface (something waiting when you arrive), distinct
from Coach (PULL: you ask, it answers). It sits at the top of the
hub in the LastVisitDigest position and hands off to Coach for any
beat the user wants to talk through.

### Beat model

```ts
type BeatKind =
  | "vindication"   // a logged prediction resolved true
  | "bad_beat"      // high-prob good outcome flipped on variance,
                    //   process clean (the user was ahead)
  | "critique"      // a real EV gap left by a process error
  | "debate"        // user took a contrarian choice vs the call
  | "anticipation"  // a live variance window before it resolves
  | "callback"      // a named past bet reached a checkpoint
  | "milestone";    // draft midpoint / week close / season close

type BeatTone = "win" | "commiserate" | "challenge" | "neutral";

type BeatStage =
  | "pre_draft" | "dynasty_draft" | "in_season" | "fast_draft";

interface BeatSource {        // the anti-slime provenance
  signal: string;             // canonical that produced it
  detail: string;             // human-readable provenance line
  values?: Record<string, number | string | null>;
}

interface Beat {
  kind: BeatKind;
  tone: BeatTone;
  stage: BeatStage;
  headline: string;           // Voice A, scoped 'we' allowed
  body?: string;              // optional 1-2 more sentences
  source: BeatSource;         // REQUIRED. no source, no beat.
  bet_id?: string;            // links to an ExpectationRecord
  prompts_handoff?: boolean;  // invites a Coach debate
  urgency?: "act_now" | "this_round" | "no_rush";
}
```

### Beat taxonomy (one vocabulary, all four stages)

| Beat | Poker analog | Grounded in | Tone |
|---|---|---|---|
| vindication | "Folded, just like we called it" | a resolved ExpectationRecord (confirmed) | win |
| bad_beat | "You were ahead, damn" | ExpectationRecord ahead at decision, flipped on variance | commiserate |
| critique | "You overcommitted, out of position" | a real EV gap left (computeWhatIfReadout / bench delta) | challenge |
| debate | "Talk me through that line" | computeWhatIfReadout EV delta vs the call | challenge |
| anticipation | "Here is what we are watching" | survivalPctFor + plays urgency before a slot | neutral |
| callback | the running story | a named bet reaching a checkpoint | win / neutral |
| milestone | "Good session" | analyzeLeagueEvBank rank + draft progress | win |

### Grounding contract (anti-slime)

Every beat carries a `source` with the canonical signal that
produced it. The classifier (`classifyBeats`) is deterministic;
beats are phrased in Voice A by template (`phraseBeat`), not by the
LLM. The LLM (Coach) enters only on the debate handoff (pull). A
beat with no grounded delta does not fire. Enforced like the
no-hardcoded-numbers invariant. See CANONICAL_SOURCES.md
"Companion beat classification."

### The expectation ledger

Companion memory lives in the `expectations` table (migration 0015)
as `ExpectationRecord` rows: what was expected (metric, value, CI),
the road not taken (alternative_label + alternative_value), the
user's logged thesis, the resolution condition, the horizon
(next_pick / this_week / this_season), and the resolution
(resolved_value + outcome). The ledger is loaded at decision
moments (a pick taken over the standing call, a lineup set, a
pregame win probability) and reconciled when new data lands (the
next picks, a game result, an injury). Reconciliation is
`reconcileExpectations`.

### Honest-first reconciliation rules

- confirmed -> vindication (win). Expected good, resolved good.
- variance_loss -> bad_beat (commiserate). The user was ahead in
  expectation (high win prob / positive EV at decision time) and
  the outcome flipped. Process was clean.
- process_error -> critique (challenge). The user chose the
  lower-EV option and a real, capturable gap was left.
- Counterfactual attribution ("Brenton's injury cost you the win")
  fires ONLY when the event actually flips the result, via the
  computeWhatIfReadout counterfactual pattern. Never commiserate on
  a loss the user was never favored to win; never attribute a loss
  to an event that did not change the outcome.

### Beat priority (what surfaces first)

`rankBeats` orders by tone-weight x magnitude x recency, mirroring
`urgentPartnerOf` in plays/urgency.ts. The check-in leads with the
single most resonant grounded beat; the rest collapse below.

### Card chrome

- Tone-colored rail (win = success, commiserate = warning,
  challenge = neutral-strong, neutral = neutral)
- Headline (Voice A, scoped 'we', leads with the number)
- Optional one to two sentence body
- Provenance on tap (the source.detail + values), per Principle 0
- Urgency chip when the beat carries one (reuses plays vocab)
- "Talk it through" handoff to Coach on debate / critique beats
  (seeds the Coach thread with the bet_id + thesis)
- A react affordance on debate beats ("my window is now") that
  writes the user's thesis back to the ExpectationRecord (the
  investment phase)

### Stage adaptation

- Pre-draft: shared-prep + ledger-loading beats. Low emotional
  stakes; the job is to co-author the plan ("if the board breaks
  chalk you are WR at 1.05; if a QB run starts, we pivot") so later
  vindication / bad-beat beats are personal. Continuity from prior
  drafts where available.
- Dynasty draft (multi-day): the gap between picks is the window.
  since-you-left digest with a point of view (not a changelog); the
  contrarian-pick debate (the Mike Evans beat) the moment the user
  takes a fringe candidate over the call; anticipation beats
  between picks; snipe commiseration (reuse detectPlanDisruption).
- In-season: pregame anticipation; post-game reconciliation (the
  vindication / bad_beat / critique trio); the weekly lineup debate
  (the in-season twin of "who do I pick"); the injury-moment
  companion; season-arc callbacks to draft bets; light rivalry
  framing against named opponents.
- Fast redraft (2 min/pick): terse-during reaction chips (one line,
  no paragraphs) accumulated into a rapid-fire reaction log; the
  real companionship is the rich post-hoc debrief after the speed
  draft.

### Format gates

Beats respect `format_rules` the same way plays do (no QB-flip beat
in a non-1QB starter league; no TE-premium beat in a non-TEP
league) and never claim absence of data that exists in context.

### Coach handoff contract

Coach context ships `active_beats` + `recent_resolved_beats` + the
open bet (thesis + alternative + EV delta). System prompt rule:
when the user opens a debate the companion surfaced, engage it,
cite the grounded signal by name, respect honest-first, and never
fabricate a reaction. The companion surfaces the beat; Coach is
where the user talks it through.

### Companion <-> Plays/Call integration (planned, post the-call overhaul; locked 2026-05-22)

Status: the companion (Principle 13) shipped to prod (PR #2). A parallel
the-call / plays overhaul (unified Decision Board, retired Strategic
Lanes, auto-active plays, the "push_path can't crown a met-position
reach" fix) is in progress on the `feat/companion` branch and is NOT yet
on main. The founder asked to wire the companion to react to it AFTER
the-call completes. Do not integrate a moving target.

PRESERVATION RULE (critical). `feat/companion` was branched before the
companion code existed. It does NOT contain the companion feature
(`src/lib/strategy/companion/`, `src/lib/companion/ledger.ts`,
`companion-check-in.tsx`, migration 0015, the `companion_beat` Coach
handoff, `seedCoachWithBeat`) or the shipping protocol in AGENTS.md.
Shipping `feat/companion` to main as-is REVERTS the companion from
production. The two MUST be integrated: merge the the-call changes ONTO
current main (which has the companion), keeping both. Never ship the-call
over the companion. The conflicting files are page.tsx, route.ts,
coach-chat.tsx; the streams edit different regions (companion: the
last-visit block, the LastVisitDigest render, `companion_beat`,
`seedCoachWithBeat`; the-call: the TheCall component, decision-board,
synthesize). Keep both regions.

Wire AFTER the-call completes:
1. Merge the-call / plays onto main, preserving the companion.
2. Re-point the debate beat at the new Decision Board's standing call.
   The the-call refactor changed standing-call selection (push_path no
   longer crowns a met-position reach), so the companion's whatIf
   reconstruction (today from the last-visit cookie's standing_call_id)
   must align with the new decision's standing call.
3. New grounded companion beats reacting to plays:
   - play_advanced (win): the latest pick is a follow-through target of
     an active / committed / auto-active play. Names the play and the
     next partner. SHIPPED (`classifyPlayAdvancedBeats`).
   - play_broken (commiserate): a committed play's named follow-through
     target was drafted by an opponent SINCE the user's last visit.
     SHIPPED 2026-07-11 (`classifyPlayBrokenBeats`). Consumes the
     canonical between-visit snipe diff (`detectPlanDisruption.snipes`,
     the same signal LastVisitDigest surfaces) cross-referenced against
     committed plays, so it fires on the TRANSITION (just sniped), not on
     every visit while the play sits broken. Names the play, the sniped
     piece, and the holder. The "or a trade undercuts a play" half is
     deferred: coverage is draft/roster-snapshot based, and there is no
     trade-away break signal yet.
   - play_activated (win): a play flips to auto_active (e.g., QB Hoard).
     DEFERRED. `auto_active` is derived fresh each render but nothing
     stores WHICH plays were auto-active last visit, so a "just activated"
     beat needs a new last-visit fingerprint field to diff against.
     Without it the beat would fire every visit the play stays active
     (noise, not a transition), which the honest-first rule forbids. Ship
     it by adding `auto_active_play_keys` to the fingerprint and diffing.
   Consume the canonical plays state and the between-visit diffs; do NOT
   re-derive play state in the companion. The engine derives, the
   companion reads. Same `format_rules` gates as the plays themselves.

## Visualization map (538-editor pass, locked 2026-05-08 PM)

Founder direction: "If you were an editor/designer for fivethirtyeight
.com what visualization and data structures would you put on these
things? The end result should be sexy charts and graphs, not just
text, though not everything gets a sexy chart."

Per-surface chart treatment:

### EV Bank · Box 1 (Your EV)
**Hero: cumulative EV trajectory line.** Stock-chart shape. X-axis =
your pick number; Y-axis = cumulative EV banked. Each pick is a node
on the line. Confidence ribbon shaded around the line as a translucent
fan. Annotations name the picks that swung the bank. Sparkline summary
above. Hover any node: player + raw EV + value + ADP variant +
survival.

### EV Bank · Box 2 (League by team)
**Dot plot with CI bars.** Each team is a row; CI range as colored
bar; team's median as a dot; mine highlighted. Sparkline column on
the left: each team's per-pick trajectory in tiny form. Diverging
green-red color. Hover team: their per-pick bars inline. Click:
modal with their full trajectory chart.

### EV Bank · Box 3 (Upcoming events)
**Horizon timeline.** Calendar strip showing next ~6 weeks. Markers
per event (training camp, post-game weekly recalc, injury report,
NFL Draft window). Above the strip: fan chart of how EV could move
under each event. Hover marker: event detail + EV swing range.

### Plays panel (cornerstone strategic frame)
Vertical stack of play cards, grouped by state (Committed →
Auto-active → Tracking → Suggested → Dismissed → Achieved/Dead).
Each card: type badge + anchor headline + Genius IF / Otherwise
prose + partners table (with per-partner survival sparkline + CI
band) + follow-through with deadline pick number + state chip +
urgency chip + dismiss. A partner's survival pct renders as a
small horizontal bar with a CI ribbon. The card's urgency chip
graduates color: red (act_now), amber (this_round), neutral
(two_round_cushion / no_rush). No fixed "next N picks" copy.

### Tier Map (late-draft hero, RESTORED to component inventory)
**Tier ladder per position.** 4 columns (QB/RB/WR/TE). Each column
is a stack of colored tier bands; players within shown as labeled
bricks. Drop between tiers rendered as a literal pixel gap with
magnitude labeled. Pick-rate sparkline on top of each column showing
recent run intensity. Hover brick: full player + ADP variant + value
+ survival.

### Position Diagnostic
**Position-strength heatmap row.** 4 cells across (QB/RB/WR/TE),
each colored by strength tier. Inside each cell: total positional
value + percentile vs league + your top player. Hover: full
position breakdown.

### Sharp Positioning + Best Value
**Diverging dot plot of every pick's ADP delta.** Horizontal axis =
pick number. Vertical = ADP delta. Each pick = dot; size = player
value. Most-extreme picks annotated. Hover dot: variant ADP + market
gap + EV contribution.

### Standing Call (within "THE CALL" lane in Strategic Lanes)
**Decision-confidence radial gauge** (small donut/arc with model
confidence as a percentage with a CI ring). Plus horizontal stacked
bar showing this pick's EV breakdown: market discount + value ×
scarcity × survival. Each component labeled.

### Opponent Gap Analysis
**Demand heatmap row.** One cell per opponent in the gap, colored by
their highest-demand position. Pick number labels above each cell.
Plus opponent fingerprint sparkline below: that opponent's recent
trade/pick activity.

### Inflection Panel (bifurcation)
**Bimodal distribution chart per player.** Two normal-curve humps
with probability mass labeled. Signal scorecard table to the right:
each signal as a row with observation + direction. Hover signal:
source citation + sample size.

### League Pulse / Activity
**Stream graph of recent picks.** Picks colored by position; height
shows volume per position over the last 12-15 picks.

### Briefings (Intel)
538-style article cards. Each briefing has hero chart + 2 supporting
beats with mini visualizations + a one-decisive-number callout.

### What stays text/numeric (no chart)
- Player names, position, age, team
- Disclaimer copy ("Counterintuitive lock", "Counterintuitive value")
- "Why this path" prose lines
- Scarcity callouts
- Coach responses
- Variant labels

### Charting approach
Inline SVG for sparklines, bars, dot plots. Reach for a charting
library only when a chart genuinely needs interactive complexity.
Voice A control over every pixel.

## Drift detection: questions to ask before any structural change

When tempted to ship a structural change, run through these:

1. Which principle does this trace to? If none, why are we doing it?
2. Which section does this live in? (See section inventory above.)
3. Does this preserve the founder's named visual richness (per-pick
   EV bars, league EV bars with ranges, position diagnostic with
   color-coded cards, comparator narrative, inflection bifurcations,
   standing-call EV number, lane primary cards)?
4. Does this render in the right register for the user's Sloan
   toggle state?
5. Does this honor stable shape + visible delta (principle 11)?
6. If this kills a component, did we replace its value somewhere
   else? If we parked it, is the parking explicit and dated?

## Compression survival contract

This file lives in the repo at `web/REDESIGN_INTENTIONS.md`. It is
imported into AGENTS.md via @ syntax so it auto-loads in every
agent session.

A memory note (feedback type) at
`feedback_redesign_intentions_codified.md` points at this file. The
note is indexed in MEMORY.md.

A future session that fixes a bug, reorganizes a panel, or adds a
new surface MUST read this file first. If a structural drift is
about to happen, the founder should be flagged before the change
ships.

The protocol is: read, align, ship. Not: ship, react, repeat.
