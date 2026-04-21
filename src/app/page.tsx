import { SiteNav } from "@/components/site-nav";
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

export default function HomePage() {
  return (
    <>
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
