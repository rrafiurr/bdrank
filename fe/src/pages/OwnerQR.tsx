import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHead } from "@/components/PageHead";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, ArrowLeft, Copy, Check, Star, ScanLine, Heart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, type ApiOwnerProduct, type ApiProduct } from "@/lib/api";
import logo from "@/assets/logo.png";
import { useTranslation } from "react-i18next";

export default function OwnerQR() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !user.is_product_owner)) navigate("/");
  }, [user, loading, navigate]);

  const { data: products = [] } = useQuery<ApiOwnerProduct[]>({
    queryKey: ["owner-products"],
    queryFn: () => apiFetch<ApiOwnerProduct[]>("/profile/products"),
    enabled: !!user?.is_product_owner,
  });

  useEffect(() => {
    if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(String(products[0].id));
    }
  }, [products, selectedProductId]);

  const selectedProduct = products.find((p) => String(p.id) === selectedProductId);
  const productUrl = selectedProductId
    ? `${window.location.origin}/product/${selectedProductId}`
    : "";

  // Public product data carries the live avg rating + review count for the poster
  const { data: productStats } = useQuery<ApiProduct>({
    queryKey: ["product", selectedProductId],
    queryFn: () => apiFetch<ApiProduct>(`/products/${selectedProductId}`),
    enabled: !!selectedProductId,
  });

  const handleCopy = () => {
    if (!productUrl) return;
    navigator.clipboard.writeText(productUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePrint = () => window.print();

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <PageHead title={t("ownerQr.pageTitle")} noindex />

      {/* Screen-only header */}
      <div className="print:hidden">
        <Header />
      </div>

      <main className="py-10 print:py-0">
        <div className="container px-4 max-w-2xl print:max-w-none print:p-0">

          {/* Screen-only controls */}
          <div className="print:hidden mb-8">
            <button
              onClick={() => navigate("/owner-dashboard")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("ownerQr.backToDashboard")}
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="font-serif text-2xl font-bold text-foreground">{t("ownerQr.heading")}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("ownerQr.subtitle")}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-2" onClick={handleCopy} disabled={!productUrl}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? t("ownerQr.copied") : t("ownerQr.copyLink")}
                </Button>
                <Button variant="hero" size="sm" className="gap-2" onClick={handlePrint} disabled={!selectedProduct}>
                  <Printer className="h-4 w-4" />
                  {t("ownerQr.print")}
                </Button>
              </div>
            </div>

            {products.length > 1 && (
              <div className="mb-6">
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t("ownerQr.selectProduct")}</label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger className="h-9 w-full sm:w-[280px] rounded-lg text-sm">
                    <SelectValue placeholder={t("ownerQr.chooseProduct")} />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {products.length === 0 && (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                {t("ownerQr.noProducts")}
              </div>
            )}
          </div>

          {/* A4 Print Card — visible on screen as preview, fills page on print */}
          {selectedProduct && (
            <div
              id="qr-print-card"
              className="
                bg-white rounded-2xl border border-border shadow-elegant overflow-hidden
                print:rounded-none print:border-0 print:shadow-none
                print:fixed print:inset-0 print:w-screen print:h-screen print:flex print:items-center print:justify-center
              "
            >
              <div className="w-full print:max-w-[720px]">
                {/* Warm top band */}
                <div className="h-2.5 print:h-3 w-full bg-gradient-warm print-exact" />

                <div className="flex flex-col items-center text-center px-8 py-10 sm:px-10 print:px-14 print:py-12 w-full">

                  {/* Logo + Brand */}
                  <img src={logo} alt="BdRanks" className="h-9 print:h-11 w-auto object-contain mb-8 print:mb-10" />

                  {/* Company + headline */}
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2 print:text-base">
                    {user.company_name}
                  </p>
                  <h2 className="font-serif text-2xl print:text-4xl font-bold text-foreground mb-2 leading-tight">
                    {selectedProduct.name}
                  </h2>

                  {/* Live rating */}
                  {productStats && productStats.review_count > 0 ? (
                    <div className="flex flex-col items-center gap-1.5 mb-8 print:mb-10">
                      <div className="flex gap-1 print-exact">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-6 w-6 print:h-7 print:w-7 ${
                              i < Math.round(productStats.avg_rating)
                                ? "fill-gold text-gold"
                                : "fill-muted text-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-2xl print:text-3xl font-bold text-foreground leading-none">
                        {productStats.avg_rating.toFixed(1)}
                        <span className="text-base print:text-lg font-medium text-muted-foreground"> / 5</span>
                      </p>
                      <p className="text-xs print:text-sm text-muted-foreground">
                        {t("ownerQr.customerReviews", { count: productStats.review_count })}
                      </p>
                    </div>
                  ) : (
                    <span className="mb-8 print:mb-10 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm print:text-base font-medium text-primary print-exact">
                      {t("ownerQr.noReviewsYet")}
                    </span>
                  )}

                  <p className="text-sm print:text-base text-muted-foreground mb-8 print:mb-10">
                    {t("ownerQr.scanCta")}
                  </p>

                  {/* QR Code with corner accents */}
                  <div className="relative mb-3 print:mb-4">
                    <span className="absolute -top-2 -left-2 h-6 w-6 border-t-[3px] border-l-[3px] border-primary rounded-tl-lg print-exact" />
                    <span className="absolute -top-2 -right-2 h-6 w-6 border-t-[3px] border-r-[3px] border-primary rounded-tr-lg print-exact" />
                    <span className="absolute -bottom-2 -left-2 h-6 w-6 border-b-[3px] border-l-[3px] border-primary rounded-bl-lg print-exact" />
                    <span className="absolute -bottom-2 -right-2 h-6 w-6 border-b-[3px] border-r-[3px] border-primary rounded-br-lg print-exact" />
                    <div className="rounded-2xl bg-white p-4 print:p-5 border border-border/60 shadow-soft">
                      <QRCodeSVG
                        value={productUrl}
                        size={200}
                        className="print:w-[260px] print:h-[260px]"
                        bgColor="#ffffff"
                        fgColor="#1a1a1a"
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                  </div>
                  <p className="text-xs print:text-sm text-muted-foreground mb-2">
                    {t("ownerQr.scanWithCamera")}
                  </p>

                  {/* URL */}
                  <p className="text-xs print:text-sm text-muted-foreground/70 font-mono break-all max-w-xs print:max-w-sm mb-8 print:mb-10">
                    {productUrl}
                  </p>

                  {/* How it works — 3 steps */}
                  <div className="grid grid-cols-3 gap-3 sm:gap-6 w-full max-w-md print:max-w-lg mb-8 print:mb-10">
                    {[
                      { icon: ScanLine, label: t("ownerQr.step1") },
                      { icon: Star, label: t("ownerQr.step2") },
                      { icon: Heart, label: t("ownerQr.step3") },
                    ].map(({ icon: Icon, label }, i) => (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <div className="h-10 w-10 print:h-12 print:w-12 rounded-full bg-primary/10 flex items-center justify-center print-exact">
                          <Icon className="h-5 w-5 print:h-6 print:w-6 text-primary" />
                        </div>
                        <p className="text-xs print:text-sm font-medium text-foreground leading-snug">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="w-16 h-px bg-border mb-6 print:mb-8" />

                  {/* CTA */}
                  <p className="text-base print:text-xl font-semibold text-foreground mb-1">
                    {t("ownerQr.lovedProduct")}
                  </p>
                  <p className="text-sm print:text-base text-muted-foreground max-w-md">
                    {t("ownerQr.shareExperience")}
                  </p>

                  {/* Footer branding */}
                  <p className="text-xs text-muted-foreground/60 mt-8 print:mt-10">
                    {t("ownerQr.poweredBy")} <span className="font-medium">BdRanks</span> · bdranks.com
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Screen-only footer */}
      <div className="print:hidden">
        <Footer />
      </div>
    </div>
  );
}
