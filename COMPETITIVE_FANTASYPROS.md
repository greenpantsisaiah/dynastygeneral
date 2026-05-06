# Competitive read: FantasyPros vs Dynasty General

Captured 2026-05-05 from founder's FP 3-day trial walkthrough. This is the durable source for: the "vs FantasyPros" landing page, marketing copy, roadmap prioritization, and future competitive comparisons (KTC, FantasyCalc, Sleeper, Yahoo, MFL).

Do not lose anything in this doc. Reference it before any landing page work, marketing copy revision, or roadmap reprioritization.

---

## 1. Strategic frame

FantasyPros is **a Bloomberg terminal**: data-dense, every tool exists, low decisiveness, the user does the synthesis.

Dynasty General is **an intelligence briefing**: synthesized, decisive, evidence-cited, the user makes the call but the analysis is done.

FP positions the user as a researcher in a library. We position the user as the general (per `project_intelligence_analyst_positioning.md` memory). Two completely different relationships, and ours is the harder, more defensible one.

The 10x play is NOT to copy their breadth. It is to weaponize our depth in places they are shallow.

**One-line value props:**
- FP: "Every fantasy tool you'd want, with rankings from 100 experts."
- DG: "An intelligence team for your dynasty league."

---

## 2. What FP has that we don't (and what to do about each)

| FP feature | What it does | Our move | Priority |
|---|---|---|---|
| **Pick Predictor (% odds before next turn)** | Per-player survival probability through your wait | **BUILD.** Already queued as Phase 2 deliverable (4th Coach trade bug). Beat them by publishing Brier score; theirs is uncalibrated. | P0 |
| **Multi-source ranking switcher** ("Latest ECR" / "Most Accurate Experts") | Toggle ranking source | **Partial adopt.** We already triangulate engine + market + ADP. Surface a clean toggle but DON'T add a dozen rando-expert blends. Three principled sources beats ten anonymous ones. | P2 |
| **Cheat-sheet tier display per position** | Color-banded tiers with "x/y drafted" badge | **We already do this better.** Variance-band overlap math vs editorial. Marketing wedge: "computed from variance, not opinion." | done |
| **Strategy presets (Zero RB, Late QB, Streaming TE)** | Static labels that change rankings opaquely | **Beat with Soundboard.** Soundboard moves real engine weights with truthful tooltips. Steal their preset CHIP UI ("Zero RB" as a one-click) but show the dials it actually moves. | P1 |
| **Custom strategy rule builder** ("suggest RBs after round 4") | Layer hand rules on top of ECR | **Don't copy directly.** Soundboard is the principled version. Let users SAVE soundboard configs as named strategies (Phase 4 monetization in `BUILD_PLAN.md`). | P3 |
| **Draft Board grid view** | All 12 teams' rosters in one scannable grid | **Adopt.** Cheap to build, high perceived sophistication, useful for opponent-need scanning. Add a "team needs" overlay (which positions each opponent is starved at) that they don't have. | P1 |
| **Mock Draft Simulator** | Run sim drafts solo | **Skip.** Heavy build. They lean on it because their static rankings need a sandbox. Our engine is live. | skip |
| **"% experts pick" suggestion framing** | "57% of experts would take CeeDee" | **Reframe ours, don't copy.** Show "Top Suggestion: confidence 0.85" not crowd-vote percentages. Confidence is honest; vote count is not. | P2 |
| **Tier badge "x/y drafted" format** | "1 of 4 in Tier 1 already drafted" | **Adopt directly.** Good UI. Surfaces depletion urgency in 2 chars. | P1 |
| **Live Sleeper sync via browser extension** | Match draft state to FP suggestions | **We already do this WITHOUT extension.** Marketing wedge. | done |

---

## 3. What we already do better (lean into in copy)

1. **Decision synthesis (the Decision Card pillar).** They make you scroll a list across four tabs (Suggestions / Cheat Sheets / Draft Board / Pick Predictor) for ONE pick. We give one card. Reference: `project_architecture_pillars.md`.

2. **Keeper-format awareness.** Their suggestions don't change for keeper/SF/dynasty in any meaningful way beyond positional weights. We bake `league_type` and `max_keepers` into the LLM contract (commit 24c9316, 2026-05-05). Their Coach gives the same advice in a 5-keeper SF league as in a 12-team redraft.

3. **Three-source consensus with magnitude-graded spread bar.** Engine + market + ADP. They show one ECR with no disagreement signal. Ours surfaces "engine and market disagree by 2.5 picks; treat as noisy" at a glance.

