import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Dynasty General: Decision Engine for Sleeper Dynasty Leagues",
  description:
    "Decision engine for serious dynasty fantasy football managers on Sleeper. Picks with named-player reasoning, trade evaluation against KTC market values, opponent characterization, and live strategy coaching. Free tier, Pro removes caps.",
  alternates: { canonical: "/" },
};
// Homepage is the alpha-share landing target. Heavy marketing funnel
// moved to /how-it-works 2026-04-25 after Reddit alpha data showed
// hot users convert via "type Sleeper username, see real league" not
// via 8 sections of scroll. Keep the Soundboard preview as the trust
// builder; keep FAQ because launch-stage questions are real.
// Waitlist removed 2026-04-25: account creation is the real signal
// now (saves leagues, chats, saved roster identity), not a beta-list
// signup, so the duplicate "apply for beta" form was a dead end.
import { FAQ } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { SoundboardPreview } from "@/components/landing/soundboard-preview";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Dynasty General",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  description:
    "Decision engine for serious dynasty fantasy football managers on Sleeper. Live picks, trade evaluation, strategy coaching, and opponent intelligence with evidence cited per recommendation.",
  url: "https://dynastygeneral.app",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free tier with Pro upgrade available",
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <SoundboardPreview />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
