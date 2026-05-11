# Empirical Age-Curve Validation

Seasons sampled: 2022, 2023, 2024, 2025. Per-player threshold: >= 6 games. Cohort threshold: >= 4 observations.

Two views per position:
  - **All survivors**: every player with >= 6 games in the season. Median includes deep-bench depth (3rd-string RBs, practice-squad TEs). Useful as a population baseline but flat curves don't necessarily refute starter-tier cliffs.
  - **Starter tier**: top-N PPR producers per (position, season). N = QB:12, RB:24, WR:36, TE:12. Isolates the production the engine actually cares about; cliffs that exist in the starter cohort but not in the all-survivors cohort are real.

Survivorship caveat: the Sleeper player cache only contains players still in the system in 2026. Retirees who left before 2026 are excluded, so age 32+ cohorts are upward-biased (counting retirees as zero would steepen the cliff). Treat cliff AGE as more reliable than cliff MAGNITUDE.

---

# Starter-Tier View (the one that matters)

## QB

| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |
|---|---|---|---|---|---|---|---|
| 23 | 5 | 20.3 | 19.1 | 21.5 | 0.90 | 0.00 | we underprice |
| 24 | 5 | 19.4 | 18.3 | 19.4 | 0.86 | 0.85 | match |
| 25 | 6 | 21.3 | 18.6 | 21.5 | 0.95 | 0.85 | we underprice |
| 26 | 7 | 19.1 | 18.1 | 24.2 | 0.85 | 1.00 | we overprice |
| 27 | 6 | 22.5 | 18.4 | 22.6 | 1.00 | 1.00 | match |
| 28 | 4 | 18.4 | 17.7 | 22.0 | 0.82 | 1.00 | we overprice |
| 29 | 4 | 21.2 | 20.7 | 22.5 | 0.94 | 1.00 | match |

Empirical cliff: no clear cliff in sampled range.

## RB

| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |
|---|---|---|---|---|---|---|---|
| 21 | 7 | 14.5 | 14.4 | 17.1 | 0.82 | 0.00 | we underprice |
| 22 | 7 | 17.6 | 13.3 | 21.3 | 1.00 | 0.00 | we underprice |
| 23 | 10 | 13.7 | 13.0 | 20.2 | 0.78 | 1.00 | we overprice |
| 24 | 20 | 14.2 | 11.6 | 15.9 | 0.80 | 1.00 | we overprice |
| 25 | 17 | 14.8 | 12.6 | 16.6 | 0.84 | 1.00 | we overprice |
| 26 | 15 | 15.7 | 13.6 | 17.2 | 0.89 | 1.00 | we overprice |
| 27 | 7 | 15.8 | 14.6 | 17.9 | 0.90 | 0.80 | match |
| 28 | 7 | 15.5 | 11.5 | 18.9 | 0.88 | 0.80 | match |

Empirical cliff: no clear cliff in sampled range.

## WR

| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |
|---|---|---|---|---|---|---|---|
| 21 | 7 | 13.0 | 11.6 | 16.7 | 0.83 | 0.00 | we underprice |
| 22 | 17 | 14.2 | 12.4 | 16.5 | 0.91 | 0.00 | we underprice |
| 23 | 21 | 14.1 | 12.3 | 16.8 | 0.91 | 0.85 | match |
| 24 | 17 | 14.3 | 13.5 | 17.6 | 0.92 | 1.00 | match |
| 25 | 21 | 14.2 | 11.9 | 17.0 | 0.91 | 1.00 | match |
| 26 | 17 | 13.6 | 12.1 | 14.3 | 0.87 | 1.00 | we overprice |
| 27 | 12 | 14.0 | 12.3 | 14.7 | 0.90 | 1.00 | we overprice |
| 28 | 10 | 15.1 | 13.5 | 18.9 | 0.97 | 1.00 | match |
| 29 | 8 | 14.8 | 12.8 | 16.6 | 0.95 | 1.00 | match |
| 30 | 5 | 15.6 | 13.2 | 17.2 | 1.00 | 0.85 | we underprice |
| 31 | 4 | 12.4 | 12.4 | 17.2 | 0.79 | 0.85 | match |

