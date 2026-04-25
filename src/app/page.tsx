import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Dynasty Copilot: Decision Engine for Sleeper Dynasty Leagues",
  description:
    "Decision engine for serious dynasty fantasy football managers on Sleeper. Picks with named-player reasoning, trade evaluation against KTC market values, opponent characterization, and live strategy coaching. Free tier, Pro removes caps.",
  alternates: { canonical: "/" },
};
import { Benefits } from "@/components/landing/benefits";
import { Differentiation } from "@/components/landing/differentiation";
import { FAQ } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Insight } from "@/components/landing/insight";
import { Preview } from "@/components/landing/preview";
import { Problem } from "@/components/landing/problem";
import { Solution } from "@/components/landing/solution";
import { SoundboardPreview } from "@/components/landing/soundboard-preview";
import { Waitlist } from "@/components/landing/waitlist";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Dynasty Copilot",
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
        <Problem />
        <Insight />
        <Solution />
        <Benefits />
        <Differentiation />
        <Preview />
        <SoundboardPreview />
        <Waitlist />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
