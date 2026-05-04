# Soundboard v2 Spec

**Status:** draft, 2026-05-03
**Owner:** Isaiah McPeak
**Companion docs:** MODEL_CARD.md (engine contract),
RESEARCH_CORPUS.md (signals), VALIDATION_PLAN.md (calibration),
project_judgment_soundboard_idea.md + project_soundboard_moat_strategy.md (memory)

## 0. Why v2 exists

Soundboard v1 (current production) was designed before the canon work.
It exposes ~5 dials that map onto an engine whose weights are still
heuristic. The dials feel like "judgment knobs" rather than "scientific
priors."

The architecture rethink on 2026-05-03 named the gap directly: the
sports science we just built (RESEARCH_CORPUS.md, MODEL_CARD.md) needs
to become **existential to the app**. That means the user-facing dials
must map onto **research-grounded model parameters**, not vibes.

v2 reorganizes 14 dials into three tiers, each tier serving a distinct
user mental model:

- **Tier 1: Math** (5 dials). Model internals exposed honestly. These
  drive the loss function, the prior, and the variance treatment.
- **Tier 2: Position** (4 dials). Position-specific philosophies. These
  shift weights within the per-position rubrics (MODEL_CARD section 4).
- **Tier 3: Preference** (5 dials). User values, not engine internals.
  These shift weights between archetypes and time horizons.

Total: 14 dials, all explainable, all auditable, all mapped to a
specific engine parameter or weight set.

## 1. Design principles

1. **Every dial maps to a real engine parameter.** No placebo dials.
   If we can't say what changes when the dial moves, we don't ship the
   dial.
2. **Every dial has a tooltip with the actual research citation.** Per
   the moat strategy memory: tooltips must be truthful. "RB age curve
   shows production drop at 27 (Mass 2018)" is fine. "We boost younger
   RBs" is too vague.
3. **Defaults are calibrated, not opinionated.** Default dial positions
   reflect Phase 2 calibration findings. We do NOT default-boost
   contrarianism or default-discount aging; we default to what the
   backtest says was optimal.
4. **Format dial is tier 1 because it changes the loss function.**
   League format is not a preference; it's a prediction-target switch.
5. **Argue-with-the-mixer is a primary interaction.** When user
   disagrees with engine output, they can challenge a dial or propose a
   new dial. See MOAT (section 8).

## 2. Tier 1: Math dials (5)

These five drive the loss function, prior weight, and variance
treatment. Touching these changes the **prediction**, not just the
ranking.

### 2.1 League Format

| Position | Effect | Engine parameter |
|---|---|---|
| Redraft | L = season_PPR_RMSE only | `loss_fn = "redraft"` |
| Standard dynasty | L = 0.6 × KTC_MAE + 0.4 × 3yr_PPR | `loss_fn = "dynasty_standard"` |
| SF dynasty | dynasty + QB position weight 1.6x | `loss_fn = "dynasty_sf"` |
| Keeper (1-keep) | season_PPR for keeper + cost penalty | `loss_fn = "keeper_v0"` |
| Best Ball | top-8-starts RMSE + variance premium | `loss_fn = "bestball"` |

**Tooltip:** "Switches the model's prediction target. Redraft optimizes
this season's points only. Dynasty optimizes for 3-year value plus KTC
movement. Each format runs a different loss function (see Validation
Plan section 8)."

**Default:** auto-detected from the league's Sleeper config.

### 2.2 Time Horizon

Continuous slider, 0-100. Position 50 = balanced.

| Position | Effect |
|---|---|
| 0 (now) | weight current-year fantasy 1.0, 3-year 0.0 |
| 50 (balanced) | weight current 0.5, 3-year 0.5 |
| 100 (long) | weight current 0.0, 3-year 1.0 |

**Tooltip:** "How much do you weight this season's points vs. the
next three years? Win-now leagues lean left. Rebuild leagues lean
right. Most dynasty managers underweight either extreme."

**Default:** comes from Coach's win-now/future analysis of the user's
current standings (e.g., 4-2 with strong roster = 70 toward now).

**Engine parameter:** `horizon_weight ∈ [0, 1]` multiplies the
cumulative_3yr term in dynasty losses.

### 2.3 Variance Tolerance

Continuous slider, 0-100. Position 50 = neutral.

| Position | Effect |
|---|---|
| 0 (smooth) | prefer point_estimate over wide-band players |
| 50 (neutral) | rank by point_estimate alone |
| 100 (volatile) | prefer wide-band players where ceiling is high |

