# Legal guardrails

Capture of the bright-line rules from the 2026-05-05 legal/privacy audit by `dynasty-legal-privacy-checker`. These rules apply to ALL public surfaces (scoreboard pages, marketing pages, blog posts, social media, conference talks). They do not apply to internal dev surfaces (Coach, league hub) which are user-private.

This doc is committed and authoritative. Update only with founder review.

## The bright lines

### 1. Never republish FantasyPros' player-level rankings

DO NOT publish, embed, table, or surface as a feature any of the following:
- FP's ranked list of players in any meaningful slice (top 5, top 10, top 50, top 200)
- "FP top 10 vs our top 10" side-by-side tables
- Cropped excerpts of their cheat sheet that include rank numbers per player
- Any persistent re-derivation of their ordering on a public page

**Why:** the FantasyPros Terms of Use prohibit "reproduce, duplicate, copy" of any portion of their site for commercial purposes, and the selection/arrangement of a fact compilation is the protectable expression under Feist v. Rural Telephone (1991).

**Single-instance carveout:** ONE illustrative miss with attribution and date IS defensible as fair-use commentary in service of an analytical claim. Example permitted: "FantasyPros ECR ranked Bijan Robinson #5 in their 2024 dynasty preseason snapshot; he finished 17th in 2024 PPR points." Example NOT permitted: a recurring "this week's FP misses" feature that lists 5+ players with their FP ranks every week.

### 2. Publish derived metrics, not source data

DEFENSIBLE to publish on `/scoreboard`:
- Spearman rank correlation per (source, season, format)
- Mean absolute rank error per (source, season, format)
- Top-N hit rate per (source, season, format)
- KTC value drift summary statistics
- Aggregate accuracy claims tied to a specific loss function and methodology link

Cite the source name, the snapshot date, the loss function, and the n-pairs for every metric.

### 3. Server-side data retention is research-internal, not redistribution

The raw FP CSVs / PNGs / HTML in `web/data/fantasypros/` are research notes from a paid trial. They live:
- Gitignored (`.gitignore` line: `/data/fantasypros/`)
- Filesystem-only on the founder's machine + Supabase via `historical_consensus_rankings`
- NEVER behind any deployed web route, even authenticated

Post-Phase-2 transition: when the calibration locks (target 2026-07-01), archive `web/data/fantasypros/` to an offline encrypted tarball, delete the working copies, retain only the derived metrics in Supabase. Document the transition in MODEL_CARD §9.7 (the canonical validation-results section; the earlier "§12" pointer predates the results landing in 9.7. §12 is "Caveats and recommendations").

### 4. No FP logo, mark, or trade dress

Use the word "FantasyPros" in plain text only. Do not use:
- Their logo or wordmark
- Their color scheme
- Their UI patterns as design assets

Comparative-advertising speech under the Lanham Act is protected when truthful. Trade-dress impersonation is not.

### 5. Date and version every published claim

Every public page that cites FP must:
- Have a visible "Updated [DATE]" header
- Tie every numeric claim to `/scoreboard/methodology`
- Tie every product claim ("their tiers are CSS-only", "FP doesn't publish dynasty SF ADP") to a re-verification at publication time

Stale product claims become false claims. Re-verify quarterly or at major publication events.

### 6. Affiliation disclaimer on every comparison page

Required footer for any page that uses the FantasyPros name:

> Dynasty General is not affiliated with, endorsed by, or sponsored by FantasyPros or Marzen Media LLC. Comparative claims reflect public product observation and our own backtest methodology as of [DATE]; see /scoreboard/methodology for sources. FantasyPros is a trademark of Marzen Media LLC, used here for comparative reference under nominative fair use.

## Pre-publication checklist

Before any public page citing FP ships, verify:

- [ ] No player-level FP rank tables (rule 1)
- [ ] All numeric claims tied to methodology page (rule 2)
- [ ] No FP logo or trade dress used (rule 4)
- [ ] "Updated [DATE]" header present (rule 5)
- [ ] Affiliation disclaimer in footer (rule 6)
- [ ] Product observations re-verified within 30 days of publication (rule 5)
- [ ] If a single illustrative miss is shown: attribution + date present, only ONE per page

## Industry prior art (defensibility evidence)

Other dynasty/fantasy companies have published comparative accuracy claims naming FantasyPros without legal action:
- FantasyCalc: `fantasycalc.com/blog/performance-analysis` explicitly states their values "outperform 91% of expert rankings, every major site's ADP, comparatively to FantasyPros ECR"
- Draft Sharks: `draftsharks.com/kb/most-accurate-fantasy-football-experts` discusses FP's accuracy publicly
- Academic sports-analytics literature regularly cites and benchmarks against industry sources by name

Cite FantasyCalc as primary prior art in `/scoreboard/methodology`.

## Who Marzen Media is

Marzen Media LLC is the legal counterparty (not "FantasyPros"). They are the IP holder per the FP ToS. Address: P.O. Box 370092, Las Vegas, NV 89137. Nevada governing law and exclusive venue. ToS specifies a 1-year limitations period after a cause of action arises.

If correspondence arrives:
1. Acknowledge receipt within 48 hours
2. Pull cited content to draft state (do not delete; unpublish)
3. Identify the specific claim/asset objected to
4. Respond with the analytical basis (Feist for facts, fair use for screenshots, comparative-advertising principles for marketing claims)
5. If they persist, retain counsel before escalating

## Out of scope for this guardrail doc

- Trademark filings for "Dynasty General" (separate engagement, do before SEO traffic builds)
- Material business legal questions (incorporation, IP ownership of the Green Pants Studio Vercel arrangement)
- GDPR/cross-jurisdictional rules for EU-accessing users (separate engagement)

## Source

Full audit transcript: 2026-05-05 run of `dynasty-legal-privacy-checker` subagent. Audit summary captured here; raw transcript not committed.

This doc reflects industry standards and a careful re-read by an AI assistant. It is NOT legal advice. Founder should retain counsel for: (a) `/vs-fantasypros` final copy review before launch, (b) trademark posture for "Dynasty General", (c) any C&D response if Marzen Media ever corresponds.
