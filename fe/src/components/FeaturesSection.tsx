import { Clock, Image, MessageCircle, Users, Star, Shield } from "lucide-react";

export function FeaturesSection() {
  const features = [
    {
      icon: Clock,
      title: "Timeline Reviews",
      description: "Track how products hold up over time. Update your review at 1 month, 1 year, and beyond.",
    },
    {
      icon: Image,
      title: "Rich Media",
      description: "Upload photos to show real-world usage. A picture is worth a thousand words.",
    },
    {
      icon: MessageCircle,
      title: "Community Discussion",
      description: "Engage with other reviewers. Ask questions and share experiences in comments.",
    },
    {
      icon: Users,
      title: "Trusted Community",
      description: "Join a growing community of honest reviewers. Build your reputation as a trusted voice.",
    },
    {
      icon: Star,
      title: "Detailed Ratings",
      description: "Rate products on multiple criteria. Help others make informed decisions.",
    },
    {
      icon: Shield,
      title: "Verified Reviews",
      description: "All reviews are from real users. No fake reviews, no paid promotions.",
    },
  ];

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container px-4">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl font-bold text-foreground mb-4">
            Why ReviewHub?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            We're building the most honest and comprehensive review platform on the web.
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
