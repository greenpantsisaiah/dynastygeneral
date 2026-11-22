# Coach quality eval harness

The runnable side of the `coach-quality` role (`.claude/agents/coach-quality.md`).
The test set, run results, and score table live in `docs/team/coach-quality/`.

For each question in `docs/team/coach-quality/test-set.jsonl`:

1. **Coach** answers through `buildCoachTurn` in `src/lib/coach/turn.ts`,
   the exact function `/api/coach` calls, with the production model
   settings (`COACH_MODEL`, temperature, web search).
2. **Baseline** answers with the same model and no product context: no
   system prompt, web search on, and the paste a manager would really give a
   chatbot (league format, record, roster names and ages, plus any opponent
   roster the question names; no engine values).
   `--baseline-model claude-opus-5-5` compares against the best general
   chatbot instead.
3. **Judge** (a separate model call that never wrote either answer) gets the
   league's full Coach context as ground truth and the two answers as A and B
   in a seeded random order. It scores each 1-5 on accuracy, use of league
   data, and senior-advisor quality, picks a winner, and tags the loser's
   failure modes (`LOSS_REASONS` in `judge.ts`).

`must_include` / `must_not` phrases from the test set are checked
deterministically on every answer and reported next to the judge's call.

## Test set conventions (on top of the role's schema)

- `league_fixture`: a Sleeper league id, `user-leagues` (rotate across every
  league of `--username`), or `user-leagues:portfolio` (a question about all
  of the user's leagues; asked inside the primary league, since Coach is
  per-league today, and scored as its own slice).
- `{placeholders}` such as `{my_old}` and `{opp_a}` fill per league from the
  Coach context (`fill.ts`), so synthetic questions name real players.
- `category`, `mentions_opponents`, and `username` are optional extras.

The 50 seed questions (source `synthetic`, 6 portfolio) cover the INVARIANTS
in-season acceptance criteria, contend-or-sell, trades, player calls,
lineup, waivers, roster build, picks, league intel, and cross-league
overwhelm. Isaiah's real questions come next:

```
npm run eval:coach-quality:export -- --username <his sleeper name>            # review in out/
npm run eval:coach-quality:export -- --username <his sleeper name> --append   # add to the set
```

The export reads production `chat_history` read-only and is limited to one
person until the privacy notice is live.

## Run

Needs `.env.local` with `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and network access to Sleeper and FantasyCalc
(the same as `npm run dev`).

```
npm run eval:coach-quality -- --username <sleeper name> --dry-run   # plan + cost estimate, no model calls
npm run eval:coach-quality -- --username <sleeper name>             # full run, capped at $20
```

Flags: `--leagues id1,id2`, `--primary id` (league for portfolio questions),
`--only id1,id2`, `--limit N`, `--max-cost 20` (USD; reserves room for
questions in flight so the run ends at or under it, default from
`docs/team/ledger/spend.md`), `--baseline-model`, `--judge-model`,
`--baseline-search-uses 10`, `--concurrency 3`, `--run-id` (defaults to
today's date; reuse it to resume), `--report-only`, and
`--rejudge <run-id>` (re-grade an earlier run's answers with
`--judge-model` under a new `--run-id` and print the agreement rate; use it
before switching to a cheaper judge).

Cost: about $1.10 per question in the first run (2026-11-22). Workers now
take one league at a time so Coach's league context and the judge's ground
truth are read from the prompt cache after the first question in a league.
Each row logs `cost_parts` (coach, baseline, judge) so the next run shows
where the money goes.

Writes `docs/team/coach-quality/runs/<date>.jsonl` (per question: both
answers, scores, verdict, phrase checks, cost), `runs/<date>.md` (win rate
with a 95% interval, mean scores, loss-reason counts, per-category table,
5 judge calls for Isaiah to spot-check), and appends a row to
`docs/team/coach-quality/scores.md` with the prompt hash and run cost.

## Reading the result

- Headline: Coach win rate against the baseline, ties counted as half, with
  its 95% interval. Under 50% means a manager does better in a plain chatbot.
- The loss-reason counts are the work list. Tags are the judge's, so read
  the spot-check calls before acting on one.
- One judge, one A/B order per question: at n = 50, treat win-rate moves
  under about 10 points as noise.
