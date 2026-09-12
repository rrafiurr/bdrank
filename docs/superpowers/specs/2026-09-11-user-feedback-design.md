# User Feedback — Design

**Date:** 2026-09-11
**Status:** Design approved, spec under review

## Summary

A logged-in user can send feedback about the platform from a `/feedback`
page: a type (bug, idea, complaint, praise, other) and a message. Admins
work through it in a CMS inbox, set a status, and can write one reply,
which the user sees on their profile.

The main requirement is that users cannot make a mess: no flooding, no
duplicates, no junk messages, no link spam, and nothing unsafe to render.
Timing limits live in a new reusable Redis rate limiter. Content rules run
in the handler. History-based rules (duplicates, open items, spam) run in
MySQL.

## Decisions

| Question | Decision |
|---|---|
| Who can send | Any logged-in user, including unverified product owners. They may need to report a problem with their own verification. |
| Fields | Type and message. The page the user came from (path only) and the browser user agent are captured automatically. |
| Admin side | Inbox with statuses, plus one editable admin reply that the user sees on their profile. |
| Reply depth | One admin reply. Users cannot reply back; a follow-up is new feedback. This gives an abuser no chat channel. |
| Rate limiting | A reusable Redis sliding-window limiter, applied to the route as middleware. Chosen over a MySQL-only check so it can protect reviews and comments later. |
| Notifications | In-app only: a "New reply" badge on the profile and a dot on the header avatar. The app has no email infrastructure. |
| Honeypot field | Not used. Browser autofill can fill hidden fields, which would silently drop real feedback. Login already filters out simple bots. |
| CAPTCHA | Not used. Every sender is logged in, so it would add friction and a third-party script for little gain. |
| Blocking a user | No block screen. An automatic spam pause does the job (see Rules). |
| Deleting feedback | Not offered. Marking spam keeps the history that the pause and duplicate checks depend on. |
| Floating feedback button | Rejected. It collides with the scroll-to-top button in the bottom-right corner and adds clutter to every page. |

## Request flow

```
POST /api/v1/feedback
  → mw.Auth                           401 when not logged in
  → mw.RateLimitPerUser("feedback")   429 + Retry-After when over a limit
  → FeedbackHandler.Create
      decode (16 KB cap) → validate → clean
      → FeedbackRepo.Admission         403 paused / 409 duplicate / 429 too many open
      → FeedbackRepo.Create            201
  ← handler answered ≥ 400?  →  limiter refunds the slot
```

The one-per-60-seconds rule means at most one request per user reaches the
handler at a time, so the MySQL checks need no locking of their own. If that
rule is ever removed, `Admission` and `Create` must run in one transaction
that locks the user's row, following the pattern in `be/internal/rewards/repo.go`.

## Rate limiter — `be/internal/ratelimit`

A sliding-window log in Redis. Each rule for each subject is a sorted set of
hit tokens scored by timestamp in milliseconds.

```go
type Rule struct {
	Name   string        // key suffix, e.g. "cooldown", "daily"
	Limit  int
	Window time.Duration
}

type Result struct {
	Allowed    bool
	RetryAfter time.Duration // set when !Allowed
	Rule       string        // name of the rule that denied
}

func New(rdb *redis.Client) *Limiter

// Allow checks every rule in one Lua script and records the hit in all of
// them only if all pass. The returned token identifies the hit for Refund.
func (l *Limiter) Allow(ctx context.Context, scope, subject string, rules []Rule) (Result, string, error)

// Refund removes a previously recorded hit from every rule.
func (l *Limiter) Refund(ctx context.Context, scope, subject string, rules []Rule, token string) error
```

- **Keys:** `rl:{<scope>:<subject>}:<rule>`, for example `rl:{feedback:42}:daily`.
  The braces are a Redis hash tag, which keeps one subject's keys in the same
  slot so the multi-key script stays valid if Redis is ever clustered. Each
  key gets a `PEXPIRE` equal to its window, so keys clean themselves up.
- **Atomic check-and-record:** the script first trims expired hits from every
  key and checks every count. It records the hit only if every rule passes,
  so one exceeded limit never uses up a slot in another.
