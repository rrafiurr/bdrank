import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiPage } from "@/lib/api";
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Home } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function StaticPage() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();

  const { data: page, isLoading, isError } = useQuery<ApiPage>({
    queryKey: ["page", slug],
    queryFn: () => apiFetch<ApiPage>(`/pages/${slug}`),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "https://bdranks.com";
  const articleJsonLd = page
    ? [
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: page.title,
          ...(page.meta_description ? { description: page.meta_description } : {}),
          dateModified: page.updated_at,
          publisher: { "@type": "Organization", name: "BdRanks", url: origin },
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: origin },
            { "@type": "ListItem", position: 2, name: page.title, item: `${origin}/page/${slug}` },
          ],
        },
      ]
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageHead
        title={page?.title ?? (slug ?? "Page")}
        description={page?.meta_description || undefined}
        ogType="article"
        jsonLd={articleJsonLd}
      />
      <Header />

      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="border-b border-border bg-secondary/30">
          <div className="container px-4 py-3">
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link to="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
                <Home className="h-3.5 w-3.5" />
                {t("staticPage.home")}
              </Link>
              <ChevronRight className="h-3.5 w-3.5" />
              {isLoading ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="text-foreground font-medium">{page?.title ?? slug}</span>
              )}
            </nav>
          </div>
        </div>

        <div className="container px-4 py-12 max-w-4xl mx-auto">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-4 w-full mt-6" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}

          {isError && (
            <div className="text-center py-24">
              <p className="text-4xl font-bold text-muted-foreground mb-4">404</p>
              <p className="text-xl font-semibold text-foreground mb-2">{t("staticPage.notFound")}</p>
              <p className="text-muted-foreground mb-8">
                {t("staticPage.notFoundDesc")}
              </p>
              <Link to="/" className="text-primary hover:underline">
                {t("staticPage.backToHome")}
              </Link>
            </div>
          )}

          {page && !isLoading && (
            <>
              <div
                className="prose prose-neutral dark:prose-invert max-w-none
                  prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-6 prose-h1:text-foreground
                  prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-foreground
                  prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:mb-4
                  prose-ul:text-muted-foreground prose-ul:list-disc prose-ul:pl-6 prose-ul:mb-4
                  prose-li:mb-1
                  prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                  prose-strong:text-foreground
                  prose-em:text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: page.content }}
              />
              <p className="mt-12 text-xs text-muted-foreground border-t border-border pt-4">
                {t("staticPage.lastUpdated")}{" "}
                {new Date(page.updated_at).toLocaleDateString(
                  i18n.language === "bn" ? "bn-BD" : "en-GB",
                  { year: "numeric", month: "long", day: "numeric" }
                )}
              </p>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
