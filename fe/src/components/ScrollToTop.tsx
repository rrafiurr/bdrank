import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shouldShowScrollTop } from "@/lib/scrollTopRules";

// Embed widgets render inside a short iframe on third-party sites, where a
// floating button would cover the badge itself.
const isExcluded = (pathname: string) => pathname.startsWith("/embed/");

// Floating "back to top" control shared by every route.
// Must be rendered inside <BrowserRouter>.
export function ScrollToTop() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const excluded = isExcluded(pathname);

  useEffect(() => {
    if (excluded) return;

    // Scroll fires far more often than the UI needs to change, so the read is
    // coalesced into one rAF per frame.
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVisible(
          shouldShowScrollTop({
            scrollY: window.scrollY,
            scrollHeight: document.documentElement.scrollHeight,
            innerHeight: window.innerHeight,
          }),
        );
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    // The threshold depends on how far the page can scroll, so it has to be
    // recomputed when that changes and not only when the user scrolls: rotating
    // a phone, or a query resolving and making the page taller, both move it.
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [excluded]);

  if (excluded) return null;

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <Button
      type="button"
      size="icon"
      onClick={scrollToTop}
      aria-label={t("common.backToTop")}
      title={t("common.backToTop")}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed bottom-6 right-6 z-40 h-11 w-11 rounded-full shadow-elevated transition-all duration-300",
        "[margin-bottom:env(safe-area-inset-bottom)]",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUp />
    </Button>
  );
}
