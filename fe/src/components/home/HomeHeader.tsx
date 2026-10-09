import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import logo from "@/assets/logo-tight.png";
import { useAuth } from "@/hooks/useAuth";
import { AccountMenu } from "@/components/AccountMenu";
import { cn } from "@/lib/utils";
import { LanguageToggle } from "./bits";
import { SearchBox } from "./SearchBox";

const NAV = [
  { to: "/categories", key: "landing.nav.categories" },
  { to: "/rewards", key: "landing.nav.rewards" },
  { to: "/owner-register", key: "landing.nav.business" },
];

interface HomeHeaderProps {
  /** True once the hero search has scrolled out of view. */
  scrolled: boolean;
  /** Phones open the full-screen search sheet instead of a dropdown. */
  onOpenSearch: () => void;
}

export function HomeHeader({ scrolled, onOpenSearch }: HomeHeaderProps) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [q, setQ] = useState("");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-[rgba(250,248,245,.94)] backdrop-blur-[10px] sm:bg-[rgba(250,248,245,.92)]",
        // The phone bar only gets its rule once there is content under it.
        scrolled ? "border-bd-line" : "border-transparent sm:border-bd-line",
      )}
    >
      <div className="mx-auto flex max-w-[1240px] items-center gap-2.5 px-4 py-2.5 sm:gap-6 sm:px-6 sm:py-3">
        <Link to="/" className="flex flex-none items-center" aria-label="BdRanks">
          <img
            src={logo}
            alt="BdRanks"
            className={cn("w-auto object-contain transition-[height]", scrolled ? "h-7 sm:h-10" : "h-8 sm:h-10")}
          />
        </Link>

        {/* Phones: a tap target that opens the search sheet. */}
        {scrolled && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-bd-line-strong bg-white px-3 py-2 text-left text-sm text-bd-faint sm:hidden"
          >
            <Search className="h-3.5 w-3.5 flex-none" aria-hidden />
            {t("landing.search.button")}
          </button>
        )}

        {/* Wider screens: the real search, once the hero's has scrolled away. */}
        {scrolled && (
          <SearchBox
            variant="compact"
            value={q}
            onChange={setQ}
            className="hidden max-w-[380px] flex-[1_1_260px] lg:block"
          />
        )}

        <nav className="ml-auto hidden flex-wrap items-center gap-[22px] text-[15px] font-medium md:flex" aria-label={t("landing.nav.label")}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="text-bd-navy hover:text-bd-amber-ink">
              {t(n.key)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex flex-none items-center gap-2 sm:gap-2.5 md:ml-0">
          <LanguageToggle />
          {!loading &&
            (user ? (
              <AccountMenu className="hidden sm:flex" />
            ) : (
              <Link to="/auth" className="hidden px-1.5 py-2 text-[15px] font-medium text-bd-navy hover:text-bd-amber-ink sm:block">
                {t("landing.nav.login")}
              </Link>
            ))}
          <Link
            to="/write-review"
            className="hidden rounded-full bg-bd-navy px-4 py-[9px] text-[15px] font-semibold text-white transition-colors hover:bg-bd-amber hover:text-bd-navy sm:block"
          >
            {t("landing.nav.write")}
          </Link>
        </div>
      </div>
    </header>
  );
}
