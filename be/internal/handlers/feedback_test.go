package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"final-review/be/internal/feedback"
	"final-review/be/internal/middleware"
	"final-review/be/internal/models"
	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type fakeFeedbackStore struct {
	spam, dup, open int
	created         []repository.NewFeedback
	filter          repository.FeedbackFilter
	updateErr       error
	updatedID       int64
	updatedStatus   *string
	updatedReply    *string
}

func (f *fakeFeedbackStore) AdmissionCounts(context.Context, int64, string) (int, int, int, error) {
	return f.spam, f.dup, f.open, nil
}

func (f *fakeFeedbackStore) Create(_ context.Context, in repository.NewFeedback) (*models.Feedback, error) {
	f.created = append(f.created, in)
	return &models.Feedback{ID: 1, Type: in.Type, Message: in.Message, Status: "new"}, nil
}

func (f *fakeFeedbackStore) ListMine(context.Context, int64, int) ([]models.Feedback, error) {
	return []models.Feedback{}, nil
}

func (f *fakeFeedbackStore) UnreadCount(context.Context, int64) (int, error) { return 0, nil }

func (f *fakeFeedbackStore) MarkSeen(context.Context, int64) error { return nil }

func (f *fakeFeedbackStore) AdminList(_ context.Context, flt repository.FeedbackFilter) ([]models.AdminFeedback, int, error) {
	f.filter = flt
	return []models.AdminFeedback{}, 0, nil
}

func (f *fakeFeedbackStore) AdminUpdate(_ context.Context, id int64, status, reply *string) error {
	f.updatedID, f.updatedStatus, f.updatedReply = id, status, reply
	return f.updateErr
}

func postFeedback(store *fakeFeedbackStore, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/feedback", strings.NewReader(body))
	req.Header.Set("User-Agent", "TestBrowser/1.0")
	req = req.WithContext(middleware.WithUserID(req.Context(), 42))
	rec := httptest.NewRecorder()
	NewFeedbackHandler(store).Create(rec, req)
	return rec
}

func errCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return body.Code
}

const okMessage = "The checkout button does nothing on my phone."

func TestFeedbackCreateRejects(t *testing.T) {
	valid := `{"type":"bug","message":"` + okMessage + `"}`
	cases := []struct {
		name       string
		body       string
		store      fakeFeedbackStore
		wantStatus int
		wantCode   string
	}{
		{"not json", `hello`, fakeFeedbackStore{}, 400, feedback.CodeInvalidBody},
		{"body over 16 KB", `{"type":"bug","message":"` + strings.Repeat("a", 17<<10) + `"}`, fakeFeedbackStore{}, 400, feedback.CodeInvalidBody},
		{"unknown type", `{"type":"rant","message":"` + okMessage + `"}`, fakeFeedbackStore{}, 400, feedback.CodeInvalidType},
		{"too short", `{"type":"bug","message":"broken"}`, fakeFeedbackStore{}, 400, feedback.CodeTooShort},
		{"low effort", `{"type":"bug","message":"aaaaaaaaaaaaaaaaaaaaaaaaa"}`, fakeFeedbackStore{}, 400, feedback.CodeLowEffort},
		{"paused", valid, fakeFeedbackStore{spam: 3}, 403, feedback.CodePaused},
		{"duplicate", valid, fakeFeedbackStore{dup: 1}, 409, feedback.CodeDuplicate},
		{"too many open", valid, fakeFeedbackStore{open: 10}, 429, feedback.CodeTooManyOpen},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			store := c.store
			rec := postFeedback(&store, c.body)
			if rec.Code != c.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, c.wantStatus, rec.Body)
			}
			if got := errCode(t, rec); got != c.wantCode {
				t.Errorf("code = %q, want %q", got, c.wantCode)
			}
			if len(store.created) != 0 {
				t.Errorf("stored %d items, want none", len(store.created))
			}
		})
	}
}

