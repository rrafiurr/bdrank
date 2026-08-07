# Anonymous Reviews — Design

**Date:** 2026-08-07
**Status:** Approved, ready for implementation planning

## Summary

A logged-in user can mark an individual review as anonymous. The review's author
name and avatar are hidden from the public, from product owners, and from the
review's own comment thread. The author's rewards-level badge still shows. The
choice is per-review: the same account can post one review under its name and
the next anonymously.

## Decisions

| Question | Decision |
|---|---|
| "Verified sign" | Out of scope. Badge only. No verified mark for regular reviewers exists today, and adding one (verified purchase) is a separate feature. |
| Who can still see the real identity | Admins (CMS moderation) and the author. Not the public, not product owners. |
| Public display | A neutral icon plus a localized "Anonymous" label, identical for every anonymous review. No per-review number, no stable per-user alias — both allow correlation across reviews. |
| Reversible after publishing | Yes, freely togglable both ways from the author's profile. |
| Author commenting on their own anonymous review | Their comments render as Anonymous too, with their badge. |

### Accepted risk: the reveal direction

Toggling anonymity **off** is not truly reversible — anyone who already saw the
name, and any search engine that indexed the page, retains it. Turning the flag
back on does not undo that. The user accepted this. Mitigation is a confirmation
dialog on the reveal direction only (see Frontend).

## Architecture: fail-closed masking in the repository

Masking happens in `ReviewRepo` and `CommentRepo`, not in the handlers.

`ReviewRepo` gains an opt-in `RevealIdentity bool`. Its zero value means masked,
so every existing call site is safe without being modified, and any endpoint
added later that forgets about anonymity renders *Anonymous*. The failure mode
is over-hiding, not a leaked name — the correct default for a privacy feature.

The rejected alternative was masking at the handler boundary. There are five
author-bearing read paths today (`ReviewRepo.List`, `ReviewRepo.FindByID`, the
review-comments query, `ReviewRepo.ListByOwner`, and `CommentRepo`'s
post-create fetch); handler-side masking fails open, so one missed call site
silently unmasks a user who was promised anonymity.

Storing the review with no `user_id` was also rejected: it breaks rewards, the
author's own profile listing, moderation, and the toggle itself.

## Data model

Migration `be/migrations/012_anonymous_reviews.sql`:

```sql
ALTER TABLE reviews ADD COLUMN is_anonymous TINYINT(1) NOT NULL DEFAULT 0;
```

`reviews.user_id` is unchanged. Anonymity is a display property, not a storage
one. No new table, no nullable foreign key.

## API

### Model changes (`be/internal/models/models.go`)

`Review` and `Comment` each gain:

```go
AuthorUserID int64 `json:"-"`             // always the real author; never serialized
IsAnonymous  bool  `json:"is_anonymous"`
```

`AuthorUserID` exists because badge decoration currently reads `Author.ID`, and
`Author` becomes `nil` when masked. `decorateReviewBadges` and
`decorateCommentBadges` in `be/internal/handlers/reviews.go` switch to
`AuthorUserID`, so an anonymous review keeps its badge.

### Masked response shape

When masked, the repository sets `Author = nil` and `IsAnonymous = true`. The
`omitempty` tag is dropped from `Review.Author` so a masked review serializes as
an explicit `"author": null` rather than omitting the key, matching `Comment`
and giving the frontend one shape to handle. It does not write the literal
string "Anonymous" into `username`: the app is
bilingual (i18next, en + bn), so the label belongs on the frontend where it can
be translated, and a `null` author cannot be confused with a real user named
"Anonymous".

```json
{
  "id": 42,
  "title": "...",
  "author": null,
  "is_anonymous": true,
  "author_badge": { "name": "Gold Reviewer", "icon": "🥇", "color": "#D4AF37" }
}
```

### Per-surface behaviour

