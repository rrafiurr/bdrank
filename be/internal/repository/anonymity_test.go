package repository

import (
	"testing"

	"final-review/be/internal/models"
)

func TestMaskReviewAuthorHidesAnonymous(t *testing.T) {
	rv := &models.Review{
		IsAnonymous:  true,
		AuthorUserID: 7,
		Author:       &models.AuthorRef{ID: 7, Username: "rafiur", AvatarURL: "/a.png"},
	}
	maskReviewAuthor(rv)

	if rv.Author != nil {
		t.Fatalf("Author = %+v, want nil", rv.Author)
	}
	if rv.AuthorUserID != 7 {
		t.Fatalf("AuthorUserID = %d, want 7 (badge decoration needs it)", rv.AuthorUserID)
	}
}

func TestMaskReviewAuthorHidesImportedAuthor(t *testing.T) {
	// An imported review carries its author's name in SourceAuthor rather than
	// Author, and SourceURL links to the original under that name. Nil'ing
	// Author alone would leave both in the response.
	rv := &models.Review{
		IsAnonymous:  true,
		AuthorUserID: 11,
		Author:       &models.AuthorRef{ID: 11, Username: "import-bot"},
		Source:       "google",
		SourceAuthor: "Tanvir Ahmed",
		SourceURL:    "https://maps.google.com/?cid=12345",
	}
	maskReviewAuthor(rv)

	if rv.SourceAuthor != "" {
		t.Errorf("SourceAuthor = %q, want empty", rv.SourceAuthor)
	}
	if rv.SourceURL != "" {
		t.Errorf("SourceURL = %q, want empty", rv.SourceURL)
	}
	if rv.Source != "google" {
		t.Errorf("Source = %q, want %q — the platform name identifies nobody", rv.Source, "google")
	}
}

func TestMaskReviewAuthorLeavesImportAttributionOnPublicReview(t *testing.T) {
	rv := &models.Review{
		IsAnonymous:  false,
		Source:       "google",
		SourceAuthor: "Tanvir Ahmed",
		SourceURL:    "https://maps.google.com/?cid=12345",
	}
	maskReviewAuthor(rv)

	if rv.SourceAuthor != "Tanvir Ahmed" || rv.SourceURL == "" {
		t.Fatalf("attribution stripped from a public review: %+v", rv)
	}
}

func TestMaskReviewAuthorLeavesPublicReview(t *testing.T) {
	rv := &models.Review{
		IsAnonymous:  false,
		AuthorUserID: 7,
		Author:       &models.AuthorRef{ID: 7, Username: "rafiur"},
	}
	maskReviewAuthor(rv)

	if rv.Author == nil || rv.Author.Username != "rafiur" {
		t.Fatalf("Author = %+v, want the real author untouched", rv.Author)
	}
}

func TestMaskCommentAuthorsHidesOnlyTheReviewAuthor(t *testing.T) {
	comments := []models.Comment{
		{ID: 1, AuthorUserID: 7, Author: &models.AuthorRef{ID: 7, Username: "rafiur"}, CompanyName: "Acme", IsOwnerReply: true},
		{ID: 2, AuthorUserID: 9, Author: &models.AuthorRef{ID: 9, Username: "someone"}, CompanyName: "Widgets Inc", IsOwnerReply: true},
	}
	maskCommentAuthors(comments, 7, true)

	// The review author's own comment must carry no identifying data at all
	// after masking — not just a nil Author. CompanyName and IsOwnerReply are
	// exactly as identifying as Author for a masked comment: it is by
	// construction the anonymous author's own comment, so a leftover company
	// name or an "official response" flag names or exposes the same person.
	if comments[0].Author != nil {
		t.Fatalf("review author's own comment: Author = %+v, want nil", comments[0].Author)
	}
	if comments[0].CompanyName != "" {
		t.Fatalf("review author's own comment: CompanyName = %q, want \"\" (identifies the anonymous author's company)", comments[0].CompanyName)
	}
	if comments[0].IsOwnerReply {
		t.Fatal("review author's own comment: IsOwnerReply = true, want false (signals the anonymous author owns the product)")
	}
	if !comments[0].IsAnonymous {
		t.Fatal("review author's own comment: IsAnonymous = false, want true")
	}

	// The third party's comment must be completely untouched.
	if comments[1].Author == nil || comments[1].Author.Username != "someone" {
		t.Fatalf("third party comment: Author = %+v, want untouched", comments[1].Author)
	}
	if comments[1].CompanyName != "Widgets Inc" {
		t.Fatalf("third party comment: CompanyName = %q, want untouched (\"Widgets Inc\")", comments[1].CompanyName)
	}
	if !comments[1].IsOwnerReply {
		t.Fatal("third party comment: IsOwnerReply = false, want untouched (true)")
	}
	if comments[1].IsAnonymous {
		t.Fatal("third party comment: IsAnonymous = true, want false")
	}
}

func TestMaskCommentAuthorsNoopOnPublicReview(t *testing.T) {
	comments := []models.Comment{
		{ID: 1, AuthorUserID: 7, Author: &models.AuthorRef{ID: 7, Username: "rafiur"}},
	}
	maskCommentAuthors(comments, 7, false)

	if comments[0].Author == nil || comments[0].Author.Username != "rafiur" {
		t.Fatalf("Author = %+v, want untouched on a public review", comments[0].Author)
	}
}
