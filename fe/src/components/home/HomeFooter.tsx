import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiFetch, type ApiPageListItem } from "@/lib/api";

const COLUMNS = [
  {
    key: "explore",
    links: [
      { to: "/categories", key: "landing.footer.categories" },
      { to: "/browse", key: "landing.footer.timelines" },
      { to: "/browse", key: "landing.footer.latest" },
    ],
  },
  {
    key: "community",
    links: [
      { to: "/write-review", key: "landing.footer.write" },
      { to: "/rewards", key: "landing.footer.rewards" },
      { to: "/rewards", key: "landing.footer.leaderboard" },
    ],
  },
  {
    key: "business",
    links: [
      { to: "/owner-register", key: "landing.footer.claim" },
      { to: "/owner-qr", key: "landing.footer.qr" },
      { to: "/owner-embed", key: "landing.footer.widget" },
    ],
  },
];

// Legal links render only while their CMS page is published.
const LEGAL = [
  { slug: "privacy", key: "footer.privacy" },
  { slug: "terms", key: "footer.terms" },
];

const linkCls = "text-bd-footer hover:text-white";

function Wordmark({ className }: { className?: string }) {
  return (
    <div className={`font-wordmark font-extrabold italic leading-none tracking-[-0.03em] ${className ?? ""}`}>
      <span className="text-white">Bd</span>
      <span className="text-bd-amber">Ranks</span>
      <span className="text-xs font-semibold text-white sm:text-[13px]">.com</span>
    </div>
  );
}

function Tagline() {
  return (
    <span className="whitespace-nowrap font-wordmark text-[10px] font-semibold tracking-[0.18em] sm:tracking-[0.12em] text-white sm:text-[11px]">
      RANK. <span className="text-bd-amber">TRUST.</span> CHOOSE BETTER.
    </span>
  );
}

export function HomeFooter() {
  const { t, i18n } = useTranslation();
  const { data: pages = [] } = useQuery<ApiPageListItem[]>({
    queryKey: ["pages"],
    queryFn: () => apiFetch<ApiPageListItem[]>("/pages", {}, undefined, { redirectOn401: false }),
    staleTime: 10 * 60 * 1000,
  });
  // CMS pages (About, Trust & moderation, …) minus the legal ones shown below.
  const companyPages = pages.filter((p) => !LEGAL.some((l) => l.slug === p.slug));
  const legal = LEGAL.filter((l) => pages.some((p) => p.slug === l.slug));
  // A published contact page replaces the bare mailto link.
  const contactLink = pages.some((p) => p.slug === "contact") ? null : (
    <a href="mailto:info@bdranks.com" className={linkCls}>{t("landing.footer.contact")}</a>
  );
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto bg-bd-navy text-[#c9cfdd] sm:text-bd-footer">
      {/* Phones: wordmark, tagline and a compact two-column link list. */}
      <div className="px-4 pb-7 pt-6 sm:hidden">
        <Wordmark className="mb-1.5 text-[22px]" />
        <div className="mb-[18px]"><Tagline /></div>
        <nav className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm" aria-label={t("landing.footer.label")}>
          <Link to="/categories" className={linkCls}>{t("landing.footer.categories")}</Link>
          <Link to="/rewards" className={linkCls}>{t("landing.footer.leaderboard")}</Link>
          <Link to="/owner-register" className={linkCls}>{t("landing.nav.business")}</Link>
          {companyPages.map((p) => (
            <Link key={p.slug} to={`/page/${p.slug}`} className={linkCls}>{p.title}</Link>
          ))}
          {contactLink}
        </nav>
        <div className="mt-[18px] border-t border-[#2a3654] pt-3.5 text-xs">
          © {year} BdRanks · {t("landing.footer.made")}
        </div>
      </div>

      <div className="hidden sm:block">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-8 px-6 pb-7 pt-12">
          <div>
            <Wordmark className="mb-2.5 text-[26px]" />
            <div className="text-sm leading-[1.55]">
              <Tagline />
              <br />
              {t("landing.footer.tagline")}
            </div>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.key} className="flex flex-col gap-2 text-sm" aria-label={t(`landing.footer.col.${col.key}`)}>
              <b className="mb-1 text-white">{t(`landing.footer.col.${col.key}`)}</b>
              {col.links.map((l) => (
                <Link key={l.key} to={l.to} className={linkCls}>{t(l.key)}</Link>
              ))}
            </nav>
          ))}
          <nav className="flex flex-col gap-2 text-sm" aria-label="BdRanks">
            <b className="mb-1 text-white">BdRanks</b>
            {companyPages.map((p) => (
              <Link key={p.slug} to={`/page/${p.slug}`} className={linkCls}>{p.title}</Link>
            ))}
            {contactLink}
          </nav>
        </div>
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-3 border-t border-[#34302b] px-6 pb-7 pt-[18px] text-[13px]">
          <span>© {year} BdRanks · {t("landing.footer.made")}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {legal.map((l) => (
              <span key={l.slug}>
                <Link to={`/page/${l.slug}`} className={linkCls}>{t(l.key)}</Link> ·
              </span>
            ))}
            <button type="button" lang="en" onClick={() => i18n.changeLanguage("en")} className={linkCls}>English</button>
            /
            <button type="button" lang="bn" onClick={() => i18n.changeLanguage("bn")} className={linkCls}>বাংলা</button>
          </span>
        </div>
      </div>
    </footer>
  );
}
