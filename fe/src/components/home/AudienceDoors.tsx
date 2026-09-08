import { Link } from "react-router-dom";
import { ArrowRight, Trophy, QrCode } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { rewardsApi, type LeaderboardEntry } from "@/lib/rewardsApi";
import { UserAvatar } from "@/components/UserAvatar";
import { useTranslation } from "react-i18next";

/** Five weekly leaders, or null when the leaderboard is empty or unavailable. */
function useTopReviewers() {
  const { data } = useQuery({
    queryKey: ["home-top-reviewers"],
    // Explicit null token: this runs for signed-out visitors too, and the
    // endpoint is mounted under optional auth so it will not 401 them away.
    queryFn: () => rewardsApi.leaderboard(null, "week", 5, 0),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const entries = data?.entries ?? [];
  return entries.length > 0 ? entries : null;
}

function TopReviewers({ entries }: { entries: LeaderboardEntry[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/85">
        {t("home.topReviewersEyebrow")}
      </p>
      <div className="flex items-start gap-3 lg:gap-4">
        {entries.map((entry) => (
          <div key={entry.user_id} className="flex min-w-0 flex-col items-center gap-1">
            <UserAvatar name={entry.username} src={entry.avatar_url} size="xs" />
            <span className="max-w-[56px] truncate text-[11px] font-medium text-primary-foreground">
              {entry.username.split(" ")[0]}
            </span>
            {/*
              LevelBadge is deliberately not used here. It tints its own
              background from the level's colour, which disappears against the
              warm gradient this card sits on. Every other surface still uses it.
            */}
            {entry.level && (
              <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-semibold text-primary-foreground">
                {entry.level.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AudienceDoors() {
  const { t } = useTranslation();
  const topReviewers = useTopReviewers();

  return (
    <section className="pb-8 pt-5 lg:pb-16 lg:pt-8">
      <div className="container grid gap-3 px-4 lg:grid-cols-2 lg:gap-6">
        {/* Contributors */}
        <Link
          to="/rewards"
          className="flex flex-col gap-3.5 rounded-2xl bg-gradient-warm p-6 shadow-soft transition-shadow hover:shadow-elevated lg:p-8"
        >
          {topReviewers ? (
            <TopReviewers entries={topReviewers} />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/20">
              <Trophy className="h-6 w-6 text-primary-foreground" />
            </div>
          )}
          <h3 className="font-serif text-[22px] font-bold leading-tight text-primary-foreground lg:text-[26px]">
            {t("home.rewardsHeading")}
          </h3>
          <p className="text-[15px] leading-relaxed text-primary-foreground/85">
            {t("home.rewardsBody")}
          </p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-foreground">
            {t("home.rewardsLink")}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        {/* Business owners */}
        <Link
          to="/owner-register"
          className="flex flex-col gap-3.5 rounded-2xl border border-border/60 bg-card p-6 shadow-soft transition-shadow hover:shadow-elevated lg:p-8"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary/10">
            <QrCode className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-serif text-[22px] font-bold leading-tight text-card-foreground lg:text-[26px]">
            {t("home.ownerHeading")}
          </h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{t("home.ownerBody")}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            {t("home.ownerLink")}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </section>
  );
}
