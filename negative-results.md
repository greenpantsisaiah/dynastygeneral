# Negative / inconclusive backtest results

The validate-first log (MODEL_LIVE_PLAN.md Phase B four-step protocol).
A signal that does not clear an operationally meaningful, CI-excludes-zero
lift is recorded here so a future session does not re-acquire it hoping
for a different answer. The data may stay wired (no harm); the rubric
weight stays at the prior until the signal earns more.

## Route participation (WR / TE), 2026-05-30, Phase B #3

**Signal.** Prior-season route participation, the share of his team's
dropbacks a WR / TE was on the field for, from nflverse
`pbp_participation` (CC-BY-4.0). Free proxy: the file lists on-field
players per play but does not chart per-player routes, so route
participation = (dropback plays on field) / (team dropbacks in those
games). WR / TE only. Computed by the canonical `buildRouteParticipation`
in `src/lib/signals/nflverse.ts`; the same function feeds the live ingest
and the backtest, so the two cannot drift.

**Method.** Three-way, per position, pooled across decision years
2023 + 2024, temporally blinded (a year-Y prediction reads year-(Y-1)
route rates). Spearman vs realized season-Y PPR points-per-game.
`scripts/backtest-route-participation.ts`. Route coverage of the cohort:
WR 85%, TE 86%.

**Result.**

| Position | n | market (KTC) | rubric A4 (no route) | rubric + route | lift vs A4 (95% CI) | lift vs market (95% CI) |
|---|---|---|---|---|---|---|
| WR | 220 | 0.744 | 0.734 | 0.743 | +0.009 ([-0.001, 0.020]) | -0.001 ([-0.012, 0.010]) |
| TE | 94 | 0.728 | 0.728 | 0.732 | +0.004 ([-0.040, 0.046]) | +0.004 ([-0.037, 0.043]) |

**Decision: INCONCLUSIVE (directionally correct, not significant).**
Route participation moves the rubric in the right direction for both
positions (WR +0.009 over the A4 baseline, TE +0.004), but neither
lift's 95% CI excludes zero, and the rubric still does not clear the
market prior by a meaningful margin. This does NOT meet the Phase D3
gate ("positive lift with CI excluding zero").

**Why this is the expected shape, not a bug.** Route participation is a
volume FLOOR, not an independent edge. A receiver's route share is
strongly collinear with his target share and his market value (a
full-time alpha runs ~95% of routes AND is priced as an alpha). KTC
already prices that in, so a route signal layered on top of an already
strong market prior earns only a small marginal lift. The TE cohort
(n=94, two years) is also small; the CI is correspondingly wide.

**What ships anyway (no harm, real benefit):**
- The signal is WIRED and PER-SEASON BACKTESTABLE (the central B#1
  lesson: a current-only snapshot cannot validate). Phase D3 can re-run
  the bake-off against richer signals (route participation in 2-TE sets,
  paid charting) on this foundation.
- The rubric weights are modest by design (WR situation weight 0.07; TE
  the MODEL_CARD 4.4 hard-floor read at 0.15), and the WR/TE rubric is
  NOT in the value scale or `synthesize` today, so this changes no
  user-facing number until Phase D wires `evaluate()`.
- The live ingest populates `route_participation_prior_year`, lighting
  up the inflection / EnrichedPlayer no-silent-null contract for WR/TE.

**Do not** re-acquire this as if it were missing, or raise the rubric
weight chasing the small lift. The next move for route is the
2-TE-set-specific charting variant (MODEL_CARD 4.4 footnote, Phase B #7),
not more of the same on-field proxy.

## 2026-05-30 · Free OL pass-protection proxy does not lift the QB rubric

**Phase B6 (sig-ol-grade), free-alternative check.** Before paying for PFF
offensive-line grades, we tested whether a FREE pass-protection proxy
(derived from nflverse play-by-play, CC-BY) lifts the QB rubric.

- **Signal:** `ol_grade_pass` = inverse sack rate allowed (sacks /
  dropbacks) per team-season, percentile-normalized 0..1. The QB rubric's
  only OL branch reads this field. Derived by
  `scripts/derive-free-ol-grades.ts`. Spread is full (0..1 each season),
  so the proxy is real and varying, not degenerate.
- **Method:** `scripts/backtest-qb-rubric.ts --with-ol --ol-file ...`,
  temporal-blinded (a season-S grade enriches decision year S+1).
  Baseline (no OL) vs +OL, Spearman of rubric vs realized next-year PPR
  PPG. Decision years 2023 + 2024, pooled n=70, OL joined for 62/70.
- **Result:**

  | | market (KTC) | rubric | lift | 95% CI |
  |---|---:|---:|---:|---|
  | baseline (no OL) | 0.781 | 0.709 | -0.072 | [-0.222, 0.012] |
  | +free OL pass | 0.781 | 0.705 | -0.076 | [-0.229, 0.012] |

  **Marginal OL lift: -0.004** (noise-level on n=70).

- **Reading:** a real, full-variance pass-protection signal does not
  improve how the rubric ranks QBs for next-year production. The marginal
  lift is essentially zero (slightly negative). This is not "free OL is
  bad data"; it is "OL pass-protection is not a QB-RANKING lever at this
  cohort size, on top of the rubric's existing tier + age + market
  signals."
- **Decision:** do NOT wire the free OL proxy into the QB rubric. It earns
  nothing. This also LOWERS the expected value of buying PFF for QB: PFF's
  charting grade is cleaner than a sack-rate proxy, but for it to be worth
  paying, it would have to turn a -0.004 proxy result into a positive
  lift, which is a large ask on n=70. Recommendation: hold the PFF spend
  for QB; revisit OL when (a) the QB cohort is larger, or (b) the RB
  rubric wires `ol_grade_run` as a variance-band modifier (a different
  test: band calibration, not a point-estimate Spearman).
- **Caveats:** n=70 is below the 100 floor; the CI is wide. The sack-rate
  proxy conflates OL with QB time-to-throw and scramble tendency (a mobile
  QB lowers his own sack rate), so it is a noisier OL measure than PFF
  charting. Both caveats argue for HOLDING, not for buying on hope.
