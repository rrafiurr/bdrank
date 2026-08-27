package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

// imageEntry is one file on disk, annotated with the review that uses it.
// ReviewID is nil when nothing in review_images points at the file. Other
// tables can still reference it — see referencesOutsideReviews.
type imageEntry struct {
	Filename    string `json:"filename"`
	URL         string `json:"url"`
	Size        int64  `json:"size"`
	Modified    string `json:"modified"`
	ReviewID    *int64 `json:"review_id"`
	ReviewTitle string `json:"review_title,omitempty"`
}

// ListImages returns every file in the upload directory, cross-referenced with
// review_images. Files are listed whether or not a review uses them, so an
// orphan left behind by a deleted review is still visible here.
func (h *AdminHandler) ListImages(w http.ResponseWriter, r *http.Request) {
	files, err := h.storage.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not read upload directory: "+err.Error())
		return
	}

	// One query for the whole folder rather than a lookup per file.
	type ref struct {
		id    int64
		title string
	}
	refs := map[string]ref{}
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT ri.url, ri.review_id, COALESCE(r.title, '')
		FROM review_images ri
		LEFT JOIN reviews r ON r.id = ri.review_id`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var url, title string
			var id int64
			if rows.Scan(&url, &id, &title) == nil {
				refs[path.Base(url)] = ref{id: id, title: title}
			}
		}
	}

	out := make([]imageEntry, 0, len(files))
	for _, f := range files {
		e := imageEntry{
			Filename: f.Filename,
			URL:      f.URL,
			Size:     f.Size,
			Modified: f.Modified.UTC().Format("2006-01-02T15:04:05Z"),
		}
		if m, ok := refs[f.Filename]; ok {
			id := m.id
			e.ReviewID = &id
			e.ReviewTitle = m.title
		}
		out = append(out, e)
	}

	writeJSON(w, http.StatusOK, out)
}

// otherUse names a non-review_images row that points at a file.
type otherUse struct {
	Table string `json:"table"`
	Label string `json:"label"`
}

// referencesOutsideReviews finds rows in the other tables that can hold an
// upload URL. The image manager cross-references review_images only, so
// without this check deleting a file would silently break an avatar, a product
// image, or a timeline entry that the listing never mentioned.
func (h *AdminHandler) referencesOutsideReviews(ctx context.Context, filename string) []otherUse {
	like := "%/" + filename

	queries := []struct {
		table string
		query string
	}{
		{"users", `SELECT COALESCE(NULLIF(username,''), email) FROM users WHERE avatar_url LIKE ?`},
		{"products", `SELECT name FROM products WHERE image_url LIKE ?`},
		{"timeline_entries", `SELECT COALESCE(NULLIF(title,''), CONCAT('entry #', id)) FROM timeline_entries WHERE image_url LIKE ?`},
		{"reward_items", `SELECT name FROM reward_items WHERE image_url LIKE ?`},
		{"reward_campaigns", `SELECT name FROM reward_campaigns WHERE image_url LIKE ?`},
	}

	var uses []otherUse
	for _, q := range queries {
		rows, err := h.db.QueryContext(ctx, q.query, like)
		if err != nil {
			// A table may be absent on an older schema. That is not a reason to
			// block the delete, but it must not be mistaken for "no references".
			log.Printf("WARN image reference check on %s failed: %v", q.table, err)
			continue
		}
		for rows.Next() {
			var label string
			if rows.Scan(&label) == nil {
				uses = append(uses, otherUse{Table: q.table, Label: label})
			}
		}
		rows.Close()
	}
	return uses
}

// safeUploadFilename reduces a client-supplied path parameter to a bare
// filename inside the upload directory, reporting whether it is usable.
//
// chi hands back the raw, still-percent-encoded segment, so decoding has to
// happen here: without it "%2e%2e%2fsecret" is treated as a literal filename
// and a traversal attempt is answered with a cheerful "ok". Decoding first
// means path.Base sees the real "../secret" and reduces it to "secret".
//
// Dotfiles are refused outright — no upload is ever named one, and allowing
// them lets a caller aim at things like ".env".
func safeUploadFilename(raw string) (string, bool) {
	if decoded, err := url.PathUnescape(raw); err == nil {
		raw = decoded
	}
	name := path.Base(strings.TrimSpace(raw))
	if name == "" || name == "." || name == ".." || name == "/" || strings.HasPrefix(name, ".") {
		return "", false
	}
	return name, true
}

// DeleteImage removes a file from the upload directory and drops any
// review_images rows pointing at it.
//
// If the file is referenced by a table the manager does not cross-reference,
// the request is refused with 409 and the conflicting rows are returned, so the
// CMS can ask before destroying something the listing never showed.
// ?force=true deletes anyway.
func (h *AdminHandler) DeleteImage(w http.ResponseWriter, r *http.Request) {
	filename, ok := safeUploadFilename(chi.URLParam(r, "filename"))
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	force, _ := strconv.ParseBool(r.URL.Query().Get("force"))
	if !force {
		if uses := h.referencesOutsideReviews(r.Context(), filename); len(uses) > 0 {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error": "file is in use outside review_images",
				"uses":  uses,
			})
			return
		}
	}

	if err := h.storage.Delete(r.Context(), "uploads/"+filename); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete file: "+err.Error())
		return
	}

	res, err := h.db.ExecContext(r.Context(),
		`DELETE FROM review_images WHERE url LIKE ?`, "%/"+filename)
	if err != nil {
		// The file is already gone; say so rather than implying nothing happened.
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("file deleted but review_images cleanup failed: %v", err))
		return
	}
	detached, _ := res.RowsAffected()

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "detached": detached})
}

// AttachImage links an already-uploaded file to a review, so a file can be
// added from the image manager without re-uploading it.
func (h *AdminHandler) AttachImage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ReviewID int64  `json:"review_id"`
		URL      string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	body.URL = strings.TrimSpace(body.URL)
	if body.ReviewID == 0 || body.URL == "" {
		writeError(w, http.StatusBadRequest, "review_id and url are required")
		return
	}

	var exists bool
	if err := h.db.QueryRowContext(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM reviews WHERE id = ?)`, body.ReviewID).Scan(&exists); err != nil || !exists {
		writeError(w, http.StatusBadRequest, "review not found")
		return
	}

	var dup bool
	h.db.QueryRowContext(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM review_images WHERE review_id = ? AND url = ?)`,
		body.ReviewID, body.URL).Scan(&dup)
	if dup {
		writeError(w, http.StatusConflict, "image already attached to this review")
		return
	}

	if _, err := h.db.ExecContext(r.Context(),
		`INSERT INTO review_images (review_id, url) VALUES (?, ?)`, body.ReviewID, body.URL); err != nil {
		writeError(w, http.StatusInternalServerError, "could not attach image")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}
