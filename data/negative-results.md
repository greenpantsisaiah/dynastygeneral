# Negative results (validate-first ledger)

Per MODEL_LIVE_PLAN Phase B doctrine (issue #34: backtest BEFORE you
invest): a signal that does not lift the rubric over the market is logged
here as a money-saving negative result. The rows can stay in the DB (no
harm); the rubric weight stays at the prior. This ledger is what stops us
re-acquiring a signal we already disproved.

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
