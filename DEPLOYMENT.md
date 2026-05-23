# Dynasty General · Deployment

Pre-deploy checklist, deploy procedure, post-deploy verification, rollback. Loaded by Claude before any deploy-related task.

## Where this app runs

- **Hosting**: Vercel (Next.js native target).
- **Domain**: dynastygeneral.app (production), `*.vercel.app` preview URLs (per-PR).
- **Region**: Vercel default (serverless functions in user-region; iad1 baseline).
- **Runtime**: Next.js 16.2.4 with Turbopack. Node 20+ required.

## Required environment variables

Set in Vercel project settings AND in `.env.local` for local dev:

| Variable | Required | Purpose | Where read |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | YES | LLM calls (verdict, coach, briefings) | `/api/*` and `/lib/*` server modules |
| `NEXT_PUBLIC_SITE_URL` | for production | absolute URLs in OG tags + emails | client + server |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | required for production | persistent rate-limit + budget state | `lib/ratelimit.ts`, `lib/budget.ts` |
| `BETA_OPEN_MODE` | currently IGNORED | `lib/billing/beta-mode.ts` returns `true` unconditionally during alpha; the env var has no effect. When ready to enforce Pro gating, restore the env-driven toggle in that file. | `lib/billing/beta-mode.ts` |
| `ADMIN_EMAILS` | optional | comma-separated allow-list for admin endpoints (e.g. `/api/admin/refresh-players`); empty = no one is admin | `lib/auth/admin.ts` |
| `NFL_DRAFT_WINDOW_START` | optional | ISO date `YYYY-MM-DD` (UTC). Both START + END must be set for draft-live mode to activate | `lib/draft-window/active.ts` |
| `NFL_DRAFT_WINDOW_END` | optional | ISO date `YYYY-MM-DD` (UTC). Inclusive end; window is closed by default | `lib/draft-window/active.ts` |
| `PLAYERS_CACHE_TTL_MINUTES` | optional, default `60` | TTL for the in-memory Sleeper /players/nfl cache. Lower during NFL Draft week if needed; admin can also force-refresh via POST /api/admin/refresh-players | `lib/players/cache.ts` |
| `CAP_FREE_COACH_PER_DAY` | optional, default `5` | Free-tier daily Coach turn cap. Beta observes only; post-beta enforces. | `lib/consumption/track.ts` |
| `CAP_FREE_BRIEFINGS_PER_DAY` | optional, default `3` | Free-tier daily Briefings batch cap. | `lib/consumption/track.ts` |
| `CAP_FREE_MULTI_PICK_PER_DAY` | optional, default `1` | Free-tier daily multi-pick rollout cap (currently not enforced). | `lib/consumption/track.ts` |
| `CAP_PRO_COACH_PER_DAY` | optional, default `200` | Protective cap for Pro against the 1% extreme user (5 leagues, hundreds of turns/draft). Median Pro never sees it. | `lib/consumption/track.ts` |
| `CAP_PRO_BRIEFINGS_PER_DAY` | optional, default `100` | Protective Pro briefings cap. | `lib/consumption/track.ts` |
| `CAP_PRO_MULTI_PICK_PER_DAY` | optional, default `50` | Protective Pro multi-pick cap. | `lib/consumption/track.ts` |
| `STRIPE_PRICE_ID_DAY_PASS` | optional | Stripe one-time price ID (~$3-5) for the Day Pass: 24h unlimited usage. Surfaced inline when a user hits a cap. Without it, the Day Pass button shows but checkout errors. | `lib/stripe/client.ts` |
| `NEXT_PUBLIC_COOKIE_BANNER_ENABLED` | optional, default off | Set to `"true"` to render the EU-style cookie consent banner at the bottom of every page. Off by default because we don't load ad trackers or third-party analytics today. Flip when EU/UK traffic appears or you wire Vercel Analytics. | `components/cookie-banner.tsx`, mounted in `app/layout.tsx` |
| `SENTRY_DSN` | optional | Error tracking. Without it, errors only land in Vercel logs. | `lib/sentry/*` (when wired) |
| `RESEND_API_KEY` | optional (required for alerts/email) | Powers ops alerts (`lib/ops/alert.ts`) plus feedback + AAR notifications. Without it, ops alerts log to Vercel only (no email). | `lib/ops/alert.ts`, `lib/email/*` |
| `EMAIL_FROM` | optional, default `alerts@dynastygeneral.app` | From address for ops alerts + notification email. Must be on a verified Resend sending domain. | `lib/ops/alert.ts`, `lib/email/*` |
| `OPS_ALERT_TO` | optional | Comma-separated recipients for ops alerts (enforcement-disabled, budget-cap-reached). Falls back to the first `ADMIN_EMAILS` entry. | `lib/ops/alert.ts` |
| `OPS_ALERT_DEDUPE_MS` | optional, default `3600000` (1h) | Per-kind in-process email dedupe window so a sustained condition does not flood the inbox. | `lib/ops/alert.ts` |

