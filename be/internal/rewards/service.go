package rewards

import (
	"context"
	"database/sql"
	"time"
)

type Service struct {
	repo *Repo
	db   *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{repo: NewRepo(db), db: db} }

// Award grants points for an event. Silent no-op on unknown/inactive rule or
// when a cap is reached. Never returns an error the caller should treat as fatal.
func (s *Service) Award(ctx context.Context, userID int64, eventType, refType string, refID int64) error {
	rule, err := s.repo.RuleByType(ctx, eventType)
	if err == ErrNotFound || (rule != nil && !rule.IsActive) {
		return nil
	}
	if err != nil {
		return err
	}
	if rule.Points == 0 {
		return nil
	}
	_, err = s.repo.AwardAtomic(ctx, userID, rule, refType, refID)
	return err
}

func (s *Service) Me(ctx context.Context, userID int64) (*MeView, error) {
	points, lifetime, err := s.repo.Balance(ctx, userID)
	if err != nil {
		return nil, err
	}
	levels, err := s.repo.ListActiveLevels(ctx)
	if err != nil {
		return nil, err
	}
	next, need := NextLevel(levels, lifetime)
	return &MeView{
		Points: points, LifetimePoints: lifetime,
		CurrentLevel: LevelFor(levels, lifetime), NextLevel: next, PointsToNext: need,
	}, nil
}

func (s *Service) History(ctx context.Context, userID int64, limit, offset int) ([]Transaction, int, error) {
	return s.repo.Transactions(ctx, userID, limit, offset)
}

func (s *Service) Levels(ctx context.Context) ([]Level, error) { return s.repo.ListActiveLevels(ctx) }

func (s *Service) Items(ctx context.Context, userID int64) ([]Item, error) {
	items, err := s.repo.ListItems(ctx, true)
	if err != nil {
		return nil, err
	}
	points, _, err := s.repo.Balance(ctx, userID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].CanAfford = points >= items[i].PointsCost
	}
	return items, nil
}

func (s *Service) Redeem(ctx context.Context, userID, itemID int64) (*Redemption, error) {
	item, err := s.repo.ItemByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	return s.repo.RedeemItem(ctx, userID, item)
}

func (s *Service) MyRedemptions(ctx context.Context, userID int64) ([]Redemption, error) {
	return s.repo.MyRedemptions(ctx, userID)
}

func (s *Service) Campaigns(ctx context.Context, userID int64) ([]CampaignView, error) {
	now := time.Now().UTC()
	camps, err := s.repo.ActiveCampaigns(ctx, now)
	if err != nil {
		return nil, err
	}
	out := make([]CampaignView, 0, len(camps))
	for i := range camps {
		c := camps[i]
		pts, err := s.repo.WindowPoints(ctx, userID, c.StartsAt, c.EndsAt)
		if err != nil {
			return nil, err
		}
		prog, err := s.repo.Progress(ctx, c.ID, userID)
		if err != nil {
			return nil, err
		}
		v := CampaignView{Campaign: c, MyPoints: pts, MyStatus: "active",
			AchievedGoalIDs: AchievedGoalIDs(c.Goals, pts)}
		if prog != nil {
			v.RedeemedGoalID = prog.RedeemedGoalID
			v.MyStatus = prog.Status
		}
		out = append(out, v)
	}

	ended, err := s.repo.EndedCampaignsSince(ctx, now.Add(-30*24*time.Hour), now)
	if err != nil {
		return nil, err
	}
	for i := range ended {
		c := ended[i]
		pts, err := s.repo.WindowPoints(ctx, userID, c.StartsAt, c.EndsAt)
		if err != nil {
			return nil, err
		}
		achieved := AchievedGoalIDs(c.Goals, pts)
		prog, err := s.repo.Progress(ctx, c.ID, userID)
		if err != nil {
			return nil, err
		}
		if len(achieved) == 0 && prog == nil {
			continue
		}
		v := CampaignView{Campaign: c, MyPoints: pts, MyStatus: "expired", AchievedGoalIDs: achieved}
		if prog != nil {
			v.RedeemedGoalID = prog.RedeemedGoalID
			v.MyStatus = prog.Status
		}
		out = append(out, v)
	}
	return out, nil
}

func (s *Service) RedeemCampaignGoal(ctx context.Context, userID, campaignID, goalID int64) (*Redemption, error) {
	camp, err := s.repo.CampaignByID(ctx, campaignID)
	if err != nil {
		return nil, err
	}
	pts, err := s.repo.WindowPoints(ctx, userID, camp.StartsAt, camp.EndsAt)
	if err != nil {
		return nil, err
	}
	prog, err := s.repo.Progress(ctx, campaignID, userID)
	if err != nil {
		return nil, err
	}
	if err := ValidateRedeem(*camp, camp.Goals, prog, goalID, pts, time.Now().UTC()); err != nil {
		return nil, err
	}
	var goal *CampaignGoal
	for i := range camp.Goals {
		if camp.Goals[i].ID == goalID {
			goal = &camp.Goals[i]
		}
	}
	return s.repo.GrantCampaignGoal(ctx, userID, camp, goal)
}