**Tooltip:** "How much chaos do you want? Best Ball and 14-team leagues
reward high-variance picks. Cash-game leagues reward smooth floors.
The model produces variance bands; this dial decides what to do with
them."

**Default:** auto-detected from format (Best Ball default = 75; cash
default = 30).

**Engine parameter:** `variance_premium ∈ [-1, 1]` multiplies the
band-width contribution to ranking.

### 2.4 Market Anchor

Continuous slider, 0-100. Position 50 = balanced.

| Position | Effect |
|---|---|
| 0 (model-only) | Bayesian prior weight = 0; rubric_score is everything |
| 50 (balanced) | prior weight = 0.5; KTC ≈ rubric |
| 100 (market-only) | prior weight = 1.0; we ARE KTC |

**Tooltip:** "How much do you trust the market price (KTC, FantasyCalc)
vs. our signals? At 100, we're a KTC mirror. At 0, we ignore market and
rank purely on signals. The honest middle is around 40 unless you have
strong reason to override."

**Default:** 40 (Phase 2 calibration may shift this).

**Engine parameter:** `prior_weight ∈ [0, 1]` in the Bayesian update
formula `posterior_value = prior_weight × ktc_value + (1 - prior_weight) × rubric_score`.

### 2.5 Confidence Threshold

Continuous slider, 0-100. Position 50 = neutral.

| Position | Effect |
|---|---|
| 0 (sensitive) | flag arbitrage at confidence 0.4+ (more flags, more noise) |
| 50 (neutral) | flag arbitrage at confidence 0.6+ |
| 100 (strict) | flag arbitrage at confidence 0.8+ (fewer flags, only strongest) |

**Tooltip:** "How confident does Coach need to be before flagging an
arbitrage opportunity? Low = catch more potential edges, accept more
false positives. High = only the cleanest signals."

**Default:** 60 (slight lean toward sensitivity).

**Engine parameter:** `arbitrage_threshold ∈ [0.4, 0.8]` filters the
`arbitrage_flags` field of EvaluationOutput.

## 3. Tier 2: Position dials (4)

These shift weights WITHIN per-position rubrics. They change ranking
within position, not loss function.

### 3.1 RB Philosophy

Three radio options: zero-RB / hero-RB / RB-heavy

| Option | Effect |
|---|---|
| zero-RB | downweight RB_role_tier importance; upweight WR / TE early; only chase RB after round 6 |
| hero-RB | upweight one anchor RB (round 1-2); zero-RB after that |
| RB-heavy | full weight on RB_role_tier; allow RB1 in rounds 1-2-3 |

**Tooltip:** "RB philosophies have different EVs in different formats.
Zero-RB outperforms in 12-team PPR ([Hayden Winks 2020]). Hero-RB
captures the early-RB upside without committing fully. RB-heavy works
in TD-heavy and standard scoring. The dial doesn't decide what's right;
it tells the engine which strategy YOU want it to optimize within."

**Default:** zero-RB for 12-team PPR; hero-RB for SF; RB-heavy for
half-PPR.

**Engine parameter:** `rb_strategy ∈ {"zero", "hero", "heavy"}`
modifies `position_value_curve.RB`.

### 3.2 QB Strategy

Three radio options: early / late / streaming

| Option | Effect |
|---|---|
| early | rounds 3-5 OK for QB1; tier-conditional aging applied |
| late | QB only after round 8; streaming acceptable |
| streaming | rotate weekly QBs; depth + matchup over single QB1 |

**Tooltip:** "Single-QB formats reward late-round QB historically (3-4
ppg gap between QB1 and QB12 doesn't justify round-3 cost). SF
formats invert this. The QB tier-conditional aging curve applies
regardless (see corpus on Tier-1 QBs aging gracefully)."

**Default:** late in 1QB; early in SF.

**Engine parameter:** `qb_strategy ∈ {"early", "late", "streaming"}`
modifies QB rubric weights.

### 3.3 WR Target Style

Three radio options: alpha-only / depth / mix

| Option | Effect |
|---|---|
| alpha-only | only WRs with target_share > 24% qualify for top-tier ranking |
| depth | flatter WR distribution; rounds 6-12 WRs get bonus |
| mix | balanced; default behavior |

**Tooltip:** "Alphas pay off in cash games where consistency matters.
Depth wins Best Ball where you start your top-3 WRs each week. Mix
splits the difference."

**Default:** mix (PPR), depth (Best Ball), alpha-only (cash).

