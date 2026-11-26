import { SiteNav } from "@/components/site-nav";

export const metadata = {
  title: "Privacy Policy",
  description:
    "Dynasty General privacy policy. What we collect, how we use it, and your rights.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <article className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-2">
            Last updated 2026-11-26
          </p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted sm:text-base">
            <p>
              Dynasty General ("we," "our," "us") provides a dynasty fantasy
              football analytics product for users of the Sleeper platform.
              This policy explains what we collect, how we use it, and the
              choices you have.
            </p>

            <Section title="What we collect">
              <p className="mt-2">
                <strong>When you visit our site without signing in:</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Usage measurement through Google Tag Manager: which pages
                  you visit and whether you complete a signup. Tags in it
                  may set first-party analytics cookies. Not used for
                  advertising.
                </li>
                <li>
                  Standard server logs (IP address, request path, user
                  agent) retained by our hosting provider Vercel for
                  operational and security purposes.
                </li>
              </ul>
              <p className="mt-4">
                <strong>When you create an account:</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  If you sign in with Google: your name, email address, and
                  profile picture as provided by Google. We do not receive
                  or store your Google password.
                </li>
                <li>
                  If you sign in with email and password: your email
                  address and a securely hashed password managed by our
                  auth provider (Supabase Auth). We never store your
                  password in plain text.
                </li>
                <li>
                  If you sign up from the homepage with your email and
                  Sleeper username: we create your account right away
                  with no password and no confirmation link, and store
                  your email, Sleeper username, and Sleeper user ID. We
                  also store where the signup came from: the campaign tags
                  on the link you followed (utm tags) and the referring
                  website&apos;s domain, never the full page address. You
                  sign in later with Google on the same address or with a
                  one-time sign-in link we email you.
                </li>
              </ul>
              <p className="mt-4">
                <strong>When you get the weekly brief email:</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Every account receives a weekly brief during the NFL
                  season, built from your Sleeper leagues. We store when
                  each brief was sent and whether you unsubscribed. Every
                  brief carries a one-click unsubscribe that needs no
                  login.
                </li>
              </ul>
              <p className="mt-4">
                <strong>When you join the waitlist:</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Name, email address, Sleeper username (optional), number
                  of dynasty leagues, area of focus, creator flag, and your
                  free-text submission.
                </li>
              </ul>
              <p className="mt-4">
                <strong>When you use the analytics product:</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Your Sleeper username, which we send to Sleeper's public
                  API to look up your leagues, rosters, and draft state.
                </li>
                <li>
                  League data including other league members' rosters,
                  owner names, and team activity, for the sole purpose of
                  analyzing the league for you. We do not retain league
                  data server-side beyond the duration of your request.
                </li>
                <li>
                  Your chat messages with Coach and its replies. When you
                  are signed in, they are stored server-side so your
                  conversations follow you across devices, and we read
                  them to improve Coach&apos;s answers. Each chat turn is sent
                  to our AI provider as described below.
                </li>
                <li>
                  Pinned briefings (Pro tier) are stored server-side so
                  they persist across devices.
                </li>
              </ul>
              <p className="mt-4">
                <strong>When you subscribe (Pro tier):</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Payment is processed by Stripe. We receive your Stripe
                  customer ID, subscription status, and plan details. We
                  never see or store your full card number.
                </li>
              </ul>
            </Section>

            <Section title="How we use your data">
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Waitlist data is used solely to invite you to the beta
                  and to understand who is interested in the product.
                </li>
                <li>
                  League and chat data is used to generate the analysis we
                  show you, including the weekly brief email.
                </li>
                <li>
                  Your email address is used for the weekly brief, sign-in
                  links, and account notices. Unsubscribing from the brief
                  stops the brief; sign-in links still arrive when you ask
                  for one.
                </li>
                <li>We do not sell your data. We do not share it with advertisers.</li>
              </ul>
            </Section>

            <Section title="Sub-processors and third parties">
              <p className="mt-2">We rely on the following service providers:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Anthropic (Claude API)</strong> processes your
                  chat messages and league context to generate AI
                  responses. Anthropic does not train its models on your
                  inputs or outputs per their{" "}
                  <a
                    href="https://www.anthropic.com/legal/commercial-terms"
                    className="text-accent hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    commercial terms
                  </a>
                  . Anthropic may also perform live web searches when
                  answering, which can transmit query content to
                  third-party search providers.
                </li>
                <li>
                  <strong>Sleeper</strong> is the source of your league
                  data; reading your data via their public API is
                  governed by your agreement with Sleeper.
                </li>
                <li>
                  <strong>Supabase</strong> hosts our database and manages
                  authentication (including Google OAuth and email/password
                  sign-in).
                </li>
                <li>
                  <strong>Stripe</strong> processes payments for Pro
                  subscriptions. Subject to{" "}
                  <a
                    href="https://stripe.com/privacy"
                    className="text-accent hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Stripe's Privacy Policy
                  </a>
                  .
                </li>
                <li>
                  <strong>Google</strong> provides OAuth sign-in. Subject
                  to{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    className="text-accent hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google's Privacy Policy
                  </a>
                  .
                </li>
                <li>
                  <strong>Resend</strong> delivers the weekly brief and
                  other product email. It receives your email address and
                  the content of each email.
                </li>
                <li>
                  <strong>Google Tag Manager</strong> measures site usage
                  (page views and signups). Subject to{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    className="text-accent hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google's Privacy Policy
                  </a>
                  .
                </li>
                <li>
                  <strong>Vercel</strong> hosts the application and serves
                  static logs.
                </li>
                <li>
                  <strong>Upstash</strong> stores rate-limit and spend
                  counters (no PII).
                </li>
              </ul>
            </Section>

            <Section title="International transfers">
              <p className="mt-2">
                Dynasty General is operated in the United States. If you
                access the Service from outside the U.S., your data
                will be transferred to and processed in the U.S. by us
                and our sub-processors. We rely on the EU-U.S. Data
                Privacy Framework, the UK Extension, and Standard
                Contractual Clauses where applicable for transfers from
                the EU and UK. Stripe, Google, Anthropic, Vercel,
                Supabase, and Upstash are all certified or
                contractually compliant with these frameworks.
              </p>
            </Section>

            <Section title="Data retention">
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Waitlist entries: retained until 12 months after public
                  launch, then deleted.
                </li>
                <li>League data: not retained server-side.</li>
                <li>
                  Chat history (signed in) and pinned briefings: stored
                  server-side until you delete them via Account settings
                  or use the "Wipe my data" feature.
                </li>
                <li>
                  Account data (email, Sleeper username and ID, email
                  preferences): kept while your account exists, deleted
                  on request.
                </li>
                <li>
                  Server logs: retained per Vercel's defaults (typically
                  30 days).
                </li>
              </ul>
            </Section>

            <Section title="Data export and deletion">
              <p className="mt-2">
                To export or delete the data we hold about you, email{" "}
                <a
                  href="mailto:isaiah@nextupleader.com"
                  className="text-accent hover:underline"
                >
                  isaiah@nextupleader.com
                </a>
                . We respond within 30 days. Self-serve export and wipe
                from the Account page is on the roadmap and will be
                announced when available.
              </p>
            </Section>

            <Section title="Your rights">
              <p className="mt-2">
                If you are in the EU/UK (GDPR) or California (CCPA/CPRA),
                you have the right to:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Access the personal data we hold about you.</li>
                <li>Request correction or deletion of your data.</li>
                <li>Object to processing.</li>
                <li>Withdraw consent.</li>
                <li>
                  California (CCPA/CPRA): opt out of the sale or
                  sharing of personal information for cross-context
                  behavioral advertising. We do not sell or share for
                  this purpose. Limit the use of sensitive personal
                  information. We do not discriminate against users
                  who exercise their rights.
                </li>
              </ul>
              <p className="mt-4">
                Email{" "}
                <a
                  href="mailto:isaiah@nextupleader.com"
                  className="text-accent hover:underline"
                >
                  isaiah@nextupleader.com
                </a>{" "}
                to exercise any of these rights. We will respond within
                30 days.
              </p>
              <p className="mt-3">
                You may also clear browser-stored data (chat history,
                declared windows) at any time without contacting us, by
                clearing site data in your browser.
              </p>
            </Section>

            <Section title="Cookies">
              <p className="mt-2">
                We use sign-in cookies set by Supabase to keep you signed
                in, and Google Tag Manager, whose tags may set
                first-party analytics cookies to count page views and
                signups. We do not set advertising cookies and do not
                sell or share data for cross-context advertising.
              </p>
              <p className="mt-3">
                You can clear cookies at any time by clearing site data
                in your browser. Clearing sign-in cookies signs you out.
              </p>
            </Section>

            <Section title="Eligibility and children">
              <p className="mt-2">
                Dynasty General is intended for users 18 and older. We
                do not knowingly collect data from anyone under 18. If
                you believe a minor has provided data, email us and we
                will delete it.
              </p>
            </Section>

            <Section title="Changes">
              <p className="mt-2">
                We may update this policy. Material changes will be
                announced on the site or by email to account holders.
              </p>
            </Section>

            <Section title="Contact">
              <p className="mt-2">
                Questions:{" "}
                <a
                  href="mailto:isaiah@nextupleader.com"
                  className="text-accent hover:underline"
                >
                  isaiah@nextupleader.com
                </a>
              </p>
              <p className="mt-2">
                Dynasty General is operated by an independent founder.
              </p>
            </Section>
          </div>
        </article>
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border-soft pt-6 first:border-0 first:pt-0">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
