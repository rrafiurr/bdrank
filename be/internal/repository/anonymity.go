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
//
// Every other identifying field on models.Review must be cleared here too.
// SourceAuthor names the person who wrote an imported review and SourceURL
// links to it under that name, so either one left in place would undo the
// masking on its own. A new identifying column is unprotected by default —
// whoever adds one must add it here.
func maskReviewAuthor(rv *models.Review) {
	if rv == nil || !rv.IsAnonymous {
		return
	}
	rv.Author = nil
	rv.SourceAuthor = ""
	rv.SourceURL = ""
}

// maskCommentAuthors hides the review author's own comments on a review they
// posted anonymously. Without it, a single reply under their real name in
// their own thread defeats the anonymity of the review above it. Comments by
// anyone else — including verified product-owner replies, who are never the
// review's author — are left untouched.
//
// A masked comment is, by construction, the review author's own comment: any
// other identifying field on models.Comment (CompanyName, IsOwnerReply, or
// anything added later) names or describes that same anonymous author and
// must be cleared here too. Author is the only field the fail-closed read
// path protects automatically (it is nil'd), so a new identifying column
// added to the struct is unprotected by default — whoever adds one must also
// add it to this function.
func maskCommentAuthors(comments []models.Comment, reviewAuthorID int64, reviewIsAnonymous bool) {
	if !reviewIsAnonymous {
		return
	}
	for i := range comments {
		if comments[i].AuthorUserID == reviewAuthorID {
			comments[i].Author = nil
			comments[i].CompanyName = ""
			comments[i].IsOwnerReply = false
			comments[i].IsAnonymous = true
		}
	}
}
