# Dynasty General: Web

A Sleeper-first dynasty fantasy football decision copilot.
Positioning: **Win the decision in front of you.**

---

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- Tailwind CSS v4 (CSS-first config in `src/app/globals.css`)
- Zod for runtime validation (Sleeper responses, API bodies)
- Supabase (Postgres + Auth). Migrations in `supabase/migrations/`
- Vercel-ready

## Local dev

```bash
cp .env.local.example .env.local
# fill in Supabase keys when you have a project; the landing + connect flow
# work without Supabase (waitlist just logs to stdout)
npm install
npm run dev        # http://localhost:3000
npm run build      # production build + type-check
npm run lint
```

## Routes

| Route | Type | What it does |
|---|---|---|
| `/` | Static | Landing: hero, problem, insight, solution, benefits, differentiation, preview, waitlist, FAQ |
| `/connect?username=...` | Dynamic | Sleeper lookup → list of dynasty leagues |
| `/leagues/[leagueId]` | Dynamic | **Decision Hub**: strategy snapshot + four action entry points |
| `/leagues/[leagueId]/pick` | Dynamic | Pick decision (engine wired) |
| `/leagues/[leagueId]/trade?mode=...` | Dynamic | Incoming or outbound trade (engine wired) |
| `/leagues/[leagueId]/strategy` | Dynamic | Strategy snapshot with inference signals |
| `/leagues/[leagueId]/coach` | Dynamic | Coach chat with full named-roster context |
| `/api/waitlist` | POST | Validated waitlist insert (Supabase if configured, stdout otherwise) |

> This Routes table is a partial, historical view. The shipped product has
> moved well past it (the Decision Hub now carries Plays, the Companion
> check-in, the value pipe, per-opponent dossiers, AAR, a public
> `/scoreboard` and `/pricing`, and Stripe billing scaffolding gated behind
> `BETA_OPEN_MODE`). For the current surface, run the app; for the current
> plan, read `MODEL_LIVE_PLAN.md`. Last reconciled 2026-07-06.

## Source layout

```
src/
  app/
    page.tsx                      : landing composition
    layout.tsx                    : root layout, fonts, metadata
    globals.css                   : operator-tool color tokens, focus ring
    connect/                      : Sleeper username → league list
    leagues/[leagueId]/           : decision hub + per-decision screens
    api/waitlist/route.ts         : beta signups
  components/
    site-nav.tsx
    ui/ticker.tsx                 : mission-control status label
    landing/                      : hero, problem, insight, solution, benefits,
                                    differentiation, preview, waitlist, faq, footer
    decision/wip-card.tsx
  lib/
    sleeper/                      : typed client + zod schemas for Sleeper public API
    strategy/infer.ts             : bootstrap heuristic for contender/rebuild/balanced
    supabase/client.ts            : browser client
    supabase/server.ts            : server client (cookies via next/headers)
supabase/migrations/0001_init.sql : profiles, leagues, strategies (+history),
                                    decisions, waitlist, RLS policies
```

## Phase roadmap

> Historical. This Phase 1-4 roadmap is superseded by the current
> orchestration plan in `MODEL_LIVE_PLAN.md` (Phases A-G, the model-live
> push). Phases 3-4 below describe an earlier framing; auth, persistence,
> and much of the leverage/creator work have since shipped or been
> re-scoped there. Kept for provenance. Last reconciled 2026-07-06.

- **Phase 1 (done)**: scaffold, landing, Sleeper sync, connect flow, decision
  hub shell, strategy inference (lightweight), Supabase schema, waitlist.
- **Phase 2 (done)**: Anthropic-powered decision engine wired into pick,
  incoming trade, outbound trade, and strategy-clarify flows. System prompt
  derived from `iceman_dialogue_corpus.docx`; structured output via tool-use
  with one retry-on-validation-fail; player metadata cache (daily); opponent
  profile heuristic (qb_banker / desperation / tilted_buyer / etc.); 8-scenario
  eval harness including no-unnamed-player-drift grounding check. 46/46 checks
  passing on the eval suite.
- **Phase 3**: Supabase auth, persistent strategy lock, decision history,
  shareable strategy cards, real-time Sleeper draft ingestion.
- **Phase 4**: leverage engine (opponent modeling from standings, depth,
  bye-week pressure), partner/creator preview flow.

## Decision engine

Key modules under `src/lib/engine/`:

- `system-prompt.ts`: cacheable iceman-derived prompt (no hedging, explicit
  opportunity cost, walk-away floors on trades, named league clusters on
  strategy synthesis, grounding rule against invented players)
- `schemas.ts`: zod + JSON-Schema for pick / trade_incoming / trade_outbound
  / strategy_clarify output contracts
- `anthropic.ts`: SDK wrapper, Sonnet 4.6 default, Opus 4.7 for deep strategy
  synthesis, ephemeral system-prompt caching, one retry on schema failure
- `context.ts`: compact context renderer (league + roster + opponents +
  standings + traded picks + inferred strategy)
- `opponent.ts`: team-profile heuristic producing labels the model reasons
  over (qb_banker, desperation, tilted_buyer, qb_stable, balanced)
- `decisions.ts`: the four decision entry points
- `src/lib/players/cache.ts`: daily `/players/nfl` in-memory cache

API routes: `/api/decisions/pick`, `/api/decisions/trade` (incoming/outbound),
`/api/decisions/strategy`.

### Evals

```bash
npx tsx --tsconfig tsconfig.json evals/run.ts                 # all scenarios
npx tsx --tsconfig tsconfig.json evals/run.ts --only=<id>     # one
npx tsx --tsconfig tsconfig.json evals/inspect.ts <id>        # dump full output
```

Scenarios in `evals/scenarios.ts` are drawn from the Iceman corpus and the
ChatGPT training-scenarios reference (the latter as user-query patterns, not
as an output quality bar). Synthetic contexts in `evals/synthetic-context.ts`.
Pattern checks in `evals/criteria.ts`: grounding, no-hedging-opener,
opportunity-cost-present, walk-away-floor-present, calibrated length, etc.

## Design language

Dark operator-tool palette (not sports-blog):
- `background` `#07080a` · `surface` `#0d0f13` · `surface-2` `#14171d`
- `accent` `#f59e0b` (reserved for CTAs + leverage/drift signals)
- Mono accents, ticker labels `NN · SECTION`, tactical HUD card in the hero

## Notes

- Sleeper's public API requires no auth. Cached per-endpoint via `fetch`
  `next.revalidate` (60–600s depending on volatility).
- `isDynastyLeague` uses `settings.type === 2`.
- All Sleeper responses are parsed with zod `.passthrough()`; unknown fields
  survive but shape is enforced.
- RLS is on for every table; waitlist accepts anon inserts only.
