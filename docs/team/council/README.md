# Customer council

- `PERSONAS.md`: the seats, scoring, season calendar, routing.
- `runs/<date>.md`: each full run's scorecard and fixes.
- Screenshots for each run live in the project files under `council/run-<date>/` (too large for git).

## Signing in as the test account (approved by Isaiah 2026-11-25)

1. The cloud environment must allow `dynastygeneral.app`, `www.dynastygeneral.app` and the Supabase host.
2. Playwright: open `/login?next=/home`, fill `isaiah+dgtest@nextupleader.com`, click "Email me a sign-in link instead", save `storageState` (it holds the PKCE verifier). One request per ~60 s.
3. Gmail connector: search `to:isaiah+dgtest@nextupleader.com newer_than:1h`, read ONLY that sign-in email, take the verify link.
4. Open the link in a context loaded from the saved state; it lands on `/home` signed in. Save the new state for the rest of the run.

Other managers' views: `/leagues/<league_id>?username=<sleeper_username>&season=<year>` renders their hub with a "Viewing another team" banner.
