# Dynasty General · Security

Threat model, standards, and the pre-deploy checklist. Loaded by the `dynasty-security-auditor` subagent and read by Claude before any change to a route or auth-relevant module.

## Threat model

What we're actually protecting against:

1. **LLM cost exhaustion.** Single biggest financial risk. An attacker hits a coach endpoint in a loop and burns the daily budget. Mitigated by per-IP rate limits + a daily total budget cap. Both must be in place on every Anthropic-touching route.
2. **Anthropic key leakage.** Catastrophic if it happens. Mitigation: key only ever read in server-only modules (`/api/`, `/lib/`-server). Never imported into a client component. Never logged.
3. **Sleeper SSRF.** User-supplied league IDs go into URLs. Mitigation: sanitize to alphanumeric, fixed base URL, no user-controlled scheme/host.
4. **PII exposure.** Today we hold almost no PII (Sleeper username + a cookie of declared windows). When we add accounts/billing, this gets bigger.
5. **XSS via Sleeper team names.** Sleeper allows arbitrary strings in team names. Mitigation: React escaping (no `dangerouslySetInnerHTML` on Sleeper content).
6. **Public scraping of paid tier features.** Once we have paid tiers, the scout endpoint shouldn't expose paid analytics to non-customers. Today it's fully public; that's intentional.

What we're explicitly NOT building defenses against in v1:

- Account takeover (no accounts yet).
- Sophisticated DDoS (relying on Vercel's edge protection + the rate limits).
- State-actor attackers (out of threat model for a solo founder's first year).

## Standards (every route must meet these)

### LLM-touching routes

Mandatory before any `client.messages.create` call:

```ts
const ip = clientIpFrom(req);
const rate = await checkRateLimit("<endpoint-scope>", ip);
if (!rate.allowed) return rateLimitedResponse(rate);

const budget = await checkBudget();
if (!budget.allowed) return budgetExceededResponse();

// ... call ...

await recordSpend({
  model,
  input_tokens: response.usage.input_tokens,
  output_tokens: response.usage.output_tokens,
}).catch(() => {});
```

`max_tokens` must be set explicitly. Default to the smallest value that fits the response shape. Comment any value > 4000 with the reason.

### External-data routes

- All Sleeper, KTC, FantasyPros, etc. fetches go through a typed wrapper (e.g. `sleeperGet`) that does Zod validation on the response.
- All outbound fetches must have a timeout (`AbortSignal.timeout(15_000)` is the project default).
- User-supplied IDs that compose into URLs must be sanitized: `/^[a-zA-Z0-9_-]+$/` for league IDs, `/^[a-zA-Z0-9._-]+$/` for usernames.

### Secret handling

- Server-only env access ONLY in `/api/` and `/lib/`-server modules.
- Never `console.log` request bodies or env values.
- Errors logged via `console.error("[scope]", err)`. Never include raw `err` in client responses; surface a generic message + a request id.
- `.env*` files in `.gitignore`. `.env.example` documents required vars without values.

### Output sanitization

- Sleeper team names + display names go through React's default escaping. No `dangerouslySetInnerHTML` on user-controlled content.
- Coach output is rendered as plain text, not HTML.
- Chat history persisted to localStorage is NOT sanitized at write time; it's just text.

## Pre-deploy security checklist

Run before every deploy. The `dynasty-security-auditor` subagent automates most of these.

- [ ] No `process.env.ANTHROPIC_API_KEY` in any client component.
- [ ] Every Anthropic call site has rate-limit + budget gates above it.
- [ ] Every Anthropic call site has explicit `max_tokens`.
- [ ] No hardcoded API keys anywhere (grep `sk-ant-`, `pk_live_`, etc.).
- [ ] Every external HTTP call goes through a typed wrapper with Zod validation.
- [ ] Every `console.log` in `/api/` and `/lib/` reviewed (ideally zero of them in production-bound code).
- [ ] Every user-supplied path/route param validated.
- [ ] CORS / security headers configured at the framework level (Next.js defaults are reasonable).
- [ ] HTTPS enforced (Vercel default; verify domain config).
- [ ] No `.env*` files committed (`git ls-files | grep .env`).

## Incident response (skeleton)

If a security issue is discovered post-deploy:

1. **Triage**. Is data being leaked right now? Are funds being drained right now? If yes: stop the bleeding (disable the endpoint, revoke the key) before fixing.
2. **Rotate keys** if a credential was exposed. Anthropic, Vercel, any third-party token.
3. **Audit the blast radius**. What did the issue allow? Who was affected?
4. **Notify** if customer data was exposed (per privacy policy commitments and applicable law).
5. **Patch + verify** the fix.
6. **Post-mortem entry** in this file under "Past incidents".

## Past incidents

(none yet)

## What this doc does NOT cover

- Customer billing fraud (Stripe webhook hardening): when we add billing, expand here.
- Account takeover defenses: when we add accounts, expand here.
- Detailed compliance frameworks (SOC2, ISO27001): not relevant at solo-founder stage.
