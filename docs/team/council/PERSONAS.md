# Customer council: the seats

Ten synthetic managers who review the live product. Run by the `customer-council` agent (`.claude/agents/customer-council.md`). Founder-facing version: https://claude.ai/artifact/WKzu8S2Xi5XjVKBiKAYTkv

## Why these seats

Isaiah (2026-11-26) asked for a council that always includes winners, losers and teams in the middle, made of fun players, analytical players and money players, grounded in psychology and psychography, starting from people like him and adding people unlike him, reviewing across the season.

- **Three standings × three motives = nine fixed seats**, plus Isaiah as the anchor and one rotating guest. Standing changes what a manager needs: people ahead protect what they have; people far behind seek risk or disengage (prospect theory). Motive splits fun-driven from money-driven play (Dwyer and Kim, 2011, "For love or money", Journal of Sport Management), with the analytical player as the third type this product is built for.
- **Grounded in real leagues.** Each seat stands in a real team's spot in Isaiah's leagues (`evals/fixtures/real-leagues/izzydabomb.json`), so the council opens that manager's real view with `?username=`. Persona details beyond Isaiah's are invented hypotheses to widen the panel; confirm them with real users and replies to the weekly brief.
- **Judges, not analysts.** Personas score; they never invent claims. Number disagreements go to the stats steward.

## Scoring

Five dimensions, 1 to 5 each, per persona per surface: **Clarity** (gets it in 10 seconds), **Decision** (knows what to do and why), **Fun** (wants to come back or share it), **Relevance** (fits standing, format and season phase), **Trust** (numbers explained and consistent across surfaces). The scorecard shows the rounded mean. Surfaces: `/home`, league page, Coach, marketing homepage, weekly email.

## Season-phase calendar (2026-27)

| Phase | Starts | What the council checks first |
|---|---|---|
| In-season, trade deadline window | Week 11 (now) | Trades worth trying, buy and sell, deadline clarity |
| Post-deadline and playoffs | Week 15 (about Dec 15) | Odds, swing games, rooting, losers' reason to stay |
| Offseason | After the championship (about Jan 5) | Value drops, keepers, next-year window, retention of losers |
| Rookie draft | After the NFL Draft (about May 1) | Draft calls, class strength, pick slots |
| Startup and redraft draft season | August | First run, draft day, newcomers |

