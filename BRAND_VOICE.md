# Dynasty General · Brand voice

Locked 2026-05-08 after voice calibration. Applies to every piece of
written content: microcopy, in-product prose, Coach default replies,
Library articles, marketing, error messages, email digests, OG-image
captions. The Sloan-mode register (Voice B below) is the only
permitted variant, and only when the user has flipped the toggle.

## Core voice (Voice A)

Plainspoken, decisive, evidence-cited, sophisticated. The reader is
treated as a sharp adult who came for a verdict, not entertainment.
The voice does not perform. It states. It cites the number. It
moves on.

### What it sounds like

> Adrian Peterson returned 96% of his ADP value at age 31. Le'Veon
> Bell returned 12% at age 27. The "RB cliff at 30" is the most-
> repeated, least-useful rule of thumb in dynasty, and it earns that
> title by averaging two completely different aging curves into one
> rounded year.

> Tyler Warren at 5.8 is a 21-pick discount on an ADP-35 player.
> Survival to your next pick is 21%. The market overpriced his
> risk; you are getting the asset.

> Judkins gone, two picks before yours. Recalibrating the next-pick
> math.

### What it never sounds like

- "Here's the thing nobody says out loud about X"
- "Let me be clear"
- "Buckle up"
- "It's complicated"
- "It depends"
- "There are several factors to consider"
- "Honestly"
- "Look, I'll just say it"

These are linkbait tropes that mark prose as AI-written or
sensationalized. Dynasty General's voice predates them and outlasts
them.

## Sloan-mode register (Voice B)

Drier, more clinical, same data. Used only when the user has flipped
the Sloan-mode toggle. The reader is a researcher, an analyst, or a
founder presenting the model. Sentences are slightly longer; jargon
is appropriate; confidence intervals appear inline.

### What it sounds like

> The aging-RB cliff is a bimodal distribution misread as a single
> distribution. High-pass-involvement backs (target share above 12%)
> decline gradually from age 28, retaining roughly 70-80% of value
> through 31. Low-pass workhorses cliff inside a single offseason.
> The leading indicator for the workhorse cliff is yards-per-carry
> stability across the second half of the prior season.

Same content, different reader posture. Switching modes never changes
the data; it changes the reading register.

## Hard rules

These are non-negotiable across both registers.

1. **No em dashes.** Anywhere. Use periods, colons, commas,
   semicolons, parentheses, or rewrite. Enforced by a PreToolUse
   hook and `npm run check:em-dashes`.

2. **No hedging openers.** "It depends" / "There are several factors"
   / "It's complicated" / "Honestly" / "Look" / "Well" / "I'll just
   say." If the answer is genuinely uncertain, say so with specific
   uncertainty (a range, a probability, a named missing fact).

3. **Numbers always have units and provenance available.** "21
   picks past ADP" not "21 picks." "ADP 82 (rookie variant)" not
   "ADP 82" when the variant is contextually ambiguous. The
   provenance is shown on tap, not in the headline, but it must
   exist somewhere reachable.

4. **No second-person plural ("we") for the model.** The system is
   "the engine" or "Dynasty General." "We" is reserved for the user
   and the founder writing about the company.

5. **No exclamation points in product chrome.** The voice is
   decisive, not enthusiastic.

6. **Headlines lead with the number when available.** "+12.3 EV
   pts banked" before "You are doing well." The data is the headline.

7. **Acknowledge what is unknown by name.** "We do not have
   2026 NFL Draft landing spots yet" beats "uncertain at this stage."

## Scaling down: microcopy

The voice scales down to button labels, error messages, empty states.
Same rules apply.

| Scenario | Bad | Brand |
|---|---|---|
| Empty state | "Nothing here yet!" | "No picks made yet. Targets and gaps will appear as you draft." |
| Loading | "Loading..." | "Resolving league snapshot." |
| Error | "Oops! Something went wrong." | "League sync failed. Sleeper API returned 503; retry available." |
| Confirm | "Are you sure?" | "Confirm: lock Tyler Warren at 5.8." |
| Success | "Pick saved!" | "Pick recorded. Standing call updates next refresh." |
| 404 | "Page not found" | "No surface at that path." |

## Scaling up: longform Library articles

Library articles follow a fixed shape so returning readers can scan
without re-reading. See `principle 11` in the design spec.

1. **Counterintuitive thesis** in 1-2 sentences. Numbers in the lede.
2. **Hero chart** that proves the thesis. Annotated with WHY arrows,
   not just labels.
3. **2-3 supporting beats**, each with its own visualization or
   call-out. Each beat tightens the thesis.
4. **Acknowledge what is unknown** in one short paragraph. This is
   the credibility move; do not skip it.
5. **Implications for the user's decision** in 2-3 lines. Concrete,
   actionable, ties back to the product surface where the decision
   lives.

Returning visitors see an auto-collapsed view: thesis + chart only,
with "view full article" affordance and an "Updated [date]: [what
changed]" line above the thesis when fresh data has shifted the
conclusion.

## Marketing voice

Marketing pages and launch tweets are still Voice A. They are NOT
Voice C (the "quiet part out loud" register that was rejected during
calibration; it reads as AI-written and dates badly). Marketing
inherits the same rules: no em dashes, no hedging, numbers with
units, evidence cited.

The only concession marketing can make is slightly punchier headlines
("The EV bank for dynasty drafts") at the cost of slightly less
density. But the voice does not change registers.

## Founder's note

Voice C ("here's the thing nobody actually says out loud about X")
was tempting because it tests well in the short term. It was rejected
in calibration as too AI-coded and too dated. Dynasty General's
voice is meant to outlast the trends that produced Voice C. When in
doubt, write Voice A. When unsure if a phrase is Voice C, it is.
