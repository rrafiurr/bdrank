import { AlertCircle, Bug, Heart, Lightbulb, MessageCircle, type LucideIcon } from "lucide-react";
import type { FeedbackStatus, FeedbackType } from "@/lib/feedbackApi";

export const FEEDBACK_TYPE_ICON: Record<FeedbackType, LucideIcon> = {
  bug: Bug,
  idea: Lightbulb,
  complaint: AlertCircle,
  praise: Heart,
  other: MessageCircle,
};

/** Badge colours per status, in the style of the profile's pending badge. */
export const FEEDBACK_STATUS_CLASS: Record<FeedbackStatus, string> = {
  new: "text-sky-700 border-sky-200 bg-sky-50",
  in_progress: "text-amber-700 border-amber-200 bg-amber-50",
  resolved: "text-emerald-700 border-emerald-200 bg-emerald-50",
  closed: "text-muted-foreground border-border bg-muted/40",
};
