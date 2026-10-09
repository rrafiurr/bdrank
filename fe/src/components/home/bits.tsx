import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Page-width wrapper: 1240px max, 16px gutters on mobile, 24px above. */
export function Container({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <div id={id} className={cn("mx-auto w-full max-w-[1240px] px-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

/** Five text stars, amber for the rating and warm grey for the rest. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const { t } = useTranslation();
  const on = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span
      role="img"
      aria-label={t("landing.starsLabel", { rating: rating.toFixed(1) })}
      className={cn("whitespace-nowrap tracking-[1px]", className)}
    >
      <span className="text-bd-amber">{"★".repeat(on)}</span>
      <span className="text-bd-star-off">{"★".repeat(5 - on)}</span>
    </span>
  );
}

const STRIPES =
  "bg-[repeating-linear-gradient(135deg,#efe9e1_0_6px,#f7f3ee_6px_12px)]";

// Hide an image whose URL fails to load; the striped placeholder shows through.
function hideBroken(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}

/** A product image over the design's striped placeholder. */
export function Thumb({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  return (
    <span className={cn("relative block flex-none overflow-hidden", STRIPES, className)}>
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={hideBroken}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}

/** Small uppercase monospace label above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-1 font-label text-[11px] font-medium uppercase tracking-[0.08em] sm:mb-1.5 sm:text-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn(
        "bd-display m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-bd-navy sm:text-[30px]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** "All categories →" style link; mobile shows the shorter label when given. */
export function MoreLink({ to, label, short }: { to: string; label: string; short?: string }) {
  return (
    <Link to={to} className="shrink-0 text-sm font-semibold text-bd-navy hover:text-bd-amber-ink sm:text-[15px]">
      {short ? (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label} →</span>
        </>
      ) : (
        <>{label} →</>
      )}
    </Link>
  );
}

/** Filter/segment pill: filled navy when active, outlined otherwise. */
export function Pill({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-none rounded-full border px-3.5 py-[7px] text-sm font-medium transition-colors duration-300 sm:py-1.5",
        active
          ? "border-bd-navy bg-bd-navy text-white"
          : "border-bd-line-strong bg-white text-bd-body hover:border-bd-navy",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** EN / বাং segmented toggle wired to i18next. */
export function LanguageToggle({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const current = i18n.language?.startsWith("bn") ? "bn" : "en";
  const opts = [
    { code: "en", label: "EN", name: t("language.english") },
    { code: "bn", label: "বাং", name: t("language.bangla") },
  ] as const;
  return (
    <div
      role="group"
      aria-label={t("language.change")}
      className={cn("flex rounded-full bg-bd-toggle p-0.5 text-xs font-semibold sm:p-[3px] sm:text-[13px]", className)}
    >
      {opts.map((o) => (
        <button
          key={o.code}
          type="button"
          lang={o.code}
          aria-pressed={current === o.code}
          aria-label={o.name}
          onClick={() => i18n.changeLanguage(o.code)}
          className={cn(
            "rounded-full px-[9px] py-1 text-bd-navy sm:px-2.5",
            current === o.code ? "bg-white" : "bg-transparent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