Empirical cliff: no clear cliff in sampled range.

## TE

| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |
|---|---|---|---|---|---|---|---|
| 23 | 6 | 9.6 | 9.3 | 10.7 | 0.73 | 0.85 | we overprice |
| 24 | 5 | 12.4 | 10.7 | 12.7 | 0.95 | 0.85 | match |
| 25 | 5 | 10.1 | 9.9 | 14.6 | 0.78 | 1.00 | we overprice |
| 26 | 4 | 12.6 | 11.1 | 12.7 | 0.96 | 1.00 | match |
| 28 | 6 | 13.1 | 10.6 | 13.4 | 1.00 | 1.00 | match |

Empirical cliff: no clear cliff in sampled range.

---

# All-Survivors View (for context)

## QB

| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |
|---|---|---|---|---|---|---|---|
| 21 | 5 | 15.9 | 14.4 | 17.6 | 0.95 | 0.00 | we underprice |
| 22 | 12 | 13.7 | 11.8 | 16.4 | 0.82 | 0.00 | we underprice |
| 23 | 17 | 12.9 | 12.0 | 18.0 | 0.77 | 0.00 | we underprice |
| 24 | 27 | 11.6 | 7.4 | 18.3 | 0.69 | 0.85 | we overprice |
| 25 | 21 | 16.3 | 10.5 | 20.2 | 0.97 | 0.85 | we underprice |
| 26 | 18 | 16.1 | 12.4 | 18.8 | 0.96 | 1.00 | match |
| 27 | 16 | 16.8 | 11.3 | 18.7 | 1.00 | 1.00 | match |
| 28 | 14 | 16.7 | 13.1 | 17.7 | 0.99 | 1.00 | match |
| 29 | 11 | 10.9 | 2.1 | 20.7 | 0.65 | 1.00 | we overprice |
| 30 | 7 | 15.4 | 11.9 | 16.6 | 0.92 | 1.00 | match |
| 31 | 7 | 13.9 | 10.4 | 18.5 | 0.82 | 1.00 | we overprice |
| 32 | 4 | 15.8 | 15.6 | 16.8 | 0.94 | 1.00 | match |
| 33 | 5 | 15.8 | 13.4 | 16.5 | 0.94 | 1.00 | match |
| 34 | 5 | 13.1 | 12.8 | 17.7 | 0.78 | 0.85 | match |
| 35 | 4 | 16.2 | 13.7 | 16.9 | 0.96 | 0.85 | we underprice |
| 36 | 4 | 10.9 | 10.8 | 13.9 | 0.65 | 0.85 | we overprice |

Empirical cliff: median PPG first drops materially at age 29.

## RB

| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |
|---|---|---|---|---|---|---|---|
| 20 | 14 | 2.7 | 1.3 | 5.0 | 0.23 | 0.00 | we underprice |
| 21 | 30 | 6.0 | 1.4 | 11.3 | 0.50 | 0.00 | we underprice |
| 22 | 47 | 5.3 | 1.7 | 9.8 | 0.45 | 0.00 | we underprice |
| 23 | 66 | 5.5 | 2.6 | 10.7 | 0.47 | 1.00 | we overprice |
| 24 | 87 | 5.2 | 2.1 | 10.7 | 0.44 | 1.00 | we overprice |
| 25 | 80 | 5.6 | 1.9 | 11.4 | 0.48 | 1.00 | we overprice |
| 26 | 53 | 7.0 | 2.8 | 13.1 | 0.59 | 1.00 | we overprice |
| 27 | 30 | 5.9 | 1.9 | 12.8 | 0.50 | 0.80 | we overprice |
| 28 | 21 | 7.9 | 1.4 | 12.3 | 0.67 | 0.80 | we overprice |
| 29 | 13 | 7.0 | 4.8 | 10.5 | 0.59 | 0.50 | match |
| 30 | 8 | 11.9 | 7.8 | 17.8 | 1.00 | 0.50 | we underprice |
| 31 | 6 | 5.2 | 2.6 | 5.5 | 0.44 | 0.00 | we underprice |

