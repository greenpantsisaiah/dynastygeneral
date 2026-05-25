# Dynasty General: Onboarding (for Minhaj, marketing)

Welcome. This guide orients you to the product, the brand, and how we work, so
your Claude Code sessions start with the same context the founder's do. Open it
in Claude Code after you clone the repo.

## 1. What you already have once you clone

The repo is private. You are a collaborator with push access, so every
checked-in doc is yours the moment you clone. When you run Claude Code inside
the repo, it auto-loads the project instruction chain (`AGENTS.md` and its
imports). The ones that matter for marketing:

- `BRAND_VOICE.md`: the locked voice. Read this first. It governs every word we
  publish: landing page, tweets, emails, microcopy, error states.
- `REDESIGN_INTENTIONS.md`: the product's principles, information architecture,
  and the named strategic frames (Plays, Companion, EV bank). This is where the
  marketing story comes from.
- `README.md`: stack, routes, source layout. The landing page lives at `/`.
- `INVARIANTS.md` and `CANONICAL_SOURCES.md`: engineering doctrine. Skim, do not
  study; useful when a claim needs to trace to real math.

## 2. What this guide adds (not in the repo)

A layer of founder context lives only in the founder's local Claude Code memory
and does not travel with the repo. The parts that change how you message the
product:

- **The positioning is "intelligence analyst," not "stats tool."** The user is
  the general; the system is their analyst team. Insights arrive as briefings,
  not data dumps. The founder advised generals, CEOs, and Shark Tank investors;
  that posture is the brand. Tagline in the README: "Win the decision in front
  of you."
- **The product is rational + emotional, on purpose.** It is not only a
  decision engine. Two named, shipped frames carry the emotional story:
  - **Plays**: the strategic frame. Every multi-pick or multi-week plan is a
    Play (QB Stack, Anchor + Handcuff, and so on) with a thesis, named partners,
    and survival math. This is the cornerstone; lead with it.
  - **Companion**: the emotional ROI loop. Poker-rail companionship for a solo
    hobby: honest shared stakes, memory, and presence. The discipline that keeps
    it from being slimy is that every reaction traces to a real computed signal.
    Message it as "an analyst who remembers what it expected and tells you the
    truth," never as "a hype buddy." Honest-first: it commiserates only when you
    were genuinely ahead and lost to variance, and critiques only on a real gap.
- **Do not describe the decision surface as three horizon lanes.** Win-now /
  balanced / future is ONE perspective among many. A single pick can be win-now
  and future and a value steal at once. Marketing copy should never imply the
  product boxes a user into three columns.
- **The EV bank is a flagship, screenshot-ready surface.** Per-pick value
  banked, league rank, confidence bands always visible. Designed for sharing;
  good source of social proof artifacts.

## 3. The brand voice in one screen (full version in BRAND_VOICE.md)

- **Voice A is the brand.** Plainspoken, decisive, evidence-cited, sophisticated.
  The reader is a sharp adult who came for a verdict.
- **Voice C is rejected.** "Here's the thing nobody says," "buckle up," "let me
  be clear." It reads as AI-written and dates badly. If a phrase feels like a
  hot take, it is Voice C; cut it.
- **Hard rules, every channel:**
  - No em dashes. Anywhere. Use periods, colons, commas, parentheses, or
    rewrite. There is a hook that blocks them in commits.
  - No hedging openers ("it depends," "honestly," "look").
  - Numbers always carry units and reachable provenance.
  - No exclamation points in product chrome.
  - Headlines lead with the number.
  - "We" means the user plus the company, never the product. (One scoped
    exception: the Companion's grounded beats. Not relevant to marketing copy.)

## 4. Release notes are a marketing surface

There is one source of truth for the changelog: `src/lib/changelog/releases.ts`.
The bottom-left "What's new" ribbon surfaces the latest; the full history is at
`/changelog`. The founder wants these kept current, written Voice A for a tester
reading the app (not copied from commit logs). When a meaningful wave ships, add
a dated `Release` to the top. A stale changelog reads as a dead product.

## 5. How we work (git, because you have push access)

The founder is non-technical and runs several Claude Code sessions at once.
Claude owns all git. The rules that keep sessions from colliding:

- **Never commit to `main`.** Main advances only through merged pull requests.
- **Each unit of work gets its own branch and worktree**, created off the latest
  `origin/main`. Your Claude Code session handles this; you do not run git by
  hand.
- **Shipping is the "ship it" flow:** build clean and tests green, push the
  branch, open a PR against `main`, squash-merge. The production site
  (dynastygeneral.app) deploys on every merge to main, and every PR gets a
  Vercel preview URL, which is handy for reviewing marketing-page changes
  visually before they go live.
- Never force-push a shared branch, never hard-reset work you did not create.

For pure marketing work (copy, positioning, briefs) you may not touch code at
all. When you do edit the landing page or changelog, follow the flow above and
let Claude drive the git.

## 6. Where things live

- Landing page and waitlist: route `/`, source under `src/app`.
- Brand and product canon: the markdown files in the repo root listed in section 1.
- Changelog data: `src/lib/changelog/releases.ts`; page at `/changelog`.
- Production: dynastygeneral.app. Repo: github.com/greenpantsisaiah/dynastygeneral (private).

## 7. First session checklist

1. Clone the repo and run Claude Code inside it so the instruction chain loads.
2. Read `BRAND_VOICE.md` end to end. It is short and load-bearing.
3. Skim `REDESIGN_INTENTIONS.md` sections on Plays (Principle 12) and Companion
   (Principle 13) for the product story.
4. Open the live site and read the landing page; that is the current public
   voice to match or improve.
5. Bring marketing ideas as drafts in Voice A. When in doubt on a phrase, ask
   "is this Voice A or Voice C," and cut the hot-take energy.
