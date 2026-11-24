# Feature map (product steward)

Regenerated monthly from `src/app/**/page.tsx`, `src/app/api/**/route.ts`, and the hub imports. Every surface lands in one job and one tier. Last regenerated: 2026-11-23 (run 1, first map).

Jobs: **Acquire** (get a manager in), **Diagnose** (read my team), **Read the league** (read everyone else), **Decide and act** (a pick, trade, or move), **Come back** (a reason to return), **Tune** (make it mine).

Tiers follow the charter and `product-steward.md`: Free gets the read (diagnosis, verdict, the why, the evidence, corrections). Pro meters what costs money to serve (language-model turns, extra leagues) and persistence. Volume gates over feature gates.

**Today every signed-in user gets everything.** `isBetaOpenMode()` in `src/lib/billing/beta-mode.ts` returns `true` unconditionally, and `src/lib/consumption/track.ts` records usage without enforcing caps. The "Target tier" column is the design, not live behavior. Turning any Pro gate on is red tier.

## Pages

| Route | Job | Target tier | Notes |
|---|---|---|---|
| `/` (landing + waitlist) | Acquire | Free | Waitlist mounted in #86 |
| `/how-it-works`, `/methodology`, `/built-by` | Acquire | Free | Trust surfaces; never gate |
| `/vs-fantasypros` | Acquire | Free | Comparative claim page; claims steward owns every sentence |
| `/library`, `/library/[slug]` | Acquire, Come back | Free | Evidence behind claims; never gate |
| `/scoreboard`, `/scoreboard/methodology` | Acquire | Free | `noindex` until MODEL_LIVE_PLAN F3 |
| `/pricing` | Acquire | Free | Simplified 2026-05-12; prices nothing not yet calibrated |
| `/changelog` | Come back | Free | Release notes are a marketing surface |
| `/login`, `/auth/*`, `/connect` | Acquire | Free | First-run path: username, then league |
| `/leagues` | Acquire | Free | League picker |
| `/leagues/[leagueId]` (hub) | Diagnose, Read the league, Decide and act, Come back | Free (read); Pro meters LLM sections | See hub breakdown below |
| `/leagues/[leagueId]/coach` | Decide and act | Free daily cap, Pro volume | LLM cost; cap `coach` 15/week free, 200/day Pro (defaults); free tier also has a $3/month model-spend backstop |
| `/leagues/[leagueId]/pick`, `/trade`, `/strategy` | Decide and act | Free daily cap (`verdict`), Pro volume | LLM decision endpoints; MODEL_LIVE_PLAN G1 asks whether they are still live deep links |
| `/leagues/[leagueId]/aar` | Come back | Free | After-action report at draft complete |
| `/scout`, `/scout/[username]` | Read the league, Acquire | Free | Works without connecting a league; strong acquisition hook |
| `/rankings` | Tune | Free | Rankings Lab dials, global and per-league |
| `/soundboard`, `/soundboard/admin` | Tune | Free (admin: founder) | Dials "Pending wiring" per INVARIANTS |
| `/share/ev-bank`, `/t/[code]` | Acquire | Free | Share artifacts; every share is acquisition |
| `/account`, `/account/shared-verdicts` | Tune | Free; export is Pro persistence | GDPR export is listed as Pro in `beta-mode.ts`; flag for legal-privacy review before enforcing (an access right may need to stay free) |
| `/privacy`, `/terms` | Acquire | Free | Legal |
| `/admin/*` | internal | n/a | Founder tools, including `/admin/feedback` |

## Hub sections (`/leagues/[leagueId]`)

| Section | Job | Target tier |
|---|---|---|
| Companion check-in | Come back | Free |
| The Call (standing call, candidates, badges) | Decide and act | Free |
| Plays panel | Decide and act, Come back | Free |
| How you're doing (Value vs ADP bank, position diagnostic) | Diagnose | Free |
| Your team (Team Identity, Inflection, Contender outlook) | Diagnose | Free |
| The league (trade strategy, opponent reads, SWOT, standings) | Read the league | Free |
| Intel (briefing feed) | Come back | Free weekly cap (`briefing` 5/week), Pro volume |
| Coach rail | Decide and act | Free daily cap, Pro volume |

## API routes that cost money to serve

| Route | Cost driver | Meter |
|---|---|---|
| `/api/coach/[leagueId]` | Anthropic, web search | `coach` |
| `/api/briefings/run/[leagueId]` | Anthropic | `briefing` |
| `/api/decisions/pick`, `/trade`, `/strategy` | Anthropic | `verdict` |
| `/api/cron/aar-notifications` | Email send | none (free) |

## Gaps this map surfaced

1. **No first-run Team Card.** The design's recommended first run (username, pick a league, one Team Card that leads with Push / Hold / Sell) does not exist. Today a new manager lands on the full hub. Registered as `EXP-P1` (drafted).
2. **Activation and week-2 return cannot be measured.** `src/lib/analytics.ts` types `sleeper_username_submit`, `leagues_fetched`, and `league_opened`, but no component fires them. Only six events fire (`coach_message_sent`, `briefing_generated`, `trade_evaluated`, `trade_attack_built`, `trade_verdict_shared`, `soundboard_doctrine_saved`), all to GTM, which agents cannot read. The `leagues` table is never written by the app, so a connected league leaves no server record. Decision issue filed.
3. **No weekly email brief exists.** The charter promises "the weekly email stays free," but the only email cron is `aar-notifications`. Nothing to gate, nothing to protect yet; it is a build candidate for the Come back job once measurement exists.
4. **Briefings carry a free weekly cap of 5.** That is in-app briefings, not the weekly email. Keep them distinct when the weekly email ships so the email is never metered.
5. **GDPR data export listed as a Pro perk.** Data-access rights may need to stay free. Route to `dynasty-legal-privacy-checker` before any enforcement.
