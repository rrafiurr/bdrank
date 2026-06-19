import { Button } from "@/components/ui/button";
import { Grid } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiCategory } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";

interface CategoryFilterProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export function CategoryFilter({ activeCategory, onCategoryChange }: CategoryFilterProps) {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<ApiCategory[]>("/categories"),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={activeCategory === "all" ? "default" : "outline"}
        size="sm"
        onClick={() => onCategoryChange("all")}
        className="gap-2"
      >
        <Grid className="h-4 w-4" />
        All Reviews
      </Button>
      {categories.map((cat) => {
        const { icon: Icon } = getCategoryDisplay(cat.slug);
        return (
          <Button
            key={cat.slug}
            variant={activeCategory === cat.slug ? "default" : "outline"}
            size="sm"
            onClick={() => onCategoryChange(cat.slug)}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            {cat.label}
          </Button>
        );
      })}
    </div>
  );
}