Empirical cliff: median PPG first drops materially at age 31.

## WR

| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |
|---|---|---|---|---|---|---|---|
| 20 | 7 | 2.8 | 1.7 | 10.5 | 0.39 | 0.00 | we underprice |
| 21 | 38 | 7.3 | 3.5 | 9.8 | 0.99 | 0.00 | we underprice |
| 22 | 96 | 5.5 | 2.1 | 10.4 | 0.75 | 0.00 | we underprice |
| 23 | 113 | 3.6 | 1.8 | 9.6 | 0.49 | 0.85 | we overprice |
| 24 | 115 | 4.0 | 1.4 | 9.5 | 0.55 | 1.00 | we overprice |
| 25 | 98 | 4.1 | 1.6 | 10.3 | 0.56 | 1.00 | we overprice |
| 26 | 81 | 4.9 | 1.9 | 10.4 | 0.67 | 1.00 | we overprice |
| 27 | 64 | 5.3 | 2.4 | 8.7 | 0.72 | 1.00 | we overprice |
| 28 | 57 | 4.5 | 2.3 | 9.1 | 0.61 | 1.00 | we overprice |
| 29 | 44 | 6.0 | 3.4 | 11.7 | 0.82 | 1.00 | we overprice |
| 30 | 24 | 5.8 | 1.5 | 13.2 | 0.79 | 0.85 | match |
| 31 | 15 | 7.3 | 3.5 | 10.6 | 1.00 | 0.85 | we underprice |
| 32 | 8 | 6.3 | 3.9 | 13.6 | 0.86 | 0.55 | we underprice |

Empirical cliff: median PPG first drops materially at age 23.

## TE

| Age | N | Median PPG | p25 | p75 | Empirical mult | Model mult | Verdict |
|---|---|---|---|---|---|---|---|
| 21 | 14 | 5.1 | 2.3 | 7.6 | 0.39 | 0.00 | we underprice |
| 22 | 40 | 3.3 | 1.0 | 4.6 | 0.25 | 0.00 | we underprice |
| 23 | 52 | 2.3 | 1.3 | 5.7 | 0.18 | 0.85 | we overprice |
| 24 | 66 | 2.8 | 1.0 | 4.8 | 0.21 | 0.85 | we overprice |
| 25 | 62 | 2.3 | 1.1 | 5.7 | 0.18 | 1.00 | we overprice |
| 26 | 46 | 2.5 | 1.0 | 6.7 | 0.19 | 1.00 | we overprice |
| 27 | 43 | 3.4 | 1.1 | 7.2 | 0.26 | 1.00 | we overprice |
| 28 | 35 | 3.2 | 1.6 | 8.3 | 0.24 | 1.00 | we overprice |
| 29 | 29 | 2.7 | 1.3 | 7.7 | 0.20 | 1.00 | we overprice |
| 30 | 20 | 1.9 | 1.3 | 7.9 | 0.15 | 1.00 | we overprice |
| 31 | 8 | 5.4 | 1.8 | 11.6 | 0.41 | 0.85 | we overprice |
| 32 | 6 | 9.0 | 7.1 | 9.9 | 0.69 | 0.85 | we overprice |
| 33 | 4 | 13.0 | 10.4 | 14.6 | 1.00 | 0.55 | we underprice |
| 34 | 4 | 9.7 | 3.2 | 12.2 | 0.75 | 0.55 | we underprice |

Empirical cliff: median PPG first drops materially at age 34.
