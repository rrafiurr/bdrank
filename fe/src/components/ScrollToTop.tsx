import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// How far down the page the user must be before the button fades in.
const SHOW_AFTER_PX = 400;

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
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVisible(window.scrollY > SHOW_AFTER_PX);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
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
