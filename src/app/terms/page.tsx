import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";

export const metadata = {
  title: "Terms · Dynasty Copilot",
  description:
    "Terms of service. Plain language for a small dynasty fantasy product.",
};

export default function TermsPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1 bg-background">
        <article className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Terms of Service
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-2">
            Last updated 2026-04-24
          </p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted sm:text-base">
            <p>
              By using Dynasty Copilot ("the Service"), you agree to these
              Terms.
            </p>

            <Section n={1} title="The Service">
              <p>
                Dynasty Copilot is a dynasty fantasy football analytics
                tool that reads publicly available data from Sleeper to
                generate strategy analysis, pick recommendations, and
                trade suggestions. The Service is an independent product.
                It is not affiliated with, endorsed by, or sponsored by
                Sleeper, the NFL, the NFLPA, KeepTradeCut, FantasyPros,
                Dynasty League Football, or any other rankings provider.
              </p>
            </Section>

            <Section n={2} title="Eligibility">
              <p>
                You must be at least 18 years old, or the age of majority
                in your jurisdiction, to use the Service. The Service is
                not directed to children under 13.
              </p>
            </Section>

            <Section n={3} title="Informational only">
              <p>
                The Service provides informational analysis for
                recreational dynasty fantasy football. We are not a
                financial advisor, sports betting service, or wagering
                platform. Recommendations are based on heuristics and AI
                models that can be wrong. You are solely responsible for
                your roster decisions, trades, and league choices. We do
                not guarantee any outcome.
              </p>
            </Section>

            <Section n={4} title="Your account and content">
              <p>
                You may create an account using Google sign-in or email
                and password. You are responsible for keeping your
                credentials secure. You may submit a Sleeper username,
                declared strategy choices, and chat messages with the AI
                coach. You retain ownership of any content you submit. By
                submitting, you grant us a limited license to process that
                content solely to operate the Service.
              </p>
            </Section>

            <Section n={5} title="Subscriptions and billing">
              <p>
                Certain features require a paid Pro subscription.
                Subscriptions are billed monthly or annually via Stripe.
                New subscriptions include a 14-day free trial. You may
                cancel at any time from your Account page; access
                continues until the end of the current billing period. We
                do not offer refunds for partial billing periods. Prices
                may change with 30 days' notice.
              </p>
            </Section>

            <Section n={6} title="Acceptable use">
              <p>You may not:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Use the Service to build a competing product.</li>
                <li>Reverse engineer, scrape, or interfere with the Service.</li>
                <li>
                  Use the Service in violation of Sleeper's Terms of Use,
                  NFL intellectual property rights, or any applicable law.
                </li>
                <li>
                  Submit content that is unlawful, defamatory, or
                  infringes others' rights.
                </li>
              </ul>
            </Section>

            <Section n={7} title="Intellectual property">
              <p>
                We own the Service, its code, copy, and design. Player
                names, team names, and statistics are factual public
                information. Third-party rankings and pricing referenced
                in the Service (KeepTradeCut, Dynasty League Football,
                FantasyCalc, FantasyPros, etc.) are the property of their
                respective owners and used only for calibration and
                reference.
              </p>
            </Section>

            <Section n={8} title="Disclaimer of warranties">
              <p className="uppercase">
                The Service is provided "as is" without warranties of any
                kind, express or implied, including warranties of
                merchantability, fitness for a particular purpose, or
                non-infringement.
              </p>
            </Section>

            <Section n={9} title="Limitation of liability">
              <p className="uppercase">
                To the maximum extent permitted by law, Dynasty Copilot
                and its operators shall not be liable for any indirect,
                incidental, consequential, or punitive damages, or any
                loss of profits, data, league standing, or fantasy
                success, arising from your use of the Service. Aggregate
                liability shall not exceed the greater of (a) one hundred
                U.S. dollars ($100) or (b) the fees you have paid us in
                the twelve months preceding the claim.
              </p>
            </Section>

            <Section n={10} title="Termination">
              <p>
                We may suspend or terminate access at any time for any
                reason, including violation of these Terms.
              </p>
            </Section>

            <Section n={11} title="Governing law">
              <p>
                These Terms are governed by the laws of the United States
                and the founder's state of residence, without regard to
                conflict-of-laws rules. Disputes shall be resolved in the
                courts of that jurisdiction.
              </p>
            </Section>

            <Section n={12} title="Changes">
              <p>
                We may update these Terms. Continued use after a change
                constitutes acceptance.
              </p>
            </Section>

            <Section n={13} title="Contact">
              <p>
                <a
                  href="mailto:isaiah@nextupleader.com"
                  className="text-accent hover:underline"
                >
                  isaiah@nextupleader.com
                </a>
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
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border-soft pt-6 first:border-0 first:pt-0">
      <h2 className="text-xl font-semibold text-foreground">
        {n}. {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
