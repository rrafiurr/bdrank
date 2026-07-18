package rewards

import "time"

// ── DB rows ─────────────────────────────────────────────────────────────
type Rule struct {
	ID          int64     `json:"id"`
	EventType   string    `json:"event_type"`
	Points      int       `json:"points"`
	DailyCap    *int      `json:"daily_cap"`
	LifetimeCap *int      `json:"lifetime_cap"`
	IsActive    bool      `json:"is_active"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Transaction struct {
	ID        int64     `json:"id"`
	EventType string    `json:"event_type"`
	Points    int       `json:"points"`
	RefType   string    `json:"ref_type"`
	RefID     *int64    `json:"ref_id"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
}

type Level struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	MinPoints int    `json:"min_points"`
	Icon      string `json:"icon"`
	Color     string `json:"color"`
	IsActive  bool   `json:"is_active"`
}

type Item struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	ImageURL        string `json:"image_url"`
	PointsCost      int    `json:"points_cost"`
	FulfillmentType string `json:"fulfillment_type"` // coupon | manual
	Stock           *int   `json:"stock"`
	IsActive        bool   `json:"is_active"`
	// computed for user-facing list:
	EffectiveStock *int `json:"effective_stock,omitempty"`
	CanAfford      bool `json:"can_afford,omitempty"`
}

type Redemption struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"user_id"`
	ItemID      *int64     `json:"item_id"`
	ItemName    string     `json:"item_name"`
	PointsSpent int        `json:"points_spent"`
	Status      string     `json:"status"`
	CouponCode  string     `json:"coupon_code"`
	AdminNote   string     `json:"admin_note"`
	CreatedAt   time.Time  `json:"created_at"`
	ResolvedAt  *time.Time `json:"resolved_at"`
	UserEmail   string     `json:"user_email,omitempty"` // admin list only
}

type Campaign struct {
	ID          int64          `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	ImageURL    string         `json:"image_url"`
	StartsAt    time.Time      `json:"starts_at"`
	EndsAt      time.Time      `json:"ends_at"`
	IsActive    bool           `json:"is_active"`
	CreatedAt   time.Time      `json:"created_at"`
	Goals       []CampaignGoal `json:"goals,omitempty"`
}

type CampaignGoal struct {
	ID              int64  `json:"id"`
	CampaignID      int64  `json:"campaign_id"`
	Name            string `json:"name"`
	ThresholdPoints int    `json:"threshold_points"`
	SortOrder       int    `json:"sort_order"`
	RewardPoints    int    `json:"reward_points"`
	RewardItemID    *int64 `json:"reward_item_id"`
}

type CampaignProgress struct {
	CampaignID     int64      `json:"campaign_id"`
	UserID         int64      `json:"user_id"`
	RedeemedGoalID *int64     `json:"redeemed_goal_id"`
	Status         string     `json:"status"`
	RedeemedAt     *time.Time `json:"redeemed_at"`
}

// ── API views ───────────────────────────────────────────────────────────
type Badge struct {
	Name  string `json:"name"`
	Icon  string `json:"icon"`
	Color string `json:"color"`
}

type MeView struct {
	Points         int    `json:"points"`
	LifetimePoints int    `json:"lifetime_points"`
	CurrentLevel   *Level `json:"current_level"`
	NextLevel      *Level `json:"next_level"`
	PointsToNext   int    `json:"points_to_next"`
}

type CampaignView struct {
	Campaign
	MyPoints        int     `json:"my_points"`
	RedeemedGoalID  *int64  `json:"redeemed_goal_id"`
	MyStatus        string  `json:"my_status"` // active | redeemed | expired
	AchievedGoalIDs []int64 `json:"achieved_goal_ids"`
}
