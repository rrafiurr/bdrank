package rewards

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes mounts all reward endpoints. auth guards user routes; admin
// guards admin routes. Mount under the host's /api/v1 group.
func RegisterRoutes(r chi.Router, svc *Service, auth, admin func(http.Handler) http.Handler) {
	a := &api{svc: svc}

	// public
	r.Get("/rewards/levels", a.levels)

	// user (JWT)
	r.Group(func(r chi.Router) {
		r.Use(auth)
		r.Get("/rewards/me", a.me)
		r.Get("/rewards/me/transactions", a.history)
		r.Get("/rewards/items", a.items)
		r.Post("/rewards/redeem", a.redeem)
		r.Get("/rewards/me/redemptions", a.myRedemptions)
		r.Get("/rewards/campaigns", a.campaigns)
		r.Post("/rewards/campaigns/{id}/redeem", a.redeemCampaign)
	})

	// admin
	r.Group(func(r chi.Router) {
		r.Use(admin)
		r.Get("/admin/rewards/rules", a.adminRules)
		r.Post("/admin/rewards/rules", a.adminCreateRule)
		r.Put("/admin/rewards/rules/{id}", a.adminUpdateRule)

		r.Get("/admin/rewards/levels", a.adminLevels)
		r.Post("/admin/rewards/levels", a.adminCreateLevel)
		r.Put("/admin/rewards/levels/{id}", a.adminUpdateLevel)
		r.Delete("/admin/rewards/levels/{id}", a.adminDeleteLevel)

		r.Get("/admin/rewards/items", a.adminItems)
		r.Post("/admin/rewards/items", a.adminCreateItem)
		r.Put("/admin/rewards/items/{id}", a.adminUpdateItem)
		r.Delete("/admin/rewards/items/{id}", a.adminDeleteItem)
		r.Post("/admin/rewards/items/{id}/codes", a.adminAddCodes)

		r.Get("/admin/rewards/redemptions", a.adminRedemptions)
		r.Put("/admin/rewards/redemptions/{id}", a.adminResolveRedemption)

		r.Get("/admin/rewards/campaigns", a.adminCampaigns)
		r.Post("/admin/rewards/campaigns", a.adminCreateCampaign)
		r.Get("/admin/rewards/campaigns/{id}", a.adminCampaign)
		r.Put("/admin/rewards/campaigns/{id}", a.adminUpdateCampaign)
		r.Delete("/admin/rewards/campaigns/{id}", a.adminDeleteCampaign)
		r.Post("/admin/rewards/campaigns/{id}/goals", a.adminCreateGoal)
		r.Put("/admin/rewards/campaigns/{id}/goals/{goalId}", a.adminUpdateGoal)
		r.Delete("/admin/rewards/campaigns/{id}/goals/{goalId}", a.adminDeleteGoal)
		r.Get("/admin/rewards/campaigns/{id}/participants", a.adminParticipants)
	})
}
