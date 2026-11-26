import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { Hero } from "@/components/landing/hero";
import {
  AnalystsSection,
  HonestySection,
  InboxSection,
  LeaguesSection,
} from "@/components/landing/brief-sections";
import { Waitlist } from "@/components/landing/waitlist";

const DESCRIPTION =
  "A weekly brief for every Sleeper league you're in: trades worth trying, playoff odds from 5,000 simulated seasons, and three analysts who argue the call. Dynasty, redraft, keeper and best ball. Free during the beta.";

export const metadata: Metadata = {
  title: "Dynasty General: the trades worth trying in every league you're in",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Dynasty General",
    description: DESCRIPTION,
    url: "/",
    type: "website",
    siteName: "Dynasty General",
  },
};

// Homepage rebuilt 2026-11-26 around the weekly brief (the product's
// front door) and one signup: email + Sleeper username. The 2026-05-12
// lane-cohort hero and proof charts described the retired Strategic
// Lanes surface; their components stay in components/landing/.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Dynasty General",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  description: DESCRIPTION,
  url: "https://dynastygeneral.app",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free during the beta.",
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
        <InboxSection />
        <AnalystsSection />
        <LeaguesSection />
        <HonestySection />
        <Waitlist />
      </main>
    </>
  );
}
