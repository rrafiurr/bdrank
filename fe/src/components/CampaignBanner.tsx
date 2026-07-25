import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";
import type { CampaignView, RewardGoal } from "@/lib/rewardsApi";

/** Lowest-threshold goal the user has not yet achieved, or null if all done. */
function nextGoal(campaign: CampaignView): RewardGoal | null {
  const achieved = new Set(campaign.achieved_goal_ids ?? []);
  const remaining = campaign.goals
    .filter((g) => !achieved.has(g.id))
    .sort((a, b) => a.threshold_points - b.threshold_points);
  return remaining[0] ?? null;
}

export function CampaignBanner({ campaign }: { campaign: CampaignView }) {
  const { t } = useTranslation();
  const goal = nextGoal(campaign);
  const hasGoals = campaign.goals.length > 0;
  const pct = goal ? Math.min(100, Math.round((campaign.my_points / goal.threshold_points) * 100)) : 100;

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-soft">
      {/* Background: campaign image, else warm gradient */}
      {campaign.image_url ? (
        <img
          src={campaign.image_url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-warm" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/60 to-foreground/30" />

      <div className="relative p-5 sm:p-6">
        <h3 className="font-serif text-xl font-bold text-background">{campaign.name}</h3>
        {campaign.description && (
          <p className="mt-1 text-sm text-background/85 line-clamp-2">{campaign.description}</p>
        )}

        {hasGoals && (
          <div className="mt-4 max-w-md">
            {goal ? (
              <>
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-background/90">
                  <span>{goal.name}</span>
                  <span>
                    {t("campaignBanner.progress", {
                      points: campaign.my_points,
                      threshold: goal.threshold_points,
                    })}
                  </span>
                </div>
                <Progress value={pct} className="h-2 bg-background/30" />
              </>
            ) : (
              <p className="text-sm font-medium text-background">{t("campaignBanner.allGoalsReached")}</p>
            )}
          </div>
        )}

        <Link to="/rewards" className="mt-4 inline-block">
          <Button variant="secondary" size="sm" className="group">
            {t("campaignBanner.view")}
            <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