| Surface | Identity |
|---|---|
| `GET /reviews` | masked |
| `GET /reviews/{id}` | masked |
| `GET /products/{id}/reviews` | masked |
| `GET /owner/reviews` (`ReviewRepo.ListByOwner`) | masked — owners do not see through it |
| `GET /profile/reviews` | real (author's own), plus `is_anonymous` so the toggle can render |
| `GET /admin/reviews`, `/admin/reviews/{id}` | real — unchanged; `be/internal/handlers/admin.go` has its own SQL and never calls `ReviewRepo` |

### Search leak fix

`be/internal/repository/review.go` matches the search query against
`u.username`, so searching a person's name would surface their anonymous
reviews. The clause becomes:

```sql
(r.title LIKE ? OR p.name LIKE ? OR (u.username LIKE ? AND r.is_anonymous = 0))
```

### Comment masking rule

A comment is masked if and only if **the review is anonymous AND the commenter
is the review's author**. Both comment read paths — the review's thread in
`be/internal/repository/review.go` and the just-posted comment in
`be/internal/repository/comment.go` — join `reviews` to evaluate it. Other
users' comments are unaffected. Owner replies (`is_owner_reply`) are never
masked, since an owner is not the review's author.

### New endpoint

```
PATCH /reviews/{id}/anonymity
Body: { "is_anonymous": true|false }
```

Requires auth. Returns 403 unless `ReviewRepo.IsAuthor` passes. Responds with
the new state. Registered beside the other authenticated review routes in
`be/internal/router/router.go`.

### Create endpoint

`POST /reviews` reads an optional `is_anonymous` field from the existing
multipart form and persists it. Rewards are awarded exactly as they are today —
anonymous reviews still earn points and count toward the leaderboard, which
leaks nothing because the leaderboard shows totals, not which reviews produced
them.

## Frontend

- **`fe/src/components/ReviewForm.tsx`** — a checkbox above the submit button,
  "Post this review anonymously", with a one-line explainer that the name and
  avatar are hidden while the level badge still shows. Sends `is_anonymous` in
  the existing multipart body.
- **`fe/src/components/ReviewCard.tsx`** — when `is_anonymous`, render a neutral
  icon and `t("review.anonymous")` in place of `<UserAvatar>` and the name.
  `<LevelBadge>` renders unchanged.
- **`fe/src/pages/ReviewDetails.tsx`** — the same treatment on the review header
  and on masked comments.
- **`fe/src/pages/Profile.tsx`** — each review row shows an Anonymous chip and a
  switch calling `PATCH /reviews/{id}/anonymity`. Turning anonymity **off**
  opens a confirmation dialog stating that revealing the name is public and
  permanent for anyone who sees it or indexes the page, and that turning it back
  on does not undo that. Turning it **on** applies immediately with no dialog.
- **Types** — `fe/src/lib/api.ts` gains `is_anonymous` on the review and comment
  types, and `author` becomes nullable. All existing `author.username` and
  `author.avatar_url` reads must be made null-safe.
- **i18n** — new keys `review.anonymous`, `reviewForm.anonymousLabel`,
  `reviewForm.anonymousHint`, and the confirmation-dialog strings, added to both
  `fe/src/locales/en/translation.json` and `fe/src/locales/bn/translation.json`.

## CMS

No change. Admin review and comment listings keep showing the real author. An
`Anonymous` indicator column may be added later if moderators ask for it; it is
not part of this work.

## Testing

Go tests at the masking boundary, where the risk concentrates:

1. A masked list and detail response has `author == nil`, `is_anonymous == true`,
   and a non-nil `author_badge`.
2. `RevealIdentity` returns the real author for the same review.
3. A non-anonymous review is unaffected: `author` populated, `is_anonymous == false`.
4. On an anonymous review, the author's own comment is masked while a third
   party's comment in the same thread is not.
5. Searching the author's username returns their public reviews and excludes
   their anonymous ones.
6. `PATCH /reviews/{id}/anonymity` returns 403 for a non-author and flips the
   flag for the author.

## Out of scope

- Any "verified purchase" or verified-reviewer mark.
- Anonymous comments on someone else's review — only the review author's own
  comments on their own anonymous review are masked.
- Hiding anonymous reviews from the rewards leaderboard.
- A CMS indicator column for anonymous reviews.
