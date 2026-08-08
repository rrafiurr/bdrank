import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A single, consistent avatar for the whole app. Shows the uploaded image when
 * `src` is present; otherwise renders a deterministic letter-avatar derived
 * from `name` (first character + a stable per-user color).
 */

// Fixed color pairs (not theme variables) so a given user always looks the
// same in light and dark. Each pair has readable contrast on its background.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "bg-rose-500", fg: "text-white" },
  { bg: "bg-orange-500", fg: "text-white" },
  { bg: "bg-amber-500", fg: "text-black" },
  { bg: "bg-emerald-500", fg: "text-white" },
  { bg: "bg-teal-500", fg: "text-white" },
  { bg: "bg-sky-500", fg: "text-white" },
  { bg: "bg-indigo-500", fg: "text-white" },
  { bg: "bg-fuchsia-500", fg: "text-white" },
];

const SIZES = {
  xs: { box: "h-8 w-8", text: "text-xs" },
  sm: { box: "h-10 w-10", text: "text-sm" },
  md: { box: "h-12 w-12", text: "text-base" },
  lg: { box: "h-16 w-16", text: "text-xl" },
  xl: { box: "h-24 w-24", text: "text-2xl" },
} as const;

export type AvatarSize = keyof typeof SIZES;

/** First alphanumeric character of `name`, uppercased; "?" when empty. */
function initialOf(name: string): string {
  const match = (name ?? "").trim().match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : "?";
}

/** Stable palette index from a string hash — same name → same color. */
function colorFor(name: string): { bg: string; fg: string } {
  let hash = 0;
  const s = name ?? "";
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Render a neutral icon instead of a letter-avatar, for anonymous authors. */
  anonymous?: boolean;
}

export function UserAvatar({ name, src, size = "sm", className, anonymous }: UserAvatarProps) {
  const { box, text } = SIZES[size];

  // Anonymous authors get one identical neutral avatar. No per-user color and
  // no initial, so two anonymous reviews cannot be linked by their avatar.
  if (anonymous) {
    return (
      <Avatar className={cn(box, className)}>
        <AvatarFallback className="bg-muted text-muted-foreground">
          <UserRound className="h-1/2 w-1/2" />
        </AvatarFallback>
      </Avatar>
    );
  }

  const { bg, fg } = colorFor(name);

  return (
    <Avatar className={cn(box, className)}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className={cn(bg, fg, text, "font-semibold")}>
        {initialOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
