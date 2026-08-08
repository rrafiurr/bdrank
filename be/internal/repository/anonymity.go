package repository

import "final-review/be/internal/models"

// maskReviewAuthor drops the public identity of an anonymous review. It is the
// single choke point for review anonymity, applied unconditionally on every
// ReviewRepo read path, so a read path added later is anonymous-safe by
// default. Callers that legitimately need the real author (the CMS in
// handlers/admin.go, the author's own listing in handlers/profile.go) run
// their own SQL and never reach this code.
//
// AuthorUserID survives masking: it is never serialized (json:"-") and badge
// decoration and ownership checks both need it.
func maskReviewAuthor(rv *models.Review) {
	if rv == nil || !rv.IsAnonymous {
		return
	}
	rv.Author = nil
}

// maskCommentAuthors hides the review author's own comments on a review they
// posted anonymously. Without it, a single reply under their real name in
// their own thread defeats the anonymity of the review above it. Comments by
// anyone else — including verified product-owner replies, who are never the
// review's author — are left untouched.
func maskCommentAuthors(comments []models.Comment, reviewAuthorID int64, reviewIsAnonymous bool) {
	if !reviewIsAnonymous {
		return
	}
	for i := range comments {
		if comments[i].AuthorUserID == reviewAuthorID {
			comments[i].Author = nil
			comments[i].IsAnonymous = true
		}
	}
}
