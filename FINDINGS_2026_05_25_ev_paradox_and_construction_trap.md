# Findings, 2026-05-25: the EV paradox and the construction trap

Triggered by founder report: izzydabomb hub showed #1 of 12 in EV bank
alongside 8th of 12 in win-now and 6th of 12 in future, with SWOT
flagging 11th of 12 in startable WR (8 bodies, 3 startable) and 9th of
12 in startable RB while QB stood at 3rd of 12 (3 startable, 4 bodies).
The founder reported having debated against TEs and fringe QBs through
the draft and felt the product kept steering them there.

Three threads investigated. Two are real. One is a perception gap on a
real-but-explainable orthogonality. They share one mechanism.

## Thread 1: the EV paradox. Not a bug, but the headline mis-sells it.

EV bank is a draft-efficiency flow metric over your picks, not a stock
metric over your roster.

Formula at `web/src/lib/strategy/ev-bank/formula.ts:15`:

```ts
perPickEv(value, pickNo, adp) = (value / 100) * (pickNo - adp)
```

A value-40 player who fell 30 picks banks `(40/100) * 30 = +12.0 EV`.
A value-80 stud who fell 10 picks banks `(80/100) * 10 = +8.0 EV`. The
worse player banks more EV. The league-EV rank in
`web/src/lib/strategy/ev-bank/league.ts:53-135` is the sum of that
per-pick number across each team's drafted picks, sorted descending.
Zero roster-strength inputs.

Win-now and future strength come from
`web/src/lib/strategy/windows/compute.ts:215-331`. Win-now is starter
talent (0.45) + starter age via a Gaussian peaked at 27 (0.20) +
position completeness (0.15) + roster fullness (0.05) + record (0.15).
Future is whole-roster youth via a logistic at 28 (0.50) + roster
fullness (0.30) + owned future-pick capital (0.20). Zero EV inputs.

So the two are orthogonal by construction. #1 EV + 8th now + 6th future
is fully coherent: best bargain-hunter, middling roster. Designed-in.

The presentation problem is real anyway. The top-of-hub companion
"Checkpoint" milestone beat phrases this as `"EV bank +10.8, 1st of 12"`
with body `"Draft 45% in. Solid session."` and the tone is set to
`"win"` whenever percentile ≥ 50 (`companion/classify.ts:266`). The
disambiguating provenance line ("EV per pick = (value/100) × (pick −
ADP). Sharp locks count negative against the bank by definition") lives
in `DraftProgressPanel`, a different panel. A casual reader reading the
top-of-hub beat alone will read "1st of 12" plus a win tone as "I am
winning this league," when it strictly means "I shopped the most
efficiently relative to ADP."

The founder's instinct that "EV is yet another vector" is exactly
right. The fix is presentation: label the rank as draft efficiency or
value-vs-ADP, so the meaning travels with the number.

## Thread 2: the construction trap. Real, shipped, and the actual cost.

The standing call has a strong rule family for HARD-slot starter holes
(scoring 60-100) and an ADP-faller bonus of up to +12, but it has no
rule that elevates a flex-eligible WR/RB starter need above the
`earned_value` baseline (~45) once hard slots are nominally covered.

Evidence in `web/src/lib/strategy/decision-synthesis/synthesize.ts`:

- The `fill_starter` / `fill_starter_urgent` gate at line 1092 is
  `if (startableHaveFor(me, pos) >= reqs[pos]) continue;`. The good
  news: `startableHaveFor` (lines 153-161) reads `startable_counts`
  with a body fallback, so 8 WR bodies do not fool it; the gate sees
  3 startable. The bad news: `reqs = effectiveStarterReqs(snap)`
  (line 1087) is an alias for `getHardStarterReqs`
  (`web/src/lib/engine/roster-fit.ts:34-46`), which returns HARD slots
  only, not realistic flex max. In a 2-hard-WR PPR league, `3 >= 2`
  suppresses the WR fill rule even though realistic WR max with flex
  is 4 and you sit 11th of 12.
- With the fill rule silent, WR competes only at `earned_value` (line
  1447: `45 - i*1.5 - sat.penalty + adpGap.adjustment`). Meanwhile a
  falling QB or TE carries the full `adpGapModifier` boost
  (lines 118-139: capped at +12 for gaps ≥ +15 picks). `45 + 12 = 57`
  beats an un-boosted WR earned_value of ~43. The faller wins. EV
  climbs. WR/RB startable depth does not.