4. **LLM Coach with explicit context contract.** Their Coach is a chatbot. Ours has signature data, format-aware system prompt, format-rules guard. Coach refusing to hallucinate trade math (and asking for the players) IS the credibility moat. Reposition in copy: **"Coach won't make things up. If we don't have the data, we'll tell you."**

5. **Continuity chip + draft journal + watchlist.** Per-league localStorage memory. They have zero per-pick continuity. Reference: `project_localstorage_memory_features.md`.

6. **Roster integrity check.** Our identity-mismatch banner caught a real Sleeper-side bug 2026-05-05. FP would silently advise the wrong team.

7. **No browser extension.** One less install, one less point of friction.

8. **Dynasty-first.** Their dynasty product feels retrofit on top of redraft. We were dynasty-native from day one.

---

## 4. Wedges NEITHER of us has yet (the moat)

These are where 10x-better lives. None are FP-blockable.

1. **Public calibrated scoreboard** (`VALIDATION_PLAN.md` §7). Phase 2 backtest publishes our Brier score against the 5 named baselines (KTC, FantasyCalc, Sleeper ADP, FP ECR, FP Most-Accurate). FP has never published their accuracy. Sloan-grade evidence. **Single biggest wedge.**

2. **Soundboard with quantified, truthful tooltips.** Per `project_soundboard_moat_strategy.md`. Real weights moving real predictions. Argue-with-a-mixer + suggest-a-dial form. Cannot be cloned without rebuilding their stack on principled engine math.

3. **Opponent psychology / manager profile.** Track each manager's draft style across seasons: "this manager reaches for RB1 in round 1 every year." FP has zero of this. Sleeper-cookie-mirrored, low cost.

4. **Briefings as missions + email digests.** Per-league mission state machine, completed-mission emails. Reference: `project_briefings_missions_email.md`.

5. **100 Voices / Stadium View** (`project_100_voices_architecture.md`). Named-expert library + Vegas + empirical drafts + system voices. FP aggregates anonymous experts; we ATTRIBUTE.

6. **Format-diverse stunt validation.** 5 leagues + AI-vs-AI Reddit league as live evidence. Reference: `project_2026_stunt_validation.md`. FP can't run this stunt because they don't have a single model to validate.

7. **Coach refusing to hallucinate as a marketed feature.** Calibrated honesty is the inverse of every chatbot's behavior. Lean in.

---

## 5. UI lifts to steal

**Cheap + high gain:**
- Tier badge "x/y drafted" format (1-line component)
- Strikethrough drafted players in any list view (CSS)
- Draft Board grid (12 columns × N rounds, color-coded by position) (half-day build)
- Position color-coding consistency across surfaces

**Cheaper than they look:**
- "Top Suggestion: [confidence X]" framing in Decision Card (copy change, no logic change)
- "Hide drafted" toggle (if not already present)
- Strategy preset chips ("Zero RB", "Hyperfragile") that pre-set Soundboard dials (1 day)

---

## 6. UI traps to deliberately AVOID

1. **Four-tab fragmentation for one decision** (Suggestions / Cheat Sheets / Draft Board / Pick Predictor). Violates synthesis pillar.
2. **"% of experts" as the primary decision basis.** Consensus is not calibration.
3. **Browser extension requirement.**
4. **Generic strategy labels with no quantification.** "Zero RB" without showing what changed = soundboard's opposite. Don't ship strategy presets without the dials being visible.
5. **Static rankings as the primary surface.** Every player frozen in editorial place.
6. **Generic chatbot Coach.** Theirs hallucinates freely. Ours has a contract.

---

## 7. Marketing copy lines (use verbatim or remix)

- "FantasyPros gives you a hundred opinions. Dynasty General gives you one decision."
- "Their rankings average 100 anonymous experts. Ours predict and publish a Brier score."
- "Coach won't make things up. If we don't have the data, we tell you. Then we ask for it."
- "Built for dynasty. Format-aware down to keeper count and superflex."
- "No browser extension. Sleeper sync just works."
- "We don't aggregate experts. We are the analyst team."
- "We ship our accuracy. They hide it."
- "FantasyPros knows which experts are accurate. They use it to pick the blend, then sell you the blend. We publish the scoreboard."
- "Stop screenshotting KTC. Get a real trade analysis." (when we ship the trade analyzer wedge product, see `project_trade_analyzer_opportunity.md`)

---

## 7a. Intel from the Experts dropdown (2026-05-05)

