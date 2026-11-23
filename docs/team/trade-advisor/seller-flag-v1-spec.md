# seller_flag@v1: rival veteran-seller detection (spec, hypothesis)

Owner: trade-advisor. Status: proposal for the stats steward to register as `hypothesis`. Written 2026-11-23, before any data is seen. Nothing here is built yet, and no seller claim may reach marketing or chrome until this type clears its bar and the claims steward approves it.

## Why this exists

Charter principle 4: spot a rival about to sell veterans, tell the user, and draft the exact question to send that manager. Today the product cannot do this. What exists:

- `buildOpponentTradeHistory` (`src/lib/strategy/opponents/trade-history.ts`) labels each opponent `pick_seller` / `pick_hoarder` / `pick_flipper` / `pick_quiet` from `traded_picks` only. "pick_seller" means the manager sent away more draft picks than they received. That is close to the OPPOSITE of a veteran seller: a manager dumping picks is usually buying veterans to win now.
- `getTransactions` exists in `src/lib/sleeper/client.ts` but is never called. Player-for-pick trade history, the direct evidence of veteran selling, is unread.
- No prediction type in `src/lib/predictions/registry.ts` covers seller calls, so no seller call can be scored.

## The prediction

For each (league, opponent roster, in-season week W), emit `P(sells_veteran within 21 days)`, 0 to 1.

**Resolution (outcome = 1):** within 21 days after W, the roster completes a Sleeper trade in which it SENDS at least one player aged 27 or older whose FantasyCalc value is in the league's startable tier (canonical `buildPositionDepth` startable at W) AND RECEIVES net younger value (mean age of received players and picks lower, picks counted as age 21). Otherwise 0. Rows resolve on day 22 from `getTransactions` for weeks W to W+3.

**Baseline (logged at the same moment):** the league's own base rate, (veteran-sell trades by any roster in the prior 21 days) / (rosters), floored at 0.02. Second baseline for the cohort read: constant 0.

**Scoring:** Brier and log loss vs baseline; reliability table in 5 bins once n >= 200.

## Inputs (all from existing canonicals, nothing re-derived)

| Signal | Source | Direction |
|---|---|---|
| Playoff position, record, points-for rank at W | `calcStanding` | Out of the race raises P |
| Roster age of startable core | `ageRetention` / `buildPositionDepth` | Older core raises P |
| Recent behavior: any veteran-out trade this season | `getTransactions` (new read, weeks 1 to W) | Prior sale raises P |
| Pick posture | `buildOpponentTradeHistory` future picks received | Net future picks IN raises P (rebuild tell) |
| Trade deadline proximity | `league.settings.trade_deadline` | Raises P as deadline nears |

v1 combines these with a hand-set logistic (weights written here before data, then frozen): intercept at the league base rate on the logit scale; +1.0 if out of the playoff race (more than 2 games behind the last playoff seat with 4 or fewer weeks before the deadline); +0.6 if median startable-core age is 27 or older; +0.8 if the roster already made a veteran-out trade this season; +0.4 if net future picks received is 2 or more; all others 0. A learned model is v2 and needs a new id.

## Success bar (pre-registered 2026-11-23)

- provisional: n >= 100 resolved rows across >= 5 leagues, Brier skill vs league base rate > 0 with a bootstrap 90% CI excluding 0.
- validated: n >= 400 across >= 15 leagues over two seasons, Brier skill > 0.05 with 95% CI excluding 0, and the top-decile flags hit at >= 2x base rate.

## Logging

`shadow_weekly` only until provisional. Rows go to the `prediction_log` ledger (migration 0019, decision #93). No user sees a seller flag until provisional.

## What the user sees, once provisional (behind a flag)

An opponent card line: "Seller watch: 34% to move a veteran in 21 days (league base 9%)." Plus a drafted message the user may send, built from the existing 4-move template in `trade-opportunities/detect.ts` (observation, problem, solution, ask plus their win), priced through the canonical pricing block and inside the plus or minus 15% fairness band, checked by `dynasty-trade-realism-tester`. The user sends it; the product never contacts any manager.

## Build order (for an engineer, after #93 lands)

1. Pure `readVeteranSales(transactions, playersMeta, valueMap)` canonical over `getTransactions`; register in `CANONICAL_SOURCES.md`.
2. Pure `sellerFlag(inputs)` implementing the frozen v1 logistic above.
3. Dry-run-default shadow logger script, same pattern as the `value_decay@v1` logger in PR #92.
4. Stats steward adds the registry entry from this spec.

## Open questions for the stats steward

- Sleeper `getTransactions` requires a league id the app can read; the shadow cohort is whatever leagues users have connected. Is that sample acceptable for the provisional bar, or do we need a public-league cohort?
- Whether "aged 27 or older" should be position-conditioned (RB 26, QB 30) via `ageRetention` instead of one cut. v1 keeps one cut to stay simple; v2 can condition.
