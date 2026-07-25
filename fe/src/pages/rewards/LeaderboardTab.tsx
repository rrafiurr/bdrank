import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { rewardsApi, type LeaderboardEntry } from "@/lib/rewardsApi";
import { UserAvatar } from "@/components/UserAvatar";
import { LevelBadge } from "@/components/LevelBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIMEFRAMES = [
  { value: "all", label: "All-time" },
  { value: "month", label: "This month" },
  { value: "week", label: "This week" },
  { value: "today", label: "Today" },
] as const;
type Timeframe = (typeof TIMEFRAMES)[number]["value"];
const PAGE_SIZE = 50;
const MEDALS = ["🥇", "🥈", "🥉"];

function Row({ entry, fallbackName }: { entry: LeaderboardEntry; fallbackName?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border px-3 py-2",
        entry.is_me && "border-primary/50 bg-primary/5",
      )}
    >
      <span className="w-8 shrink-0 text-center font-semibold text-muted-foreground">
        {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
      </span>
      <UserAvatar name={entry.username || fallbackName || ""} src={entry.avatar_url} size="xs" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground">
            {entry.username || fallbackName}
          </span>
          {entry.level && (
            <LevelBadge name={entry.level.name} icon={entry.level.icon} color={entry.level.color} />
          )}
        </div>
      </div>
      <span className="shrink-0 font-semibold text-foreground">{entry.points} pts</span>
    </div>
  );
}

export function LeaderboardTab() {
  const { token } = useAuth();
  const [timeframe, setTimeframe] = useState<Timeframe>("all");

  const q = useInfiniteQuery({
    queryKey: ["leaderboard", timeframe],
    queryFn: ({ pageParam }) => rewardsApi.leaderboard(token, timeframe, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.entries.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: !!token,
  });

  const entries = q.data?.pages.flatMap((p) => p.entries) ?? [];
  const me = q.data?.pages[0]?.me;
  const meInList = entries.some((e) => e.is_me);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TIMEFRAMES.map((tf) => (
          <Button
            key={tf.value}
            size="sm"
            variant={tf.value === timeframe ? "default" : "outline"}
            onClick={() => setTimeframe(tf.value)}
          >
            {tf.label}
          </Button>
        ))}
      </div>

      {q.isError ? (
        <p className="py-8 text-center text-destructive">Could not load the leaderboard.</p>
      ) : q.isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No one's on the board yet</p>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((e) => (
              <Row key={e.user_id} entry={e} />
            ))}
          </div>

          {q.hasNextPage && (
            <div className="text-center">
              <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}

          {me && !me.unranked && !meInList && (
            <div className="pt-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your rank
              </p>
              <Row
                entry={{
                  rank: me.rank,
                  user_id: -1,
                  username: "",
                  avatar_url: "",
                  level: null,
                  points: me.points,
                  is_me: true,
                }}
                fallbackName="You"
              />
            </div>
          )}

          {me && me.unranked && (
            <p className="pt-2 text-center text-sm text-muted-foreground">
              Earn points to join the board
            </p>
          )}
        </>
      )}
    </div>
  );
}
