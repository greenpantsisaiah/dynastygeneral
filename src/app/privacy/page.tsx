import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";

export const metadata = {
  title: "Privacy · Dynasty Copilot",
  description:
    "What we collect, how we use it, your rights. Plain language for a small dynasty fantasy product.",
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
            Last updated 2026-04-22
          </p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted sm:text-base">
            <p>
              Dynasty Copilot ("we," "our," "us") provides a dynasty fantasy
              football analytics product for users of the Sleeper platform.
              This policy explains what we collect, how we use it, and the
              choices you have.
            </p>

            <Section title="What we collect">
              <p className="mt-2">
                <strong>When you visit our site without signing up:</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  A functional preference cookie (`dw_&lt;leagueId&gt;`)
                  storing your declared draft window. Not used for tracking
                  or advertising.
                </li>
                <li>
                  Standard server logs (IP address, request path, user
                  agent) retained by our hosting provider Vercel for
                  operational and security purposes.
                </li>
              </ul>
              <p className="mt-4">
                <strong>When you join the waitlist:</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Name, email address, Sleeper username (optional), number
                  of dynasty leagues, area of focus, creator flag, and your
                  free-text "biggest pain point" submission.
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
                  Your declared strategy choices and chat messages with the
                  coach. These are stored ONLY in your browser's
                  localStorage (not on our servers). Each chat turn is
                  sent to our AI provider as described below.
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
                  show you.
                </li>
                <li>We do not sell your data. We do not share it with advertisers.</li>
              </ul>
            </Section>

            <Section title="Sub-processors and third parties">
              <p className="mt-2">We rely on the following service providers:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Anthropic</strong> processes your chat messages
                  and league context to generate AI responses. Subject to{" "}
                  <a
                    href="https://www.anthropic.com/legal/privacy"
                    className="text-accent hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Anthropic's Privacy Policy
                  </a>
                  . Anthropic may also perform live web searches when
                  answering your questions, which may transmit query
                  content to third-party search providers.
                </li>
                <li>
                  <strong>Sleeper</strong> is the source of your league
                  data; reading your data via their public API is
                  governed by your agreement with Sleeper.
                </li>
                <li>
                  <strong>Supabase</strong> hosts our waitlist database.
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

            <Section title="Data retention">
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Waitlist entries: retained until 12 months after public
                  launch, then deleted.
                </li>
                <li>League data: not retained server-side.</li>
                <li>
                  Chat history: stored in your browser's localStorage
                  indefinitely until you clear it. To clear, open browser
                  settings and remove site data for dynastygeneral.app.
                </li>
                <li>
                  Server logs: retained per Vercel's defaults (typically
                  30 days).
                </li>
              </ul>
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
                We set one cookie: `dw_&lt;leagueId&gt;`, a 180-day
                functional preference cookie storing your declared draft
                window. We do not set advertising, analytics, or tracking
                cookies. We do not use third-party trackers.
              </p>
            </Section>

            <Section title="Children">
              <p className="mt-2">
                Dynasty Copilot is not directed to children under 13 and
                we do not knowingly collect data from anyone under 13.
                Users must be at least 13 years old (or the minimum age
                required in your jurisdiction).
              </p>
            </Section>

            <Section title="Changes">
              <p className="mt-2">
                We may update this policy. Material changes will be
                announced on the site or by email to waitlist members.
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
                Dynasty Copilot is operated by an independent founder.
              </p>
            </Section>
          </div>
        </article>
      </main>
      <Footer />
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
