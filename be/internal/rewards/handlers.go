package rewards

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"final-review/be/internal/middleware"
	"github.com/go-chi/chi/v5"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
func qInt(r *http.Request, k string, def int) int {
	if v, err := strconv.Atoi(r.URL.Query().Get(k)); err == nil {
		return v
	}
	return def
}
func idParam(r *http.Request, k string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, k), 10, 64)
}

type api struct{ svc *Service }

// ── user ────────────────────────────────────────────────────────────────
func (a *api) me(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	v, err := a.svc.Me(r.Context(), uid)
	if err != nil {
		writeErr(w, 500, "failed to load rewards")
		return
	}
	writeJSON(w, 200, v)
}

func (a *api) history(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	tx, total, err := a.svc.History(r.Context(), uid, qInt(r, "limit", 20), qInt(r, "offset", 0))
	if err != nil {
		writeErr(w, 500, "failed to load history")
		return
	}
	writeJSON(w, 200, map[string]any{"data": tx, "total": total})
}

func (a *api) levels(w http.ResponseWriter, r *http.Request) {
	ls, err := a.svc.Levels(r.Context())
	if err != nil {
		writeErr(w, 500, "failed to load levels")
		return
	}
	writeJSON(w, 200, map[string]any{"data": ls})
}

func (a *api) items(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	its, err := a.svc.Items(r.Context(), uid)
	if err != nil {
		writeErr(w, 500, "failed to load catalog")
		return
	}
	writeJSON(w, 200, map[string]any{"data": its})
}

func (a *api) redeem(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	var body struct {
		ItemID int64 `json:"item_id"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.ItemID == 0 {
		writeErr(w, 400, "item_id is required")
		return
	}
	rd, err := a.svc.Redeem(r.Context(), uid, body.ItemID)
	switch {
	case errors.Is(err, ErrInsufficientPoints):
		writeErr(w, 400, "insufficient points")
	case errors.Is(err, ErrOutOfStock):
		writeErr(w, 400, "out of stock")
	case errors.Is(err, ErrItemInactive):
		writeErr(w, 400, "item is not available")
	case errors.Is(err, ErrNotFound):
		writeErr(w, 404, "item not found")
	case err != nil:
		writeErr(w, 500, "failed to redeem")
	default:
		writeJSON(w, 201, rd)
	}
}

func (a *api) myRedemptions(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	rs, err := a.svc.MyRedemptions(r.Context(), uid)
	if err != nil {
		writeErr(w, 500, "failed to load redemptions")
		return
	}
	writeJSON(w, 200, map[string]any{"data": rs})
}

func (a *api) campaigns(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	cs, err := a.svc.Campaigns(r.Context(), uid)
	if err != nil {
		writeErr(w, 500, "failed to load campaigns")
		return
	}
	writeJSON(w, 200, map[string]any{"data": cs})
}

func (a *api) redeemCampaign(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	cid, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid campaign id")
		return
	}
	var body struct {
		GoalID int64 `json:"goal_id"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.GoalID == 0 {
		writeErr(w, 400, "goal_id is required")
		return
	}
	rd, err := a.svc.RedeemCampaignGoal(r.Context(), uid, cid, body.GoalID)
	switch {
	case errors.Is(err, ErrGoalNotAchieved):
		writeErr(w, 400, "goal not yet achieved")
	case errors.Is(err, ErrAlreadyRedeemed):
		writeErr(w, 400, "you already redeemed a goal in this campaign")
	case errors.Is(err, ErrCampaignClosed):
		writeErr(w, 400, "campaign is closed")
	case errors.Is(err, ErrNotFound):
		writeErr(w, 404, "not found")
	case err != nil:
		writeErr(w, 500, "failed to redeem goal")
	default:
		writeJSON(w, 201, map[string]any{"item_redemption": rd})
	}
}

// ── admin: rules ────────────────────────────────────────────────────────
func (a *api) adminRules(w http.ResponseWriter, r *http.Request) {
	rs, err := a.svc.AdminRules(r.Context())
	if err != nil {
		writeErr(w, 500, "failed to load rules")
		return
	}
	writeJSON(w, 200, map[string]any{"data": rs})
}

func validateRule(rule *Rule) string {
	rule.EventType = strings.ToLower(strings.TrimSpace(rule.EventType))
	if rule.EventType == "" {
		return "event_type is required"
	}
	if rule.Points < 0 {
		return "points must be >= 0"
	}
	if rule.DailyCap != nil && *rule.DailyCap < 1 {
		return "daily_cap must be >= 1"
	}
	if rule.LifetimeCap != nil && *rule.LifetimeCap < 1 {
		return "lifetime_cap must be >= 1"
	}
	return ""
}

func (a *api) adminCreateRule(w http.ResponseWriter, r *http.Request) {
	var rule Rule
	if json.NewDecoder(r.Body).Decode(&rule) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if msg := validateRule(&rule); msg != "" {
		writeErr(w, 400, msg)
		return
	}
	id, err := a.svc.AdminCreateRule(r.Context(), &rule)
	if err != nil {
		writeErr(w, 500, "failed to create rule")
		return
	}
	rule.ID = id
	writeJSON(w, 201, rule)
}

func (a *api) adminUpdateRule(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	var rule Rule
	if json.NewDecoder(r.Body).Decode(&rule) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if msg := validateRule(&rule); msg != "" {
		writeErr(w, 400, msg)
		return
	}
	rule.ID = id
	if err := a.svc.AdminUpdateRule(r.Context(), &rule); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "rule not found")
			return
		}
		writeErr(w, 500, "failed to update rule")
		return
	}
	writeJSON(w, 200, rule)
}

