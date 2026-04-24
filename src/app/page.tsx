import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Dynasty Copilot: AI Dynasty Fantasy Football Decision Engine",
  description:
    "AI-powered dynasty fantasy football copilot. Trade analysis, pick recommendations, strategy coaching, and scout reports for Sleeper dynasty leagues.",
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
import { Waitlist } from "@/components/landing/waitlist";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Dynasty Copilot",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  description:
    "AI-powered dynasty fantasy football decision engine. Trade analysis, pick recommendations, strategy coaching, and scout reports for Sleeper dynasty leagues.",
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
        <Waitlist />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
