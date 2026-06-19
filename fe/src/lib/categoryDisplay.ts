import { Package, Briefcase, Monitor, UtensilsCrossed, Tag, type LucideIcon } from "lucide-react";

interface CategoryDisplay {
  icon: LucideIcon;
  color: string;
  borderColor: string;
  badgeVariant: "physical" | "service" | "digital" | "food" | "default";
  searchColor: string;
}

const known: Record<string, CategoryDisplay> = {
  physical: {
    icon: Package,
    color: "from-emerald-500/20 to-emerald-600/10",
    borderColor: "border-emerald-500/30",
    badgeVariant: "physical",
    searchColor: "text-blue-500",
  },
  service: {
    icon: Briefcase,
    color: "from-sky-500/20 to-sky-600/10",
    borderColor: "border-sky-500/30",
    badgeVariant: "service",
    searchColor: "text-emerald-500",
  },
  digital: {
    icon: Monitor,
    color: "from-violet-500/20 to-violet-600/10",
    borderColor: "border-violet-500/30",
    badgeVariant: "digital",
    searchColor: "text-purple-500",
  },
  food: {
    icon: UtensilsCrossed,
    color: "from-orange-500/20 to-orange-600/10",
    borderColor: "border-orange-500/30",
    badgeVariant: "food",
    searchColor: "text-orange-500",
  },
};

const fallback: CategoryDisplay = {
  icon: Tag,
  color: "from-gray-500/20 to-gray-600/10",
  borderColor: "border-gray-500/30",
  badgeVariant: "default",
  searchColor: "text-muted-foreground",
};

export function getCategoryDisplay(slug: string): CategoryDisplay {
  return known[slug] ?? fallback;
}