func (s *Service) LevelsForUsers(ctx context.Context, userIDs []int64) (map[int64]Level, error) {
	return s.repo.LevelsForUsers(ctx, userIDs)
}

func BadgeOf(l *Level) *Badge {
	if l == nil {
		return nil
	}
	return &Badge{Name: l.Name, Icon: l.Icon, Color: l.Color}
}

// Admin passthroughs
func (s *Service) AdminRules(ctx context.Context) ([]Rule, error) { return s.repo.AllRules(ctx) }
func (s *Service) AdminCreateRule(ctx context.Context, r *Rule) (int64, error) {
	return s.repo.CreateRule(ctx, r)
}
func (s *Service) AdminUpdateRule(ctx context.Context, r *Rule) error {
	return s.repo.UpdateRule(ctx, r)
}
func (s *Service) AdminLevels(ctx context.Context) ([]Level, error) { return s.repo.ListAllLevels(ctx) }
func (s *Service) AdminCreateLevel(ctx context.Context, l *Level) (int64, error) {
	return s.repo.CreateLevel(ctx, l)
}
func (s *Service) AdminUpdateLevel(ctx context.Context, l *Level) error {
	return s.repo.UpdateLevel(ctx, l)
}
func (s *Service) AdminDeleteLevel(ctx context.Context, id int64) error {
	return s.repo.DeleteLevel(ctx, id)
}
func (s *Service) AdminItems(ctx context.Context) ([]Item, error) {
	return s.repo.ListItems(ctx, false)
}
func (s *Service) AdminCreateItem(ctx context.Context, it *Item) (int64, error) {
	return s.repo.CreateItem(ctx, it)
}
func (s *Service) AdminUpdateItem(ctx context.Context, it *Item) error {
	return s.repo.UpdateItem(ctx, it)
}
func (s *Service) AdminDeleteItem(ctx context.Context, id int64) error {
	return s.repo.DeleteItem(ctx, id)
}
func (s *Service) AdminAddCodes(ctx context.Context, itemID int64, codes []string) (int, error) {
	return s.repo.AddCouponCodes(ctx, itemID, codes)
}
func (s *Service) AdminRedemptions(ctx context.Context, status string) ([]Redemption, error) {
	return s.repo.AdminRedemptions(ctx, status)
}
func (s *Service) AdminResolveRedemption(ctx context.Context, id int64, status, note string) error {
	return s.repo.ResolveRedemption(ctx, id, status, note)
}
func (s *Service) AdminCampaigns(ctx context.Context) ([]Campaign, error) {
	return s.repo.AllCampaigns(ctx)
}
func (s *Service) AdminCampaign(ctx context.Context, id int64) (*Campaign, error) {
	return s.repo.CampaignByID(ctx, id)
}
func (s *Service) AdminCreateCampaign(ctx context.Context, c *Campaign) (int64, error) {
	return s.repo.CreateCampaign(ctx, c)
}
func (s *Service) AdminUpdateCampaign(ctx context.Context, c *Campaign) error {
	return s.repo.UpdateCampaign(ctx, c)
}
func (s *Service) AdminDeleteCampaign(ctx context.Context, id int64) error {
	return s.repo.DeleteCampaign(ctx, id)
}
func (s *Service) AdminCreateGoal(ctx context.Context, g *CampaignGoal) (int64, error) {
	return s.repo.CreateGoal(ctx, g)
}
func (s *Service) AdminUpdateGoal(ctx context.Context, g *CampaignGoal) error {
	return s.repo.UpdateGoal(ctx, g)
}
func (s *Service) AdminCreateGoalOrdered(ctx context.Context, g *CampaignGoal) (int64, error) {
	return s.repo.CreateGoalOrdered(ctx, g)
}
func (s *Service) AdminUpdateGoalOrdered(ctx context.Context, g *CampaignGoal) error {
	return s.repo.UpdateGoalOrdered(ctx, g)
}
func (s *Service) AdminDeleteGoal(ctx context.Context, id int64) error {
	return s.repo.DeleteGoal(ctx, id)
}
func (s *Service) AdminParticipants(ctx context.Context, campaignID int64) ([]Participant, error) {
	return s.repo.CampaignParticipants(ctx, campaignID)
}
