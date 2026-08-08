import { UserAvatar } from "@/components/UserAvatar";
import { LevelBadge } from "@/components/LevelBadge";
import { useTranslation } from "react-i18next";
import type { ApiComment } from "@/lib/api";

/**
 * Avatar, name, and level badge for one comment. Used by both comment cards on
 * the review detail page so the anonymity rule lives in exactly one place: a
 * masked comment (the review author replying on their own anonymous review)
 * arrives with `author: null` and `is_anonymous: true`, and must never fall
 * back to a real name.
 *
 * Owns the avatar plus the whole `flex-1` content column (name/badge/timestamp
 * row, then whatever the card passes as `children` below it — body text, like
 * button, etc). Each card keeps its own outer wrapper (border, header strip,
 * `Card`/`CardContent`) and just renders `<div className="flex gap-4">` around
 * this component.
 */
interface CommentAuthorProps {
  comment: ApiComment;
  /** Extra classes for the avatar — the owner-reply card rings it. */
  avatarClassName?: string;
  /** Rendered in the name row, after the badge — the formatted timestamp. */
  timestamp?: React.ReactNode;
  /** Rendered below the name row — the comment body and like button. */
  children?: React.ReactNode;
}

export function CommentAuthor({ comment, avatarClassName, timestamp, children }: CommentAuthorProps) {
  const { t } = useTranslation();
  const name = comment.is_anonymous
    ? t("review.anonymous")
    : comment.author?.username ?? "";

  return (
    <>
      <UserAvatar
        name={comment.is_anonymous ? "" : name}
        src={comment.is_anonymous ? undefined : comment.author?.avatar_url}
        size="sm"
        anonymous={comment.is_anonymous}
        className={avatarClassName}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-foreground">{name}</span>
          {comment.author_badge && <LevelBadge {...comment.author_badge} />}
          {timestamp}
        </div>
        {children}
      </div>
    </>
  );
}
