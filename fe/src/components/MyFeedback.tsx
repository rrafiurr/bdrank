import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { feedbackApi } from "@/lib/feedbackApi";
import { FEEDBACK_STATUS_CLASS, FEEDBACK_TYPE_ICON } from "@/lib/feedbackDisplay";

// Messages longer than this, or with more lines, start clamped with a toggle.
const LONG_MESSAGE_CHARS = 280;
const CLAMP_LINES = 4;

export function MyFeedback() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isSuccess } = useQuery({
    queryKey: ["feedback-mine", user?.id],
    queryFn: () => feedbackApi.mine(token),
    enabled: Boolean(user && token),
  });

  // Replies that were unread when this visit saw them. Seeing the list counts
  // as reading them, so the server flag is cleared right away, but the badges
  // come from this snapshot: they stay for the whole visit even when the list
  // refetches (window focus, a new send) with reply_unread already false.
  const [newReplyIds, setNewReplyIds] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const unread = items.filter((item) => item.reply_unread).map((item) => item.id);
    if (unread.length === 0) return;
    setNewReplyIds((prev) => new Set([...prev, ...unread]));
    feedbackApi
      .markSeen(token)
      .then(() => qc.invalidateQueries({ queryKey: ["feedback-unread"] }))
      .catch(() => {
        /* the dot stays; the next visit retries */
      });
  }, [items, token, qc]);

  // Long messages the user has opened on this visit.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(() => new Set());
  const toggleExpanded = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Arriving from the form's "See your feedback" link (/profile#my-feedback).
  useEffect(() => {
    if (isSuccess && location.hash === "#my-feedback") {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isSuccess, location.hash]);

  const locale = i18n.language === "bn" ? "bn-BD" : "en-US";

  return (
    <div
      id="my-feedback"
      ref={cardRef}
      className="mt-6 mb-8 scroll-mt-24 bg-card border border-border rounded-xl overflow-hidden shadow-soft"
    >
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <h2 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
          <MessagesSquare className="h-5 w-5 text-primary" />
          {t("feedback.myTitle")}
        </h2>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/feedback" state={{ from: "/profile" }}>
            {t("feedback.navLink")}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-10 text-center text-muted-foreground text-sm">{t("feedback.myEmpty")}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = FEEDBACK_TYPE_ICON[item.type];
            const expanded = expandedIds.has(item.id);
            const isLong = item.message.length > LONG_MESSAGE_CHARS || item.message.split("\n").length > CLAMP_LINES;
            return (
              <li key={item.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground/80">{t(`feedback.types.${item.type}`)}</span>
                  <span>·</span>
                  <span>{new Date(item.created_at).toLocaleDateString(locale)}</span>
                  <Badge variant="outline" className={cn("ml-auto text-xs", FEEDBACK_STATUS_CLASS[item.status])}>
                    {t(`feedback.status.${item.status}`)}
                  </Badge>
                </div>
                <p className={cn("text-sm text-foreground/80 whitespace-pre-wrap break-words", isLong && !expanded && "line-clamp-4")}>
                  {item.message}
                </p>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(item.id)}
                    aria-expanded={expanded}
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                  >
                    {expanded ? t("feedback.showLess") : t("feedback.showMore")}
                  </button>
                )}

                {item.admin_reply && (
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
                      <span className="font-semibold text-primary">{t("feedback.replyFrom")}</span>
                      {item.replied_at && (
                        <span className="text-muted-foreground">· {new Date(item.replied_at).toLocaleDateString(locale)}</span>
                      )}
                      {newReplyIds.has(item.id) && <Badge className="ml-auto text-[10px] px-1.5 py-0">{t("feedback.newReply")}</Badge>}
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">{item.admin_reply}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
