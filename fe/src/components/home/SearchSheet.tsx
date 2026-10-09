import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronRight, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ApiProduct } from "@/lib/api";
import { SuggestionFooter, SuggestionRow } from "./SearchBox";
import { useCategories, useProductSuggestions } from "./useHomeData";

const sectionLabel = "font-label text-[11px] font-medium uppercase tracking-[0.06em] text-bd-faint";

interface SearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  q: string;
  onQ: (q: string) => void;
  popular: ApiProduct[];
}

/** Full-screen search for phones: popular picks when empty, live results when typing. */
export function SearchSheet({ open, onOpenChange, q, onQ, popular }: SearchSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: categories = [] } = useCategories();
  const { active, products, empty } = useProductSuggestions(q, 5);
  const close = () => onOpenChange(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    close();
    navigate(`/browse?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="bd-home fixed inset-0 z-[60] flex flex-col bg-bd-bg font-bangla text-bd-navy focus:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">{t("landing.search.button")}</DialogPrimitive.Title>
          <form
            role="search"
            onSubmit={submit}
            className="flex items-center gap-2.5 border-b border-bd-line px-4 py-2.5 pt-[max(10px,env(safe-area-inset-top))]"
          >
            <div className="flex flex-1 items-center gap-2 rounded-xl border-[1.5px] border-bd-navy bg-white px-3 py-2.5">
              <Search className="h-4 w-4 flex-none text-bd-muted" aria-hidden />
              <input
                type="search"
                autoFocus
                value={q}
                onChange={(e) => onQ(e.target.value)}
                placeholder={t("landing.search.placeholderMobile")}
                aria-label={t("landing.search.placeholder")}
                autoComplete="off"
                className="min-w-0 flex-1 border-0 bg-transparent text-base text-bd-navy outline-none placeholder:text-bd-faint [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <DialogPrimitive.Close className="min-h-[44px] px-0 text-[15px] font-semibold text-bd-navy">
              {t("common.cancel")}
            </DialogPrimitive.Close>
          </form>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {active ? (
              <>
                {products.length > 0 && <div className={`${sectionLabel} mb-2 mt-1`}>{t("common.products")}</div>}
                {products.map((p) => (
                  <SuggestionRow key={p.id} p={p} onPick={close} large />
                ))}
                <SuggestionFooter q={q} empty={empty} onPick={close} large />
              </>
            ) : (
              <>
                {popular.length > 0 && (
                  <>
                    <div className={`${sectionLabel} mb-2.5 mt-1`}>{t("landing.search.popularNow")}</div>
                    <div className="flex flex-wrap gap-2">
                      {popular.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onQ(p.name)}
                          className="rounded-full border border-bd-line-strong bg-white px-3.5 py-2 text-sm font-medium text-bd-body"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {categories.length > 0 && (
                  <>
                    <div className={`${sectionLabel} mb-2.5 mt-[22px]`}>{t("landing.search.categories")}</div>
                    {categories.map((c) => (
                      <Link
                        key={c.slug}
                        to={`/browse?category=${encodeURIComponent(c.slug)}`}
                        onClick={close}
                        className="flex items-center justify-between border-b border-[#f0ebe4] py-3 text-[15px] font-medium text-bd-navy"
                      >
                        {c.label}
                        <ChevronRight className="h-4 w-4 text-bd-faint" aria-hidden />
                      </Link>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
