import { Button } from "@/components/ui/button";
import { ArrowRight, Star, Clock, Users } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-hero py-20 lg:py-32">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gold/5 blur-3xl" />
      </div>

      <div className="container relative px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary animate-fade-in">
            <Star className="h-4 w-4 fill-primary" />
            Trusted by 10,000+ reviewers
          </div>

          <h1 className="mb-6 font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl animate-slide-up">
            Real Reviews,{" "}
            <span className="text-gradient">Real Stories,</span>{" "}
            Over Time
          </h1>

          <p className="mb-10 text-lg text-muted-foreground sm:text-xl max-w-2xl mx-auto animate-slide-up animation-delay-100">
            Share your honest experiences with products and services. Track how they hold up over months and years with our unique timeline reviews.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up animation-delay-200">
            <Button variant="hero" size="xl" className="group">
              Start Writing Reviews
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button variant="outline" size="xl">
              Browse Reviews
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 animate-fade-in animation-delay-300">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-primary mb-2">
                <Star className="h-5 w-5 fill-primary" />
                <span className="text-3xl font-bold font-serif">50K+</span>
              </div>
              <p className="text-sm text-muted-foreground">Reviews Written</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-primary mb-2">
                <Clock className="h-5 w-5" />
                <span className="text-3xl font-bold font-serif">5K+</span>
              </div>
              <p className="text-sm text-muted-foreground">Timeline Reviews</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-primary mb-2">
                <Users className="h-5 w-5" />
                <span className="text-3xl font-bold font-serif">10K+</span>
              </div>
              <p className="text-sm text-muted-foreground">Active Members</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