- **Retry-After:** the time until the hit that would free a slot leaves the
  window. When several rules deny, the longest wait is returned.
- **Token:** `<now_ms>-<random hex>`, unique per hit, so `Refund` removes
  exactly that hit and nothing else.

### HTTP middleware — `be/internal/middleware/ratelimit.go`

```go
func RateLimitPerUser(l *ratelimit.Limiter, scope string, rules ...ratelimit.Rule) func(http.Handler) http.Handler
```

It lives next to `auth.go` and `admin.go`, runs after `Auth`, and keys on
`UserIDFromCtx`.

- **Over a limit:** 429 with a `Retry-After` header (whole seconds, rounded up)
  and `{"error": "...", "code": "rate_limited", "retry_after": 42}`.
- **Only successful requests count:** the middleware wraps the response writer.
  When the handler answers with a status of 400 or higher, it refunds the hit,
  so a typo does not cost the user one of their daily sends. The refund uses
  `context.WithoutCancel` with a 2-second timeout.
- **Fails closed:** if Redis cannot be reached, it answers 503 with code
  `rate_limit_unavailable` and the request goes no further. Session checks
  already depend on Redis, so this adds no new failure mode.

## Rules

| Check | Where | Rule | Code |
|---|---|---|---|
| Logged in | `mw.Auth` | required | 401 (existing) |
| Cooldown | Redis | 1 per 60 seconds | `rate_limited` |
| Daily cap | Redis | 5 per rolling 24 hours | `rate_limited` |
| Body | handler | valid JSON, at most 16 KB (`http.MaxBytesReader`) | `invalid_body` |
| Type | handler | `bug`, `idea`, `complaint`, `praise`, or `other` | `invalid_type` |
| Length | handler | 20–2,000 characters after cleaning, counted in runes so Bangla is measured correctly | `message_too_short` / `message_too_long` |
| Low effort | handler | at least 6 distinct non-space characters | `message_low_effort` |
| Links | handler | at most 2 matches of `http://`, `https://`, or `www.` (case-insensitive) | `too_many_links` |
| Spam pause | MySQL | 3 or more of the user's items created in the last 30 days are marked spam | `paused` |
| Duplicate | MySQL | the same fingerprint from the same user within 30 days | `duplicate` |
| Open items | MySQL | 10 or more of the user's items are `new` or `in_progress` | `too_many_open` |

The MySQL checks run in that order, so a paused user learns nothing else.

### Cleaning — `be/internal/feedback` (pure functions, unit-tested)

- Normalize `\r\n` to `\n` and turn tabs into spaces.
- Remove control characters (Unicode category Cc) except `\n`. Zero-width
  joiner and non-joiner (U+200D, U+200C) are **kept**, because Bangla uses
  them inside conjuncts.
- Trim, then collapse three or more consecutive newlines to two.
- The cleaned text is what gets stored. It is only ever rendered as plain
  text: React escaping with `whitespace-pre-wrap`, never `dangerouslySetInnerHTML`.

**Fingerprint** (for the duplicate check): SHA-256 in hex of the cleaned text,
lowercased, with every run of whitespace collapsed to one space.

**Page path:** kept only when it starts with `/` (but not `//`), has no control
characters, and is at most 300 characters. Otherwise it is stored as NULL. It
is never a reason to reject the request.

**User agent:** from the request header, truncated to 255 characters.

**Public status:** the user-facing API shows `spam` as `closed`. The other
statuses pass through unchanged.

The spam pause counts items by creation date, so it lifts on its own as
flagged items age past 30 days. An item marked spam long after it was sent
counts for less time. That is accepted, because admins usually triage within
days.

## Data model

Migration `be/migrations/016_feedback.sql`:

