import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHead } from "@/components/PageHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code2, Copy, CheckCheck, Clock, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, BASE_URL, type ApiEmbedToken, type ApiOwnerProduct } from "@/lib/api";

const SITE_URL = BASE_URL.replace(/\/api\/v1$/, "");

function StatusBadge({ status }: { status: ApiEmbedToken["status"] }) {
  if (status === "approved")
    return <Badge className="gap-1 bg-green-100 text-green-700 hover:bg-green-100"><CheckCircle className="h-3 w-3" />Approved</Badge>;
  if (status === "revoked")
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Revoked</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 shrink-0">
      {copied ? <CheckCheck className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function snippetCode(token: string) {
  return `<script src="${SITE_URL}/widget.js" data-bdranks-token="${token}"><\/script>`;
}

export default function OwnerEmbed() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [productId, setProductId] = useState("");
  const [domain, setDomain] = useState("");
  const [showRating, setShowRating] = useState(true);
  const [showCount, setShowCount] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!loading && (!user || !user.is_product_owner)) navigate("/");
  }, [user, loading, navigate]);

  const { data: products = [] } = useQuery<ApiOwnerProduct[]>({
    queryKey: ["owner-products"],
    queryFn: () => apiFetch<ApiOwnerProduct[]>("/profile/products"),
    enabled: !!user?.is_product_owner,
  });

  const { data: embedsData } = useQuery<{ data: ApiEmbedToken[] }>({
    queryKey: ["owner-embeds"],
    queryFn: () => apiFetch<{ data: ApiEmbedToken[] }>("/owner/embed"),
    enabled: !!user?.is_product_owner && !!user?.owner_verified,
  });
  const embeds = embedsData?.data ?? [];

  const requestMutation = useMutation({
    mutationFn: () =>
      apiFetch("/owner/embed", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(productId),
          domain,
          show_rating: showRating,
          show_count: showCount,
          show_breakdown: showBreakdown,
          show_snippet: showSnippet,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-embeds"] });
      setProductId("");
      setDomain("");
      setShowRating(true);
      setShowCount(true);
      setShowBreakdown(false);
      setShowSnippet(false);
      setFormError("");
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!productId || !domain) {
      setFormError("Please select a product and enter your domain.");
      return;
    }
    requestMutation.mutate();
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <PageHead title="Embed Codes — BdRanks" noindex />
      <Header />
      <main className="py-12">
        <div className="container px-4 max-w-3xl">
          <div className="mb-8">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-1">Embed Codes</h1>
            <p className="text-muted-foreground text-sm">
              Show your BdRanks review badge on your own website. Paste the snippet where you want the badge to appear.
            </p>
          </div>

          {!user.owner_verified ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Your account is pending verification. Embed codes will be available once verified.
            </div>
          ) : (
            <>
              {/* Request form */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Code2 className="h-4 w-4" />
                    Request a new embed code
                  </CardTitle>
                  <CardDescription>
                    Each code is tied to one product and one domain. Admin approval is required before the badge goes live.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="product">Product</Label>
                        <Select value={productId} onValueChange={setProductId}>
                          <SelectTrigger id="product">
                            <SelectValue placeholder="Select a product" />
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
                      <div className="space-y-1.5">
                        <Label htmlFor="domain">Your domain</Label>
                        <Input
                          id="domain"
                          placeholder="mybrand.com"
                          value={domain}
                          onChange={(e) => setDomain(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium">Display options</p>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {[
                          { id: "show_rating", label: "Average rating", value: showRating, onChange: setShowRating },
                          { id: "show_count", label: "Review count", value: showCount, onChange: setShowCount },
                          { id: "show_breakdown", label: "Star breakdown", value: showBreakdown, onChange: setShowBreakdown },
                          { id: "show_snippet", label: "Latest review snippet", value: showSnippet, onChange: setShowSnippet },
                        ].map(({ id, label, value, onChange }) => (
                          <div key={id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                            <Switch id={id} checked={value} onCheckedChange={onChange} />
                            <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                              {label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {formError && (
                      <p className="text-sm text-destructive">{formError}</p>
                    )}

                    <Button type="submit" disabled={requestMutation.isPending}>
                      {requestMutation.isPending ? "Submitting…" : "Request embed code"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Token list */}
              {embeds.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold text-foreground">Your embed codes</h2>
                  {embeds.map((tok) => (
                    <Card key={tok.id}>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-sm">{tok.product_name}</p>
                            <p className="text-xs text-muted-foreground">{tok.domain}</p>
                          </div>
                          <StatusBadge status={tok.status} />
                        </div>

                        {tok.admin_note && (
                          <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
                            {tok.admin_note}
                          </p>
                        )}

                        <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                          {tok.show_rating && <span className="rounded bg-muted px-1.5 py-0.5">Rating</span>}
                          {tok.show_count && <span className="rounded bg-muted px-1.5 py-0.5">Count</span>}
                          {tok.show_breakdown && <span className="rounded bg-muted px-1.5 py-0.5">Breakdown</span>}
                          {tok.show_snippet && <span className="rounded bg-muted px-1.5 py-0.5">Snippet</span>}
                        </div>

                        {tok.status === "approved" && (
                          <div className="rounded-lg bg-muted p-3 flex items-center gap-2">
                            <code className="text-xs flex-1 break-all font-mono">
                              {snippetCode(tok.token)}
                            </code>
                            <CopyButton text={snippetCode(tok.token)} />
                          </div>
                        )}

                        {tok.status === "pending" && (
                          <p className="text-xs text-amber-600">
                            Awaiting admin approval — you will be able to copy the snippet once approved.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
