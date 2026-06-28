import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiFetch, type ApiCategory, type ApiPageListItem } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import logo from "@/assets/logo-tight.png";
import { Mail } from "lucide-react";

const EXPLORE_LINKS = [
  { labelKey: "footer.browseReviews", to: "/browse" },
  { labelKey: "nav.categories", to: "/categories" },
  { labelKey: "footer.writeAReview", to: "/write-review" },
  { labelKey: "footer.productOwnerPortal", to: "/owner-register" },
];

const ACCOUNT_LINKS = [
  { labelKey: "footer.signIn", to: "/auth" },
  { labelKey: "footer.myProfile", to: "/profile" },
];

export function Footer() {
  const { t } = useTranslation();

  const { data: categories = [] } = useQuery<ApiCategory[]>({
    queryKey: ["categories"],
    queryFn: () => apiFetch<ApiCategory[]>("/categories"),
    staleTime: 10 * 60 * 1000,
  });

  const { data: pages = [] } = useQuery<ApiPageListItem[]>({
    queryKey: ["pages"],
    queryFn: () => apiFetch<ApiPageListItem[]>("/pages"),
    staleTime: 10 * 60 * 1000,
  });

  return (
    <footer className="bg-secondary/40 border-t border-border">
      <div className="container px-4 py-12">
        {/* Top grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">

          {/* Brand column */}
          <div className="col-span-2 md:col-span-2">
            <Link to="/" className="inline-block mb-4">
              <img src={logo} alt="BdRanks" className="h-10 w-auto object-contain" />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {t("footer.tagline")}
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a
                href="mailto:info@bdranks.com"
                aria-label="Email"
                className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Explore column */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 text-sm tracking-wide uppercase">
              {t("footer.explore")}
            </h4>
            <ul className="space-y-2.5">
              {EXPLORE_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories column — dynamic */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 text-sm tracking-wide uppercase">
              {t("footer.categories")}
            </h4>
            <ul className="space-y-2.5">
              {categories.map((cat) => {
                const display = getCategoryDisplay(cat.slug);
                const Icon = display.icon;
                return (
                  <li key={cat.slug}>
                    <Link
                      to={`/browse?category=${cat.slug}`}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                    >
                      <Icon className={`h-3.5 w-3.5 ${display.searchColor} flex-shrink-0`} />
                      {cat.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Company column — dynamic from pages API */}
          <div>
            <h4 className="font-semibold text-foreground mb-4 text-sm tracking-wide uppercase">
              {t("footer.company")}
            </h4>
            <ul className="space-y-2.5">
              {pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    to={`/page/${page.slug}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="mailto:info@bdranks.com"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.contactUs")}
                </a>
                <span className="block text-xs text-muted-foreground/70 mt-0.5">
                  info@bdranks.com
                </span>
              </li>
              {/* Account links */}
              <li className="pt-2 border-t border-border mt-2">
                {/* Spacer */}
              </li>
              {ACCOUNT_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} BdRanks. {t("footer.rights")}</p>
          <div className="flex items-center gap-4">
            <Link to="/page/privacy" className="hover:text-foreground transition-colors">{t("footer.privacy")}</Link>
            <Link to="/page/terms" className="hover:text-foreground transition-colors">{t("footer.terms")}</Link>
            <Link to="/page/contact" className="hover:text-foreground transition-colors">{t("footer.contact")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