```sql
CREATE TABLE IF NOT EXISTS feedback (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  type         ENUM('bug','idea','complaint','praise','other') NOT NULL,
  message      TEXT NOT NULL,
  message_hash CHAR(64) NOT NULL,
  page_path    VARCHAR(300) NULL,
  user_agent   VARCHAR(255) NULL,
  status       ENUM('new','in_progress','resolved','spam') NOT NULL DEFAULT 'new',
  admin_reply  TEXT NULL,
  replied_at   TIMESTAMP NULL,
  reply_unread TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_feedback_user (user_id, created_at),
  INDEX idx_feedback_status (status, created_at),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`Admission` is one query over the user's own rows, reached through
`idx_feedback_user`:

```sql
SELECT
  COALESCE(SUM(status = 'spam' AND created_at > NOW() - INTERVAL 30 DAY), 0),
  COALESCE(SUM(message_hash = ? AND created_at > NOW() - INTERVAL 30 DAY), 0),
  COALESCE(SUM(status IN ('new','in_progress')), 0)
FROM feedback WHERE user_id = ?
```

## API

All paths are under `/api/v1`. Every error body is
`{"error": "<English sentence>", "code": "<code>"}`, plus `retry_after` when
the code is `rate_limited`. The `error` field matches the rest of the API.
The new `code` field lets the frontend show the message in English or Bangla.
A `writeErrorCode` helper joins `writeError` in `handlers/response.go`.

### User

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /feedback` | user + limiter | Body `{type, message, page_path?}`. Returns 201 with the created item. |
| `GET /feedback/mine` | user | The user's latest 50 items, newest first: `id, type, message, status` (public), `admin_reply, replied_at, reply_unread, created_at`. |
| `GET /feedback/mine/unread` | user | `{"count": n}`, the number of items with an unread reply. Drives the header dot. |
| `POST /feedback/mine/seen` | user | Clears `reply_unread` on all the user's items. 204. |

### Admin

| Method and path | Purpose |
|---|---|
| `GET /admin/feedback?status=&type=&limit=&offset=` | `{data, total}`, newest first. An empty or missing `status` or `type` means no filter; an unknown value returns 400. Items add `user {id, username, email}`, `page_path`, `user_agent`, and the raw `status`. |
| `PATCH /admin/feedback/{id}` | Body `{status?, admin_reply?}`. |
| `GET /admin/stats` | Gains `new_feedback`, the count of items with status `new`. |

`PATCH` rules:

- `status` must be one of the four values, or it returns 400 `invalid_status`.
- `admin_reply` is trimmed. An empty string clears the reply (`admin_reply`
  and `replied_at` go to NULL and `reply_unread` to 0). Otherwise it must be
  1–2,000 characters, or it returns 400 `invalid_reply`.
- A reply that differs from the stored one sets `replied_at = NOW()` and
  `reply_unread = 1`. Saving identical text changes nothing.
- A reply does not change the status. Admins set status explicitly.

## Frontend (`fe/`)

### `/feedback` page — `pages/Feedback.tsx` and `components/FeedbackForm.tsx`

- Route added in `App.tsx`. `PageHead` is marked `noindex`.
- Logged-out visitors are sent to `/auth`, as `ReviewForm` does today.
- **Type:** five chips with icons. Bug (`Bug`), Idea (`Lightbulb`),
  Complaint (`AlertCircle`), Praise (`Heart`), Other (`MessageCircle`).
- **Message:** a textarea with a live character counter and a hint that
  follows the chosen type, for example for Bug: "What were you doing, and
  what went wrong?"
- **Client-side rules:** `lib/feedbackRules.ts` mirrors the server's length,
  low-effort, and link rules, counting characters with `[...text].length` to
  match Go's runes. Errors appear under the field, following `ReviewForm`'s
  inline-error pattern with `aria-invalid` and `aria-describedby`. The server
  still has the final say.
- **Page path:** entry links pass `state={{ from: location.pathname }}`, and the
  page sends `location.state?.from` when present.
- **Submitting:** the button is disabled while the request is in flight.
- **Success:** the form is replaced by a thank-you state with "See your
  feedback" (links to the profile) and "Send another" (resets the form).
- **Errors:** each `code` maps to `feedback.errors.<code>`. `rate_limited`
  shows the wait, for example "You can send more feedback in 42 minutes",
  with numbers localized for Bangla. Network failures use a toast, as elsewhere.

### Entry points

- Header user dropdown and mobile menu: "Send feedback", shown to logged-in users.
- Footer: "Send feedback", shown to everyone. Logged-out visitors end up at sign-in.
- Profile "My feedback" card: a "Send feedback" button.

