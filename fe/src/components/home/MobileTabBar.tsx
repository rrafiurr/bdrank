import { Link } from "react-router-dom";
import { House, Plus, Search, Trophy, UserRound, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const tabClass =
  "flex min-h-[44px] w-[62px] flex-col items-center gap-1 py-1 text-[11px] font-semibold";

function Tab({ icon: Icon, label, active, to, onClick }: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  to?: string;
  onClick?: () => void;
}) {
  const cls = cn(tabClass, active ? "text-bd-navy" : "text-bd-faint");
  const body = (
    <>
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
      {label}
    </>
  );
  return to ? (
    <Link to={to} className={cls} aria-current={active ? "page" : undefined}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-current={active ? "page" : undefined}>{body}</button>
  );
}

/** Bottom navigation for phones (< 640px). Hidden on wider screens. */
export function MobileTabBar({ searchOpen, onOpenSearch }: { searchOpen: boolean; onOpenSearch: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <nav
      aria-label={t("landing.tabs.label")}
      className="bd-tabbar fixed inset-x-0 bottom-0 z-40 flex items-end justify-around border-t border-bd-line bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-[10px] sm:hidden"
    >
      <Tab icon={House} label={t("landing.tabs.home")} active={!searchOpen} onClick={toTop} />
      <Tab icon={Search} label={t("landing.tabs.search")} active={searchOpen} onClick={onOpenSearch} />
      <Link
        to="/write-review"
        className="-mt-[22px] flex flex-col items-center gap-[3px] text-[11px] font-semibold text-bd-navy"
      >
        <span className="grid h-[54px] w-[54px] place-items-center rounded-full border-4 border-white bg-bd-amber text-bd-navy shadow-[0_8px_18px_-6px_rgba(242,150,0,.6)]">
          <Plus className="h-7 w-7" strokeWidth={2} aria-hidden />
        </span>
        {t("landing.tabs.review")}
      </Link>
      <Tab icon={Trophy} label={t("landing.tabs.rewards")} to="/rewards" />
      <Tab icon={UserRound} label={t("landing.tabs.account")} to={user ? "/profile" : "/auth"} />
    </nav>
  );
}
