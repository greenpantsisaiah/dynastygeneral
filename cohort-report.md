# Lane-Identity Cohort Calibration Report

Cohort size: 58 rosters across 5 leagues.

## Whole-cohort state distribution

| Lane | Axis | IN | CLOSE | NOT_IN | Median | Threshold (CLOSE / IN) |
|---|---|---|---|---|---|---|
| Win-Now Floor | horizon | 23 (40%) | 25 (43%) | 10 (17%) | 286 | 200 / 300 |
| Balanced | horizon | 23 (40%) | 18 (31%) | 17 (29%) | 215 | 160 / 240 |
| Future Stock | horizon | 17 (29%) | 9 (16%) | 32 (55%) | 190 | 200 / 320 |
| RB Bellcow | archetype | 13 (22%) | 4 (7%) | 41 (71%) | 39 | 50 / 75 |
| WR Anchor | archetype | 13 (22%) | 9 (16%) | 36 (62%) | 0 | 55 / 80 |
| WR Stable | archetype | 2 (3%) | 11 (19%) | 45 (78%) | 73 | 100 / 140 |
| QB Stable | archetype | 3 (8%) | 8 (22%) | 25 (69%) | 84 | 100 / 140 |
| TE-Premium Lock | archetype | 5 (14%) | 4 (11%) | 27 (75%) | 31 | 60 / 90 |
| Trade Capital | archetype | 16 (28%) | 18 (31%) | 24 (41%) | 138 | 130 / 190 |
| Sustained Contender | composite | 12 (21%) | 13 (22%) | 33 (57%) | 1 | 2 / 3 |
| Zero-RB | composite | 1 (2%) | 8 (14%) | 49 (84%) | 1 | 1 / 2 |

## State distribution by format

### 1qb non-TEP (22 rosters)

| Lane | Axis | IN | CLOSE | NOT_IN | Median | Threshold (CLOSE / IN) |
|---|---|---|---|---|---|---|
| Win-Now Floor | horizon | 5 (23%) | 10 (45%) | 7 (32%) | 256 | 200 / 300 |
| Balanced | horizon | 6 (27%) | 5 (23%) | 11 (50%) | 170 | 160 / 240 |
| Future Stock | horizon | 1 (5%) | 5 (23%) | 16 (73%) | 130 | 200 / 320 |
| RB Bellcow | archetype | 7 (32%) | 1 (5%) | 14 (64%) | 44 | 50 / 75 |
| WR Anchor | archetype | 4 (18%) | 3 (14%) | 15 (68%) | 0 | 55 / 80 |
| WR Stable | archetype | 2 (9%) | 2 (9%) | 18 (82%) | 72 | 100 / 140 |
| Trade Capital | archetype | 2 (9%) | 6 (27%) | 14 (64%) | 116 | 130 / 190 |
| Sustained Contender | composite | 1 (5%) | 5 (23%) | 16 (73%) | 1 | 2 / 3 |
| Zero-RB | composite | 1 (5%) | 1 (5%) | 20 (91%) | 1 | 1 / 2 |

### superflex TEP (36 rosters)

| Lane | Axis | IN | CLOSE | NOT_IN | Median | Threshold (CLOSE / IN) |
|---|---|---|---|---|---|---|
| Win-Now Floor | horizon | 18 (50%) | 15 (42%) | 3 (8%) | 301 | 200 / 300 |
| Balanced | horizon | 17 (47%) | 13 (36%) | 6 (17%) | 239 | 160 / 240 |
| Future Stock | horizon | 16 (44%) | 4 (11%) | 16 (44%) | 305 | 200 / 320 |
| RB Bellcow | archetype | 6 (17%) | 3 (8%) | 27 (75%) | 0 | 50 / 75 |
| WR Anchor | archetype | 9 (25%) | 6 (17%) | 21 (58%) | 0 | 55 / 80 |
| WR Stable | archetype | 0 (0%) | 9 (25%) | 27 (75%) | 73 | 100 / 140 |
| QB Stable | archetype | 3 (8%) | 8 (22%) | 25 (69%) | 84 | 100 / 140 |
| TE-Premium Lock | archetype | 5 (14%) | 4 (11%) | 27 (75%) | 31 | 60 / 90 |
| Trade Capital | archetype | 14 (39%) | 12 (33%) | 10 (28%) | 174 | 130 / 190 |
| Sustained Contender | composite | 11 (31%) | 8 (22%) | 17 (47%) | 2 | 2 / 3 |
| Zero-RB | composite | 0 (0%) | 7 (19%) | 29 (81%) | 1 | 1 / 2 |