If `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are unset, rate limits and budget caps cannot be enforced. Behavior splits by route:
- **LLM-touching routes fail CLOSED in real production** (Coach, Briefings, decisions/pick|trade|strategy, the scout page). They return `503` and fire an `enforcement_unconfigured` ops alert rather than serve unprotected and let one bot drain the Anthropic budget. The guard keys on `VERCEL_ENV === "production"`, so local dev and Vercel preview deploys are NOT blocked (they have no Upstash by design). The guard checks only the persistent misconfiguration case (env vars absent); a transient Upstash error still fails open so a momentary blip does not take LLM features down. Guard lives in `lib/ops/llm-guard.ts`.
- **Non-LLM routes still allow-all** (the code logs a loud error once and returns allow-all), since they carry no cost-exhaustion risk.

Vercel KV exposes Upstash-compatible REST credentials under "REST API" in the KV dashboard; copy those into the Upstash-named env vars. The auto-injected `KV_*` names are NOT what `lib/ratelimit.ts` reads.

**Ops alerts.** Two critical conditions email the founder (and always log to Vercel): `enforcement_unconfigured` (Upstash missing in production) and `budget_cap_reached` (daily Anthropic cap hit). Wire `RESEND_API_KEY` + `OPS_ALERT_TO` (or `ADMIN_EMAILS`) to receive the emails; without them the conditions still log. Emails dedupe per kind per warm instance (`OPS_ALERT_DEDUPE_MS`, default 1h).

If `ANTHROPIC_API_KEY` is unset, the verdict + coach return graceful stubs (`Set ANTHROPIC_API_KEY to enable verdicts`). The app still runs; LLM features just degrade.

### NFL Draft window activation

When `NFL_DRAFT_WINDOW_START` + `NFL_DRAFT_WINDOW_END` are set and the current UTC date falls inside that window:
- League hub ticker shows "🔴 NFL Draft live · refresh between picks"
- Coach prompt receives a "## NFL Draft is LIVE" addendum so it reads each rookie's team field individually instead of assuming a static pre-draft world
- Pair with `ADMIN_EMAILS` so the admin can hit `POST /api/admin/refresh-players` between rounds and bypass the players-cache TTL

Example (2026 draft):
```
NFL_DRAFT_WINDOW_START=2026-04-23
NFL_DRAFT_WINDOW_END=2026-04-26
ADMIN_EMAILS=isaiah@nextupleader.com
```

### Beta mode posture

`BETA_OPEN_MODE=true` (the default) ships every killer feature to every signed-in user during alpha/beta. Pro-only persistence (cross-device chat history mirror, War Room server-side mirror, GDPR data export) stays Pro regardless. The daily Anthropic budget cap is the actual cost ceiling, not the per-feature gates.

When ready to enforce paid tiers, set `BETA_OPEN_MODE=false` in Vercel env. No code change required.

## Pre-deploy checklist

Run all of these before promoting to production. The `dynasty-security-auditor` and `dynasty-cost-watcher` subagents automate the heavy lifts.

### Build + types

- [ ] `npm run build` from `web/` returns clean (zero warnings).
- [ ] `npx tsc --noEmit` returns clean.
- [ ] `npm run check:em-dashes` (or whatever the script is named) returns clean.
- [ ] `git status` shows no uncommitted files.

### Security

- [ ] Run `dynasty-security-auditor` (`audit:full-sweep`). Address all CRITICAL and HIGH findings.
- [ ] Verify `.env*` files NOT committed (`git ls-files | grep .env` is empty).
- [ ] Verify no `console.log` of secrets, request bodies, or env values in production-bound paths.

### Cost

- [ ] Run `dynasty-cost-watcher` (`audit:full-sweep`). Confirm aggregate worst-case daily spend is below your budget cap with margin.
- [ ] Verify `lib/budget.ts` daily cap is set to a value you can afford to lose if the worst-case fires.
- [ ] Verify rate limits in `lib/ratelimit.ts` are tight enough that one IP can't burn the budget.

### Privacy / legal

- [ ] Run `dynasty-legal-privacy-checker` (`audit:full-sweep`). Address all CRITICAL findings.
- [ ] Privacy policy is published and linked from every page.
- [ ] Terms of service is published if monetizing.
- [ ] Contact email for data subject requests is published.

### Functional

- [ ] Smoke test against a real Sleeper league: scout works, league hub loads, coach responds, briefings render.
- [ ] Smoke test against a league with a completed draft (post-draft state should NOT show "you're on the clock").
- [ ] Smoke test against a league with active draft (should show Decision card + Strategic Forks).
- [ ] Smoke test against a username with multiple dynasty leagues (scout portfolio renders all teams).

### Operational

- [ ] Upstash Redis provisioned and `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars set in Vercel. NOT the auto-injected `KV_*` names: `src/lib/ratelimit.ts` reads the Upstash-native names, so a Vercel KV instance must expose its REST API credentials under the Upstash names (the KV dashboard surfaces them under "REST API"). Without these, rate limiting AND the LLM budget cap silently disable in production and the cost-watcher's worst-case-per-IP estimates apply unchecked.
- [ ] **Known state: `isBetaOpenMode()` is hardcoded `true`.** `src/lib/billing/beta-mode.ts` returns `true` unconditionally; the `BETA_OPEN_MODE` env var is ignored. Pro tier gating on Coach / Briefings / Decisions is therefore NOT enforced. When ready to monetize, restore the env-driven toggle in that file (the comment names the steps).
- [ ] Sentry (or equivalent) DSN configured if using error tracking.
- [ ] Vercel Analytics enabled if you want traffic visibility.
- [ ] Supabase migrations applied. Run `supabase db push` (or paste each `.sql` into the SQL editor in order). The Soundboard scaffold (0006_soundboard.sql) introduces three tables: `judgment_profiles`, `mixer_feedback`, `mixer_suggestions`. Without it, /soundboard renders fine but argue/suggest 500.

