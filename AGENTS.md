<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project invariants and workflow

Read these before fixing bugs, adding surfaces, or touching the strategy engine. They capture root-quality lessons that survive compaction.

@INVARIANTS.md

# Canonical computation sources

Before writing any helper that returns a number, label, or boolean used in user-facing copy or scoring, check the canonical-sources index. Re-implementing a domain that already has a canonical is the bug class we keep paying for. CI enforces a subset via `evals/anti-patterns.test.ts`.

@CANONICAL_SOURCES.md