## Standings cross-check (IN-rate by win-pct bucket)

If a lane's IN-rate slopes positively from bottom-quartile to top-quartile, it correlates with team success. Win-now-floor and sustained-contender should slope hard; future-stock can slope either way.

| Lane | Top quartile (likely contender) | Upper mid | Lower mid | Bottom quartile (likely rebuild) |
|---|---|---|---|---|
| Win-Now Floor | 2/6 (33%) | 2/5 (40%) | 1/6 (17%) | 0/5 (0%) |
| Balanced | 2/6 (33%) | 1/5 (20%) | 2/6 (33%) | 1/5 (20%) |
| Future Stock | 0/6 (0%) | 1/5 (20%) | 0/6 (0%) | 0/5 (0%) |
| RB Bellcow | 2/6 (33%) | 1/5 (20%) | 2/6 (33%) | 2/5 (40%) |
| WR Anchor | 3/6 (50%) | 0/5 (0%) | 1/6 (17%) | 0/5 (0%) |
| WR Stable | 0/6 (0%) | 0/5 (0%) | 2/6 (33%) | 0/5 (0%) |
| Trade Capital | 1/6 (17%) | 1/5 (20%) | 0/6 (0%) | 0/5 (0%) |
| Sustained Contender | 0/6 (0%) | 0/5 (0%) | 1/6 (17%) | 0/5 (0%) |
| Zero-RB | 0/6 (0%) | 0/5 (0%) | 1/6 (17%) | 0/5 (0%) |

## Per-lane recommendations

#### Win-Now Floor (win_now_floor)
- IN-rate 40% looks healthy.
- Median 286; p25-p75: 237 to 330; thresholds CLOSE 200 / IN 300.

#### Balanced (balanced)
- IN-rate 40% looks healthy.
- Median 215; p25-p75: 143 to 272; thresholds CLOSE 160 / IN 240.

#### Future Stock (future_stock)
- IN-rate 29% looks healthy.
- Median 190; p25-p75: 73 to 342; thresholds CLOSE 200 / IN 320.

#### RB Bellcow (rb_bellcow)
- IN-rate 22% looks healthy.
- Median 39; p25-p75: 0 to 74; thresholds CLOSE 50 / IN 75.

#### WR Anchor (wr_anchor)
- IN-rate 22% looks healthy.
- Median 0; p25-p75: 0 to 62; thresholds CLOSE 55 / IN 80.

#### WR Stable (wr_stable)
- Median 73; p25-p75: 47 to 96; thresholds CLOSE 100 / IN 140.

#### QB Stable (qb_stable)
- Median 84; p25-p75: 57 to 105; thresholds CLOSE 100 / IN 140.

#### TE-Premium Lock (te_premium_lock)
- Median 31; p25-p75: 0 to 77; thresholds CLOSE 60 / IN 90.

#### Trade Capital (trade_capital)
- IN-rate 28% looks healthy.
- Median 138; p25-p75: 102 to 195; thresholds CLOSE 130 / IN 190.

#### Sustained Contender (sustained_contender)
- IN-rate 21% looks healthy.
- Median 1; p25-p75: 0 to 2; thresholds CLOSE 2 / IN 3.

#### Zero-RB (zero_rb)
- Median 1; p25-p75: 1 to 1; thresholds CLOSE 1 / IN 2.
