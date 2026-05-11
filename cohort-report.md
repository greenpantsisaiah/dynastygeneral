# Lane-Identity Cohort Calibration Report

Cohort size: 58 rosters across 5 leagues.

## Whole-cohort state distribution

| Lane | Axis | IN | CLOSE | NOT_IN | Median | Threshold (CLOSE / IN) |
|---|---|---|---|---|---|---|
| Win-Now Floor | horizon | 23 (40%) | 24 (41%) | 11 (19%) | 279 | 200 / 300 |
| Balanced | horizon | 16 (28%) | 19 (33%) | 23 (40%) | 180 | 160 / 240 |
| Future Stock | horizon | 17 (29%) | 8 (14%) | 33 (57%) | 190 | 200 / 320 |
| RB Bellcow | archetype | 13 (22%) | 5 (9%) | 40 (69%) | 38 | 50 / 75 |
| WR Anchor | archetype | 13 (22%) | 9 (16%) | 36 (62%) | 0 | 55 / 80 |
| WR Stable | archetype | 2 (3%) | 11 (19%) | 45 (78%) | 73 | 100 / 140 |
| QB Stable | archetype | 3 (8%) | 8 (22%) | 25 (69%) | 83 | 100 / 140 |
| TE-Premium Lock | archetype | 5 (14%) | 3 (8%) | 28 (78%) | 31 | 60 / 90 |
| Trade Capital | archetype | 16 (28%) | 16 (28%) | 26 (45%) | 136 | 130 / 190 |
| Sustained Contender | composite | 12 (21%) | 13 (22%) | 33 (57%) | 1 | 2 / 3 |
| Zero-RB | composite | 1 (2%) | 8 (14%) | 49 (84%) | 1 | 1 / 2 |

## State distribution by format

### 1qb non-TEP (22 rosters)

| Lane | Axis | IN | CLOSE | NOT_IN | Median | Threshold (CLOSE / IN) |
|---|---|---|---|---|---|---|
| Win-Now Floor | horizon | 5 (23%) | 11 (50%) | 6 (27%) | 252 | 200 / 300 |
| Balanced | horizon | 5 (23%) | 6 (27%) | 11 (50%) | 170 | 160 / 240 |
| Future Stock | horizon | 1 (5%) | 4 (18%) | 17 (77%) | 130 | 200 / 320 |
| RB Bellcow | archetype | 7 (32%) | 2 (9%) | 13 (59%) | 43 | 50 / 75 |
| WR Anchor | archetype | 4 (18%) | 4 (18%) | 14 (64%) | 0 | 55 / 80 |
| WR Stable | archetype | 2 (9%) | 2 (9%) | 18 (82%) | 72 | 100 / 140 |
| Trade Capital | archetype | 2 (9%) | 5 (23%) | 15 (68%) | 116 | 130 / 190 |
| Sustained Contender | composite | 1 (5%) | 5 (23%) | 16 (73%) | 1 | 2 / 3 |
| Zero-RB | composite | 1 (5%) | 1 (5%) | 20 (91%) | 1 | 1 / 2 |

### superflex TEP (36 rosters)

| Lane | Axis | IN | CLOSE | NOT_IN | Median | Threshold (CLOSE / IN) |
|---|---|---|---|---|---|---|
| Win-Now Floor | horizon | 18 (50%) | 13 (36%) | 5 (14%) | 300 | 200 / 300 |
| Balanced | horizon | 11 (31%) | 13 (36%) | 12 (33%) | 214 | 160 / 240 |
| Future Stock | horizon | 16 (44%) | 4 (11%) | 16 (44%) | 305 | 200 / 320 |
| RB Bellcow | archetype | 6 (17%) | 3 (8%) | 27 (75%) | 0 | 50 / 75 |
| WR Anchor | archetype | 9 (25%) | 5 (14%) | 22 (61%) | 0 | 55 / 80 |
| WR Stable | archetype | 0 (0%) | 9 (25%) | 27 (75%) | 73 | 100 / 140 |
| QB Stable | archetype | 3 (8%) | 8 (22%) | 25 (69%) | 83 | 100 / 140 |
| TE-Premium Lock | archetype | 5 (14%) | 3 (8%) | 28 (78%) | 31 | 60 / 90 |
| Trade Capital | archetype | 14 (39%) | 11 (31%) | 11 (31%) | 159 | 130 / 190 |
| Sustained Contender | composite | 11 (31%) | 8 (22%) | 17 (47%) | 2 | 2 / 3 |
| Zero-RB | composite | 0 (0%) | 7 (19%) | 29 (81%) | 1 | 1 / 2 |

## Standings cross-check (IN-rate by win-pct bucket)

If a lane's IN-rate slopes positively from bottom-quartile to top-quartile, it correlates with team success. Win-now-floor and sustained-contender should slope hard; future-stock can slope either way.

| Lane | Top quartile (likely contender) | Upper mid | Lower mid | Bottom quartile (likely rebuild) |
|---|---|---|---|---|
| Win-Now Floor | 2/6 (33%) | 2/5 (40%) | 1/6 (17%) | 0/5 (0%) |
| Balanced | 1/6 (17%) | 1/5 (20%) | 2/6 (33%) | 1/5 (20%) |
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
- Median 279; p25-p75: 223 to 321; thresholds CLOSE 200 / IN 300.

#### Balanced (balanced)
- IN-rate 28% looks healthy.
- Median 180; p25-p75: 133 to 243; thresholds CLOSE 160 / IN 240.

#### Future Stock (future_stock)
- IN-rate 29% looks healthy.
- Median 190; p25-p75: 73 to 342; thresholds CLOSE 200 / IN 320.

#### RB Bellcow (rb_bellcow)
- IN-rate 22% looks healthy.
- Median 38; p25-p75: 0 to 74; thresholds CLOSE 50 / IN 75.

#### WR Anchor (wr_anchor)
- IN-rate 22% looks healthy.
- Median 0; p25-p75: 0 to 64; thresholds CLOSE 55 / IN 80.

#### WR Stable (wr_stable)
- Median 73; p25-p75: 47 to 95; thresholds CLOSE 100 / IN 140.

#### QB Stable (qb_stable)
- Median 83; p25-p75: 57 to 106; thresholds CLOSE 100 / IN 140.

#### TE-Premium Lock (te_premium_lock)
- Median 31; p25-p75: 0 to 59; thresholds CLOSE 60 / IN 90.

#### Trade Capital (trade_capital)
- IN-rate 28% looks healthy.
- Median 136; p25-p75: 97 to 193; thresholds CLOSE 130 / IN 190.

#### Sustained Contender (sustained_contender)
- IN-rate 21% looks healthy.
- Median 1; p25-p75: 0 to 2; thresholds CLOSE 2 / IN 3.

#### Zero-RB (zero_rb)
- Median 1; p25-p75: 1 to 1; thresholds CLOSE 1 / IN 2.
