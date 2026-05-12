import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import {
  ContrarianSection,
  ProofSection,
} from "@/components/landing/proof-section";

export const metadata: Metadata = {
  title: "Dynasty General: Intelligence layer for dynasty fantasy football",
  description:
    "Lane identity across an 82-roster cohort. Per-opponent trade fingerprints. Coach context with named players. The intelligence layer your dynasty league does not have.",
  alternates: { canonical: "/" },
};

// Homepage rebuilt 2026-05-12. Old hero (UI screenshot, 4 numbered
// callouts) replaced by a chart-led hero that visualizes the cohort
// math BEFORE introducing the product surface. Per founder direction:
// "visual > words in the copy" and "rethink from the ground up."
// SoundboardPreview + FAQ removed to keep the homepage to one scroll.
// They live as components in case a future surface wants them; the
// homepage does not.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Dynasty General",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  description:
    "Intelligence layer for dynasty fantasy football managers. Lane identity across an 82-roster calibration cohort, per-opponent trade fingerprints, Coach context with named players.",
  url: "https://dynastygeneral.app",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Alpha is free for every signed-in tester.",
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
        <ProofSection />
        <ContrarianSection />
      </main>
      <Footer />
    </>
  );
}
