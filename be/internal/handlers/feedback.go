package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"final-review/be/internal/feedback"
	"final-review/be/internal/middleware"
	"final-review/be/internal/models"
	"final-review/be/internal/repository"
)

// feedbackStore is what FeedbackHandler needs from storage.
// *repository.FeedbackRepo satisfies it; it is an interface so the HTTP
// contract can be tested without MySQL.
type feedbackStore interface {
	AdmissionCounts(ctx context.Context, userID int64, hash string) (spam, dup, open int, err error)
	Create(ctx context.Context, in repository.NewFeedback) (*models.Feedback, error)
	ListMine(ctx context.Context, userID int64, limit int) ([]models.Feedback, error)
	UnreadCount(ctx context.Context, userID int64) (int, error)
	MarkSeen(ctx context.Context, userID int64) error
	AdminList(ctx context.Context, f repository.FeedbackFilter) ([]models.AdminFeedback, int, error)
	AdminUpdate(ctx context.Context, id int64, status, reply *string) error
}

type FeedbackHandler struct {
	store feedbackStore
}

func NewFeedbackHandler(store feedbackStore) *FeedbackHandler {
	return &FeedbackHandler{store: store}
}

const (
	maxFeedbackBody = 16 << 10 // bytes
	mineLimit       = 50
)

// feedbackErrors maps each client-facing code to its HTTP status and English
// sentence. The frontend shows its own translation keyed by the code; the
// sentence is for other API consumers and for logs.
var feedbackErrors = map[string]struct {
	status int
	msg    string
}{
	feedback.CodeInvalidBody:   {http.StatusBadRequest, "request body must be JSON under 16 KB"},
	feedback.CodeInvalidType:   {http.StatusBadRequest, "type must be one of bug, idea, complaint, praise, other"},
	feedback.CodeTooShort:      {http.StatusBadRequest, "message must be at least 20 characters"},
	feedback.CodeTooLong:       {http.StatusBadRequest, "message must be at most 2000 characters"},
	feedback.CodeLowEffort:     {http.StatusBadRequest, "message needs more than a repeated character or two"},
	feedback.CodeTooManyLinks:  {http.StatusBadRequest, "message may contain at most 2 links"},
	feedback.CodePaused:        {http.StatusForbidden, "feedback is paused for this account"},
	feedback.CodeDuplicate:     {http.StatusConflict, "you already sent this feedback"},
	feedback.CodeTooManyOpen:   {http.StatusTooManyRequests, "too many open feedback items"},
	feedback.CodeInvalidStatus: {http.StatusBadRequest, "status must be one of new, in_progress, resolved, spam"},
	feedback.CodeInvalidReply:  {http.StatusBadRequest, "reply must be at most 2000 characters"},
}

func writeFeedbackError(w http.ResponseWriter, code string) {
	e := feedbackErrors[code]
	writeErrorCode(w, e.status, code, e.msg)
}

// Create stores one feedback item. It sits behind Auth and
// RateLimitPerUser(feedback.RateRules), so timing limits are already checked
// by the time it runs; every rejection here answers 4xx, which refunds the
// user's rate-limit slot.
func (h *FeedbackHandler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxFeedbackBody)
	var body struct {
		Type     string `json:"type"`
		Message  string `json:"message"`
		PagePath string `json:"page_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeFeedbackError(w, feedback.CodeInvalidBody)
		return
	}
	if !feedback.ValidType(body.Type) {
		writeFeedbackError(w, feedback.CodeInvalidType)
		return
	}
	message, code := feedback.Validate(body.Message)
	if code != "" {
		writeFeedbackError(w, code)
		return
	}

	ctx := r.Context()
	userID := middleware.UserIDFromCtx(ctx)
	hash := feedback.Fingerprint(message)
	spam, dup, open, err := h.store.AdmissionCounts(ctx, userID, hash)
	if err != nil {
		log.Printf("ERROR feedback admission user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to send feedback")
		return
	}
	if code := feedback.Admission(spam, dup, open); code != "" {
		writeFeedbackError(w, code)
		return
	}

	item, err := h.store.Create(ctx, repository.NewFeedback{
		UserID:    userID,
		Type:      body.Type,
		Message:   message,
		Hash:      hash,
		PagePath:  feedback.CleanPagePath(body.PagePath),
		UserAgent: feedback.CleanUserAgent(r.UserAgent()),
	})
	if err != nil {
		log.Printf("ERROR feedback create user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to send feedback")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

// Mine lists the caller's own feedback, newest first.
func (h *FeedbackHandler) Mine(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	list, err := h.store.ListMine(r.Context(), userID, mineLimit)
	if err != nil {
		log.Printf("ERROR feedback list user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// Unread counts the caller's replies not yet seen; it drives the header dot.
func (h *FeedbackHandler) Unread(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	n, err := h.store.UnreadCount(r.Context(), userID)
	if err != nil {
		log.Printf("ERROR feedback unread user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": n})
}

// MarkSeen clears the unread flag on the caller's replies.
func (h *FeedbackHandler) MarkSeen(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	if err := h.store.MarkSeen(r.Context(), userID); err != nil {
		log.Printf("ERROR feedback seen user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to update feedback")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
