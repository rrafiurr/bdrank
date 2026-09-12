import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { feedbackApi } from "@/lib/feedbackApi";

/**
 * How many of the signed-in user's feedback items have a reply they haven't
 * seen yet. It drives the header dot. It is cached for a minute so moving
 * between pages doesn't refetch every time, and MyFeedback invalidates it
 * after marking replies read. A failure counts as zero: a missing dot must
 * never break the header.
 */
export function useFeedbackUnread(): number {
  const { user, token } = useAuth();
  const { data } = useQuery({
    queryKey: ["feedback-unread", user?.id],
    queryFn: () => feedbackApi.unread(token),
    enabled: Boolean(user && token),
    staleTime: 60_000,
    retry: false,
  });
  return user ? data ?? 0 : 0;
}