// ── admin: levels ───────────────────────────────────────────────────────
func (a *api) adminLevels(w http.ResponseWriter, r *http.Request) {
	ls, err := a.svc.AdminLevels(r.Context())
	if err != nil {
		writeErr(w, 500, "failed to load levels")
		return
	}
	writeJSON(w, 200, map[string]any{"data": ls})
}

func (a *api) adminCreateLevel(w http.ResponseWriter, r *http.Request) {
	var l Level
	if json.NewDecoder(r.Body).Decode(&l) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if l.Name == "" {
		writeErr(w, 400, "name is required")
		return
	}
	id, err := a.svc.AdminCreateLevel(r.Context(), &l)
	if err != nil {
		writeErr(w, 500, "failed to create level")
		return
	}
	l.ID = id
	writeJSON(w, 201, l)
}

func (a *api) adminUpdateLevel(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	var l Level
	if json.NewDecoder(r.Body).Decode(&l) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if l.Name == "" {
		writeErr(w, 400, "name is required")
		return
	}
	l.ID = id
	if err := a.svc.AdminUpdateLevel(r.Context(), &l); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "level not found")
			return
		}
		writeErr(w, 500, "failed to update level")
		return
	}
	writeJSON(w, 200, l)
}

func (a *api) adminDeleteLevel(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	if err := a.svc.AdminDeleteLevel(r.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "level not found")
			return
		}
		writeErr(w, 500, "failed to delete level")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

// ── admin: items ────────────────────────────────────────────────────────
func (a *api) adminItems(w http.ResponseWriter, r *http.Request) {
	its, err := a.svc.AdminItems(r.Context())
	if err != nil {
		writeErr(w, 500, "failed to load items")
		return
	}
	writeJSON(w, 200, map[string]any{"data": its})
}

func (a *api) adminCreateItem(w http.ResponseWriter, r *http.Request) {
	var it Item
	if json.NewDecoder(r.Body).Decode(&it) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if it.Name == "" || it.PointsCost < 0 {
		writeErr(w, 400, "name and non-negative points_cost required")
		return
	}
	id, err := a.svc.AdminCreateItem(r.Context(), &it)
	if err != nil {
		writeErr(w, 500, "failed to create item")
		return
	}
	it.ID = id
	writeJSON(w, 201, it)
}

func (a *api) adminUpdateItem(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	var it Item
	if json.NewDecoder(r.Body).Decode(&it) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if it.Name == "" || it.PointsCost < 0 {
		writeErr(w, 400, "name and non-negative points_cost required")
		return
	}
	it.ID = id
	if err := a.svc.AdminUpdateItem(r.Context(), &it); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "item not found")
			return
		}
		writeErr(w, 500, "failed to update item")
		return
	}
	writeJSON(w, 200, it)
}

func (a *api) adminDeleteItem(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	if err := a.svc.AdminDeleteItem(r.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "item not found")
			return
		}
		writeErr(w, 500, "failed to delete item")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

func (a *api) adminAddCodes(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	var body struct {
		Codes string `json:"codes"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	var codes []string
	for _, line := range strings.Split(body.Codes, "\n") {
		if c := strings.TrimSpace(line); c != "" {
			codes = append(codes, c)
		}
	}
	if len(codes) == 0 {
		writeErr(w, 400, "codes is required")
		return
	}
	n, err := a.svc.AdminAddCodes(r.Context(), id, codes)
	if err != nil {
		writeErr(w, 500, "failed to add codes")
		return
	}
	writeJSON(w, 201, map[string]any{"added": n})
}

// ── admin: redemptions ──────────────────────────────────────────────────
func (a *api) adminRedemptions(w http.ResponseWriter, r *http.Request) {
	rs, err := a.svc.AdminRedemptions(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		writeErr(w, 500, "failed to load redemptions")
		return
	}
	writeJSON(w, 200, map[string]any{"data": rs})
}

func (a *api) adminResolveRedemption(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	var body struct {
		Status    string `json:"status"`
		AdminNote string `json:"admin_note"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if body.Status != "approved" && body.Status != "rejected" {
		writeErr(w, 400, "status must be approved or rejected")
		return
	}
	if err := a.svc.AdminResolveRedemption(r.Context(), id, body.Status, body.AdminNote); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "redemption not found")
			return
		}
		writeErr(w, 500, "failed to resolve redemption")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "resolved"})
}

