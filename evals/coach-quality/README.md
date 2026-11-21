# Coach quality eval

Is the in-app Coach better than asking plain Claude? This eval answers that
with a number, and says why Coach loses when it does.

For each question it gets three answers' worth of work:

1. **Coach**: the production prompt, built by `buildCoachTurn` in
   `src/lib/coach/turn.ts` (the exact function `/api/coach` calls), with the
   production model settings (`COACH_MODEL`, temperature, web search).
2. **Plain Claude**: the same question to a current Claude model with no
   system prompt, web search on, and the paste a manager would really give a
   chatbot: league format, record, roster names and ages, plus any opponent
   roster the question names. No engine values. That gap is the edge Coach is
   supposed to have.
3. **Blind judge**: a current Claude model sees the league's full Coach
   context as ground truth, the question, and the two answers as A and B in a
   seeded random order. It scores each 1-5 on accuracy, use of league data,
   and senior-advisor quality, picks a winner, and tags the loser's failure
   modes from a fixed list (`LOSS_REASONS` in `judge.ts`).

## Questions

- `questions.ts`: 50 realistic mid-season dynasty questions across 9
  categories. Placeholders such as `{my_old}` and `{opp_a}` fill from the
  league under test, so every question names real players and managers.
  League questions rotate across all of the user's leagues.
- 6 of the 50 are **cross-league** ("which of my leagues should I push
  all-in on"). Coach is per-league today, so these measure the portfolio
  gap; they are reported as their own slice.
- **Real Coach questions**: `export-real-questions.ts` pulls user messages
  from production `chat_history` (read-only) into the gitignored `out/`
  folder; pass that file with `--real` to replay them as a third slice.

## Run

Needs `.env.local` with `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and network access to Sleeper and FantasyCalc
(the same as `npm run dev`).

```
npm run eval:coach-quality:export                      # optional: real questions
npm run eval:coach-quality -- --username <sleeper> --dry-run   # plan + cost estimate, no model calls
npm run eval:coach-quality -- --username <sleeper> --real evals/coach-quality/out/real-questions.jsonl
```

Flags: `--leagues id1,id2` (limit leagues), `--primary id` (league for
cross-league questions), `--only dir-01,trd-02`, `--limit N`,
`--max-cost 40` (stops starting new questions past this spend, USD),
`--baseline-model`, `--judge-model`, `--concurrency 3`, `--run-id` (reuse a
run folder to resume), `--report-only`.

Output in `out/<run-id>/`: `plan.json`, `results.jsonl` (answers, scores,
rationale per question), `summary.json`, `report.md` (win rate with a 95%
interval, mean scores per axis, loss-reason counts, per-category and
per-question tables).

## Cost

Coach's context carries the full realistic player pool, so each Coach call
is large. Rough run cost for 50 bank questions plus about 30 real ones is
$15-40; `--dry-run` prints an estimate for your leagues and `--max-cost`
caps it. The judge's ground truth is prompt-cached per league.

## Reading the result

- The headline is the Coach win rate against plain Claude, ties counted as
  half, with its 95% interval. Under 50% means a manager is better off in a
  general chatbot.
- The loss-reason counts are the work list. Tags are the judge's, so read a
  few `rationale` lines in `report.md` before acting on a tag.
- One judge, one order per question: treat differences under about 10
  points of win rate as noise at n = 50.
