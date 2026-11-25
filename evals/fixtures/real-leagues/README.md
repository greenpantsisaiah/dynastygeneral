# Real-league snapshots

Committed captures of real Sleeper leagues, so cloud sessions (which cannot reach Sleeper) can render user-facing outputs with real data. See `docs/team/QUALITY_BAR.md`, "The real-league snapshot".

## Refresh (weekly, before the Monday brief)

On a machine that can reach Sleeper (Isaiah's Mac), from the repo root:

```
npx tsx scripts/capture-real-leagues.ts <sleeper_username>
```

Then commit the updated `<username>.json` through the normal PR flow.

## Rules

- A render against a snapshot older than 8 days does not count. `loadRealLeagueSnapshot()` in `load.ts` refuses a stale file.
- Contents: league settings, rosters, public user fields, matchups so far, traded picks, drafts and picks, nfl_state, trimmed player records, and FantasyCalc values per format.
- Never add emails, auth tokens, or postal addresses. Sleeper's public API returns none of them.