## Deploy procedure

### First-time deploy (preview)

1. Connect the repo to Vercel via the dashboard.
2. Set environment variables in Vercel project settings.
3. Push to a feature branch. Vercel builds a preview at `https://<branch>-<project>.vercel.app`.
4. Run the post-deploy verification (below) against the preview URL.
5. Merge to main only after preview passes.

### Production deploy

1. Confirm the pre-deploy checklist is complete.
2. Merge to `main`. Vercel auto-deploys.
3. Watch the deploy log for the first 5 minutes. Build failures here are loud.
4. Run post-deploy verification against the production URL.

### Domain setup (production)

1. In Vercel project settings, add the production domain.
2. Configure DNS at the registrar:
   - A record: `76.76.21.21` (Vercel's anycast IP)
   - or CNAME for subdomain to `cname.vercel-dns.com`
3. Wait for SSL provisioning (typically <5 min via Let's Encrypt automation).
4. Verify HTTPS works and redirects HTTP.

## Post-deploy verification

Run within 15 minutes of any production deploy:

- [ ] Production URL loads (200 OK on `/`).
- [ ] `/leagues/<known-good-league-id>` loads with expected hub content.
- [ ] `/scout/<known-good-username>` loads, verdict streams in.
- [ ] Coach endpoint accepts a chat turn and returns a response.
- [ ] Server logs show no unhandled errors in the first 5 minutes.
- [ ] Rate-limit headers present on `/api/*` responses.
- [ ] Vercel KV is being read/written (check the KV dashboard for activity).

## Rollback

If something is on fire:

1. **Vercel dashboard → Deployments → previous good deploy → Promote to Production.** Takes ~30 seconds.
2. Communicate (status page, Twitter/X, customer email) if customers were affected.
3. File a post-incident entry in `SECURITY.md` (if security-relevant) or here under "Past incidents".

## Past incidents

(none yet)

## Cost monitoring

Day-to-day:

- Anthropic Console (https://console.anthropic.com/): daily spend by model.
- Vercel dashboard: function invocations + bandwidth.
- Vercel KV: budget state (the running daily total per `lib/budget.ts`).

Set Anthropic spend alerts at 50% and 80% of your monthly budget cap.

## Scaling notes (when traffic grows)

- Vercel KV is rate-limited at the free tier (3000 ops/day). Above that, upgrade.
- Anthropic has per-org rate limits; if you hit them, request an increase or upgrade.
- Sleeper API is unauthenticated and has soft rate limits; if heavy traffic, cache more aggressively (current caching is per-route in `lib/sleeper/client.ts`).
- Consider edge functions for read-heavy routes (`/leagues/*` is read-only; could move to edge runtime).

## What this doc does NOT cover

- CI/CD beyond Vercel's auto-deploy on push.
- Multi-environment promotion (we're single-environment until that becomes a problem).
- Database migrations (no database yet).
- Customer support workflows.
- Stripe / billing setup (when monetizing, expand here).