**Engine parameter:** `wr_strategy ∈ {"alpha", "depth", "mix"}`
modifies WR rubric.

### 3.4 TE Approach

Three radio options: elite-only / streaming / late

| Option | Effect |
|---|---|
| elite-only | only top-3 TEs (Kelce-tier) qualify as TE1 |
| streaming | rotate; depth and matchup |
| late | late-round TE with breakout-prone profile (12-personnel rate, scheme tag) |

**Tooltip:** "TE is the most position-scarce surface in fantasy. Elite
TE = you punt the position-gap problem. Late TE = you bet on a
breakout (corpus shows 12-personnel rate predicts TE breakout, see
research_corpus section TE)."

**Default:** late.

**Engine parameter:** `te_strategy ∈ {"elite", "streaming", "late"}`.

## 4. Tier 3: Preference dials (5)

These shift weights between user-values, not loss function or position
rubric. These ARE judgment calls, but they're made explicit.

### 4.1 Win-Now Urgency

Continuous, 0-100. Independent of horizon.

This is the user's confidence in their own roster's win-now strength.
Whereas horizon (2.2) is "how much do I value now vs future," urgency
is "how committed am I to TRYING to win now."

| Position | Effect |
|---|---|
| 0 (rebuild) | trade now-value to future; never mortgage future for marginal upgrades |
| 50 (balanced) | act on net-positive trades regardless of timing |
| 100 (all-in) | accept future-cost for now-upgrade; cut bench depth for waiver star |

**Default:** Coach-derived from standings + roster age.

**Engine parameter:** `urgency_premium` boosts trade recommendations
that cost future for now.

### 4.2 Rookie Love

Continuous, 0-100. Position 50 = neutral.

| Position | Effect |
|---|---|
| 0 (rookie-skeptic) | downweight rookies regardless of pedigree |
| 50 (neutral) | rookies treated by their archetype score |
| 100 (rookie-fiend) | upweight rookies; rookies of round 1 NFL = always considered |

**Tooltip:** "How much extra do you weight unproven NFL rookies? The
research shows rookie WR year-1 hit rate is ~25% even for first-round
NFL picks; rookie RB year-1 has higher hit rate at 40%. The neutral
default applies these rates honestly."

**Default:** 50.

**Engine parameter:** `rookie_premium ∈ [-0.3, 0.3]` modifies rookie
players' point_estimate.

### 4.3 Aging-Veteran Tolerance

Continuous, 0-100. Position 50 = neutral.

| Position | Effect |
|---|---|
| 0 (age-cliff-fearful) | RBs over 27 hard-discounted; WRs over 30 |
| 50 (neutral) | apply position aging curves from corpus |
| 100 (age-tolerant) | minimal age penalty; bet on outliers |

**Tooltip:** "Age curves are real but vary by position. RB cliff is
sharp at 27 (corpus, Mass 2018). WR aging is more gradual; 30+ WRs
hold value if target_share holds. QB tier-1 ages well; tier-2 ages
poorly. The neutral default applies position-specific curves."

**Default:** 50.

**Engine parameter:** `age_curve_steepness ∈ [-0.3, 0.3]` modifies
position-specific aging functions.

### 4.4 News Reactivity

Continuous, 0-100. Position 50 = neutral.

| Position | Effect |
|---|---|
| 0 (slow-react) | discount transient news; trust season-long signals |
| 50 (neutral) | apply compounding-news arbitrage normally |
| 100 (fast-react) | weight latest-week news heavily; chase headlines |

**Tooltip:** "Compounding-news (3+ transitions in offseason) is a
real arbitrage signal. But week-to-week news is mostly noise. The
neutral default uses the corpus rule: 3+ transitions = arbitrage flag,
single news item = ignore."

**Default:** 50.

**Engine parameter:** `news_decay_rate` modifies how quickly news
items lose weight.

### 4.5 Trade Aggression

Continuous, 0-100. Position 50 = neutral.

| Position | Effect |
|---|---|
| 0 (passive) | only suggest trades with >15% net value gain |
| 50 (neutral) | suggest trades with >5% net value gain |
| 100 (active) | suggest any trade Coach can defend |

**Tooltip:** "How aggressive should Coach be in proposing trades?
Passive = only obvious wins. Active = many proposals, lower hit rate.
The KTC ±15% trade-realism gate still applies regardless (see
trade-realism-tester subagent)."

**Default:** 50.

**Engine parameter:** `trade_threshold ∈ [0.05, 0.15]` filters
suggested trades by net value gain.