// ── admin: campaigns ────────────────────────────────────────────────────
func (a *api) adminCampaigns(w http.ResponseWriter, r *http.Request) {
	cs, err := a.svc.AdminCampaigns(r.Context())
	if err != nil {
		writeErr(w, 500, "failed to load campaigns")
		return
	}
	writeJSON(w, 200, map[string]any{"data": cs})
}

func (a *api) adminCampaign(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	c, err := a.svc.AdminCampaign(r.Context(), id)
	switch {
	case errors.Is(err, ErrNotFound):
		writeErr(w, 404, "campaign not found")
	case err != nil:
		writeErr(w, 500, "failed to load campaign")
	default:
		writeJSON(w, 200, c)
	}
}

func (a *api) adminCreateCampaign(w http.ResponseWriter, r *http.Request) {
	var c Campaign
	if json.NewDecoder(r.Body).Decode(&c) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if c.Name == "" || !c.EndsAt.After(c.StartsAt) {
		writeErr(w, 400, "name and ends_at > starts_at required")
		return
	}
	id, err := a.svc.AdminCreateCampaign(r.Context(), &c)
	if err != nil {
		writeErr(w, 500, "failed to create campaign")
		return
	}
	c.ID = id
	writeJSON(w, 201, c)
}

func (a *api) adminUpdateCampaign(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	var c Campaign
	if json.NewDecoder(r.Body).Decode(&c) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if c.Name == "" || !c.EndsAt.After(c.StartsAt) {
		writeErr(w, 400, "name and ends_at > starts_at required")
		return
	}
	c.ID = id
	if err := a.svc.AdminUpdateCampaign(r.Context(), &c); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "campaign not found")
			return
		}
		writeErr(w, 500, "failed to update campaign")
		return
	}
	writeJSON(w, 200, c)
}

func (a *api) adminDeleteCampaign(w http.ResponseWriter, r *http.Request) {
	id, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	if err := a.svc.AdminDeleteCampaign(r.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "campaign not found")
			return
		}
		writeErr(w, 500, "failed to delete campaign")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

// ── admin: campaign goals ───────────────────────────────────────────────
func validateGoal(g *CampaignGoal) string {
	if g.ThresholdPoints <= 0 {
		return "threshold_points must be > 0"
	}
	if g.RewardPoints <= 0 && g.RewardItemID == nil {
		return "reward_points or reward_item_id required"
	}
	return ""
}

func (a *api) adminCreateGoal(w http.ResponseWriter, r *http.Request) {
	cid, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid campaign id")
		return
	}
	var g CampaignGoal
	if json.NewDecoder(r.Body).Decode(&g) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if msg := validateGoal(&g); msg != "" {
		writeErr(w, 400, msg)
		return
	}
	g.CampaignID = cid
	id, err := a.svc.AdminCreateGoal(r.Context(), &g)
	if err != nil {
		writeErr(w, 500, "failed to create goal")
		return
	}
	g.ID = id
	writeJSON(w, 201, g)
}

func (a *api) adminUpdateGoal(w http.ResponseWriter, r *http.Request) {
	cid, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid campaign id")
		return
	}
	gid, err := idParam(r, "goalId")
	if err != nil {
		writeErr(w, 400, "invalid goal id")
		return
	}
	var g CampaignGoal
	if json.NewDecoder(r.Body).Decode(&g) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if msg := validateGoal(&g); msg != "" {
		writeErr(w, 400, msg)
		return
	}
	g.ID = gid
	g.CampaignID = cid
	if err := a.svc.AdminUpdateGoal(r.Context(), &g); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "goal not found")
			return
		}
		writeErr(w, 500, "failed to update goal")
		return
	}
	writeJSON(w, 200, g)
}

func (a *api) adminDeleteGoal(w http.ResponseWriter, r *http.Request) {
	gid, err := idParam(r, "goalId")
	if err != nil {
		writeErr(w, 400, "invalid goal id")
		return
	}
	if err := a.svc.AdminDeleteGoal(r.Context(), gid); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeErr(w, 404, "goal not found")
			return
		}
		writeErr(w, 500, "failed to delete goal")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "deleted"})
}

func (a *api) adminParticipants(w http.ResponseWriter, r *http.Request) {
	cid, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid campaign id")
		return
	}
	ps, err := a.svc.AdminParticipants(r.Context(), cid)
	if err != nil {
		writeErr(w, 500, "failed to load participants")
		return
	}
	writeJSON(w, 200, map[string]any{"data": ps})
}
