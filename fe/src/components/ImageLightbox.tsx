import { useCallback, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ImageLightboxProps {
  images: string[];
  /** Index of the open image, or null when closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Describes the set, e.g. the review title. Used to build alt text. */
  label?: string;
}

/**
 * Full-screen viewer for a set of images.
 *
 * Thumbnails on the page are cropped to fit their grid (object-cover), so the
 * viewer's job is to show the whole image — object-contain, never cropped,
 * never enlarged past its natural size.
 *
 * Built on the Radix primitives rather than ui/dialog's DialogContent, which
 * hardcodes a max-width, padding and a background meant for forms.
 */
export function ImageLightbox({ images, index, onIndexChange, label }: ImageLightboxProps) {
  const { t } = useTranslation();
  const open = index !== null && index >= 0 && index < images.length;
  const many = images.length > 1;

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      // Wrap, so the arrows never dead-end on the first or last image.
      onIndexChange((index + delta + images.length) % images.length);
    },
    [index, images.length, onIndexChange]
  );

  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    };
    // Radix already closes on Escape; only the arrows need handling.
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, many, go]);

  if (!open) return null;

  return (
    <DialogPrimitive.Root open onOpenChange={o => !o && onIndexChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
          // The image itself is the content; clicking the backdrop closes.
          onClick={() => onIndexChange(null)}
        >
          <DialogPrimitive.Title className="sr-only">
            {label ? `${label} — ${t("review.photoOf", { current: index + 1, total: images.length })}` : t("review.imageViewer")}
          </DialogPrimitive.Title>

          <img
            src={images[index]}
            alt={label ? `${label} — ${index + 1}` : `${index + 1}`}
            // Stop the backdrop handler so clicking the photo does not close it.
            onClick={e => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] object-contain select-none"
          />

          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
            aria-label={t("review.closeViewer")}
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>

          {many && (
            <>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); go(-1); }}
                aria-label={t("review.previousPhoto")}
                className="absolute left-2 md:left-4 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); go(1); }}
                aria-label={t("review.nextPhoto")}
                className="absolute right-2 md:right-4 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <span className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-sm text-white/80">
                {t("review.photoOf", { current: index + 1, total: images.length })}
              </span>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
