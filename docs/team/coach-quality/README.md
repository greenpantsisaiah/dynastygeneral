# Coach quality evals

Owner: `coach-quality` agent. Gate: any Coach prompt, model, router, or context change must beat the last row of `scores.md` before the reviewer merges it.

- `test-set.jsonl`: one question per line (schema in `.claude/agents/coach-quality.md`). Target 50 by 2026-12-05, 200 by launch. Isaiah's real questions first.
- `runs/YYYY-MM-DD.jsonl`: per-question results for a run (Coach answer, baseline answer, judge verdict, reason).
- `scores.md`: one row per run.

The judge is always a separate subagent from whatever produced either answer, sees the two answers in random order, and is spot-checked by Isaiah five calls per week.

Run it: `npm run eval:coach-quality -- --username <sleeper name>` (harness and options in `evals/coach-quality/README.md`).
