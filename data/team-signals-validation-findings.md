# Phase B #1: Validation findings before --write

Generated 2026-05-27. Read these before authorizing `ingest-team-signals.ts --write`.

## What's ready

- `data/team-coaching-scheme-2026.json`: 32/32 teams extracted via Claude Sonnet 4.6 + web_search.
- `data/team-derived-metrics-2025.json`: 32/32 teams with `pass_rate_neutral`, `scheme_pace`, `personnel_12_rate` from nflverse 2025 pbp + pbp_participation.
- Dry-run coverage: `scheme=32/32 hc=32/32 oc=32/32 pass=32/32 pace=32/32 p12=32/32`.

Derived metric ranges (sanity check):
- `pass_rate_neutral`: min=0.417 (NYJ), median=0.503, max=0.594 (ARI). Rubric reads `(rate - 0.55) * 12`, so range maps to roughly -1.6 to +0.53 (sensible).
- `scheme_pace`: min=54.9 (LV), median=61.0, max=64.2 (CHI) plays per regulation game. No rubric reads this yet.
- `personnel_12_rate`: min=0.058 (LAC), median=0.227, max=0.412 (CLE). Rubric reads `(rate - 0.20) * 30`, so range maps to roughly -4.3 to +6.4 (very meaningful).

## Issue 1: `hc_first_time_flag` semantics miscoded (4 teams), unambiguous bug

My system prompt: "hc_first_time_flag: true if this is the HC's first time as an NFL head coach EVER (interim HC stints don't count). Otherwise false."

The model coded `False` for 4 long-tenured HCs whose ONLY NFL HC seat is their current team. Per the spec these should all be `True`:

| Team | HC | Coded | Should be | Rationale |
|---|---|---|---|---|
| CIN | zac-taylor | False | **True** | Only NFL HC seat ever (was LAR QBs coach immediately before). Model reasoned "8 seasons in = not first-time"; that's a misread. |
| GB | matt-lafleur | False | **True** | Only NFL HC seat ever (was TEN OC immediately before). |
| LAR | sean-mcvay | False | **True** | Only NFL HC seat ever (was WAS OC immediately before). |
| SF | kyle-shanahan | False | **True** | Only NFL HC seat ever (was ATL OC immediately before). |

Recommendation: programmatic fix in place (4 cells flipped to True). Other retread codings (ATL stefanski, NYG harbaugh, PIT mccarthy, TEN saleh, KC reid, NE vrabel, TB bowles, WAS quinn, DEN payton, LAC harbaugh) are correctly `False`.

## Issue 2: `oc_first_year_with_team_flag` semantics ambiguity (2 teams), founder decision

My system prompt: "oc_first_year_with_team_flag: true if the OC is in YEAR 1 with THIS team (regardless of prior OC experience elsewhere). Otherwise false."

Two rows are internally inconsistent (oc_tenure_yrs=1 but first_year=False):

| Team | OC | Rationale snippet |
|---|---|---|
| DEN | davis-webb | "Webb joined the Broncos in 2023 as quarterbacks coach... 2026 is NOT his first year with this team, only his first year as OC." |
| WAS | david-blough | "Blough joined Washington as assistant QB coach in February 2024... He is new to the OC title but NOT new to this team." |

Ambiguity: my prompt's phrase "with THIS team" could mean "first year on the staff in any role" (model's read) OR "first year in the OC role with this team" (the rubric's variance signal: `qb.ts` widens band on "first-year OC").

The rubric intent argues for the second reading. The variance modifier exists because a NEW OC means uncertain installation; whether the person was on the staff in a different role doesn't change that variance. By that reading, both DEN and WAS should be `True`.

Decision needed: do we adopt "first year in OC role at this team" semantics? If yes, flip both to True (and update the system prompt for next time). If no, flip oc_tenure_yrs to a count of OC-seasons-at-this-team-plus-staff-time and document.

## Issue 3: Retread HCs flagged for sanity check (4 teams), not obviously wrong

These came from real web search with dated source URLs, but they're high-profile coaching moves worth a 30-second eyeball:

- **ATL: kevin-stefanski** (year 1, retread). Stefanski was Browns HC 2020-2025.
- **NYG: john-harbaugh** (year 1, retread). Harbaugh was Ravens HC 2008-2025.
- **PIT: mike-mccarthy** (year 1, retread). McCarthy was Packers / Cowboys HC.
- **TEN: robert-saleh** (year 1, retread). Saleh was Jets HC 2021-2024.

Source URLs are in `data/team-coaching-scheme-2026.json` per row (`source_urls` field). If any of these are hallucinated by the search, the corresponding row's other fields (OC, scheme) inherit the error and need re-extraction.

## Issue 4: Coverage gaps in other team_signals columns (out of scope for this PR)

The dry-run prints `null` for columns this PR doesn't touch (per task spec: tracked separately):
- `ol_continuity_score`: already 100% populated from an earlier snap-counts pass (will remain unchanged).
- `ol_grade_run`, `ol_grade_pass`: PFF-paid, founder decision.
- `rookie_ol_starters_count`, `rookie_ol_position_breakdown`: OL track.

The upsert is column-scoped to the 12 columns this script sets, so existing values for `ol_continuity_score` etc. will NOT be overwritten.

## Recommended next step

1. Founder reviews Issues 1-3 above and `data/team-coaching-scheme-2026.json`.
2. Apply Issue 1 fix (4 cells; trivial), apply Issue 2 fix per founder direction (2 cells).
3. Re-run dry-run to confirm.
4. Authorize `npx tsx scripts/ingest-team-signals.ts --write`.
5. Verify via `scripts/audit-signal-coverage.ts | grep team_signals`.
