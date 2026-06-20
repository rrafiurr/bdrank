import { useQuery } from "@tanstack/react-query";
import { apiFetch, type AdminStats } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, MessageSquare, Package, BookOpen, Tag, AlertTriangle } from "lucide-react";

const STAT_CARDS = [
  { key: "total_users",      label: "Total Users",      icon: Users,         color: "text-blue-500",   bg: "bg-blue-50" },
  { key: "total_reviews",    label: "Reviews",          icon: FileText,      color: "text-violet-500", bg: "bg-violet-50" },
  { key: "pending_reviews",  label: "Pending Reviews",  icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50" },
  { key: "total_comments",   label: "Comments",         icon: MessageSquare, color: "text-emerald-500",bg: "bg-emerald-50" },
  { key: "pending_comments", label: "Pending Comments", icon: AlertTriangle, color: "text-amber-500",  bg: "bg-amber-50" },
  { key: "pending_owners",   label: "Pending Owners",  icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50" },
  { key: "total_products",   label: "Products",         icon: Package,       color: "text-indigo-500", bg: "bg-indigo-50" },
  { key: "total_categories", label: "Categories",       icon: Tag,           color: "text-pink-500",   bg: "bg-pink-50" },
  { key: "total_pages",      label: "Pages",            icon: BookOpen,      color: "text-teal-500",   bg: "bg-teal-50" },
] as const;

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => apiFetch<AdminStats>("/admin/stats"),
    refetchInterval: 60_000,
  });

  return (
    <Layout title="Dashboard">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, color, bg }) => (
          <Card key={key} className="overflow-hidden">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                <div className={`h-8 w-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {isLoading ? (
                <Skeleton className="h-9 w-20" />
              ) : (
                <p className="text-3xl font-bold text-foreground">
                  {stats?.[key as keyof AdminStats]?.toLocaleString() ?? "—"}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