- The full `DecisionRule` enum (`types.ts:27-34`) is
  `fill_starter_urgent | fill_starter | push_path | future_stash |
  window_direction | earned_value | position_steal`. There is no
  flex-fill rule. Flex-eligible need is handled only as a saturation
  penalty on over-rostered positions (relative demotion), not as a
  priority boost for under-rostered flex positions.

Safety valves and where they hold:

- QB in superflex saturates correctly. With 4 QBs in a 2-eligible
  league, `surplus_after_one_more > 0`, so a falling QB hits the
  saturation penalty (−30) and has its ADP boost zeroed (lines
  1435-1437). A 4th QB should NOT keep winning. Confirmed.
- TE in a non-TEP league has `flexShare(TE) = 1` in both ppr and
  standard (`roster-fit.ts:130-137`), so realistic TE max = hard.TE +
  1 = 2. A 2nd TE is non-saturated, keeps the full +12 ADP boost,
  and can win earned_value over a WR with no fill firing. This is
  the door the "kept steering me to TEs" complaint walks through.
- The non-TEP TE scoring fix is documented as still open in this
  repo (`INVARIANTS.md:192-193`, `CANONICAL_SOURCES.md:238`,
  `REDESIGN_INTENTIONS.md:760-763`). Today's investigation confirms
  no commit has shipped it.

Net trace, mid-late draft, user has 3 startable WR (hard 2) and 4
startable RB (hard 2), best raw EV available is a falling TE:

1. WR/RB fill rules are gated off. No 60-100 candidate from the real
   flex need.
2. Falling TE enters earned_value with the full +12 boost, position
   non-saturated. Scores ~57.
3. WR/RB compete at earned_value baseline (~43). Lose.
4. TE wins. EV climbs. Startable WR/RB does not advance toward
   realistic flex use.

Repeat each pick. End-state matches the reported roster: EV #1, WR/RB
weak at startable, QB/TE deep.

Threads 1 and 2 are one mechanism. The engine optimized the metric it
shows you (EV) and had no lever to fight for the flex WR/RB depth that
wins. The headline then told you that you won.

## Thread 3: EV as a third vector on the standings table.

The data is already in scope at the render site. `analyzeLeagueEvBank`
runs at `web/src/app/leagues/[leagueId]/page.tsx:1314` and produces a
`rosters` array sorted desc by `total_ev`, keyed by `roster_id`. The
standings component (`web/src/components/league/league-divergence.tsx`)
receives only `outlook: LeagueOutlook` today; joining EV on roster_id
is pure plumbing. No new math.

Two reasons not to bolt it on:

- Locked IA. Principle 8 (`REDESIGN_INTENTIONS.md:101-110`) assigns
  "league EV by team" to Box 2 of the EV-bank row in "How you're
  doing." Duplicating that read on the standings table is the same
  pattern that retired the old `EvBankPercentileChip`.
- EV totals are draft-pick-based and go null in-season, which is
  exactly when the standings table leads.

The cheap, brand-correct alternative: keep EV as Box 2 (its locked
home) AND clarify the top-of-hub beat so the "1st of 12" cannot read
as league standing. That ships thread 1's fix and removes most of the
pressure to duplicate the surface.

## Thread 4 (added 2026-05-26): the "EV" label was over-claiming. Kill it.

Founder epiphany on reading this doc: the word "EV" was carrying a
forward-looking meaning the implementation never honored. Today's
`perPickEv = (value/100) * (pickNo - adp)` has only market inputs
(FantasyCalc value, Sleeper ADP). It measures draft-timing arbitrage
against the market, not forward expected value. It goes null in-season
because the only thing it ever measured (timing) is over once the
draft ends.

The proprietary forward apparatus the corpus + signal tables were built
for (`src/lib/engine/evaluation/`, the position rubrics, `market_delta`)
exists in code but is UNWIRED. Two live importers: an admin debug page
and a `TierMap` component that is never rendered on the hub. Signal
tables (`player_signals`, `team_signals`) are 0 rows in production.
`ARCHITECTURE_UNIFICATION_PLAN.md` already documents this plainly:
"the board's value is a pure FantasyCalc/KTC market passthrough ...
the product cannot hold an opinion that differs from the market."

