package rewards

import "errors"

var (
	ErrInsufficientPoints = errors.New("insufficient points")
	ErrItemInactive       = errors.New("item is not available")
	ErrOutOfStock         = errors.New("out of stock")
	ErrGoalNotAchieved    = errors.New("goal not yet achieved")
	ErrAlreadyRedeemed    = errors.New("already redeemed a goal in this campaign")
	ErrCampaignClosed     = errors.New("campaign is not open for redemption")
	ErrNotFound           = errors.New("not found")
	ErrValidation         = errors.New("validation error")
)
