import { useEffect, useRef, useState } from "react";
import type { ApiProduct } from "@/lib/api";

export interface ReviewDraftValues {
  productName: string;
  /**
   * The locked-in product, stored whole rather than by id so Restore can put
   * the selection back without a round trip. Without it, restoring a draft for
   * an existing product would silently create a duplicate product on submit.
   */
  selectedProduct: ApiProduct | null;
  category: string;
  title: string;
  content: string;
  rating: number;
  videoURL: string;
  customValues: Record<number, string>;
}

interface StoredDraft extends ReviewDraftValues {
  savedAt: number;
}

const SAVE_DEBOUNCE_MS = 800;
/** Drafts older than this are ignored and cleared — a stale one is noise. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const keyFor = (userId: number) => `review_draft_${userId}`;

const isEmpty = (v: ReviewDraftValues) =>
  !v.productName.trim() &&
  !v.title.trim() &&
  !v.content.trim() &&
  !v.videoURL.trim() &&
  v.rating === 0 &&
  !v.selectedProduct &&
  Object.values(v.customValues).every((x) => !x.trim());

function read(userId: number): StoredDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(keyFor(userId));
      return null;
    }
    return parsed;
  } catch {
    // Private mode, cleared storage, or a draft written by an older shape.
    return null;
  }
}

/**
 * Autosaves the in-progress review to localStorage and surfaces any draft found
 * on mount so the form can offer to restore it.
 *
 * Only non-empty forms are written, so a blank mount never clobbers the stored
 * draft before the reviewer has decided what to do with it. The found draft is
 * also held in a ref, so Restore still works if they started typing first and
 * overwrote what was on disk.
 */
export function useReviewDraft(userId: number | null, values: ReviewDraftValues) {
  const [pending, setPending] = useState<ReviewDraftValues | null>(null);
  const found = useRef<ReviewDraftValues | null>(null);
  const cleared = useRef(false);

  useEffect(() => {
    if (userId === null) return;
    const draft = read(userId);
    if (draft && !isEmpty(draft)) {
      found.current = draft;
      setPending(draft);
    }
  }, [userId]);

  useEffect(() => {
    if (userId === null || cleared.current || isEmpty(values)) return;
    const timer = setTimeout(() => {
      try {
        const payload: StoredDraft = { ...values, savedAt: Date.now() };
        localStorage.setItem(keyFor(userId), JSON.stringify(payload));
      } catch {
        // Storage full or blocked — autosave is a convenience, never a blocker.
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [userId, values]);

  /** The draft to restore, or null. Dismisses the prompt either way. */
  const restoreDraft = (): ReviewDraftValues | null => {
    const draft = found.current;
    setPending(null);
    return draft;
  };

  const discardDraft = () => {
    found.current = null;
    setPending(null);
    if (userId !== null) {
      try {
        localStorage.removeItem(keyFor(userId));
      } catch {
        /* nothing to do */
      }
    }
  };

  /** Called after a successful submit; also stops further autosaves. */
  const clearDraft = () => {
    cleared.current = true;
    discardDraft();
  };

  return { pendingDraft: pending, restoreDraft, discardDraft, clearDraft };
}
