package repository

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"testing"

	"final-review/be/internal/feedback"
	"final-review/be/internal/models"
	"github.com/go-sql-driver/mysql"
)

// testFeedbackRepo needs a THROWAWAY MySQL named in MYSQL_TEST_DSN, and the
// database name must end in "_test" because this drops and recreates tables.
// It builds a minimal users table and applies the real 016 migration, so the
// migration itself is under test.
func testFeedbackRepo(t *testing.T) (*FeedbackRepo, *sql.DB) {
	t.Helper()
	dsn := os.Getenv("MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEST_DSN not set; skipping MySQL-backed feedback tests")
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatalf("parse MYSQL_TEST_DSN: %v", err)
	}
	if !strings.HasSuffix(cfg.DBName, "_test") {
		t.Fatalf("refusing to run against database %q: its name must end in _test", cfg.DBName)
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	migration, err := os.ReadFile("../../migrations/016_feedback.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, stmt := range []string{
		`DROP TABLE IF EXISTS feedback`,
		`DROP TABLE IF EXISTS users`,
		`CREATE TABLE users (
		   id       BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
		   email    VARCHAR(255) NOT NULL UNIQUE,
		   username VARCHAR(100) NULL
		 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`INSERT INTO users (id, email, username) VALUES (1, 'a@example.com', 'alice'), (2, 'b@example.com', NULL)`,
		string(migration),
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("setup %.50q: %v", stmt, err)
		}
	}
	return NewFeedbackRepo(db), db
}

func mustCreate(t *testing.T, r *FeedbackRepo, userID int64, typ, msg string) *models.Feedback {
	t.Helper()
	f, err := r.Create(context.Background(), NewFeedback{UserID: userID, Type: typ, Message: msg, Hash: feedback.Fingerprint(msg)})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	return f
}

func mustExec(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatalf("exec %.50q: %v", q, err)
	}
}

func TestFeedbackRepoCreateAndListMine(t *testing.T) {
	r, _ := testFeedbackRepo(t)
	ctx := context.Background()

	first, err := r.Create(ctx, NewFeedback{
		UserID: 1, Type: "bug", Message: "The checkout button does nothing", Hash: "h1",
		PagePath: "/review/12", UserAgent: "TestBrowser/1.0",
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.ID == 0 || first.Status != "new" || first.Type != "bug" || first.ReplyUnread || first.RepliedAt != nil {
		t.Fatalf("created = %+v, want a new bug with no reply", first)
	}
	second := mustCreate(t, r, 1, "idea", "Please add a dark mode toggle")
	mustCreate(t, r, 2, "other", "Someone else's feedback here")

	list, err := r.ListMine(ctx, 1, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].ID != second.ID || list[1].ID != first.ID {
		t.Fatalf("ListMine = %+v, want user 1's two items, newest first", list)
	}
}

func TestFeedbackRepoAdmissionCounts(t *testing.T) {
	r, db := testFeedbackRepo(t)
	ctx := context.Background()

	spam, dup, open, err := r.AdmissionCounts(ctx, 1, "h1")
	if err != nil {
		t.Fatal(err)
	}
	if spam != 0 || dup != 0 || open != 0 {
		t.Fatalf("fresh user: spam=%d dup=%d open=%d, want all 0", spam, dup, open)
	}

	insert := `INSERT INTO feedback (user_id, type, message, message_hash, status, created_at)
	           VALUES (1, 'bug', 'm', ?, ?, NOW() - INTERVAL ? DAY)`
	mustExec(t, db, insert, "h1", "new", 0)
	mustExec(t, db, insert, "h2", "in_progress", 0)
	mustExec(t, db, insert, "h3", "resolved", 0)
	mustExec(t, db, insert, "h4", "spam", 1)
	mustExec(t, db, insert, "h5", "spam", 2)
	mustExec(t, db, insert, "h6", "spam", 31)     // too old to count toward a pause
	mustExec(t, db, `INSERT INTO feedback (user_id, type, message, message_hash) VALUES (2, 'bug', 'm', 'h1')`)

	spam, dup, open, err = r.AdmissionCounts(ctx, 1, "h1")
	if err != nil {
		t.Fatal(err)
	}
	if spam != 2 {
		t.Errorf("spam = %d, want 2 (the 31-day-old one is outside the window)", spam)
	}
	if dup != 1 {
		t.Errorf("dup = %d, want 1 (user 2's identical message must not count)", dup)
	}
	if open != 2 {
		t.Errorf("open = %d, want 2 (new + in_progress)", open)
	}

	if _, dup, _, _ := r.AdmissionCounts(ctx, 1, "old"); dup != 0 {
		t.Errorf("dup for a 31-day-old message = %d, want 0", dup)
	}
}

func TestFeedbackRepoListMineShowsSpamAsClosed(t *testing.T) {
	r, db := testFeedbackRepo(t)
	f := mustCreate(t, r, 1, "other", "buy cheap followers now at my site")
	mustExec(t, db, `UPDATE feedback SET status = 'spam' WHERE id = ?`, f.ID)

	list, err := r.ListMine(context.Background(), 1, 50)
	if err != nil {
		t.Fatal(err)
	}
	if list[0].Status != "closed" {
		t.Errorf("status = %q, want closed", list[0].Status)
	}
}

func TestFeedbackRepoAdminUpdate(t *testing.T) {
	r, _ := testFeedbackRepo(t)
	ctx := context.Background()
	f := mustCreate(t, r, 1, "bug", "The checkout button does nothing")

	status := "in_progress"
	if err := r.AdminUpdate(ctx, f.ID, &status, nil); err != nil {
		t.Fatal(err)
	}
	reply := "Thanks, we are on it."
	if err := r.AdminUpdate(ctx, f.ID, nil, &reply); err != nil {
		t.Fatal(err)
	}
	mine, _ := r.ListMine(ctx, 1, 50)
	if got := mine[0]; got.Status != "in_progress" || got.AdminReply != reply || !got.ReplyUnread || got.RepliedAt == nil {
		t.Fatalf("after status+reply: %+v, want in_progress with an unread reply", got)
	}
	if n, _ := r.UnreadCount(ctx, 1); n != 1 {
		t.Errorf("UnreadCount = %d, want 1", n)
	}

	if err := r.MarkSeen(ctx, 1); err != nil {
		t.Fatal(err)
	}
	if n, _ := r.UnreadCount(ctx, 1); n != 0 {
		t.Errorf("UnreadCount after MarkSeen = %d, want 0", n)
	}

	// Saving identical text is a no-op: it must not flag the reply unread again.
	if err := r.AdminUpdate(ctx, f.ID, nil, &reply); err != nil {
		t.Fatal(err)
	}
	if n, _ := r.UnreadCount(ctx, 1); n != 0 {
		t.Errorf("UnreadCount after re-saving the same reply = %d, want 0", n)
	}

	edited := "Fixed in today's release."
	if err := r.AdminUpdate(ctx, f.ID, nil, &edited); err != nil {
		t.Fatal(err)
	}
	if n, _ := r.UnreadCount(ctx, 1); n != 1 {
		t.Errorf("UnreadCount after editing the reply = %d, want 1", n)
	}

	empty := ""
	if err := r.AdminUpdate(ctx, f.ID, nil, &empty); err != nil {
		t.Fatal(err)
	}
	mine, _ = r.ListMine(ctx, 1, 50)
	if got := mine[0]; got.AdminReply != "" || got.RepliedAt != nil || got.ReplyUnread {
		t.Errorf("after clearing: %+v, want no reply", got)
	}

	if err := r.AdminUpdate(ctx, 99999, &status, nil); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown id: err = %v, want ErrNotFound", err)
	}
}

func TestFeedbackRepoAdminList(t *testing.T) {
	r, db := testFeedbackRepo(t)
	ctx := context.Background()
	oldest := mustCreate(t, r, 1, "bug", "Bug report from alice")
	mustCreate(t, r, 1, "idea", "Idea from alice for later")
	spammy := mustCreate(t, r, 2, "bug", "Bug report from user two")
	mustExec(t, db, `UPDATE feedback SET status = 'spam' WHERE id = ?`, spammy.ID)

	all, total, err := r.AdminList(ctx, FeedbackFilter{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 || len(all) != 3 {
		t.Fatalf("all: total=%d len=%d, want 3/3", total, len(all))
	}

	bugs, total, _ := r.AdminList(ctx, FeedbackFilter{Type: "bug", Limit: 50})
	if total != 2 || len(bugs) != 2 {
		t.Errorf("type=bug: total=%d len=%d, want 2/2", total, len(bugs))
	}

	spam, total, _ := r.AdminList(ctx, FeedbackFilter{Status: "spam", Limit: 50})
	if total != 1 || len(spam) != 1 || spam[0].ID != spammy.ID || spam[0].Status != "spam" {
		t.Fatalf("status=spam: %+v (total %d), want only item %d with the raw spam status", spam, total, spammy.ID)
	}
	if u := spam[0].User; u.ID != 2 || u.Email != "b@example.com" || u.Username != "" {
		t.Errorf("user = %+v, want user 2 with the NULL username as empty", u)
	}

	page, total, _ := r.AdminList(ctx, FeedbackFilter{Limit: 1, Offset: 2})
	if total != 3 || len(page) != 1 || page[0].ID != oldest.ID {
		t.Errorf("limit 1 offset 2: %+v (total %d), want the oldest item %d", page, total, oldest.ID)
	}
}
