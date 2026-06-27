import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Star, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useTranslation } from "react-i18next";

const AddTimeline = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({ title: t("timeline.titleRequired"), description: t("timeline.titleRequiredDesc"), variant: "destructive" });
      return;
    }
    if (!content.trim()) {
      toast({ title: t("timeline.contentRequired"), description: t("timeline.contentRequiredDesc"), variant: "destructive" });
      return;
    }
    if (rating === 0) {
      toast({ title: t("timeline.ratingRequired"), description: t("timeline.ratingRequiredDesc"), variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("content", content.trim());
      fd.append("rating", String(rating));
      if (image) fd.append("image", image);

      await apiFetch(`/reviews/${id}/timeline`, { method: "POST", body: fd });

      toast({ title: t("timeline.successTitle"), description: t("timeline.successDesc") });
      navigate(`/review/${id}`);
    } catch (err: any) {
      toast({ title: t("timeline.errorTitle"), description: err.message ?? t("timeline.errorDesc"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHead title={t("timeline.pageTitle")} noindex />
      <Header />

      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Back Button */}
          <Link
            to={`/review/${id}`}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("timeline.backToReview")}
          </Link>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-2xl">{t("timeline.cardTitle")}</CardTitle>
              <CardDescription>
                {t("timeline.cardDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">{t("timeline.entryTitle")}</Label>
                  <Input
                    id="title"
                    placeholder={t("timeline.entryTitlePlaceholder")}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Rating */}
                <div className="space-y-2">
                  <Label>{t("timeline.currentRating")}</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoveredRating(star)}
                        onMouseLeave={() => setHoveredRating(0)}
                        className="p-1 transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-8 h-8 ${
                            star <= (hoveredRating || rating)
                              ? "text-primary fill-primary"
                              : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    ))}
                    <span className="ml-3 text-sm text-muted-foreground">
                      {rating > 0
                        ? t("timeline.star", { count: rating })
                        : t("timeline.selectRating")}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-2">
                  <Label htmlFor="content">{t("timeline.yourUpdate")}</Label>
                  <Textarea
                    id="content"
                    placeholder={t("timeline.updatePlaceholder")}
                    className="min-h-[150px] resize-none"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </div>

                {/* Image Upload */}
                <div className="space-y-2">
                  <Label>{t("timeline.photo")}</Label>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    {imagePreview ? (
                      <div className="space-y-4">
                        <div className="relative aspect-video max-w-sm mx-auto rounded-lg overflow-hidden">
                          <img
                            src={imagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setImage(null);
                            setImagePreview(null);
                          }}
                        >
                          {t("timeline.removePhoto")}
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageChange}
                        />
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Camera className="w-6 h-6 text-primary" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {t("timeline.clickToUpload")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("timeline.pngJpgLimit")}
                          </p>
                        </div>
                      </label>
                    )}
                  </div>
                </div>

                {/* Submit */}
                <div className="flex gap-4 pt-4">
                  <Button type="submit" className="flex-1" disabled={submitting}>
                    {submitting ? t("timeline.saving") : t("timeline.addEntry")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(`/review/${id}`)}
                    disabled={submitting}
                  >
                    {t("timeline.cancel")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AddTimeline;
