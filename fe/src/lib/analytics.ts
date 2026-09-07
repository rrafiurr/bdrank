const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let loaded = false;

export function isAnalyticsConfigured(): boolean {
  return !!GA_MEASUREMENT_ID;
}

// initAnalytics injects gtag.js once. Automatic page_view is disabled because
// gtag only fires it on a hard load, and GA's "history changes" fallback reports
// the previous document title on SPA navigations. RouteAnalytics sends them instead.
export function initAnalytics(): void {
  if (!GA_MEASUREMENT_ID || loaded) return;
  loaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js distinguishes the arguments object from a plain array and ignores
    // array pushes, so rest params would silently break every command.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as (...args: unknown[]) => void;

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

// trackPageView sends a manual page_view for the current SPA route.
export function trackPageView(path: string, title: string): void {
  if (!GA_MEASUREMENT_ID || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: title,
  });
}
