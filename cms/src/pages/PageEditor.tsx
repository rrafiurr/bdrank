import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, SITE_URL, type AdminPageDetail } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Save, Search } from "lucide-react";
import { toast } from "sonner";

const slugify = (s: string) =>
  s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");

const TITLE_LIMIT = 60;
const DESC_LIMIT = 160;

export default function PageEditor() {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const isEdit = !!routeSlug;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [metaDescription, setMetaDescription] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const { data: page, isLoading, isError } = useQuery<AdminPageDetail>({
    queryKey: ["admin-page", routeSlug],
    queryFn: () => apiFetch(`/admin/pages/${routeSlug}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setSlug(page.slug);
      setMetaDescription(page.meta_description);
      setContent(page.content);
      setIsPublished(page.is_published);
    }
  }, [page]);

  const saveMut = useMutation({
    mutationFn: () => {
      const body = { slug, title, meta_description: metaDescription, content, is_published: isPublished };
      return isEdit
        ? apiFetch(`/admin/pages/${routeSlug}`, { method: "PATCH", body: JSON.stringify(body) })
        : apiFetch("/admin/pages", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pages"] });
      qc.invalidateQueries({ queryKey: ["admin-page", routeSlug] });
      toast.success(isEdit ? "Page saved" : "Page created");
      if (!isEdit) navigate(`/pages/${slug}/edit`, { replace: true });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const canSave = !!title.trim() && !!slug && !saveMut.isPending && (!isEdit || !isLoading);

  const seoTitle = `${title || "Page title"} | BdRanks`;

  return (
    <Layout
      title={isEdit ? "Edit Page" : "New Page"}
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/pages")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />Back
          </Button>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={!canSave}>
            <Save className="h-4 w-4 mr-1.5" />
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      {isEdit && isError ? (
        <div className="text-center py-24 text-muted-foreground">
          Page not found. <Link to="/pages" className="text-primary hover:underline">Back to pages</Link>
        </div>
      ) : isEdit && isLoading ? (
        <div className="space-y-4 max-w-3xl">
          <div className="h-10 bg-muted animate-pulse rounded" />
          <div className="h-96 bg-muted animate-pulse rounded" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          {/* Main column */}
          <div className="space-y-4 min-w-0">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={e => {
                  setTitle(e.target.value);
                  if (!isEdit && !slugTouched) setSlug(slugify(e.target.value));
                }}
                placeholder="Page title"
                className="text-base font-medium h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Content</Label>
              <RichTextEditor value={content} onChange={setContent} />
              <p className="text-xs text-muted-foreground">
                Tip: drop or paste images straight into the editor — they upload automatically. Use the <span className="font-mono">&lt;/&gt;</span> button to edit the raw HTML.
              </p>
            </div>
          </div>

          {/* Side column */}
          <div className="space-y-4">
            {/* Publish */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="published" className="cursor-pointer font-semibold">Published</Label>
                <Switch id="published" checked={isPublished} onCheckedChange={setIsPublished} />
              </div>
              <p className="text-xs text-muted-foreground">
                {isPublished
                  ? "Visible on the site, linked in the footer, and included in the sitemap."
                  : "Draft — hidden from the site, footer, and sitemap."}
              </p>
              {isEdit && page?.is_published && (
                <a
                  href={`${SITE_URL}/page/${routeSlug}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />View live page
                </a>
              )}
            </div>

            {/* Slug */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-2">
              <Label className="font-semibold">URL Slug</Label>
              {isEdit ? (
                <p className="font-mono text-xs text-muted-foreground break-all">/page/{slug}</p>
              ) : (
                <>
                  <Input
                    value={slug}
                    onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
                    placeholder="about-us"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground break-all">/page/{slug || "…"}</p>
                </>
              )}
            </div>

            {/* SEO */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Label className="font-semibold">SEO</Label>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Meta description</Label>
                  <Badge variant="outline" className={`text-[10px] px-1.5 ${metaDescription.length > DESC_LIMIT ? "text-destructive border-destructive/40" : "text-muted-foreground"}`}>
                    {metaDescription.length}/{DESC_LIMIT}
                  </Badge>
                </div>
                <Textarea
                  value={metaDescription}
                  onChange={e => setMetaDescription(e.target.value)}
                  placeholder="A short summary shown in Google results and social shares…"
                  maxLength={300}
                  className="text-xs min-h-[72px] resize-y"
                />
              </div>

              {title.length > TITLE_LIMIT && (
                <p className="text-[11px] text-amber-600">
                  Title is over {TITLE_LIMIT} characters — Google may truncate it.
                </p>
              )}

              {/* Google preview */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Search preview</Label>
                <div className="border border-border rounded-md p-3 bg-background space-y-0.5">
                  <p className="text-[11px] text-emerald-700 truncate">
                    bdranks.com › page › {slug || "slug"}
                  </p>
                  <p className="text-[13px] leading-snug text-blue-700 font-medium line-clamp-2">
                    {seoTitle}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug line-clamp-3">
                    {metaDescription || "Add a meta description to control how this page appears in search results."}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Published pages automatically get canonical &amp; Open Graph tags, Article structured data, and a sitemap entry.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
