import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Star, Upload, X, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiCategory, type ApiProduct } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import { useTranslation } from "react-i18next";

interface ReviewFormProps {
  onClose?: () => void;
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

  // Product autocomplete state
  const [productName, setProductName] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const productWrapperRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    title: "",
    category: "",
    rating: 0,
    content: "",
  });
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_IMAGES = 3;

  // Debounce product search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(productName.trim()), 300);
    return () => clearTimeout(timer);
  }, [productName]);

  const { data: productSearchData, isFetching: searchFetching } = useQuery({
    queryKey: ["product-search", debouncedQuery],
    queryFn: () =>
      apiFetch<{ data: ApiProduct[]; total: number }>(
        `/products?q=${encodeURIComponent(debouncedQuery)}&limit=6`
      ),
    enabled: debouncedQuery.length >= 2 && !selectedProduct,
  });

  const suggestions = productSearchData?.data ?? [];

  // Show dropdown when there are results and no product locked in
  useEffect(() => {
    setShowDropdown(!selectedProduct && suggestions.length > 0 && debouncedQuery.length >= 2);
    setFocusedIndex(-1);
  }, [suggestions, selectedProduct, debouncedQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productWrapperRef.current && !productWrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleProductNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProductName(e.target.value);
    if (selectedProduct) {
      // User started typing again — clear the locked selection
      setSelectedProduct(null);
      setFormData((prev) => ({ ...prev, category: "" }));
    }
  };

  const handleProductSelect = (p: ApiProduct) => {
    setProductName(p.name);
    setSelectedProduct(p);
    setFormData((prev) => ({ ...prev, category: p.category }));
    setShowDropdown(false);
  };

  const clearSelectedProduct = () => {
    setSelectedProduct(null);
    setProductName("");
    setFormData((prev) => ({ ...prev, category: "" }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      handleProductSelect(suggestions[focusedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setFocusedIndex(-1);
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast({ title: t("reviewForm.signInRequired"), description: t("reviewForm.signInRequiredDesc"), variant: "destructive" });
      navigate("/auth");
      return;
    }

    if (!productName.trim() || !formData.title || !formData.category || formData.rating === 0 || !formData.content) {
      toast({ title: t("reviewForm.missingFields"), description: t("reviewForm.missingFieldsDesc"), variant: "destructive" });
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
      images.forEach((f) => fd.append("images[]", f));

      await apiFetch("/reviews", { method: "POST", body: fd });

      toast({ title: t("reviewForm.reviewSubmitted"), description: t("reviewForm.reviewSubmittedDesc") });
      navigate("/browse");
      onClose?.();
    } catch (err: any) {
      toast({ title: t("reviewForm.errorTitle"), description: err.message ?? t("reviewForm.failedToSubmit"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Product name with autocomplete */}
      <div className="space-y-2">
        <Label htmlFor="product">{t("reviewForm.productLabel")}</Label>
        <div ref={productWrapperRef} className="relative">
          <div className="relative">
            <Input
              id="product"
              placeholder={t("reviewForm.productPlaceholder")}
              value={productName}
              onChange={handleProductNameChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (!selectedProduct && suggestions.length > 0) setShowDropdown(true);
              }}
              className={`bg-background pr-8 ${selectedProduct ? "border-primary ring-1 ring-primary/20" : ""}`}
              autoComplete="off"
            />
            {searchFetching && !selectedProduct && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}
            {selectedProduct && (
              <button
                type="button"
                onClick={clearSelectedProduct}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive transition-colors"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Selected product pill */}
          {selectedProduct && (
            <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-xs font-medium text-primary">{t("reviewForm.existingSelected")}</span>
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {selectedProduct.review_count > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {selectedProduct.avg_rating.toFixed(1)}
                    <span className="text-border/70">·</span>
                    {selectedProduct.review_count} review{selectedProduct.review_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Suggestions dropdown */}
          {showDropdown && (
            <div className="absolute z-50 top-full mt-1.5 w-full bg-card border border-border rounded-xl shadow-elevated overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("reviewForm.existingProducts", { count: suggestions.length })}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:block">{t("reviewForm.navigateHint")}</span>
              </div>

              {/* Product rows */}
              {suggestions.map((p, idx) => {
                const { icon: Icon, badgeVariant } = getCategoryDisplay(p.category);
                const isHighlighted = focusedIndex === idx;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProductSelect(p)}
                    className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/40 last:border-b-0 group ${
                      isHighlighted ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="h-11 w-11 rounded-lg overflow-hidden flex-shrink-0 bg-muted border border-border flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate leading-snug">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={badgeVariant} className="text-[10px] px-1.5 h-4 py-0">
                          {p.category}
                        </Badge>
                        {p.review_count > 0 ? (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {p.avg_rating.toFixed(1)}
                            <span className="text-border">·</span>
                            {p.review_count} review{p.review_count !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{t("reviewForm.noReviewsYet")}</span>
                        )}
                      </div>
                    </div>

                    {/* Select hint */}
                    <span
                      className={`flex items-center gap-0.5 text-xs font-medium text-primary flex-shrink-0 transition-opacity ${
                        isHighlighted ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      Select
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}

              {/* Footer hint */}
              <div className="px-3 py-2 bg-muted/30 border-t border-border">
                <p className="text-[11px] text-muted-foreground">
                  {t("reviewForm.notWhatYouNeed")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">{t("reviewForm.titleLabel")}</Label>
        <Input
          id="title"
          placeholder={t("reviewForm.titlePlaceholder")}
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="bg-background"
        />
      </div>

      {/* Category — locked when an existing product is selected */}
      <div className="space-y-2">
        <Label>
          {t("reviewForm.categoryLabel")}
          {selectedProduct && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">{t("reviewForm.categorySetByProduct")}</span>
          )}
        </Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Badge
              key={cat.slug}
              variant={formData.category === cat.slug ? "gold" : "outline"}
              className={selectedProduct ? "opacity-60" : "cursor-pointer transition-all hover:scale-105"}
              onClick={() => {
                if (!selectedProduct) setFormData({ ...formData, category: cat.slug });
              }}
            >
              {cat.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Rating */}
      <div className="space-y-2">
        <Label>{t("reviewForm.ratingLabel")}</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className="p-1 transition-transform hover:scale-110"
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              onClick={() => setFormData({ ...formData, rating: star })}
            >
              <Star
                className={`h-8 w-8 transition-colors ${
                  star <= (hoveredRating || formData.rating)
                    ? "fill-primary text-primary"
                    : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-2">
        <Label htmlFor="content">{t("reviewForm.contentLabel")}</Label>
        <Textarea
          id="content"
          placeholder={t("reviewForm.contentPlaceholder")}
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          className="min-h-[150px] bg-background"
        />
      </div>

      {/* Images */}
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

      {/* Submit */}
      <div className="flex gap-3 pt-4">
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
