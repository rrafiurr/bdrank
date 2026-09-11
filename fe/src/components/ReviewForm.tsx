import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, Upload, X, FileClock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiCategory, type ApiProduct, type ApiReviewField } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { CustomFieldInputs } from "@/components/CustomFieldInputs";
import { ProductPicker } from "@/components/ProductPicker";
import { ReviewPrompts } from "@/components/ReviewPrompts";
import { useReviewDraft, type ReviewDraftValues } from "@/hooks/useReviewDraft";
import { looksLikeSupportedVideo } from "@/lib/videoLink";
import { cn } from "@/lib/utils";

interface ReviewFormProps {
  onClose?: () => void;
}

// Stable reference so the `data: customFields = []` fallback below doesn't
// create a new array on every render (which would re-trigger the effect
// that prunes stale answers and loop indefinitely) while the review-fields
// query is disabled.
const EMPTY_CUSTOM_FIELDS: ApiReviewField[] = [];

const MAX_IMAGES = 3;

// Not a minimum — submitting a shorter review is allowed. It's the point past
// which the counter stops nudging, because reviews below it rarely tell anyone
// anything useful.
const HELPFUL_LENGTH = 100;

/** Small numbered heading so nine stacked inputs read as four short steps. */
function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
            {step}
          </span>
          {title}
        </h2>
        {description && <p className="text-xs text-muted-foreground pl-7">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function ReviewForm({ onClose }: ReviewFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<ApiCategory[]>("/categories"),
    staleTime: 5 * 60 * 1000,
  });

  const [productName, setProductName] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    category: "",
    rating: 0,
    content: "",
  });
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [videoURL, setVideoURL] = useState("");
  const [customValues, setCustomValues] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  // Admin-defined fields for the selected product or category
  const { data: customFields = EMPTY_CUSTOM_FIELDS } = useQuery<ApiReviewField[]>({
    queryKey: ["review-fields", selectedProduct?.id ?? null, formData.category],
    queryFn: () =>
      apiFetch(
        selectedProduct
          ? `/review-fields?product_id=${selectedProduct.id}`
          : `/review-fields?category=${encodeURIComponent(formData.category)}`
      ),
    enabled: Boolean(selectedProduct || formData.category),
    // Keep showing the previous product/category's fields while the new
    // query is in flight, instead of falling back to `data: undefined` (and
    // thus EMPTY_CUSTOM_FIELDS) for a render. Without this, the pruning
    // effect below would see an empty allowed-set on every product switch
    // and wipe everything the reviewer had typed, even when the new
    // selection offers the exact same fields. The trade-off is that the
    // form briefly shows the previous selection's fields during the
    // refetch rather than flickering to none — deliberate, since discarding
    // typed answers is worse than a stale label for a moment.
    placeholderData: (prev) => prev,
  });

  // Drop answers to fields that are no longer offered, keeping the rest —
  // re-selecting a product must not wipe what the reviewer typed.
  useEffect(() => {
    setCustomValues((prev) => {
      const allowed = new Set(customFields.map((f) => f.id));
      const keys = Object.keys(prev);
      if (keys.every((k) => allowed.has(Number(k)))) return prev;
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (allowed.has(Number(k))) next[Number(k)] = v;
      }
      return next;
    });
  }, [customFields]);

  // Autosaved draft. Memoised so a hover-rating render doesn't reset the
  // debounce — only a real edit should.
  const draftValues = useMemo<ReviewDraftValues>(
    () => ({
      productName,
      selectedProduct,
      category: formData.category,
      title: formData.title,
      content: formData.content,
      rating: formData.rating,
      videoURL,
      customValues,
    }),
    [productName, selectedProduct, formData, videoURL, customValues]
  );

  const { pendingDraft, restoreDraft, discardDraft, clearDraft } = useReviewDraft(
    user?.id ?? null,
    draftValues
  );

  const handleRestoreDraft = () => {
    const draft = restoreDraft();
    if (!draft) return;
    setProductName(draft.productName);
    setSelectedProduct(draft.selectedProduct);
    setFormData({
      title: draft.title,
      category: draft.category,
      rating: draft.rating,
      content: draft.content,
    });
    setVideoURL(draft.videoURL);
    setCustomValues(draft.customValues ?? {});
    setErrors({});
  };

  const handleProductSelect = (product: ApiProduct | null) => {
    setSelectedProduct(product);
    // An existing product carries its own category; a cleared selection hands
    // the choice back to the reviewer.
    setFormData((prev) => ({ ...prev, category: product?.category ?? "" }));
    clearError("product");
    clearError("category");
  };

  // Images
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = MAX_IMAGES - images.length;
    const accepted: File[] = [];
    for (const f of files.slice(0, remaining)) {
      if (!f.type.startsWith("image/")) {
        toast({ title: t("reviewForm.invalidFile"), description: `${f.name} is not an image.`, variant: "destructive" });
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        toast({ title: t("reviewForm.fileTooLarge"), description: `${f.name} exceeds 5MB.`, variant: "destructive" });
        continue;
      }
      accepted.push(f);
    }
    if (files.length > remaining) {
      toast({ title: t("reviewForm.imageLimit"), description: t("reviewForm.imageLimitDesc", { max: MAX_IMAGES }) });
    }
    setImages((prev) => [...prev, ...accepted]);
    setImagePreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    return () => { imagePreviews.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!productName.trim()) next.product = t("reviewForm.errProduct");
    if (!formData.category) next.category = t("reviewForm.errCategory");
    if (formData.rating === 0) next.rating = t("reviewForm.errRating");
    if (!formData.content.trim()) next.content = t("reviewForm.errContent");
    if (!formData.title.trim()) next.title = t("reviewForm.errTitle");
    for (const f of customFields) {
      if (f.is_required && !(customValues[f.id] ?? "").trim()) {
        next[`cf-${f.id}`] = t("reviewForm.customFieldRequired", { label: f.label });
      }
    }
    // Caught here only so the reviewer sees it before losing the form; the
    // server rejects an unsupported link regardless.
    if (videoURL.trim() && !looksLikeSupportedVideo(videoURL)) {
      next.video = t("reviewForm.videoInvalid");
    }
    return next;
  };

  // Send them to the first problem rather than leaving them to hunt for it.
  const focusFirstError = (found: Record<string, string>) => {
    const order = [
      "product",
      "category",
      "rating",
      ...customFields.map((f) => `cf-${f.id}`),
      "content",
      "title",
      "video",
    ];
    const key = order.find((k) => found[k]);
    if (!key) return;
    const elementId =
      key === "category" ? "field-category" : key === "rating" ? "field-rating" : key === "video" ? "video-url" : key;
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({ title: t("reviewForm.signInRequired"), description: t("reviewForm.signInRequiredDesc"), variant: "destructive" });
      navigate("/auth");
      return;
    }

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();

      if (selectedProduct) {
        fd.append("product_id", String(selectedProduct.id));
      } else {
        fd.append("product_name", productName.trim());
        fd.append("category", formData.category);
      }

      fd.append("title", formData.title);
      fd.append("content", formData.content);
      fd.append("rating", String(formData.rating));
      fd.append("is_anonymous", isAnonymous ? "true" : "false");
      fd.append("fields", JSON.stringify(customValues));
      fd.append("video_url", videoURL.trim());
      images.forEach((f) => fd.append("images[]", f));

      await apiFetch("/reviews", { method: "POST", body: fd });

      clearDraft();
      toast({ title: t("reviewForm.reviewSubmitted"), description: t("reviewForm.reviewSubmittedDesc") });
      navigate("/browse");
      onClose?.();
    } catch (err) {
      const description = err instanceof Error ? err.message : t("reviewForm.failedToSubmit");
      toast({ title: t("reviewForm.errorTitle"), description, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const activeRating = hoveredRating || formData.rating;
  const contentLength = formData.content.trim().length;

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {pendingDraft && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
          <FileClock className="h-4 w-4 flex-shrink-0 text-primary" />
          <p className="min-w-[12rem] flex-1 text-sm text-foreground">{t("reviewForm.draftFound")}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={discardDraft}>
              {t("reviewForm.draftDiscard")}
            </Button>
            <Button type="button" size="sm" onClick={handleRestoreDraft}>
              {t("reviewForm.draftRestore")}
            </Button>
          </div>
        </div>
      )}

      <Section step={1} title={t("reviewForm.sectionSubject")} description={t("reviewForm.sectionSubjectHint")}>
        <div className="space-y-2">
          <Label htmlFor="product">{t("reviewForm.productLabel")}</Label>
          <ProductPicker
            value={productName}
            onValueChange={(name) => {
              setProductName(name);
              clearError("product");
            }}
            selected={selectedProduct}
            onSelect={handleProductSelect}
            invalid={Boolean(errors.product)}
            describedBy={errors.product ? "product-error" : undefined}
          />
          <FieldError id="product-error" message={errors.product} />
        </div>

        <div className="space-y-2">
          <Label>
            {t("reviewForm.categoryLabel")}
            {selectedProduct && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t("reviewForm.categorySetByProduct")}
              </span>
            )}
          </Label>
          <div
            id="field-category"
            tabIndex={-1}
            className={cn(
              "flex flex-wrap gap-2 rounded-lg outline-none",
              errors.category && "ring-2 ring-destructive/40 ring-offset-4 ring-offset-card"
            )}
          >
            {categories.map((cat) => (
              <Badge
                key={cat.slug}
                variant={formData.category === cat.slug ? "gold" : "outline"}
                className={selectedProduct ? "opacity-60" : "cursor-pointer transition-all hover:scale-105"}
                onClick={() => {
                  if (selectedProduct) return;
                  setFormData({ ...formData, category: cat.slug });
                  clearError("category");
                }}
              >
                {cat.label}
              </Badge>
            ))}
          </div>
          <FieldError id="category-error" message={errors.category} />
        </div>
      </Section>

      <div className="border-t border-border/70" />

      <Section step={2} title={t("reviewForm.sectionRating")} description={t("reviewForm.sectionRatingHint")}>
        <div className="space-y-2">
          <div
            id="field-rating"
            tabIndex={-1}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg outline-none",
              errors.rating && "ring-2 ring-destructive/40 ring-offset-4 ring-offset-card"
            )}
          >
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="p-1 transition-transform hover:scale-110"
                  aria-label={t(`reviewForm.ratingLabels.${star}`)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => {
                    setFormData({ ...formData, rating: star });
                    clearError("rating");
                  }}
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      star <= activeRating ? "fill-primary text-primary" : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            {/* Reserve the row so the form doesn't jump when a label appears. */}
            <span className="min-h-[1.25rem] text-sm font-medium text-foreground">
              {activeRating > 0 ? t(`reviewForm.ratingLabels.${activeRating}`) : ""}
            </span>
          </div>
          <FieldError id="rating-error" message={errors.rating} />
        </div>
      </Section>

      <div className="border-t border-border/70" />

      <Section step={3} title={t("reviewForm.sectionExperience")} description={t("reviewForm.sectionExperienceHint")}>
        <CustomFieldInputs
          fields={customFields}
          values={customValues}
          errors={errors}
          onChange={(id, v) => {
            setCustomValues((p) => ({ ...p, [id]: v }));
            clearError(`cf-${id}`);
          }}
        />

        <div className="space-y-3">
          <Label htmlFor="content">{t("reviewForm.contentLabel")}</Label>
          <ReviewPrompts
            category={formData.category}
            value={formData.content}
            onChange={(next) => {
              setFormData((prev) => ({ ...prev, content: next }));
              clearError("content");
            }}
            textareaRef={contentRef}
          />
          <Textarea
            id="content"
            ref={contentRef}
            placeholder={t("reviewForm.contentPlaceholder")}
            value={formData.content}
            onChange={(e) => {
              setFormData({ ...formData, content: e.target.value });
              clearError("content");
            }}
            aria-invalid={Boolean(errors.content) || undefined}
            aria-describedby={errors.content ? "content-error" : "content-hint"}
            className={cn(
              "min-h-[180px] bg-background",
              errors.content && "border-destructive focus-visible:ring-destructive"
            )}
          />
          <FieldError id="content-error" message={errors.content} />
          <p
            id="content-hint"
            className={cn(
              "text-xs",
              contentLength >= HELPFUL_LENGTH ? "text-success" : "text-muted-foreground"
            )}
          >
            {contentLength >= HELPFUL_LENGTH
              ? t("reviewForm.lengthGood")
              : t("reviewForm.lengthNudge", { length: contentLength, target: HELPFUL_LENGTH })}
          </p>
        </div>

        {/* Asked last: a title is a summary, and you can't summarise what you
            haven't written yet. */}
        <div className="space-y-2">
          <Label htmlFor="title">{t("reviewForm.titleLabel")}</Label>
          <Input
            id="title"
            placeholder={t("reviewForm.titlePlaceholder")}
            value={formData.title}
            onChange={(e) => {
              setFormData({ ...formData, title: e.target.value });
              clearError("title");
            }}
            aria-invalid={Boolean(errors.title) || undefined}
            aria-describedby={errors.title ? "title-error" : undefined}
            className={cn("bg-background", errors.title && "border-destructive focus-visible:ring-destructive")}
          />
          <FieldError id="title-error" message={errors.title} />
        </div>
      </Section>

      <div className="border-t border-border/70" />

      <Section step={4} title={t("reviewForm.sectionProof")} description={t("reviewForm.sectionProofHint")}>
        <div className="space-y-6 rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
          <div className="space-y-2">
            <Label>{t("reviewForm.photosLabel", { max: MAX_IMAGES })}</Label>
            <div className="flex flex-wrap gap-3">
              {imagePreviews.map((src, i) => (
                <div key={src} className="relative h-24 w-24 rounded-lg overflow-hidden border border-border group">
                  <img src={src} alt={`Upload preview ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-background shadow-soft opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5 text-foreground" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24 w-24 rounded-lg border-2 border-dashed border-border hover:border-primary hover:bg-accent/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-xs">{t("reviewForm.addPhoto")}</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageSelect}
            />
            <p className="text-xs text-muted-foreground">{t("reviewForm.photoHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="video-url">{t("reviewForm.videoLabel")}</Label>
            <Input
              id="video-url"
              type="url"
              inputMode="url"
              placeholder={t("reviewForm.videoPlaceholder")}
              value={videoURL}
              onChange={(e) => {
                setVideoURL(e.target.value);
                clearError("video");
              }}
              aria-invalid={Boolean(errors.video) || undefined}
              aria-describedby={errors.video ? "video-error" : undefined}
              className={cn("bg-background", errors.video && "border-destructive focus-visible:ring-destructive")}
            />
            {errors.video ? (
              <FieldError id="video-error" message={errors.video} />
            ) : (
              <p className="text-xs text-muted-foreground">{t("reviewForm.videoHint")}</p>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 p-4">
            <Checkbox
              id="is-anonymous"
              checked={isAnonymous}
              onCheckedChange={(v) => setIsAnonymous(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="is-anonymous" className="cursor-pointer font-medium">
                {t("reviewForm.anonymousLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("reviewForm.anonymousHint")}</p>
            </div>
          </div>
        </div>
      </Section>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>
          {t("reviewForm.cancel")}
        </Button>
        <Button type="submit" variant="hero" className="flex-1" disabled={submitting}>
          {submitting ? t("reviewForm.submitting") : t("reviewForm.submit")}
        </Button>
      </div>
    </form>
  );
}
