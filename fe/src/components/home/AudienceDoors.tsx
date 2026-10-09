import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Code2, MessageSquareReply, QrCode, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Container, Eyebrow } from "./bits";
import { useLeaderboard, type LeaderboardRange } from "./useHomeData";

const RANK_COLORS = ["text-[#c27a00]", "text-[#8f969e]", "text-[#9a6233]"];
const RANGES: LeaderboardRange[] = ["week", "month", "all"];

function Leaderboard({ narrow }: { narrow: boolean }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<LeaderboardRange>("week");
  // Phones show this week's top three, without the range switch.
  const active = narrow ? "week" : range;
  const { isLoading, isError, entries } = useLeaderboard(active, 5);
  const shown = narrow ? entries.slice(0, 3) : entries;

  return (
    <div className="rounded-[14px] bg-bd-soft px-3 py-2.5 sm:rounded-2xl sm:p-3.5">
      <div className="mb-1 flex items-center justify-between gap-2 sm:mb-2">
        <b className="text-xs text-bd-muted sm:text-sm sm:text-bd-navy">
          {narrow ? t("landing.rewards.topWeek") : t("landing.rewards.top")}
        </b>
        {!narrow && (
          <div role="group" className="flex rounded-full bg-bd-toggle p-0.5 text-xs font-semibold">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cn("rounded-full px-2.5 py-[3px] text-bd-navy", range === r ? "bg-white" : "bg-transparent")}
              >
                {t(`landing.rewards.range.${r}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="h-[150px] animate-pulse rounded-xl bg-bd-toggle/60" />
      ) : isError || shown.length === 0 ? (
        <p className="m-0 px-1 py-4 text-sm text-bd-muted">{t("landing.rewards.empty")}</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {shown.map((e, i) => (
            <li key={e.user_id} className="flex items-center gap-2.5 px-0 py-1.5 text-sm sm:px-1 sm:py-[7px]">
              <span className={cn("w-4 text-center font-bold sm:w-5", RANK_COLORS[i] ?? "text-bd-faint")}>{e.rank}</span>
              <UserAvatar name={e.username} src={e.avatar_url} size="xs" className="h-[26px] w-[26px] text-[11px] sm:h-7 sm:w-7 sm:text-xs" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {e.username}{" "}
                {e.level && <span className="hidden text-xs font-semibold text-bd-badge sm:inline">{e.level.name}</span>}
              </span>
              <span className="font-label text-xs font-medium text-bd-ink2 sm:text-[13px]">
                {t("landing.rewards.points", { value: e.points })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: "qr", icon: QrCode },
  { key: "replies", icon: MessageSquareReply },
  { key: "widget", icon: Code2 },
];

/** Two doors: rewards for reviewers, tools for businesses. */
export function AudienceDoors({ narrow }: { narrow: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <section className="pb-8 pt-7 sm:pb-[72px] sm:pt-16">
      <Container>
        <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(340px,1fr))] sm:gap-5">
          <div id="rewards" className="flex flex-col gap-3 rounded-[20px] border border-bd-line bg-white p-[18px] sm:gap-[18px] sm:rounded-3xl sm:p-7">
            <div>
              <Eyebrow className="text-bd-amber-ink">{t("landing.rewards.eyebrow")}</Eyebrow>
              <h3 className="bd-display m-0 font-display text-[21px] font-bold leading-[1.2] tracking-[-0.02em] sm:mb-1.5 sm:text-[26px] sm:leading-[1.15]">
                {t("landing.rewards.title")}
              </h3>
              <p className="m-0 hidden text-[15px] leading-normal text-bd-muted sm:block">{t("landing.rewards.body")}</p>
            </div>
            <Leaderboard narrow={narrow} />
            <div className="mt-auto flex flex-wrap gap-2.5 pt-0.5">
              <Link
                to={user ? "/rewards" : "/auth"}
                className="w-full rounded-full bg-bd-navy px-5 py-3 text-center text-[15px] font-semibold text-white transition-colors hover:bg-bd-amber hover:text-bd-navy sm:w-auto sm:py-[11px]"
              >
                {user ? t("landing.rewards.mine") : t("landing.rewards.join")}
              </Link>
              <Link to="/rewards" className="hidden px-2 py-[11px] text-[15px] font-semibold text-bd-navy hover:text-bd-amber-ink sm:block">
                {t("landing.rewards.leaderboard")} →
              </Link>
            </div>
          </div>

          {/* Phones get a single tappable card; wider screens the full door. */}
          <Link
            to="/owner-register"
            className="flex items-center gap-3.5 rounded-[20px] border border-bd-tint-line bg-bd-tint p-[18px] text-bd-navy hover:text-bd-navy sm:hidden"
          >
            <span className="flex-1">
              <Eyebrow className="text-bd-logo">{t("landing.business.eyebrow")}</Eyebrow>
              <span className="bd-display mb-1 block font-display text-lg font-bold leading-[1.2]">{t("landing.business.claim")}</span>
              <span className="text-[13px] leading-[1.4] text-[#4b5263]">{t("landing.business.summary")}</span>
            </span>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-bd-logo text-white">
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>

          <div id="business" className="hidden flex-col gap-[18px] rounded-3xl border border-bd-tint-line bg-bd-tint p-7 sm:flex">
            <div>
              <Eyebrow className="text-bd-logo">{t("landing.business.eyebrow")}</Eyebrow>
              <h3 className="bd-display m-0 mb-1.5 font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em]">
                {t("landing.business.title")}
              </h3>
              <p className="m-0 text-[15px] leading-normal text-[#4b5263]">{t("landing.business.body")}</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
              {FEATURES.map(({ key, icon: Icon }) => (
                <div key={key} className="rounded-[14px] bg-white p-3.5">
                  <span className="mb-2.5 grid h-[72px] place-items-center rounded-lg bg-[repeating-linear-gradient(135deg,#e7ebf3_0_5px,#f3f5f9_5px_10px)]">
                    <Icon className="h-7 w-7 text-bd-logo" aria-hidden />
                  </span>
                  <b className="text-sm">{t(`landing.business.${key}Title`)}</b>
                  <div className="text-[13px] leading-[1.4] text-[#5f6676]">{t(`landing.business.${key}Body`)}</div>
                </div>
              ))}
            </div>
            <div className="mt-auto flex flex-wrap gap-2.5">
              <Link
                to="/owner-register"
                className="rounded-full bg-bd-logo px-5 py-[11px] text-[15px] font-semibold text-white hover:bg-bd-navy hover:text-white"
              >
                {t("landing.business.claim")}
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
