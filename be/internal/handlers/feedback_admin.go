package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"final-review/be/internal/feedback"
	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

// AdminList serves the CMS inbox. An empty status or type means no filter; an
// unknown value is a 400 rather than a silently empty page.
func (h *FeedbackHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := repository.FeedbackFilter{
		Status: q.Get("status"),
		Type:   q.Get("type"),
		Limit:  min(max(queryInt(r, "limit", 50), 1), 100),
		Offset: max(queryInt(r, "offset", 0), 0),
	}
	if f.Status != "" && !feedback.ValidStatus(f.Status) {
		writeFeedbackError(w, feedback.CodeInvalidStatus)
		return
	}
	if f.Type != "" && !feedback.ValidType(f.Type) {
		writeFeedbackError(w, feedback.CodeInvalidType)
		return
	}
	list, total, err := h.store.AdminList(r.Context(), f)
	if err != nil {
		log.Printf("ERROR admin feedback list: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list, "total": total})
}

// AdminUpdate sets an item's status and/or its reply to the user.
func (h *FeedbackHandler) AdminUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxFeedbackBody)
	var body struct {
		Status     *string `json:"status"`
		AdminReply *string `json:"admin_reply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeFeedbackError(w, feedback.CodeInvalidBody)
		return
	}
	if body.Status != nil && !feedback.ValidStatus(*body.Status) {
		writeFeedbackError(w, feedback.CodeInvalidStatus)
		return
	}
	if body.AdminReply != nil {
		reply, code := feedback.CleanReply(*body.AdminReply)
		if code != "" {
			writeFeedbackError(w, code)
			return
		}
		body.AdminReply = &reply
	}

	err = h.store.AdminUpdate(r.Context(), id, body.Status, body.AdminReply)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "feedback not found")
		return
	}
	if err != nil {
		log.Printf("ERROR admin feedback update id=%d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to update feedback")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
