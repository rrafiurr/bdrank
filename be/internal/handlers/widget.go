package handlers

import (
	"log"
	"net/http"
	"net/url"
	"strings"

	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type WidgetHandler struct {
	embeds *repository.EmbedRepo
}

func NewWidgetHandler(embeds *repository.EmbedRepo) *WidgetHandler {
	return &WidgetHandler{embeds: embeds}
}

func (h *WidgetHandler) GetWidget(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	tok, err := h.embeds.FindByToken(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}

	if tok.Status != "approved" {
		writeError(w, http.StatusForbidden, "not_approved")
		return
	}

	// Domain check — missing Origin/Referer is allowed (direct curl, server-side fetch)
	caller := extractWidgetHost(r.Header.Get("Origin"))
	if caller == "" {
		caller = extractWidgetHost(r.Header.Get("Referer"))
	}
	if caller != "" && !widgetDomainsMatch(caller, tok.Domain) {
		log.Printf("WARN widget token=%s: domain mismatch caller=%q registered=%q", token, caller, tok.Domain)
		writeError(w, http.StatusForbidden, "domain_mismatch")
		return
	}

	data, err := h.embeds.GetWidgetData(r.Context(), tok)
	if err != nil {
		log.Printf("ERROR widget GetWidgetData token=%s: %v", token, err)
		writeError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	writeJSON(w, http.StatusOK, data)
}

// extractWidgetHost returns the bare lowercase hostname from an Origin or Referer value.
func extractWidgetHost(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.ToLower(u.Hostname())
}

// widgetDomainsMatch returns true when caller and registered resolve to the same domain,
// treating www. as optional on both sides.
func widgetDomainsMatch(caller, registered string) bool {
	normalize := func(h string) string {
		return strings.TrimPrefix(strings.ToLower(h), "www.")
	}
	return normalize(caller) == normalize(registered)
}
