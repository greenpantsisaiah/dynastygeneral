<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Multi-session workflow (worktrees + shipping to prod)

The founder runs several Claude sessions at once and is NOT technical. You own all git. Never ask the founder to run git commands, resolve a merge, or reason about branches. They start a session with `dg-new <name>` (launcher at `../dg-new`, a sibling of `web/`) and ship by saying "ship it."

## Isolation: one session, one worktree, one branch

- Each session works in its OWN git worktree on its OWN `work/<name>` branch, created off the latest `origin/main`. At the start of any code work, confirm where you are: `git rev-parse --show-toplevel` and `git branch --show-current`.
- NEVER run `git checkout` / `git switch` to change branches inside a worktree, and never inside the main checkout at `web/`. Switching branches in a shared tree yanks files out from under other live sessions (this is the exact bug that tangled sessions on 2026-05-21). If you are on `main` or in `web/` and about to write code, STOP and make your own worktree first: `git worktree add ../dg-<name> -b work/<name> origin/main`, then work there.
- NEVER commit directly to `main`. Commit to your `work/<name>` branch.

## Shipping to prod (the "ship it" flow)

Vercel deploys production on every push to `main` and builds a preview URL for every branch/PR. To ship:

1. `npm run build` clean (zero warnings) AND `npm test` all green. If not, fix before shipping; do not ship red.
2. Commit your work to your `work/<name>` branch.
3. `git push -u origin work/<name>` (a branch push, never a main push).
4. `gh pr create --fill --base main`, then `gh pr merge --squash --delete-branch`. The squash-merge advances `origin/main`, which triggers the Vercel production deploy.
5. Tell the founder it is live in plain language, with the production URL (dynastygeneral.app) and the PR preview URL if a visual check helps.

NEVER run `git push origin main` directly. It bypasses this flow, races other sessions, and trips the safety classifier. Main advances only through merged PRs.

## Never (destructive)

- Never `git push --force` / `--force-with-lease` to a shared branch or main.
- Never `git reset --hard`, `git checkout -- .`, or `git clean -fd` on work you did not create.
- Never delete a branch that has unmerged commits.
- After a PR merges, retire the worktree with `git worktree remove <path>` (only once merged).

# Project invariants and workflow

Read these before fixing bugs, adding surfaces, or touching the strategy engine. They capture root-quality lessons that survive compaction.

@INVARIANTS.md

# Canonical computation sources

Before writing any helper that returns a number, label, or boolean used in user-facing copy or scoring, check the canonical-sources index. Re-implementing a domain that already has a canonical is the bug class we keep paying for. CI enforces a subset via `evals/anti-patterns.test.ts`.

@CANONICAL_SOURCES.md

# Redesign intentions (locked)

Before making any structural UI / layout / IA decision, read the redesign intentions. This is the canonical record of principles, voice, IA, stage adaptation, and audit of what's shipped vs. drifted vs. parked. Survives compression.

@REDESIGN_INTENTIONS.md

# Brand voice (locked)

Voice A is the brand. Voice C is rejected. No em dashes. No hedging openers. No linkbait. Numbers always have units and reachable provenance.

@BRAND_VOICE.md
