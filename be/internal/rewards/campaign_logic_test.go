package rewards

import (
	"errors"
	"testing"
	"time"
)

func TestAchievedGoalIDs(t *testing.T) {
	goals := []CampaignGoal{
		{ID: 1, ThresholdPoints: 100},
		{ID: 2, ThresholdPoints: 250},
		{ID: 3, ThresholdPoints: 500},
	}
	got := AchievedGoalIDs(goals, 250)
	if len(got) != 2 || got[0] != 1 || got[1] != 2 {
		t.Fatalf("250 -> %v want [1 2]", got)
	}
	if len(AchievedGoalIDs(goals, 50)) != 0 {
		t.Fatalf("50 should achieve none")
	}
}

func TestValidateRedeem(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	open := Campaign{IsActive: true, StartsAt: now.Add(-24 * time.Hour), EndsAt: now.Add(24 * time.Hour)}
	goals := []CampaignGoal{{ID: 1, ThresholdPoints: 100}, {ID: 2, ThresholdPoints: 250}}

	if err := ValidateRedeem(open, goals, nil, 1, 120, now); err != nil {
		t.Fatalf("valid redeem errored: %v", err)
	}
	if err := ValidateRedeem(open, goals, nil, 2, 120, now); !errors.Is(err, ErrGoalNotAchieved) {
		t.Fatalf("unachieved goal -> %v want ErrGoalNotAchieved", err)
	}
	redeemed := &CampaignProgress{Status: "redeemed", RedeemedGoalID: ptr64(1)}
	if err := ValidateRedeem(open, goals, redeemed, 2, 300, now); !errors.Is(err, ErrAlreadyRedeemed) {
		t.Fatalf("second redeem -> %v want ErrAlreadyRedeemed", err)
	}
	ended := Campaign{IsActive: true, StartsAt: now.Add(-48 * time.Hour), EndsAt: now.Add(-time.Hour)}
	if err := ValidateRedeem(ended, goals, nil, 1, 120, now); !errors.Is(err, ErrCampaignClosed) {
		t.Fatalf("ended -> %v want ErrCampaignClosed", err)
	}
	if err := ValidateRedeem(open, goals, nil, 99, 120, now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown goal -> %v want ErrNotFound", err)
	}
}

func ptr64(n int64) *int64 { return &n }
