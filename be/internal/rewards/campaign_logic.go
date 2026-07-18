package rewards

import "time"

// AchievedGoalIDs returns the ids of goals whose threshold is met by points,
// in ascending threshold order.
func AchievedGoalIDs(goals []CampaignGoal, points int) []int64 {
	var out []int64
	for _, g := range goals {
		if points >= g.ThresholdPoints {
			out = append(out, g.ID)
		}
	}
	return out
}

// ValidateRedeem enforces the campaign redeem state machine.
func ValidateRedeem(c Campaign, goals []CampaignGoal, prog *CampaignProgress, goalID int64, points int, now time.Time) error {
	if !c.IsActive || now.Before(c.StartsAt) || now.After(c.EndsAt) {
		return ErrCampaignClosed
	}
	if prog != nil && prog.Status == "redeemed" {
		return ErrAlreadyRedeemed
	}
	var goal *CampaignGoal
	for i := range goals {
		if goals[i].ID == goalID {
			goal = &goals[i]
			break
		}
	}
	if goal == nil {
		return ErrNotFound
	}
	if points < goal.ThresholdPoints {
		return ErrGoalNotAchieved
	}
	return nil
}