## 5. UX architecture

### 5.1 Primary view: tier-collapsed

By default, Soundboard shows three collapsed tiers with a one-line
summary each:

```
[Math]      Format: Dynasty SF · Horizon: 60 · Variance: 50 · Anchor: 40 · Threshold: 60
[Position]  RB: zero-RB · QB: SF-early · WR: mix · TE: late
[Preference] Urgency: 65 · Rookie: 55 · Veteran: 50 · News: 50 · Trade: 50
```

Click a tier to expand the dials.

### 5.2 Tooltip pattern

Every dial label has a `?` icon. Click reveals:

1. Plain-English description
2. Research citation (corpus reference + year)
3. The engine parameter the dial controls
4. The default value and why

### 5.3 Argue-with-the-mixer (moat feature)

When Coach produces a recommendation the user disagrees with, the
"Why?" expansion shows which dials drove it. User can:

- Adjust a dial inline and see recommendation update in real time
- Save adjusted dials as a "scenario" for later comparison
- Submit a "I disagree because..." note that becomes training data for
  future calibration

### 5.4 Suggest-a-dial (moat feature)

Free-text input: "I think the engine should consider..."

Submitted suggestions are reviewed weekly. If a dial is added, the
suggester is credited (user-name visible in dial tooltip). This is the
crowd-sourced feedback loop named in the moat strategy memory.

### 5.5 Tier-mapped tweak/build

- Free tier: tier 3 dials only (preferences)
- Paid tier: all 14 dials
- Pro tier: dials + scenario saving + dial-suggestion priority + dial-impact graphs

## 6. Migration from v1

### 6.1 v1 dial mapping

| v1 dial | v2 destination |
|---|---|
| Risk tolerance | Tier 1.3 Variance Tolerance |
| Time horizon | Tier 1.2 Time Horizon |
| Rookie weight | Tier 3.2 Rookie Love |
| RB strategy | Tier 2.1 RB Philosophy |
| Trade frequency | Tier 3.5 Trade Aggression |

The 5 v1 dials map cleanly. The 9 new dials are added.

### 6.2 Migration path

1. Phase 1.5 (week 4): Build v2 dial schema; migrate v1 user
   preferences to v2 with conservative defaults
2. Phase 1.5: Wire v2 dials to engine parameters; v1 UI continues
3. Phase 2 (post-calibration): swap v1 UI for v2 UI; old dials forward
4. Phase 3: deprecate v1 schema after one season of v2

### 6.3 Backward compatibility

v1 user dials get defaults for the new v2 dials. New users start with
calibrated v2 defaults. Soundboard v1 component stays in code but is
hidden behind a feature flag for one season as fallback.

## 7. Calibration impact

Phase 2 (calibration sprint, June-July 2026) must answer:

- Which DEFAULT dial position minimizes loss across the backtest?
- Which dial COMBINATIONS produce the best top-decile performance?
- Are any dials redundant (high correlation between dial movements)?
- Are any dials missing (calibration shows residual error not
  explained by current dials)?

Outputs: calibrated default values for every dial, written into
`web/lib/soundboard/defaults.ts` and documented in MODEL_CARD section
12.

## 8. Open questions

1. Does the "Confidence Threshold" dial deserve to be in tier 1, or
   does it belong in tier 3 (it doesn't change the loss function, just
   filters the output)? Argument for tier 1: it changes which players
   make the recommendation surface. Argument for tier 3: it's not the
   prediction itself.
2. Should "Trade Aggression" be split into "Trade volume" and "Trade
   acceptance threshold" (different things, currently conflated)?
3. Should we add a "Roster archetype" dial (e.g., "I want a balanced
   roster" vs "I want positional concentration")? Probably tier 2
   addition, but defer to Phase 3 to avoid scope creep.
4. How do we expose the QB tier-conditional aging curve as a dial? It's
   already inside the QB rubric, but power users may want to modulate
   it.

## 9. Definition of done for Soundboard v2

- All 14 dials implemented in TS schema
- All 14 mapped to engine parameters in `engine/evaluation/`
- Tier-collapsed UI live behind feature flag `SOUNDBOARD_V2`
- Tooltips written and citation-linked for all 14
- Argue-with-the-mixer wired (live recommendation update on dial change)
- Phase 2 calibration completed and defaults updated
- Old v1 component hidden behind fallback flag
- A/B test (10% v2 vs 90% v1) for one week; if v2 retention is not
  worse, full ship
