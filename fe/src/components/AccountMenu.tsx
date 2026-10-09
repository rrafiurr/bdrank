import { Link, useLocation } from "react-router-dom";
import { User, LogOut, LayoutDashboard, Code2, MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useFeedbackUnread } from "@/hooks/useFeedbackUnread";
import { cn } from "@/lib/utils";

/**
 * The signed-in user's avatar button and its menu. Renders nothing while
 * signed out — callers show their own sign-in link in that case.
 */
export function AccountMenu({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const unreadReplies = useFeedbackUnread();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative rounded-full h-9 w-9 p-0", className)}>
          <UserAvatar name={user.username || user.email} src={user.avatar_url} size="xs" />
          {unreadReplies > 0 && (
            <>
              <span
                className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background"
                aria-hidden="true"
              />
              <span className="sr-only">{t("feedback.unreadLabel")}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-2xl shadow-elevated">
        <div className="px-3 py-2">
          <p className="text-sm font-semibold">{user.full_name || user.username || "User"}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
          <Link to="/profile" className="flex items-center">
            <User className="h-4 w-4 mr-2" />
            {t("common.myProfile")}
            {unreadReplies > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
          <Link to="/feedback" state={{ from: location.pathname }} className="flex items-center">
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            {t("feedback.navLink")}
          </Link>
        </DropdownMenuItem>
        {user.is_product_owner && (
          <>
            <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
              <Link to="/owner-dashboard" className="flex items-center">
                <LayoutDashboard className="h-4 w-4 mr-2" />
                {t("nav.ownerDashboard")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
              <Link to="/owner-embed" className="flex items-center">
                <Code2 className="h-4 w-4 mr-2" />
                {t("nav.embedCodes")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="text-destructive focus:text-destructive cursor-pointer rounded-xl mx-1 mb-1"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