func TestFeedbackCreateStoresCleanedSubmission(t *testing.T) {
	store := &fakeFeedbackStore{}
	rec := postFeedback(store, `{"type":"bug","message":"  `+okMessage+`\r\n\r\n\r\nPlease fix  ","page_path":"/review/12"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (body %s)", rec.Code, rec.Body)
	}
	if len(store.created) != 1 {
		t.Fatalf("stored %d items, want 1", len(store.created))
	}
	got := store.created[0]
	wantMsg := okMessage + "\n\nPlease fix"
	if got.UserID != 42 || got.Type != "bug" || got.Message != wantMsg {
		t.Errorf("stored %+v, want user 42's cleaned bug report", got)
	}
	if got.Hash != feedback.Fingerprint(wantMsg) {
		t.Error("hash is not the fingerprint of the cleaned message")
	}
	if got.PagePath != "/review/12" || got.UserAgent != "TestBrowser/1.0" {
		t.Errorf("context = %q / %q, want /review/12 and TestBrowser/1.0", got.PagePath, got.UserAgent)
	}
}

func TestFeedbackCreateDropsUnsafePagePath(t *testing.T) {
	store := &fakeFeedbackStore{}
	rec := postFeedback(store, `{"type":"idea","message":"`+okMessage+`","page_path":"https://evil.example/"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: a bad page path is dropped, not an error", rec.Code)
	}
	if p := store.created[0].PagePath; p != "" {
		t.Errorf("stored page path %q, want empty", p)
	}
}

func patchFeedback(store *fakeFeedbackStore, id, body string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Patch("/admin/feedback/{id}", NewFeedbackHandler(store).AdminUpdate)
	req := httptest.NewRequest(http.MethodPatch, "/admin/feedback/"+id, strings.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestFeedbackAdminUpdate(t *testing.T) {
	t.Run("unknown status", func(t *testing.T) {
		rec := patchFeedback(&fakeFeedbackStore{}, "7", `{"status":"closed"}`)
		if rec.Code != 400 || errCode(t, rec) != feedback.CodeInvalidStatus {
			t.Fatalf("status = %d, want 400 invalid_status", rec.Code)
		}
	})
	t.Run("reply too long", func(t *testing.T) {
		rec := patchFeedback(&fakeFeedbackStore{}, "7", `{"admin_reply":"`+strings.Repeat("a", feedback.MaxReply+1)+`"}`)
		if rec.Code != 400 || errCode(t, rec) != feedback.CodeInvalidReply {
			t.Fatalf("status = %d, want 400 invalid_reply", rec.Code)
		}
	})
	t.Run("non-numeric id", func(t *testing.T) {
		if rec := patchFeedback(&fakeFeedbackStore{}, "abc", `{"status":"new"}`); rec.Code != 400 {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})
	t.Run("unknown id", func(t *testing.T) {
		rec := patchFeedback(&fakeFeedbackStore{updateErr: repository.ErrNotFound}, "7", `{"status":"new"}`)
		if rec.Code != 404 {
			t.Fatalf("status = %d, want 404", rec.Code)
		}
	})
	t.Run("status and cleaned reply reach the store", func(t *testing.T) {
		store := &fakeFeedbackStore{}
		rec := patchFeedback(store, "7", `{"status":"resolved","admin_reply":"  Thanks, fixed.  "}`)
		if rec.Code != 200 {
			t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
		}
		if store.updatedID != 7 || store.updatedStatus == nil || *store.updatedStatus != "resolved" {
			t.Errorf("update id=%d status=%v, want 7 and resolved", store.updatedID, store.updatedStatus)
		}
		if store.updatedReply == nil || *store.updatedReply != "Thanks, fixed." {
			t.Errorf("reply = %v, want the trimmed text", store.updatedReply)
		}
	})
	t.Run("blank reply is passed on so it clears", func(t *testing.T) {
		store := &fakeFeedbackStore{}
		patchFeedback(store, "7", `{"admin_reply":"   "}`)
		if store.updatedReply == nil || *store.updatedReply != "" || store.updatedStatus != nil {
			t.Errorf("reply=%v status=%v, want an empty reply and no status change", store.updatedReply, store.updatedStatus)
		}
	})
}

func TestFeedbackAdminListFilters(t *testing.T) {
	list := func(store *fakeFeedbackStore, query string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/admin/feedback?"+query, nil)
		rec := httptest.NewRecorder()
		NewFeedbackHandler(store).AdminList(rec, req)
		return rec
	}

	if rec := list(&fakeFeedbackStore{}, "status=bogus"); rec.Code != 400 || errCode(t, rec) != feedback.CodeInvalidStatus {
		t.Errorf("status=bogus: %d, want 400 invalid_status", rec.Code)
	}
	if rec := list(&fakeFeedbackStore{}, "type=bogus"); rec.Code != 400 || errCode(t, rec) != feedback.CodeInvalidType {
		t.Errorf("type=bogus: %d, want 400 invalid_type", rec.Code)
	}

	store := &fakeFeedbackStore{}
	if rec := list(store, "status=new&type=bug&limit=1000&offset=-5"); rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	want := repository.FeedbackFilter{Status: "new", Type: "bug", Limit: 100, Offset: 0}
	if store.filter != want {
		t.Errorf("filter = %+v, want %+v (limit capped, offset floored)", store.filter, want)
	}

	store = &fakeFeedbackStore{}
	list(store, "")
	if want := (repository.FeedbackFilter{Limit: 50}); store.filter != want {
		t.Errorf("default filter = %+v, want %+v", store.filter, want)
	}
}
