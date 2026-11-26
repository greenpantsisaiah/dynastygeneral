# Experiment registry

One row per growth or product test. A test is registered here before it launches. Every experiment that changes the product ships behind an on/off flag.

| ID | Owner | Hypothesis | Flag or channel | Budget cap | Stop rule | Status | Spend to date | Result |
|---|---|---|---|---|---|---|---|---|
| EXP-P1 | product-steward | A first-run Team Card that leads with one verdict line (Push, Hold, or Sell) gets a new manager to a first useful read faster and lifts week-2 return vs landing on the full hub | flag `first_run_team_card` (not yet in registry; variants `off`, `on`) | $0 (engineering only) | Success metric, set before data: week-2 return (signed-in manager opens any hub again on days 8 to 14 after first hub open). Secondary: activation (signup to first hub render). Decide on a Bayesian comparison at P(on beats off) >= 0.9 or stop at 2027-02-28. Pre-launch: read on Isaiah's leagues and league-mates only. Blocked on: activation and return events (decision issue) and a registered verdict term from the stats steward (`contend-or-sell` terms sit at `hypothesis`) | drafted | $0 | none yet |
| GROW-T1 | growth | Isaiah's league-mates sign up when he shares what the brief says about their own league | league chats, `utm_source=sleeper_chat` | $0 | 7 days | waiting-on-isaiah | $0 | none yet |
| GROW-T2 | growth | A founder post in r/DynastyFF and r/SleeperApp brings signups who open the brief | reddit organic, `utm_source=reddit&utm_medium=post` | $0 | 7 days | waiting-on-isaiah | $0 | none yet |
| GROW-T3 | growth-partnerships | Small dynasty podcasters mention the brief for free Pro + a listener code | podcast outreach, `ref=pod_<show>` | $0 | 2 follow-ups, then drop | drafted | $0 | none yet |
| GROW-T4 | growth-paid | Reddit promoted post reaches dynasty managers under $5 per signup | Reddit Ads, `utm_source=reddit&utm_medium=paid` | $100 | stop at $75 with no signup under $5, or day 7 | waiting-on-isaiah (account) | $0 | none yet |
| GROW-T5 | growth-paid | Meta image ads (Mako personas) reach fantasy players under $7 per signup | Meta via Mako, `utm_source=meta&utm_medium=paid` | $100 | stop at $75 with no signup under $7, or day 7 | waiting-on-isaiah (account) | $0 | none yet |

Status values: `drafted`, `waiting-on-isaiah`, `live`, `paused-stop-rule`, `paused-early`, `done-won`, `done-lost`.
