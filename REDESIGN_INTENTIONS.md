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

### 8. EV bank: 3-box row, second from the top

UPDATED 2026-05-08 PM after founder direction. The EV bank is not a
single widget; it is a 3-box row that lives second-from-the-top of
the hub (below the headline section, above the rest):

- **Box 1: Your EV.** Per-pick bars + total + range (confidence band
  always visible inline as margin of error).
- **Box 2: League EV by team.** Per-team summary bars (mine
  highlighted). Click a team to open a modal showing that team's
  per-pick bars in the same shape as Box 1.
- **Box 3: Upcoming events that recalculate EV.** Training camp,
  weekly post-game recalc, injury news, NFL Draft window, etc.
  Surfaces "what could move your number next, and when."

The range envelope (confidence band) renders for every number in
every box.

Per founder direction 2026-05-08: "I'd think of it as a three item
thing. Box 1 = my EV. Box 2 = league EV by team (can click one for
a modal showing their picks like mine in box 1). Box 3 = Next events
that will affect/recalculate EV (e.g. training camp, recalc after
next week's games, injuries, etc.)."

### 9. Cool conversations + screenshots

The product is designed for sharing. Comparator narratives, EV bank
ranks, decisive locks, opponent reads each render as screenshot-
optimized artifacts with unobtrusive `dynastygeneral.app` footnote
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
4. **No second-person plural "we" for the model.** System is "the engine" / "Dynasty General." "We" is the user + founder.
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
2. **The Call** (active draft only; standing call dominates)
   - Disclaimer band when present
   - Standing call hero with EV number
   - Opponent gap line
   - Lanes (3 cards: Win-Now / Trade-Flex / Keeper-Lock with
     format-adaptive labels)
   - Scarcity callout when present
   - Counter view when present
   - Why landscape + Next picks plan (collapsed)
3. **How you're doing** (during + post-draft)
   - DraftProgressPanel: position diagnostic + watch the board +
     league rank + best value + sharp positioning + wins/gaps
   - EV bank section INSIDE DraftProgressPanel: per-pick bars + total
     + range + collapsible "see how the league stands" expander
   - WindowsBar (next to EV bank per founder direction 2026-05-08)
4. **Your team** (always)
   - Team Identity (build, comparator, risk, lineup talent)
   - Inflection panel (player-relevant variance windows)
   - Contender outlook
5. **The league** (default-open varies by stage)
   - TradeStrategyPanel
   - OpponentCharacterizations
   - SamePathThreatsCard
   - LeagueOutlook + SwotCard + LeagueDivergence + LeagueTable
6. **Intel** (collapsed by default)
   - Library teaser
   - Briefing feed
7. **Coach** (sticky right column, unchanged)

### Components retired (do not bring back without revisiting the spec)

- StrategicForks: covered by The Call's lanes
- TierMap: covered by The Call's candidate context
- DecisionQuadrant: parked at `the-call/decision-quadrant.tsx`,
  reserved for a future `/pick` deep-dive page where it can live
  with a real interpretation headline. NOT rendered on the hub.
- PlaysFromHere, LiveStrategyBoard, DraftJournal: deprecated.

## What's shipped vs. drifted vs. missing (audit, last updated 2026-05-08)

### Shipped + working
- Voice A locked + BRAND_VOICE.md
- Sloan-mode infrastructure (cookie, hook, toggle on The Call,
  Coach register switch)
- Last-visit fingerprint write-side
- Stage-adaptation function (`selectSurfaceLayout`)
- Comparator team narrative data layer (12 cases passing)
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
  opponent_notes plumbed
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

### Drifted from the principle (data exists, rendering missing)

- **Principle 11 last-visit "Since [time]: ..." digest line.** Data
  is computed; cookie is written. NO UI surface renders the digest
  on the hub. Need to render at the top of the hub above the first
  section.
- **Principle 11 plan-disruption acknowledgment.** Data is computed
  (`detectPlanDisruption`). NO UI surface renders the
  acknowledgment band when a planned target gets sniped between
  visits.
- **Principle 11 per-section change dots.** Not implemented. Each
  section header should carry a small dot when underlying data has
  changed since last visit.
- **Principle 11 within-surface delta marks.** Not implemented.
- **Principle 8 EV bank percentile chip in the Bridge / hub
  header.** No Bridge yet; no chip yet. The user wanted at-a-glance
  EV bank context BEFORE scrolling to "How you're doing."
- **Principle 7 visual rendering of underlying question.** Coach
  rule shipped; UI surface (a small "underneath:" line above the
  answer) not implemented.
- **Principle 9 comparator team narrative rendering.** Data layer
  shipped (12 test cases). The redesigned Team Identity panel is
  expected to render the comparator inline; verify it does. If
  not, render it.
- **Principle 9 EV bank rank screenshot artifact.** No dedicated
  shareable card / OG image generator.
- **Principle 3 statistical-claims chart on the hub.** No hub-
  visible chart that surfaces a methodology claim with annotation.
  The Library has the long-form articles; the HUB has nothing
  that says "here's the bold statistical claim, here's the chart
  that proves it."
- **Principle 5 + 6 Sloan mode beyond The Call.** Toggle exists
  but only The Call switches register. The rest of the page does
  not honor Sloan mode.
- **Visual hierarchy: EV bank prominence.** The EV bank is buried
  inside DraftProgressPanel which has many other panels above it
  (position diagnostic, watch the board, secondary metrics, sharp
  positioning, wins/gaps). The user has named this directly: "I
  can't even locate EV on the page." It needs to lead the section
  or get its own section.

### Parked (not built; reserved for future)

- `/pick` deep-dive route with Decision Quadrant + interpretation
  headline
- Player-trade history (via `getTransactions` per-week) for the
  opponent dossier
- Counterparty-stated-plans UI control (the schema is shipped; no
  client UI to add notes from inside the product)
- Plan-disruption acknowledgment band visual + transition
  animation
- "Argue with the mixer" / Soundboard adversarial feedback
  (parked until engine wiring lands)
- Player-trade visual breakdown by position
- Sloan-mode register applied to all sections (not just The Call)

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
| 2026-05-08 | Lanes is still here / can't locate EV | PENDING (this audit) |

## Strategic Lanes (THE active-draft hero, locked 2026-05-08 PM)

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

### Strategic Lanes (active-draft hero)
3 cards side-by-side (vertical stack on mobile). Each card per the
spec above: mini path diagram + sparkline + horizon meter + EV
chips + tap-to-expand for full candidate detail.

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
