import Image from "next/image";
import Link from "next/link";
import { Ticker } from "@/components/ui/ticker";
import { isBetaOpenMode } from "@/lib/billing/beta-mode";

/**
 * Input-led hero. Shipped 2026-04-25 after Reddit alpha-share data
 * showed the conversion path is "type Sleeper username, see your
 * real league analyzed" rather than "scroll through marketing
 * funnel." Long-form story moved to /how-it-works; the homepage now
 * gets the user from cold-paste to in-app in 2 clicks.
 *
 * Form is a plain HTML GET to /connect (no client JS needed). The
 * existing /connect handler accepts ?username= and shows the league
 * picker. Don't auto-pick a league; let the user confirm.
 */
export function Hero() {
  const beta = isBetaOpenMode();
  return (
    <section className="relative overflow-hidden border-b border-border-soft">
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div className="absolute inset-0 bg-glow" />
      <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <Ticker
          label={
            beta
              ? "Beta · everything's open · Sleeper today, MFL next · Dynasty only"
              : "Live · Sleeper today, MyFantasyLeague next · Dynasty only"
          }
        />
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Win the decision in front of you.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
          Most dynasty tools tell you who is good. This one tells you
          what to do, right now, in your league, with your team.
        </p>

        {/* Input-led conversion. Plain HTML GET form so this section
            stays a server component and works without hydration. */}
        <form
          action="/connect"
          method="GET"
          className="mt-10 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input
            type="hidden"
            name="platform"
            value="sleeper"
          />
          <label className="flex-1">
            <span className="sr-only">Sleeper username</span>
            <input
              name="username"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="Sleeper username"
              className="h-12 w-full rounded-md border border-border-strong bg-surface px-4 text-base text-foreground outline-none transition focus:border-accent sm:h-12"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-black transition hover:brightness-110"
          >
            See your decision →
          </button>
        </form>
        <p className="mt-3 max-w-xl text-xs text-muted-2">
          We'll find your dynasty leagues. No password, no install.
          Read-only access via Sleeper's public API.
        </p>

        {beta && (
          <p className="mt-4 max-w-xl rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-foreground">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Beta is open ·
            </span>{" "}
            Coach, briefings, the 5-deep Decision card, and Contender
            Outlook are free for every signed-in tester.{" "}
            <Link href="/pricing" className="text-accent hover:underline">
              Support on Pro
            </Link>{" "}
            if it sharpens your decisions.
          </p>
        )}

        <HeroPreview />

        <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-2">
          <Link
            href="/how-it-works"
            className="hover:text-foreground"
          >
            How it works →
          </Link>
          <Link
            href="/pricing"
            className="hover:text-foreground"
          >
            Pricing →
          </Link>
          <Link
            href="/built-by"
            className="hover:text-foreground"
          >
            Built by →
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Annotated preview of the actual Decision card. Acts as both
 * marketing proof ("this is what you'll see") and lightweight
 * onboarding ("here's the vocabulary you'll meet inside"). The
 * numbered callouts below the screenshot teach the user what to
 * look at before they even land in their league.
 *
 * Static image for v1; a real GIF or video can replace it later
 * without changing the surrounding layout.
 */
function HeroPreview() {
  return (
    <div className="mt-14 max-w-3xl">
      <div className="overflow-hidden rounded-lg border border-border-strong bg-surface shadow-[0_0_0_1px_rgba(245,158,11,0.05),0_20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="border-b border-border-soft bg-surface-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
          What you'll see, on your league
        </div>
        <Image
          src="/marketing/decision-card.png"
          alt="Decision card showing the Lean, Counter-view, Next Picks Plan, and Coach entry"
          width={1400}
          height={1050}
          className="w-full"
          priority
        />
      </div>
      <ol className="mt-5 grid gap-x-6 gap-y-3 text-sm text-muted sm:grid-cols-2">
        <CalloutItem
          n={1}
          title="The Lean"
          body="One named player at this slot, with KTC value, ADP, and the rule that surfaced it (starter fill, push path, earned value)."
        />
        <CalloutItem
          n={2}
          title="Counter-view"
          body="The strongest argument against the Lean, surfaced inline so you don't have to ask Coach to find it."
        />
        <CalloutItem
          n={3}
          title="Next Picks Plan"
          body="Five picks deep with confidence buckets and within-position alts. The chain you take if your lane gets sniped."
        />
        <CalloutItem
          n={4}
          title="Ask Coach"
          body="Conversational follow-up with full league context. Web search, KTC-anchored trade math, hold-the-line on vibes pushback."
        />
      </ol>
    </div>
  );
}

function CalloutItem({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/60 bg-accent/10 font-mono text-[11px] font-semibold text-accent">
        {n}
      </span>
      <span>
        <span className="font-medium text-foreground">{title}.</span>{" "}
        {body}
      </span>
    </li>
  );
}