The "Experts" picker on the rankings page exposes:
- **Latest ECR** (default consensus)
- **2024 Draft Accuracy → Top 10 / Top 20 Overall** (most accurate at preseason)
- **2025 In-Season Accuracy → Top 10 / Top 20 Overall** (most accurate at weekly)
- **2024 In-Season Accuracy → Top 10 / Top 20 Overall**
- **Sites** subsection (FantasyPros internal, Footballguys, Fantasy In Frames, Going For 2, etc.)

Implication: FP HAS per-expert accuracy scoring. They just use it to filter the blend. They never publish:
- Per-expert Brier score or log loss
- A leaderboard of which experts beat/miss the consensus
- Calibration curves
- The accuracy of THEIR consensus vs each individual expert

That gap is our wedge. Phase 2 must publish at minimum:
- Per-source Brier score (KTC, FantasyCalc, Sleeper ADP, FP ECR, FP Top-20 Draft Accuracy, our engine)
- Calibration plot (predicted-rank vs realized-rank)
- Disagreement-weighted accuracy (when sources disagreed, who was right?)

Marketing line for the landing page: "FantasyPros measures expert accuracy. They just don't show you. We do."

**Field note 2026-05-05:** their "2025 In-Season Accuracy" picker option exists but does not actually shuffle the rankings (likely uncomputed post-season or a UI bug). Their accuracy machinery is publicly visible but partly broken. Another small credibility crack we close.

