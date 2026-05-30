# Dynasty General · Negative results

Per MODEL_LIVE_PLAN Phase B (B.N.4): a signal whose backtest lift does not
clear the bar is logged here. The rows can stay in the source tables (no
harm), but the rubric weight stays at the prior and the signal is NOT
promoted to the live `player_signals` column. This file is the durable
record so a future session does not re-run a settled bake-off.

## B2: LLM-coded `rb_role_tier` lost the bake-off to the snap-derived tier (2026-05-30)

`rb_role_tier` is the RB-rubric HARD GATE (MODEL_CARD 4.2 v1): a
`committee_member` / `starter_uncertain` coding caps the rubric at 60 and
defeats the market blend. Phase B2 ran a validate-first bake-off of two tier
sources as that gate:

- **Snap-derived** (the incumbent): `deriveRbRoleTier` over prior-season
  nflverse snap / rush / target share (`src/lib/signals/nflverse.ts`). The
  source the production RB rubric reads today (the A4 baseline).
- **LLM-coded**: the `historical-signal-extractor` agent's vintage-blinded
  coding in `historical_signal_codes` (182 rows: 2022 / 2023 / 2024,
  ~60 RBs/year, all values on-schema), each restricted to sources dated
  before that year's pre-draft cutoff.

Both are vintage-safe: snap-derived reads season Y-1, the LLM is blinded to
pre-draft Y. Neither sees season-Y outcomes.

### Backtest (temporal-blinded, decision years 2023 + 2024)

Harness: `scripts/backtest-rb-tier-bakeoff.ts`. Loss function: Spearman of
the RB-rubric point estimate vs realized season-Y PPR points-per-game
(`games_played >= 6`). Market baseline: KTC at the historical snapshot
`<= Sep 15` of year Y. Same cohort across all variants (cohort held fixed,
only the injected `rb_role_tier` source changes). CI: 1000-iter mulberry32
bootstrap (seed 42), the same protocol as the A4 backtests. Full output:
`data/audits/backtest-rb-tier-bakeoff-2026-05-30.txt`.

LLM tier coverage of the cohort: 74 / 129 (57.4%); the LLM batch coded
top-N RBs as of the pre-draft cutoff, so it does not reach every cohort RB.

| Variant | Spearman | Lift vs market | 95% CI of lift |
|---|---:|---:|---|
| market (KTC) | 0.717 | (baseline) | |
| rubric + SNAP tier (A4) | 0.691 | -0.027 | [-0.065, +0.011] |
| rubric + LLM tier (+snap fallback) | 0.675 | -0.042 | [-0.086, +0.002] |
| rubric + LLM tier (no fallback) | 0.675 | -0.042 | [-0.086, +0.001] |

Apples-to-apples (only the 74 RBs both sources code), head-to-head paired
bootstrap of (LLM tier - snap tier) vs the same outcome:

- Spearman diff: **-0.007**, 95% CI **[-0.051, +0.040]** (straddles zero).

### Decision

**Winner: the snap-derived tier (incumbent). The LLM tier is the negative
result.** Three reasons:

1. **No source clears the market.** Every variant's lift vs KTC is negative;
   no CI excludes zero on the up side. This reproduces the A4 finding
   (the RB rubric is statistically indistinguishable from the market on the
   current signal set) and confirms the bottleneck is the missing
   load-bearing RB signals (weighted-opportunity, OL run grade), not the
   tier source.
2. **The LLM tier does not beat the snap tier.** Its point estimate is
   slightly worse and the paired head-to-head CI straddles zero: the two
   sources are not statistically separable on this cohort.
3. **The snap tier covers the full pool**; the LLM batch only reaches
   top-N RBs as of the cutoff. With no quality edge to offset the coverage
   gap, there is no case to switch.

The snap-derived tier therefore STAYS the live `player_signals.rb_role_tier`
source. `scripts/ingest-rb-role-tier.ts` (dry-run-validated) refreshes that
winning source per completed season; the production write is
founder-authorized. The LLM `rb_role_tier` rows remain in
`historical_signal_codes` for the historical backtest harness; they are NOT
promoted to the live column and no rubric weight changes.

Caveat (do not over-read): the bake-off says the LLM tier is not BETTER at
ranking realized production, on a 129-RB / 74-paired cohort. The disagreements
are real and substantive (the LLM was consistently more conservative, e.g.
snap `strict_bellcow` vs LLM `bellcow` for CMC / Saquon; snap `lead_back` vs
LLM `bellcow` for Derrick Henry 2024). The bake-off measures rank-correlation
to PPR, not per-player coding accuracy, and both feed the same coarse 4-band
rubric gate. If a future Phase D rubric makes finer use of the tier, re-run
the bake-off before assuming this verdict still holds.
