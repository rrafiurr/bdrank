import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ArrowRight, Star } from "lucide-react";

interface TimelineEntry {
  date: string;
  period: string;
  rating: number;
  summary: string;
}

interface TimelinePreviewProps {
  productName: string;
  productImage: string;
  author: string;
  entries: TimelineEntry[];
}

export function TimelinePreview({
  productName,
  productImage,
  author,
  entries,
}: TimelinePreviewProps) {
  return (
    <div className="bg-card rounded-xl shadow-soft overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-1/3 relative">
          <img
            src={productImage}
            alt={productName}
            className="w-full h-48 md:h-full object-cover"
          />
          <div className="absolute top-3 left-3">
            <Badge variant="gold" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Timeline Review
            </Badge>
          </div>
        </div>

        <div className="flex-1 p-6">
          <h3 className="font-serif text-xl font-semibold text-card-foreground mb-2">
            {productName}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">by {author}</p>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />

            <div className="space-y-4">
              {entries.map((entry, index) => (
                <div key={index} className="flex gap-4 relative">
                  <div className="relative z-10">
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      index === entries.length - 1 
                        ? "bg-primary border-primary" 
                        : "bg-card border-primary"
                    }`} />
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-card-foreground">
                        {entry.period}
                      </span>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-gold text-gold" />
                        <span className="text-sm text-muted-foreground">
                          {entry.rating}/5
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{entry.date}</p>
                    <p className="text-sm text-muted-foreground">{entry.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button variant="ghost" size="sm" className="mt-4 group">
            View Full Timeline
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
