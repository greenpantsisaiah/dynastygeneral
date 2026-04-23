# Multi-platform support

This codebase grew up Sleeper-only. The platform abstraction was added
in the post-launch refactor so we can add MyFantasyLeague (MFL), then
Fantrax, without rewriting consumers.

## Where the seam lives

`web/src/lib/leagues/`:

- `types.ts` is the platform-agnostic surface area: `PlatformId`,
  `PlatformLabel`, `UnifiedUser`, `UnifiedLeagueSummary`. Plus the
  `PLATFORMS` array the UI reads to render the picker.
- `adapter.ts` is the `PlatformAdapter` interface every host
  implements: `findUser`, `listLeagues`, `buildSnapshot`.
- `sleeper-adapter.ts` is the live implementation. Wraps existing
  `lib/sleeper/*` fetchers; behavior is unchanged.
- `mfl-adapter.ts` is a stub that throws `PlatformNotReadyError` on
  every call. Exists so the registry resolves "mfl" cleanly and the
  UI can show "coming soon" without import-time errors.
- `registry.ts` resolves a `PlatformId` to its adapter and parses the
  `?platform=` query param (defaults to `sleeper`).

The downstream pipeline (`buildLeagueSnapshot` and everything below
it: windows, contender outlook, decision synthesis, coach context)
already consumes platform-agnostic types. The adapter only normalizes
the inputs to that pipeline.

## Current state

- **Sleeper**: live in production. Every consumer still imports
  `lib/sleeper/*` directly; the adapter exists alongside as the new
  seam. New surfaces should prefer the adapter.
- **MFL**: stub adapter. UI shows "coming soon" on /connect. No
  customer-facing impact yet.
- **URL structure**: routes are still `/leagues/[id]` with implicit
  Sleeper. When MFL ships we'll add `?platform=mfl` query support
  (no breaking URL change for existing users).

## How to add MFL (the work plan)

When ready to implement MFL for real:

1. **Build the MFL client** at `web/src/lib/mfl/client.ts`:
   - Base URL: `https://api.myfantasyleague.com/{year}/`
   - Endpoints: `export?TYPE=league&L={id}&JSON=1` (league),
     `?TYPE=rosters` (rosters), `?TYPE=draftResults` (draft picks),
     `?TYPE=futureDraftPicks` (traded future picks), `?TYPE=players`
     (player dictionary), `?TYPE=myleagues` (user's leagues, requires
     auth cookie).
   - Zod schemas for each response (MFL returns JSON when `JSON=1`).
   - Auth: MFL uses a session cookie obtained by POSTing to
     `login.php?XML=1`. Solo-user case is fine; for multi-user store
     a per-account encrypted cookie in `subscriptions` or a new table.

2. **Implement the MFL adapter** at `web/src/lib/leagues/mfl-adapter.ts`:
   - `findUser(handle)`: handle = MFL username; POST to login.
   - `listLeagues({ user, season })`: call `myleagues` for the season.
   - `buildSnapshot({ leagueId, user })`: call league + rosters +
     draft + future picks. Map all four to the inputs that
     `buildLeagueSnapshot` expects (currently typed as
     `SleeperLeague`, `SleeperRoster[]`, etc.).

3. **Refactor `buildLeagueSnapshot` inputs** to a platform-agnostic
   shape OR add a per-platform branch. Currently
   `buildLeagueSnapshot` takes Sleeper-typed inputs. Two options:
   - **Option A** (preferred): introduce
     `lib/strategy/league-state/inputs.ts` with platform-agnostic
     `RawLeagueInput`, `RawRosterInput[]`, `RawDraftInput`. Sleeper
     adapter maps Sleeper types → inputs; MFL adapter maps MFL types
     → inputs.
   - **Option B**: keep Sleeper types as the canonical input, have
     MFL adapter "pretend to be Sleeper" by mapping MFL data to
     Sleeper-shaped objects. Faster but ugly.

4. **Player cache**: today `lib/players/cache.ts` is Sleeper-only.
   MFL has its own player IDs. Either:
   - Resolve MFL player IDs → Sleeper player IDs via name + team +
     position match (cache the mapping).
   - Maintain two parallel player caches.
   First option is cheaper (we keep one source of truth for player
   data) and works because both platforms reference the same NFL
   players.

5. **Future picks**: MFL's futureDraftPicks endpoint shape differs
   from Sleeper's traded_picks. Map both to the same internal
   `TradedPick` type.

6. **URL routing**: add `?platform=mfl` query support to
   `/leagues/[id]`, `/scout/[username]`, etc. Default remains
   `sleeper` so existing URLs keep working.

7. **Persistence**: extend `public.leagues` with a `platform` column
   (default `'sleeper'`). Existing rows backfill cleanly. Per-user
   MFL credentials live in a new table or as encrypted bytes in
   `profiles`.

8. **UI**: flip the MFL `status` in `PLATFORMS` from `coming_soon`
   to `live`. The picker shows it as live; account page shows linked
   platforms with "Add MFL" button.

9. **Marketing**: update hero / how-it-works copy. Mention "Sleeper
   AND MFL" in the dynasty-pro outreach.

## Why we built it this way

Strangler-fig pattern. The new abstraction grew alongside the old
Sleeper code instead of replacing it. Existing consumers keep working
during the migration. Each consumer migrates when it's touched, not
in a big-bang rewrite. Reduces risk; ship value continuously.

## Anti-patterns

- **Don't add platform-specific branches to consumers.** If you find
  yourself writing `if (platform === "mfl") { ... }` outside the
  adapter, the abstraction is leaking. The adapter should hide the
  platform.
- **Don't create a third player cache.** Use the resolution table
  pattern. NFL players are the same regardless of fantasy host.
- **Don't expose adapter errors directly to users.** Wrap with the
  product-language ("MFL is on the roadmap") in the route handler.
