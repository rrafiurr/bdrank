import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Star, Package, Briefcase, Monitor } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiProduct } from "@/lib/api";

const categoryIcon = (c: string) => {
  if (c === "service") return Briefcase;
  if (c === "digital") return Monitor;
  return Package;
};

export function ReviewedProducts() {
  const { data, isLoading } = useQuery({
    queryKey: ["products", { limit: 12 }],
    queryFn: () => apiFetch<{ data: ApiProduct[]; total: number }>("/products?limit=12"),
  });

  const products = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="min-w-[240px] max-w-[240px] h-[240px] rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No reviewed products yet. Be the first to write a review!
      </p>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x">
      {products.map((product) => {
        const Icon = categoryIcon(product.category);
        return (
          <Link
            key={product.id}
            to={`/product/${product.id}`}
            className="min-w-[240px] max-w-[240px] snap-start group bg-card rounded-xl overflow-hidden shadow-soft hover:shadow-elevated transition-all duration-300 hover:-translate-y-1 border border-border"
          >
            <div className="aspect-[4/3] bg-muted overflow-hidden flex items-center justify-center">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <Icon className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            <div className="p-4">
              <Badge variant={product.category as any} className="mb-2">
                {product.category}
              </Badge>
              <h3 className="font-serif font-semibold text-card-foreground line-clamp-1 group-hover:text-primary transition-colors">
                {product.name}
              </h3>
              <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-gold text-gold" />
                  {product.avg_rating.toFixed(1)}
                </span>
                <span>{product.review_count} review{product.review_count !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
