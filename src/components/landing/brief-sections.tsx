import { ANALYSTS } from "@/components/landing/analysts";

/**
 * Homepage sections after the hero (2026-11-26). Each describes a
 * shipped capability; anything not live yet is labeled "Coming".
 * Claims stay at register level 0 (what the product does). No accuracy
 * or "beats the market" claims: the prediction log is not live.
 */

export function InboxSection() {
  return (
    <section className="border-b border-border-soft">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Kicker>What lands in your inbox</Kicker>
        <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          One email for all your leagues, before your trade deadlines pass.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Card
            title="Trades worth trying"
            body="Up to 3 per week, one per league where a move is worth making. Each names the player, the manager to ask, an opening price, and who else to call if it doesn't land."
          />
          <Card
            title="Your week in every league"
            body="Last week's result and your playoff chance in each league, with the change since last Tuesday."
          />
          <Card
            title="League shifts"
            body="Which managers moved up or down a playoff range, or lost a key starter to injury, and why. Where trades are open, each is marked seller, buyer or rival."
          />
        </div>
        <p className="mt-6 text-sm text-muted">
          Arrives Tuesday morning during the NFL season.{" "}
          <span className="text-muted-2">
            Coming next: a Sunday Game Day email with your swing game and
            who to root for.
          </span>
        </p>
      </div>
    </section>
  );
}

export function AnalystsSection() {
  return (
    <section className="border-b border-border-soft">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Kicker>Three analysts, one decision</Kicker>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              You see the argument, not just the verdict.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Sometimes all three agree. When they don&apos;t, that is
              the useful part: you weigh the case the way you would with a
              front office, then make the call.
            </p>
          </div>
          <ul className="grid gap-3">
            {ANALYSTS.map((a) => (
              <li
                key={a.key}
                className="flex items-start gap-3 rounded-lg border border-border-soft bg-surface px-4 py-4"
              >
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: a.color }}
                >
                  {a.initial}
                </span>
                <div>
                  <div className="font-semibold text-foreground">{a.name}</div>
                  <div className="mt-0.5 text-sm text-muted">{a.role}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function LeaguesSection() {
  return (
    <section className="border-b border-border-soft">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <Kicker>Every league, read correctly</Kicker>
        <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Your format, off Sleeper. Nothing to set up.
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card
            title="Dynasty, redraft, keeper, best ball"
            body="Best ball and leagues past their trade deadline get the recap and playoff odds, never a trade you can't make."
          />
          <Card
            title="Your league's rules"
            body="Superflex, TE premium, kickers and defenses where your league rosters them, read straight from Sleeper."
          />
          <Card
            title="Coach, with your real roster"
            body="Ask about any trade or pick. Coach sees every roster in your league by player name, not IDs."
          />
          <Card
            title="Draft day"
            body="During a draft, one call per pick with the reasoning and the odds the player is still there at your next turn."
          />
        </div>
      </div>
    </section>
  );
}

export function HonestySection() {
  return (
    <section className="border-b border-border-soft">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <Kicker>What we don&apos;t claim</Kicker>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Odds from simulations. No accuracy boasts.
            </h2>
          </div>
          <ul className="space-y-4 text-sm text-foreground">
            <li>
              <span className="font-semibold">No hit-rate claims yet.</span>{" "}
              Every playoff and title number is a simulation of your league,
              not a track record. A hit rate gets published only after the
              odds are logged and scored.
            </li>
            <li>
              <span className="font-semibold">No vibes-only verdicts.</span>{" "}
              Each analyst line cites the numbers behind it.
            </li>
            <li>
              <span className="font-semibold">No ads, no affiliate banners.</span>{" "}
              Free during the beta. Replies to the brief go to the founder.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
      {children}
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
