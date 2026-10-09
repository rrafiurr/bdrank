import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { PageHead } from "@/components/PageHead";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeHero } from "@/components/home/HomeHero";
import { ReviewDeck } from "@/components/home/ReviewDeck";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { TimelineStrip } from "@/components/home/TimelineStrip";
import { ProductCarousel } from "@/components/home/ProductCarousel";
import { LatestReviews } from "@/components/home/LatestReviews";
import { HowItWorks, TrustStrip, WriteCta } from "@/components/home/InfoSections";
import { AudienceDoors } from "@/components/home/AudienceDoors";
import { HomeFooter } from "@/components/home/HomeFooter";
import { MobileTabBar } from "@/components/home/MobileTabBar";
import { SearchSheet } from "@/components/home/SearchSheet";
import { useIsNarrow, usePopularProducts, useTimelineReviews } from "@/components/home/useHomeData";
import "@/components/home/home.css";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Hind+Siliguri:wght@400;500;600&family=JetBrains+Mono:wght@500&family=Poppins:ital,wght@0,600;1,800&display=swap";

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "BdRanks",
  url: typeof window !== "undefined" ? window.location.origin : "https://bdranks.com",
  description:
    "Honest, time-tested product reviews from a real community. Track how products perform over months and years.",
};

/** Header search appears once the hero's bottom edge is this close to the top. */
const HEADER_SEARCH_AT = 60;

const Index = () => {
  const narrow = useIsNarrow();
  const heroRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetQ, setSheetQ] = useState("");
  const timelines = useTimelineReviews();
  const popular = usePopularProducts();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = heroRef.current;
        if (el) setScrolled(el.getBoundingClientRect().bottom < HEADER_SEARCH_AT);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const openSearch = (q = "") => {
    setSheetQ(q);
    setSheetOpen(true);
  };

  // The sheet only exists on phones; close it if the window grows past 640px.
  useEffect(() => {
    if (!narrow) setSheetOpen(false);
  }, [narrow]);

  const deckKey = timelines.items.map((x) => x.id).join();

  return (
    <div className="bd-home flex min-h-screen flex-col bg-bd-bg pb-[76px] font-bangla text-bd-navy antialiased sm:pb-0">
      <PageHead
        title="BdRanks - Honest Reviews Over Time"
        description="Discover honest, time-tested product reviews. Our community tracks products over months and years so you get the full picture before you buy."
        jsonLd={orgSchema}
      />
      <Helmet>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </Helmet>

      <HomeHeader scrolled={scrolled} onOpenSearch={() => openSearch()} />

      <main>
        <HomeHero ref={heroRef} narrow={narrow} timelines={timelines.items} popular={popular} onOpenSearch={openSearch} />

        {/* Phones: the deck gets its own section under the hero. */}
        {narrow && timelines.items.length > 0 && (
          <section className="bd-rise px-4 pt-6" style={{ animationDelay: "0.4s" }}>
            <ReviewDeck key={deckKey} items={timelines.items} narrow />
          </section>
        )}

        <HowItWorks />
        <CategoryTiles />
        <TimelineStrip items={timelines.items} isLoading={timelines.isLoading} />
        <ProductCarousel />
        <LatestReviews />
        <WriteCta />
        <TrustStrip />
        <AudienceDoors narrow={narrow} />
      </main>

      <HomeFooter />

      {narrow && (
        <>
          <MobileTabBar searchOpen={sheetOpen} onOpenSearch={() => openSearch()} />
          <SearchSheet open={sheetOpen} onOpenChange={setSheetOpen} q={sheetQ} onQ={setSheetQ} popular={popular} />
        </>
      )}
    </div>
  );
};

export default Index;