### Profile — `components/MyFeedback.tsx`

- A card after "My comments" on `pages/Profile.tsx`, matching that card's styling.
- Each item shows its type icon, date, status badge (New / In progress /
  Resolved / Closed), and message. An admin reply appears in a highlighted
  "Reply from BdRanks" box with its date.
- Items with `reply_unread` get a "New reply" badge. After the list loads, the
  card calls `POST /feedback/mine/seen` and invalidates the unread query. The
  badges come from the data already fetched, so they stay visible for this visit.
- **Empty state:** "You haven't sent any feedback yet", with a "Send feedback" button.

### Header dot

- For logged-in users, the header queries `GET /feedback/mine/unread` through
  React Query (`["feedback-unread"]`, `staleTime` 60 seconds), so moving
  between pages does not refetch every time.
- When the count is above 0, a small dot shows on the avatar button and
  beside "My profile" in the dropdown and the mobile menu.

### Copy

All new strings are added to `locales/en/translation.json` and `locales/bn/translation.json`.

## CMS (`cms/`)

- **`pages/Feedback.tsx`:** a new route, plus a sidebar item with a count
  badge fed by `stats.new_feedback`, following the Comments item.
- **Table:** date, user (username and email), type badge, message preview
  (one line), page path, and a status `Select` that saves immediately, like
  the home-placement control on Products.
- **Filters:** status (defaults to New) and type. Paginated with
  `limit`/`offset`, as on Comments.
- **Row dialog:** the full message (`whitespace-pre-wrap`, plain text), user
  agent, page path, and a reply textarea (2,000 characters max) with Save.
- **Types:** `AdminFeedback` is added to `cms/src/lib/api.ts`.

## Testing

1. **Unit, `be/internal/feedback`:** table-driven tests for cleaning (CRLF,
   tabs, control characters removed, ZWJ/ZWNJ kept, blank-line collapse),
   each validation code at its boundary (19/20 and 2,000/2,001 runes,
   including an all-Bangla message), the low-effort and link rules, fingerprint
   stability under case and spacing changes, page-path acceptance, and
   public status mapping.
2. **Limiter, `be/internal/ratelimit`, against a throwaway `redis:7-alpine`
   container.** Skipped when `REDIS_TEST_ADDR` is unset. Covers:
   - allows up to the limit and then denies with the correct `RetryAfter`
   - a window sliding open again
   - all-or-nothing across rules, so a denial by one rule leaves the others untouched
   - `Refund` removing exactly one hit
   - 20 goroutines at once against a limit of 5, where exactly 5 are allowed
3. **Middleware:** returns 429 with a `Retry-After` header, refunds when the
   handler answers 400 or higher, keeps the hit on 2xx, and returns 503 when
   Redis is unreachable.
4. **Integration against a throwaway MySQL 8.4** with the real migrations:
   `Admission` returns `paused`, `duplicate`, and `too_many_open` in the right
   order. `PATCH` sets `reply_unread` only when the reply text changes.
5. `go vet ./...` and `go test ./...` in `be/`, run through Docker.
6. `npx tsc --noEmit -p tsconfig.app.json` in `fe/` and `cms/`. `npm run build`
   does not type-check, and there is no frontend test runner.
7. **Manual:**
   - send feedback
   - send again right away and see the cooldown message
   - send the same text after the cooldown and see the duplicate message
   - reply from the CMS
   - see the header dot and the "New reply" badge, and the dot clearing after
     the profile is opened
   - mark three items spam and see the pause message

## Rollout

Migrations are applied by hand on the VPS (`deploy/VPS_DEPLOYMENT.md`, step 9),
and a push to `main` deploys to production. **Apply `016_feedback.sql` on the
VPS before merging.** Otherwise every `/feedback` and `/admin/feedback` call
answers 500. `/admin/stats` would not fail, because it ignores scan errors and
would report `new_feedback` as 0, which hides the problem rather than
announcing it.

## Out of scope

- Email notifications
- User replies and threads
- Screenshots or attachments
- Deleting feedback, and a manual block screen
- Analytics or export of feedback
- Applying the limiter to reviews and comments. It is built to allow this; each would be its own change.
