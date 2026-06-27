import { Clock, Image, MessageCircle, Users, Star, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

export function FeaturesSection() {
  const { t } = useTranslation();

  const features = [
    {
      icon: Clock,
      title: t("features.timelineTitle"),
      description: t("features.timelineDesc"),
    },
    {
      icon: Image,
      title: t("features.mediaTitle"),
      description: t("features.mediaDesc"),
    },
    {
      icon: MessageCircle,
      title: t("features.communityTitle"),
      description: t("features.communityDesc"),
    },
    {
      icon: Users,
      title: t("features.trustedTitle"),
      description: t("features.trustedDesc"),
    },
    {
      icon: Star,
      title: t("features.ratingsTitle"),
      description: t("features.ratingsDesc"),
    },
    {
      icon: Shield,
      title: t("features.verifiedTitle"),
      description: t("features.verifiedDesc"),
    },
  ];

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container px-4">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl font-bold text-foreground mb-4">
            {t("features.heading")}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t("features.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-card rounded-xl p-6 shadow-soft hover:shadow-medium transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-serif text-lg font-semibold text-card-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
