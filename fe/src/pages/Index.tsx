import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { ProductCarousel } from "@/components/home/ProductCarousel";
import { TimelineStrip } from "@/components/home/TimelineStrip";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { LatestReviews } from "@/components/home/LatestReviews";
import { TrustStrip } from "@/components/home/TrustStrip";
import { AudienceDoors } from "@/components/home/AudienceDoors";
import { Footer } from "@/components/Footer";

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "BdRanks",
  url: typeof window !== "undefined" ? window.location.origin : "https://bdranks.com",
  description:
    "Honest, time-tested product reviews from a real community. Track how products perform over months and years.",
};

const Index = () => (
  <div className="min-h-screen bg-background">
    <PageHead
      title="BdRanks - Honest Reviews Over Time"
      description="Discover honest, time-tested product reviews. Our community tracks products over months and years so you get the full picture before you buy."
      jsonLd={orgSchema}
    />
    <Header autoHide />
    <main>
      <HeroSection />
      <ProductCarousel />
      <TimelineStrip />
      <CategoryTiles />
      <LatestReviews />
      <TrustStrip />
      <AudienceDoors />
    </main>
    <Footer />
  </div>
);

export default Index;