A 2026-05-25 backtest (Stage 2b, PR #39, recorded in the rookie-vs-
sophomore memory note) added a hard nuance: in the deep tier (rank
100-280), prior-season opportunity has NO marginal forward-VALUE edge
over the market. Forward Value, as in "our model values player X
above market," is empirically not supported on current evidence. The
defensible signal is forward PRODUCTION (opportunity stickiness +
age + scheme), not forward value-vs-market.

Founder decision (2026-05-26):

- Retire the bare word "EV" from chrome and from this product's
  vocabulary going forward.
- Use the specific name per the meaning:
  - "Value vs ADP" (tag: `vsADP`) for the metric we actually ship
    today (draft-timing arbitrage). Honest about what it measures.
  - "Forward Value" reserved for our model's projected market value
    vs market. Data-gated. Not shipped.
  - "Forward Production" reserved for our model's projected fantasy
    production over a horizon. The defensible signal Stage 2
    grounding identified. Build target. Not shipped yet.
- Threads 1-3 of this doc remain real, but their priority order is
  superseded. Thread 1's relabel becomes part of the broader rename.
  Thread 2's construction-trap fix is deferred behind the metric
  re-cast: the right shape for a flex-fill rule is "what does
  forward production say about this roster slot," not "hardcoded
  score band above earned_value." Thread 3 (EV on the standings
  table) is moot under the new naming and stays retired.

The rock-solid plan to build Forward Value and Forward Production
lives in `FORWARD_EV_PLAN.md` (this session). It honors the locked
architecture-unification plan and the Stage 2b data, and it stages
each piece behind a gate so each metric ships only when it survives
evidence.

## Recommended actions, in order (superseded 2026-05-26)

The order below replaces the earlier 1-5 list.

1. Ship the EV-naming kill today (Stage 0 of `FORWARD_EV_PLAN.md`).
   Re-label every chrome surface that uses "EV bank" or "EV banked"
   so it reads "Value vs ADP" / "value banked vs ADP" instead. No
   math change. Companion milestone beat, DraftProgressPanel,
   EV trajectory chart, share card + OG image, share button text,
   release note. Brand voice unchanged: lead with the number, no
   em dashes, no exclamation. The bare word "EV" should not appear
   in user-facing chrome after this ship.

2. Ship Stage 2c (the ADP-vs-trade-value divergence surface, from
   the rookie-vs-sophomore note). Doesn't touch the value scale.
   Gives users their first taste of "here is where the market and
   the model would diverge if we held a view." Independent of the
   Stage 2b negative result; greenlit; shippable. The Mitchell case
   is the canonical example.

3. Pick the Forward Production target with canon-keeper grounding.
   Horizon (rest-of-season vs full-season vs multi-year), output
   shape (point estimate vs distribution), position-conditioning.
   Founder decision required before building.

4. Build the Forward Production projection. Position-conditioned per
   MODEL_CARD section 4. Variance bands always visible per Principle
   0. NEVER a value-scale multiplier; always a projection. Gated by
   dynasty-canon-keeper CRITIQUE on each position rubric, dynasty-
   assumption-auditor on the wired weights, backtest before flip.

5. Surface Forward Production on the hub. This becomes the in-season
   surface that survives the season. Per-week banked vs market-
   projected, rolled up across the roster.

6. Re-cast the standing call's scoring around Forward Production
   gaps. The construction trap (thread 2) becomes a symptom that
   resolves naturally: the flex-fill question stops being "score
   band above earned_value" and becomes "what is the projected
   production gap at this slot vs the alternative." Same answer,
   principled scaffolding.

7. Forward Value remains parked. Unlock conditions (per Stage 2b
   resolution): more KTC snapshots, shallow-tier slice, methodology
   audit, cleaner value metric. Until met, the product does not
   promise Forward Value in chrome.

## Memory notes

- `memory/project_ev_construction_trap.md` for compaction survival of
  the mechanism (today's EV is market-vs-market timing arbitrage; no
  flex-fill rule; following the call drifts EV-rich + WR/RB-poor +
  QB/TE-deep).
- `memory/feedback_kill_ev_label.md` for the naming decision (kill
  the bare word "EV"; use Value vs ADP / Forward Value / Forward
  Production).
- The rock-solid plan toward forward-looking metrics lives in
  `FORWARD_EV_PLAN.md` at the repo root, indexed in the architecture-
  unification plan as the metrics-side companion.
