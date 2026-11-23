# Coach quality evals

Owner: `coach-quality` agent. Gate: any Coach prompt, model, router, or context change must beat the last row of `scores.md` before the reviewer merges it.

- `test-set.jsonl`: one question per line (schema in `.claude/agents/coach-quality.md`). Target 50 by 2026-12-05, 200 by launch. Isaiah's real questions first.
- `runs/YYYY-MM-DD.jsonl`: per-question results for a run (Coach answer, baseline answer, judge verdict, reason).
- `scores.md`: one row per run.

The judge is always a separate subagent from whatever produced either answer, sees the two answers in random order, and is spot-checked by Isaiah five calls per week.

## Test set notes (2026-11-23)

- 50 questions: 25 `isaiah` (each traced to a founder report in `INVARIANTS.md`, `CANONICAL_SOURCES.md`, `REDESIGN_INTENTIONS.md`, `WAKE_UP_2026_05_07.md`, or `FABLE_AUDIT_2026_09_15.md`), 25 `synthetic` (cover the in-season acceptance criteria, format rules, and charter principles).
- Each row carries an extra `origin` field naming the report or rule it came from, so a failure traces back to the bug class it guards.
- `must_include` and `must_not` are judge hints, not exact-string matches. Every row also bans em dashes.
- `league_fixture` names a fixture that does not exist yet for most rows (`fixture to be captured` / `to be built`). The scoring harness request in the 2026-11-23 report covers building them. No real league ids are stored here.