**Archive URL pattern (verified 2026-05-05):** `dynasty-overall.php?year=YYYY&week=0` and `dynasty-superflex.php?year=YYYY&week=0` return PRESEASON snapshots for that year (rookies show with high WORST variance; experts haven't seen the season yet). The "last updated" date label can be misleading (shows when archive was finalized, e.g. Jan 9 2025 for the 2024 archive). Trust the content over the label. Files for 2022/2023/2024 PPR + SF are now in `web/data/fantasypros/`.

**FP Dynasty ADP is shallow (verified 2026-05-05):** the dynasty ADP page reports "Consensus of 2 Sources" (Sleeper + RTSports). Sleeper alone draws from far more drafts. Marketing wedge: "Their dynasty ADP blends 2 sources. Ours triangulates KTC, FantasyCalc, and Sleeper, plus our own engine." Their consumer-facing ADP is mostly a redraft product retrofit to dynasty.

**FP does not expose dynasty Superflex ADP at all (verified 2026-05-05):** there is no `dynasty-superflex.php` ADP page. SF redraft ADP exists, but dynasty SF ADP does not. Marketing wedge: "FantasyPros doesn't even publish dynasty Superflex ADP. We do." Format-aware product positioning.

**Pick Predictor captures saved (2026-05-05):** three depth views (one-round / two-rounds / three-rounds) from a 5-keeper startup-style league context, plus a dynasty rookie-draft view (one-round only; the round-depth toggle is missing in rookie-draft mode, suggesting their UI varies by league type but the underlying math may not). Player pools differ by league type (rookies-only in rookie-draft mode), but identical column structure (Overall/QB/RB/WR/TE) across formats hints at a single underlying model. We publish calibrated probabilities (Brier score) and they don't.

**Tier breaks are CSS-only, not data-structural (verified 2026-05-05):** when copy/pasting the FP Cheat Sheets surface, tier dividers ("Tier 1", "Tier 2", etc.) do NOT come through. Their tiers are styled in the DOM, not stored as a numeric tier field. PDF print is also blocked from paginating. This means: their tier breaks are editorial overlays, not principled bands derived from variance or any computed boundary. Our variance-band overlap math (in `web/src/lib/engine/evaluation/tiers.ts`) gives us a quantified tier with a real breakpoint (when the next player's variance band fails to overlap the current tier band). Marketing wedge: "Their tiers are colored stripes. Ours are computed boundaries you can audit."

**FP "Should I Trade?" tool is a value-comparison, not a true trade analyzer (verified 2026-05-05):** at `https://www.fantasypros.com/nfl/dynasty-trade-value-chart.php`, the "Should I Trade?" UI offers up to 4 player slots and a "View Advice" button, but there is NO concept of "I give X, I get Y." It just ranks 4 selected players by expert consensus. Cannot frame an actual trade as posed. KTC's calculator and our Coach trade analysis both handle trade-as-posed. Marketing wedge: "Their trade tool can't even ask who's getting what. Ours analyzes the actual trade you're considering."

**Half-PPR dynasty rankings do not exist as a downloadable artifact (verified 2026-05-05):** the Dynasty Rankings page Scoring dropdown is effectively locked to PPR. The Half-PPR option visible in the "Should I Trade?" tool only affects that tool. FP treats dynasty as PPR-only for their flagship rankings product. Half-PPR is a real dynasty format (used in many leagues including the founder's keeper league). Marketing wedge: "FP doesn't even publish Half-PPR dynasty rankings. Format support is dynasty 101."

**FP content sprawl as competitive intel (verified 2026-05-05):** their content footprint includes 30+ named content categories: news, articles, podcasts, player profiles, injury reports, weekly notes (RB/WR/QB/TE/K/DST), waiver wire, sleeper, bust, breaking, partner content, dynasty articles, rookie articles, strategy, start/sit, MFL10s, DFS, etc. FP is a content/SEO juggernaut on top of a tools product. Implication for our positioning: don't try to match content breadth (we'll lose); compete on data depth + decisive synthesis (we'll win). Their content is opinion at scale; ours is calibrated prediction.

---

## 8. Landing page checklist: `/vs-fantasypros`

Build target: a long-form landing page that captures SEO for "fantasypros alternative", "fantasypros dynasty", "fantasypros vs", "fantasypros competitor" queries.

**Page sections (in order):**

1. **Hero**: headline + subhead + screenshot pair (their 4-tab clutter vs our Decision card)
2. **The honesty wedge**: "Coach won't make things up" with screenshot of Coach refusing to hallucinate trade history
3. **Comparison table** (compact): rows = features, columns = FP / DG / advantage. Use sections 2-4 above.
4. **Calibration scoreboard preview** (when Phase 2 ships): "We publish our Brier score. They don't."
5. **Dynasty-native vs retrofit**: keeper-format awareness, SF, league_type as first-class inputs
6. **Soundboard demo**: a small embeddable Soundboard with one or two dials live
7. **Pricing comparison**: their bundle ($80/yr+) vs ours (positioning TBD)
8. **CTA**: "Try Dynasty General free" with Sleeper-only onboarding (no extension)

**SEO:**
- Title: "FantasyPros Alternative for Dynasty Leagues | Dynasty General"
- Slug: `/vs-fantasypros` (canonical) plus `/fantasypros-alternative` redirect
- Schema.org `Product` markup with `competitor` field
- Open graph: comparison-grid card

**Watchouts:**
- Don't disparage FP. Frame as "different philosophies."
- No em dashes (per global CLAUDE.md hard rule).
- Don't claim Brier score advantage until Phase 2 backtest publishes; until then, frame as "we will publish ours."

---

## 9. Other competitive landing pages to build (SEO + positioning)

In rough priority order. Each is a `/vs-<competitor>` page that captures intent traffic and forces our positioning to be precise.

| Page | Why | Wedge |
|---|---|---|
| `/vs-fantasypros` | Highest-intent comparison search | Calibration + decision synthesis + dynasty-native |
| `/vs-keeptradecut` | Dynasty-specific, our most-cited price source | We BUILD ON KTC. Use it as a prior, then disagree-with-evidence. KTC is one source; we triangulate. |
| `/vs-fantasycalc` | Their dynasty algo competes directly with ours | We're calibrated and explainable; they're a black box |
| `/vs-sleeper` | Top-of-funnel for Sleeper users | We complement, not replace. Coach analyst layer on top of their league tools. |
| `/vs-yahoo` | Yahoo dynasty users are underserved | Free Yahoo tools are basic; we're the analyst |
| `/vs-mfl` | MyFantasyLeague is the old-guard dynasty platform | Our intelligence layer + their platform = upgrade |
| `/dynasty-glossary` | Long-tail SEO for dynasty terms | Builds topical authority and links |

---

## 10. Founder TODOs from the FP trial

- Extract Tier 1 artifacts within 3-day window (see DATA_ACQUISITION_PLAN.md §2.6)
- Drop CSVs in `web/data/fantasypros/`
- Cancel before trial expires unless we want continued archive access (~$80/yr)

---

## 11. Roadmap implications

This analysis VALIDATES the existing priority order. Already-queued work confirmed as priority by competitive pressure:

1. **Phase 2 backtest + calibrated survival probability** (single biggest wedge)
2. **Soundboard quantification + tooltips** (moat construction)
3. **Public scoreboard surface** (the marketing artifact)

New work surfaced by the FP screenshots:

4. **Draft Board grid view** (half-day build, parity lift)
5. **Tier badge "x/y depleted" format** (data exists, UI only)
6. **Strategy preset chips on Soundboard** (Zero RB / Late QB as one-click presets)
7. **`/vs-fantasypros` landing page** (SEO capture + positioning)
8. **Coach honesty repositioning** (copy change on existing surface)

Nothing else from FP is worth re-prioritizing for. Their breadth is a trap; ours is the depth.
