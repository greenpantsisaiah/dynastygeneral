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

## Adjudication (live sig-scheme32 tab, 2026-05-28)

This tab adopted the rescued extraction + derivation as-is (no LLM re-run)
and resolved Issues 1-3 as follows. The `--write` is still gated on explicit
founder authorization.

### Issue 1: declined the recommended flip; gated by tenure instead

The recommendation was to flip CIN / GB / LAR / SF `hc_first_time_flag` to
True (literal "first NFL HC job ever"). I did NOT, because that read is
rubric-harmful. The only consumer is `qb.ts`:

```
if (tier === 1 && ctx.team?.hc_first_time_flag === true) bandModifier += 5;
```

It widens a tier-1 QB's variance band as an INSTALLATION-uncertainty signal.
McVay (y10), Shanahan (y10), Taylor (y8), LaFleur (y8), O'Connell (y5),
Sirianni (y6) are the opposite of unstable; flipping them True would inject
false variance into Stafford / Purdy / Burrow / Love / Jefferson / Hurts.

Resolution (rubric-faithful, applied in `ingest-team-signals.ts:buildRow`):
`hc_first_time_flag = (LLM first_time_ever) AND (hc_tenure_yrs <= 1)`. The
flag now fires only in the HC's installation window. After the gate it is True
for exactly the genuine rookie HCs: ARI, BAL, BUF, CLE, LV, MIA (all tenure 1,
first NFL seat). Established first-time HCs and veteran retreads are False.
The raw LLM `first_time_ever` value + rationale are preserved in
`source_attribution.hc_first_time_flag` (`raw_first_time_ever`, `gate`), so the
provenance is honest about the divergence. The LLM's own codings were already
inconsistent here (True for Campbell y6 / Ryans y4 / Steichen y4 but False for
McVay y10 / Shanahan y10); the tenure gate makes the signal consistent AND
rubric-correct in one rule rather than hand-editing cells.

### Issue 2: kept DEN / WAS oc_first_year_with_team_flag = False

Held the "first year with the organization" semantic the rest of the table
uses (False for an internal promotion; True only for an outside hire). Webb
(DEN, on staff since 2023) and Blough (WAS, on staff since 2024) are internal
promotions to the OC title, so False is consistent with the other ~28 rows.
With `oc_tenure_yrs = 1` they get neither the continuity bonus (needs >= 3) nor
the new-OC band widener: an internal promotion reads as neutral, which is the
defensible treatment. Flipping only these two to True would make the column
mean two different things across the table. (If the founder prefers the
"first year in the OC role" reading, that is a one-rule recode applied to ALL
promoted-from-within OCs, not a two-cell patch.)

### Issue 3: retread HCs confirmed, not hallucinated

ATL Stefanski, NYG Harbaugh, PIT McCarthy, TEN Saleh all match the 2026
coaching carousel independently (ESPN / NFL.com 2026 hiring-cycle coverage).
Kept as `hc_first_time_flag = False` (veteran retreads, correctly not flagged).

### Season basis (documented for the founder)

Coaching/scheme is the CURRENT 2026 staff (a live snapshot; `team_signals` has
no season column). `pass_rate_neutral` / `scheme_pace` / `personnel_12_rate`
are from the 2025 completed season (the only completed season available), the
standard one-cycle preseason lag. For teams with a brand-new 2026 staff the
rates describe the prior regime; this is the best available prior and refreshes
once 2026 play-by-play exists.

### Independent cross-check of pass_rate_neutral

A from-scratch second derivation of `pass_rate_neutral` (different neutral
definition: win-prob 0.20-0.80 instead of `|score_diff| <= 10`) agreed with
the rescued numbers to mean |diff| 0.020 (max 0.060), with identical rank
ordering (NYJ lowest ~0.42, ARI / CIN / LAR / KC highest ~0.57-0.59). The
derived metric is sound.
