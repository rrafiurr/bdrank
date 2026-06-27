import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReviewForm } from "@/components/ReviewForm";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function WriteReview() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title="Write a Review"
        description="Share your honest product experience with the ReviewHub community. Help others make informed decisions."
        noindex
      />
      <Header />

      <main className="container px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
              {t("writeReview.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("writeReview.subtitle")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-elegant">
            <ReviewForm onClose={() => navigate("/")} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
