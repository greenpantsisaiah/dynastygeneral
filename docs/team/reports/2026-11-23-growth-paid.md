# [Report] growth-paid: week of 2026-11-23

Spend this week / MTD: $0 / $0 of $500
Live tests: none. No ad account is connected (decisions-log has no entry for one).
Paused or finished: none.
Shipped: this report only.

## Findings

- **Measurement gap (blocks every paid test).** There is no way to count "signup that connects a league" per source. `src/lib/analytics.ts` fires into GTM only, `sleeper_username_submit`, `leagues_fetched` and `league_opened` are defined but fired by no component, no UTM capture exists, and the `leagues` table is never written by the app. Product-steward decision issue #101 (options A/B/C) already asks Isaiah to approve a server-side `product_events` table. Paid needs one addition to that build: capture `utm_source`, `utm_campaign` and `utm_content` on first landing and attach them to the user at league connection. No separate build is requested until #101 is answered.
- **ChatGPT ads (monthly research, 2026-11-23).** Secondary reports from May to June 2026 say OpenAI opened a self-serve Ads Manager to US advertisers and removed the $50,000 floor. One guide reports daily budgets as low as $25. CPC billing was added, and CPA bidding was reported rolling out in June 2026. Not verified against OpenAI's own current pages. Sources: https://axios.com/2026/05/05/openai-self-serve-ad-platform , https://the-decoder.com/chatgpt-ads-are-now-open-to-small-businesses-as-openai-builds-a-full-self-serve-ad-platform/ , https://ppc.land/openais-ads-manager-is-live-and-the-barrier-to-entry-just-dropped/
- **Claims.** The claims register has no approved claims, so no ad copy can be written yet. Ads can only state level 0 product facts once the claims steward approves them.

## Decisions needed

1. Answer #101 (recommendation A). Without it there is no metric for any paid test.
2. When ready to test, open an ad account with a hard monthly cap of $500 (agents cannot open accounts or enter cards). Recommendation: start with Reddit (dynasty communities) and, if the account is open to a small advertiser, ChatGPT ads.

## Next week

- Draft registry rows for two tests (Reddit dynasty-community audience; ChatGPT ads) once #101 is answered.
- Ask claims-steward for approved level 0 copy.
- Spec the landing variant behind a flag with UTM capture.
