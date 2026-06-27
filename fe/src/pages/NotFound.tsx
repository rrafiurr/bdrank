import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Home, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    console.error("404: page not found:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PageHead title="Page Not Found" noindex />
      <Header />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-8xl font-bold text-primary/20 mb-4">404</p>
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">{t("notFound.title")}</h1>
          <p className="text-muted-foreground mb-8">
            {t("notFound.desc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/">
              <Button variant="hero" className="gap-2 w-full sm:w-auto">
                <Home className="h-4 w-4" />
                {t("notFound.goHome")}
              </Button>
            </Link>
            <Link to="/browse">
              <Button variant="outline" className="gap-2 w-full sm:w-auto">
                <Search className="h-4 w-4" />
                {t("notFound.browseReviews")}
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
