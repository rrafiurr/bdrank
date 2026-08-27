import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, uploadImage, ApiError, type AdminImage, type ImageUse } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, Trash2, LinkIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A delete blocked by rows outside review_images, awaiting confirmation. */
type Blocked = { filename: string; uses: ImageUse[] };

export default function Images() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(null);

  const { data: images = [], isLoading } = useQuery<AdminImage[]>({
    queryKey: ["admin-images"],
    queryFn: () => apiFetch("/admin/images"),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-images"] });

  const remove = useMutation({
    mutationFn: ({ filename, force }: { filename: string; force?: boolean }) =>
      apiFetch<{ ok: boolean; detached: number }>(
        `/admin/images/${encodeURIComponent(filename)}${force ? "?force=true" : ""}`,
        { method: "DELETE" }
      ),
    onSuccess: (res) => {
      refresh();
      toast.success(res.detached > 0
        ? `Deleted — detached from ${res.detached} review image(s)`
        : "Deleted");
    },
    onError: (e, vars) => {
      // 409 means rows outside review_images still point at the file. Show them
      // and offer to force, rather than reporting a bare failure.
      const uses = e instanceof ApiError && e.status === 409
        ? (e.data as { uses?: ImageUse[] })?.uses
        : undefined;
      if (uses?.length) { setBlocked({ filename: vars.filename, uses }); return; }
      toast.error(e instanceof Error ? e.message : "Delete failed");
    },
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadImage(file);
      refresh();
      toast.success("Uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const linked = images.filter(i => i.review_id !== null).length;

  return (
    <Layout title="Images">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${images.length} files · ${linked} in review_images`}
          </p>
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
            />
            <Button size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Uploading…" : "Upload image"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4 p-5">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
          </div>
        ) : images.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            No files in the upload folder yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4 p-5">
            {images.map(img => (
              <div key={img.filename} className="border border-border rounded-lg overflow-hidden group">
                <div className="aspect-square bg-muted/40">
                  <img
                    src={img.url}
                    alt={img.filename}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-2 space-y-1.5">
                  <p className="font-mono text-[11px] truncate text-muted-foreground" title={img.filename}>
                    {img.filename}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatSize(img.size)} · {new Date(img.modified).toLocaleDateString()}
                  </p>
                  {img.review_id !== null ? (
                    <Badge variant="outline" className="text-[10px] gap-1 max-w-full">
                      <LinkIcon className="h-2.5 w-2.5 flex-shrink-0" />
                      <span className="truncate">#{img.review_id} {img.review_title}</span>
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                      not in review_images
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => setConfirm(img.filename)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plain delete confirmation */}
      <AlertDialog open={confirm !== null} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono text-xs">{confirm}</span> will be removed from the
              upload folder and detached from any review that uses it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirm) remove.mutate({ filename: confirm }); setConfirm(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* In use somewhere the listing does not show — confirm before destroying it */}
      <AlertDialog open={blocked !== null} onOpenChange={o => !o && setBlocked(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" />Still in use
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>This file is not in <code>review_images</code>, but it is used by:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {blocked?.uses.map((u, i) => (
                    <li key={i} className="text-sm">
                      <span className="text-muted-foreground">{u.table}</span> — {u.label}
                    </li>
                  ))}
                </ul>
                <p>Deleting it will leave a broken image there.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (blocked) remove.mutate({ filename: blocked.filename, force: true });
                setBlocked(null);
              }}
            >
              Delete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
