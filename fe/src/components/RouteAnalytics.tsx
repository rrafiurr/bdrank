import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initAnalytics, isAnalyticsConfigured, trackPageView } from "@/lib/analytics";

// Embed widgets render inside third-party sites; their traffic would distort
// metrics for bdranks.com itself, so they are not tracked.
const isExcluded = (pathname: string) => pathname.startsWith("/embed/");

// RouteAnalytics sends a GA4 page_view on every client-side navigation.
// Must be rendered inside <BrowserRouter>.
export function RouteAnalytics() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!isAnalyticsConfigured() || isExcluded(pathname)) return;

    initAnalytics();

    // PageHead writes the title via react-helmet-async, which syncs the DOM in a
    // requestAnimationFrame queued from an effect that runs after this one. A
    // double rAF lands after that frame's callbacks, so document.title is current.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => trackPageView(pathname + search, document.title));
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [pathname, search]);

  return null;
}
