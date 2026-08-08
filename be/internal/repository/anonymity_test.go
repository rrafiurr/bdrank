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
		{ID: 1, AuthorUserID: 7, Author: &models.AuthorRef{ID: 7, Username: "rafiur"}},
		{ID: 2, AuthorUserID: 9, Author: &models.AuthorRef{ID: 9, Username: "someone"}},
	}
	maskCommentAuthors(comments, 7, true)

	if comments[0].Author != nil {
		t.Fatalf("review author's own comment: Author = %+v, want nil", comments[0].Author)
	}
	if !comments[0].IsAnonymous {
		t.Fatal("review author's own comment: IsAnonymous = false, want true")
	}
	if comments[1].Author == nil || comments[1].Author.Username != "someone" {
		t.Fatalf("third party comment: Author = %+v, want untouched", comments[1].Author)
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
