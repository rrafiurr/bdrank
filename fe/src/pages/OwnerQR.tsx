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
import { Printer, ArrowLeft, Copy, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, type ApiOwnerProduct } from "@/lib/api";
import logo from "@/assets/logo.png";

export default function OwnerQR() {
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
      <PageHead title="Product QR Code" noindex />

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
              Back to Dashboard
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="font-serif text-2xl font-bold text-foreground">Product QR Code</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Print or share a QR code that links directly to your product's review page.
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-2" onClick={handleCopy} disabled={!productUrl}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                <Button variant="hero" size="sm" className="gap-2" onClick={handlePrint} disabled={!selectedProduct}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </div>
            </div>

            {products.length > 1 && (
              <div className="mb-6">
                <label className="text-sm font-medium text-foreground mb-1.5 block">Select product</label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger className="h-9 w-full sm:w-[280px] rounded-lg text-sm">
                    <SelectValue placeholder="Choose a product" />
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
                No products linked to your account yet. Contact an admin to link your products.
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
              <div className="flex flex-col items-center text-center px-10 py-12 print:px-16 print:py-16 w-full">

                {/* Logo + Brand */}
                <div className="flex items-center gap-2.5 mb-10 print:mb-14">
                  <img src={logo} alt="ReviewHub" className="h-9 print:h-12 w-auto object-contain" />
                </div>

                {/* Company + headline */}
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2 print:text-base">
                  {user.company_name}
                </p>
                <h2 className="font-serif text-2xl print:text-4xl font-bold text-foreground mb-1 leading-tight">
                  {selectedProduct.name}
                </h2>
                <p className="text-sm print:text-base text-muted-foreground mb-10 print:mb-14">
                  Scan to read honest reviews from real customers
                </p>

                {/* QR Code */}
                <div className="rounded-2xl print:rounded-3xl bg-white p-4 print:p-6 border border-border/60 shadow-soft mb-8 print:mb-12">
                  <QRCodeSVG
                    value={productUrl}
                    size={200}
                    className="print:w-[280px] print:h-[280px]"
                    bgColor="#ffffff"
                    fgColor="#1a1a1a"
                    level="M"
                    includeMargin={false}
                  />
                </div>

                {/* URL */}
                <p className="text-xs print:text-sm text-muted-foreground font-mono break-all max-w-xs print:max-w-sm mb-10 print:mb-14">
                  {productUrl}
                </p>

                {/* Divider */}
                <div className="w-16 h-px bg-border mb-8 print:mb-10" />

                {/* CTA */}
                <p className="text-base print:text-xl font-semibold text-foreground mb-1">
                  Loved our product?
                </p>
                <p className="text-sm print:text-base text-muted-foreground">
                  Share your experience — your review helps others make better decisions.
                </p>

                {/* Footer branding */}
                <p className="text-xs text-muted-foreground/60 mt-10 print:mt-16">
                  Powered by <span className="font-medium">ReviewHub</span> · bdranks.com
                </p>
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