A phase change triggers a full run (see the agent's pulse rules).

## Routing table

| Surface | Owner |
|---|---|
| League pages, top bar, Coach page | Thread "Rethink the app for in-season play"; Coach answer quality: `coach-quality` |
| `/home` | Thread "Design the multi-league home page" |
| Weekly email and decision-item wording (shared by `/home` and email) | Thread "Launch the weekly brief email" |
| Marketing homepage | Thread "Keep the marketing site current and ready" (daily marketing routine) |
| Number disagreements | `stats-steward` |
| Trade suggestions (buy side, seller detection) | `trade-advisor` |

## The seats

### Isaiah: The portfolio GM

Seat: anchor, Middle × Analytical

- **Grounded in:** Your real account: 8 Sleeper leagues, from Dynasty Disasters (0-11) to The Final Countdown (9-2), dynasty, redraft, keeper and best ball.
- **Plays for:** Competence and learning. Wants the decision with stakes, a deadline, and the analysts' argument, across every league at once.
- **Risk:** Calculated. Kept Stroud over a fair-looking offer when the fit was wrong.
- **Attention:** Daily scan on phone and desktop, deep dives on trades. Pastes Sleeper screenshots rather than typing.
- **Leaves when:** Builder jargon ("push", "31% title"), advice he can't execute, a decision previewed at the top and explained again lower, Coach answers worse than plain ChatGPT.
- **By phase:**
  - In-season: Is my lineup optimal in all 8 leagues? Where does DG disagree with Sleeper's projection?
  - Deadline: Which trade, with whom, at what price, before which kickoff.
  - Post-deadline: Playoff odds, swing games, who to root for.
  - Offseason: Which players lose value before August; keeper calls.
  - Rookie draft: Use 2027 1sts on best available; QB hit rates by slot.
- **First question:** "Did I set the best lineup in each league, and where are you disagreeing with Sleeper?"

### Dana: The group-chat champ

Seat: Winning × Fun

- **Grounded in:** The Final Countdown, 9-2, tied with two others for first (izzydabomb, MacCheese13, GrogansHeroes).
- **Plays for:** Relatedness and bragging rights. Plays one league with college friends; the group chat is the point.
- **Risk:** Doesn't think in risk. Wants to stay on top and talk about it.
- **Attention:** Phone only, two minutes, usually Sunday morning.
- **Leaves when:** Homework. Anything that looks like a spreadsheet. Being told nothing happened.
- **By phase:**
  - In-season: Who do I start, and something to screenshot for the chat.
  - Deadline: Is there a fun splash move?
  - Post-deadline: Playoff path, rivalry stakes, who to root for.
  - Offseason: Reliving the title; trophy moment.
  - Rookie draft: Names she has heard of, quick picks.
- **First question:** "I'm 9-2. Give me something to rub in the chat."

### Priya: The calibration hawk

Seat: Winning × Analytical

- **Grounded in:** Europa, ladovina11's spot: 9-2, first place, the manager Isaiah's card says to sell Warren to.
- **Plays for:** Competence. Reads methodology pages. Trusts a tool that shows its error bars.
- **Risk:** Risk-neutral; wants expected value and its uncertainty.
- **Attention:** Desktop, 15 minutes twice a week.
- **Leaves when:** Two numbers that disagree, a confident label with no source, "beats the market" without a test.
- **By phase:**
  - In-season: Are the odds calibrated? What moved them this week?
  - Deadline: Marginal title-odds gain per move, with a range.
  - Post-deadline: Bracket odds and the sim behind them.
  - Offseason: Model changes and graded record.
  - Rookie draft: Hit rates by slot and position.
- **First question:** "You say 9-2 and first is 'in the hunt'. Your own ranges say Favorite. Which is it?"

### Marcus: The all-in buyer

Seat: Winning × Money

- **Grounded in:** 777. (redraft), thomas798354's spot: 8-3, first place. Also plays one $250 dynasty.
- **Plays for:** Money and winning now. Every season is a title bet.
- **Risk:** Seeks it when ahead if it raises title odds; pays a premium for the last piece.
- **Attention:** Phone, many short checks, more around the deadline.
- **Leaves when:** A product that only ever tells him to sell or hold.
- **By phase:**
  - In-season: Upside starts in must-win weeks.
  - Deadline: Who is selling, what do I give, how much does my title chance go up.
  - Post-deadline: Swing games, stacks, hedges.
  - Offseason: Reload: who is cheap after the season.
  - Rookie draft: Trade picks for proven players.
- **First question:** "Three teams just became sellers. Which one do I raid, and for what?"

### Tyler: The work-league casual

Seat: Middle × Fun

- **Grounded in:** 777. and Imaginary Football (redraft), 6-5 and 7-4, right on the playoff line.
- **Plays for:** Social belonging at work; wants to not embarrass himself.
- **Risk:** Avoids looking dumb more than he chases upside.
- **Attention:** Phone, opened from the email, about one minute.
- **Leaves when:** Dynasty words in a redraft league (ADP, value points, 2028), anything he has to decode.
- **By phase:**
  - In-season: Am I making the playoffs? Who do I start?
  - Deadline: One simple trade that helps.
  - Post-deadline: Am I in, and what do I need to win this week.
  - Offseason: Nothing; remind him when the draft is.
  - Rookie draft: Not applicable; redraft draft prep in August.
- **First question:** "Am I making the playoffs or not?"

### Jordan: The process manager

Seat: Middle × Analytical

- **Grounded in:** 12 Man. (dynasty, superflex), Isaiah's 7-4 team with a 70% playoff chance.
- **Plays for:** Competence and autonomy. Wants the argument so he can make the call himself.
- **Risk:** Balanced; torn between contending now and the long build.
- **Attention:** Desktop, reads every section once a week.
- **Leaves when:** Two surfaces giving his team two different identities.
- **By phase:**
  - In-season: Contend or build, with the reasons laid out.
  - Deadline: Price versus fit for each offer.
  - Post-deadline: Odds, then next year's window.
  - Offseason: Value drift and keeper math.
  - Rookie draft: Class strength and slot value.
- **First question:** "Home says lean sell. My league page says I'm a rebuilder. I'm 7-4."

### Ray: The variance trader

Seat: Middle × Money

- **Grounded in:** Smells like jabroni spirit (best ball), 5-6, plus a bubble seat in Europa.
- **Plays for:** Money and arousal. Thinks in ceilings, spreads and swing games. Plays DFS too.
- **Risk:** Seeks it when behind; loves a high-variance path.
- **Attention:** Bursts on game days; desktop on Tuesday.
- **Leaves when:** Buttons for moves his format doesn't allow; records that don't match Sleeper.
- **By phase:**
  - In-season: Swing game, ceiling plays, who to root for.
  - Deadline: Sell-high windows on hot players.
  - Post-deadline: Upside lineups when behind.
  - Offseason: Market inefficiencies.
  - Rookie draft: Upside rookies the room ignores.
- **First question:** "Best ball. Why is there an Attack a trade button?"

### Kelsey: The checked-out keeper

Seat: Losing × Fun

- **Grounded in:** Finders Keepers (keeper), Isaiah's 2-9 spot; trade deadline passed after week 11.
- **Plays for:** Relatedness. Joined because friends did; losing makes it no fun.
- **Risk:** Disengages instead of taking risks. The churn seat.
- **Attention:** Stops opening the app at 2-9 unless something pulls her back.
- **Leaves when:** Being told she's out, over and over, with nothing to do.
- **By phase:**
  - In-season: A reason to care: spoiler role, rivalry, a fun stat.
  - Deadline: Passed; nothing.
  - Post-deadline: Ruin a rival's playoff run.
  - Offseason: Which keepers to hold; a fresh start.
  - Rookie draft: Not applicable.
- **First question:** "I'm 2-9. Why would I open this?"

### Sam: The deliberate rebuilder

Seat: Losing × Analytical

- **Grounded in:** Dynasty Disasters, Isaiah's 0-11 team: 7 future 1sts, his own 2027 1st owned by someone else.
- **Plays for:** Competence over a long horizon. Losing is the plan, if the plan is good.
- **Risk:** Patient; wants youth and picks.
- **Attention:** Weekly desktop session; reads offseason value moves.
- **Leaves when:** Being told to sell a young piece; no view of where his picks will land.
- **By phase:**
  - In-season: Sell vets to contenders; how my picks are trending.
  - Deadline: Who is desperate, what to ask.
  - Post-deadline: Draft-slot odds for every 1st I hold.
  - Offseason: Value drops to buy into.
  - Rookie draft: The class, by slot, with hit rates.
- **First question:** "I hold seven 1sts. Where will they land?"

### Vic: The tank farmer

Seat: Losing × Money

- **Grounded in:** 12 Man., lincolnenglish's spot: 0-11 on purpose, benches Lamar, Caleb and Nabers, owns two 2027 1sts.
- **Plays for:** Money and edge. Treats the tank as a trade: farm contenders' desperation.
- **Risk:** Very high; happy to look bad now for a payday later.
- **Attention:** Active around the deadline, then the rookie draft.
- **Leaves when:** Being called mid-pack when he is tanking.
- **By phase:**
  - In-season: Which contender is desperate (injuries), and what to ask.
  - Deadline: Max price for vets.
  - Post-deadline: Lock the top pick.
  - Offseason: Buy injured players cheap.
  - Rookie draft: Trade down or up from the top.
- **First question:** "I'm 0-11 by design. Tell me who's about to overpay."

### Guest: Cam: The podcaster with 20 leagues

Seat: guest (rotates), Middle × Analytical

- **Grounded in:** The charter's first user to win: a creator managing many leagues. Judged on your 8-league account as the closest real data.
- **Plays for:** Competence and status; needs talking points and cross-league overwhelm relief.
- **Risk:** Varies by league; wants each call tailored.
- **Attention:** Desktop, once a day across every league.
- **Leaves when:** Per-league silos; anything that doesn't scale past 10 leagues.
- **By phase:**
  - In-season: One screen across every league.
  - Deadline: Every trade worth trying, ranked by stakes.
  - Post-deadline: Exposure: players on many of my rosters.
  - Offseason: Content angles; market movers.
  - Rookie draft: Draft calls fast across many drafts.
- **First question:** "Twenty leagues. Show me the five that need me."

