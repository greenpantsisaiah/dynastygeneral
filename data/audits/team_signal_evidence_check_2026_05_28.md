# Phase B #1: live evidence-stack verification (2026-05-28)

After the authorized production write of the 32-team coaching/scheme +
derived-rate columns to `team_signals`, this is the LIVE rubric read
check. It confirms `evaluate()` (via `evaluateForPlayer` +
`getPlayerSignalsMap` + `getTeamSignalsMap`) now reads the new signals
and surfaces them in the evidence stack for current-season evaluation.

It is NOT a historical backtest. `team_signals` is a 2026-only snapshot
(coaching) + 2025-season rates, with no season column; the A4 backtests
are temporally blinded to 2022-2024, so reading 2026 tags for a 2023
player would be leakage. Backtest validation of these signals needs
historical/vintage team coding, tracked as a separate Phase B follow-on.

Raw output: `team_signal_evidence_check_2026_05_28.txt`
Post-write coverage: `team_signals_coverage_after_2026_05_28.txt`
Script: `scripts/check-team-signal-evidence.ts`

## What the four cases show

| Case | Player picked | New signal(s) in evidence stack | Effect |
|---|---|---|---|
| WR on pass-heavy scheme | Trent Sherfield (WR, ARI, mcvay, pass 0.59) | `scheme_pass_heavy` +1.20, `pass_rate_neutral` +0.16 | point estimate |
| QB on stable-OC team | Andy Dalton (QB, CAR, oc_tenure 3) | `oc_continuity` +1.20 | point estimate |
| QB on rookie-HC team, tier 1 | Jacoby Brissett (QB, ARI, hc_first true) | `oc_first_year`, `first_time_hc_tier1_qb` | variance band (by design) |
| TE on high-12 team | Feleipe Franks (TE, ATL, p12 0.38) | `personnel_12_rate` +2.72, `oc_first_year_te_penalty` -2.00 | point estimate |

Three of four cases produce non-zero point contributions. The fourth
(rookie-HC tier-1 QB) fires the two new signals as VARIANCE-band
wideners, which carry `contribution = 0` by design (the rubric adds
them to `bandModifier`, not the point estimate). Their effect is visible
in the band width: the rookie-HC tier-1 QB band is [81.5, 98.5] (~17
wide), versus the stable-OC QB band [53.1, 61.1] (~8 wide). Both
`oc_first_year` (+4) and `first_time_hc_tier1_qb` (+5) demonstrably
applied.

## Note on player selection

The script picks a representative player at the target position on the
matched team (sorted by age as a proxy for an established name), so the
sampled players are not always the marquee starter. That does not affect
the check: the new signals are TEAM-level, so their evidence-stack
contributions are identical for any player at that position on that team.
The check verifies the live rubric READS the signals; it is not a
player-value claim.

## Coverage confirmation

Post-write coverage on the 12 target columns is 32/32 real teams (the
audit prints 97% because a 33rd non-team placeholder row, written earlier
by `ingest-player-signals`, has null coaching). `ol_continuity_score`
remains 32/33 unchanged, confirming the column-scoped upsert did not
overwrite it.
