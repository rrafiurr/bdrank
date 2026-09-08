import { ShieldCheck, BadgeCheck, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

export function TrustStrip() {
  const { t } = useTranslation();

  const facts = [
    { icon: ShieldCheck, title: t("home.trustModeratedTitle"), body: t("home.trustModeratedBody") },
    { icon: BadgeCheck, title: t("home.trustVerifiedTitle"), body: t("home.trustVerifiedBody") },
    { icon: Clock, title: t("home.trustTimelineTitle"), body: t("home.trustTimelineBody") },
  ];

  return (
    <section className="pb-2 pt-6 lg:pt-10">
      <div className="container px-4">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card px-4 py-4 lg:flex-row lg:gap-8 lg:px-6 lg:py-5">
          {facts.map((fact) => {
            const Icon = fact.icon;
            return (
              <div key={fact.title} className="flex flex-1 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
                  <Icon className="h-[18px] w-[18px] text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-card-foreground">{fact.title}</p>
                  <p className="text-[13px] leading-snug text-muted-foreground">{fact.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
