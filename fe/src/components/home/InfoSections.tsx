import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Container } from "./bits";

const STEP_COLORS = ["bg-bd-navy text-white", "bg-bd-logo text-white", "bg-bd-amber text-bd-navy"];

/** Three numbered steps under the hero. Wide screens only; phones go straight to the deck. */
export function HowItWorks() {
  const { t } = useTranslation();
  return (
    <section className="hidden pb-2 pt-14 sm:block">
      <Container>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 p-0">
          {[1, 2, 3].map((n, i) => (
            <li key={n} className="flex items-start gap-3.5">
              <span
                className={cn(
                  "grid h-[34px] w-[34px] flex-none place-items-center rounded-full font-display text-[15px] font-bold",
                  STEP_COLORS[i],
                )}
              >
                {n}
              </span>
              <div>
                <div className="bd-display mb-1 font-display text-lg font-semibold">{t(`landing.how.step${n}Title`)}</div>
                <div className="text-[15px] leading-normal text-bd-muted">{t(`landing.how.step${n}Body`)}</div>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/** Navy "Bought something recently?" panel. */
export function WriteCta() {
  const { t } = useTranslation();
  const steps = ["rate", "write", "title", "photos"] as const;
  return (
    <section id="write" className="pt-7 sm:pt-16">
      <Container>
        <div className="flex flex-wrap items-center justify-between gap-8 rounded-[20px] bg-bd-navy p-[22px] text-bd-bg sm:rounded-3xl sm:p-10">
          <div className="flex-[1_1_380px]">
            <h2 className="bd-display m-0 mb-2 font-display text-2xl font-bold leading-[1.15] tracking-[-0.02em] text-bd-bg sm:mb-2.5 sm:text-[clamp(26px,3vw,36px)] sm:leading-[1.1]">
              {t("landing.cta.title")}
            </h2>
            <p className="m-0 max-w-[520px] text-[15px] leading-normal text-[#c9cfdd] sm:text-[17px] sm:leading-[1.55] sm:text-bd-footer">
              <span className="sm:hidden">{t("landing.cta.bodyShort")}</span>
              <span className="hidden sm:inline">{t("landing.cta.body")}</span>
            </p>
          </div>
          <div className="flex w-full flex-col gap-3.5 sm:w-auto sm:flex-[0_1_auto]">
            <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-xs text-[#c9cfdd] sm:gap-2.5 sm:text-sm sm:text-bd-footer">
              {steps.map((s, i) => (
                <li key={s} className="rounded-full border border-[#33416a] px-2.5 py-[3px] sm:border-[#3d3731] sm:px-3 sm:py-1">
                  {i + 1} · {t(`landing.cta.step.${s}`)}
                </li>
              ))}
            </ol>
            <Link
              to="/write-review"
              className="block rounded-full bg-bd-amber p-[13px] text-center text-base font-semibold text-bd-navy hover:bg-[#ffb53d] hover:text-bd-navy sm:self-start sm:px-[26px]"
            >
              {t("landing.cta.button")}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Four bordered trust facts. */
export function TrustStrip() {
  const { t } = useTranslation();
  const facts = ["moderation", "owners", "timelines", "imports"] as const;
  return (
    <section className="pt-7 sm:pt-14">
      <Container>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f} className="rounded-[14px] border border-bd-line p-3.5 sm:rounded-2xl sm:p-[22px]">
              <div className="bd-display mb-[3px] font-display text-[15px] font-semibold sm:mb-1 sm:text-[17px]">
                <span className="sm:hidden">{t(`landing.trust.${f}.titleShort`)}</span>
                <span className="hidden sm:inline">{t(`landing.trust.${f}.title`)}</span>
              </div>
              <div className="text-[12.5px] leading-[1.45] text-bd-muted sm:text-sm sm:leading-normal">
                <span className="sm:hidden">{t(`landing.trust.${f}.bodyShort`)}</span>
                <span className="hidden sm:inline">{t(`landing.trust.${f}.body`)}</span>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
