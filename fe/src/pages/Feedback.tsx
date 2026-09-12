import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FeedbackForm } from "@/components/FeedbackForm";
import { useAuth } from "@/hooks/useAuth";

export default function Feedback() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <PageHead title={t("feedback.pageTitle")} description="Send feedback to the BdRanks team." noindex />
      <Header />

      <main className="container px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">{t("feedback.pageTitle")}</h1>
            <p className="text-muted-foreground">{t("feedback.pageSubtitle")}</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-elegant">
            {user ? <FeedbackForm /> : <div className="h-40 animate-pulse rounded-lg bg-muted/40" />}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
