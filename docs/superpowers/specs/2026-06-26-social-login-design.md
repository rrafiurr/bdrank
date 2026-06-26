# Social Login (Google & Facebook) — Design Spec

**Date:** 2026-06-26
**Status:** Approved

## Overview

Add "Continue with Google" and "Continue with Facebook" to the end-user `/auth`
page. Social login is for **end users only**. Product owners and admins must
continue to use email/password login. The flow uses frontend-obtained provider
tokens that the backend verifies (Approach A — no redirect dance).

---

## 1. Data Model & Account Rules

### Migration (new file `be/migrations/007_social_login.sql`)

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'email' AFTER password_hash;

ALTER TABLE users
  MODIFY password_hash VARCHAR(255) NULL;
```

`auth_provider` values: `email`, `google`, `facebook`.
`password_hash` becomes nullable so social-only users have no password.

### Decision logic (shared by both providers)

After the backend verifies the provider token and obtains a **verified** email,
name, and avatar:

1. Look up user by email.
2. **Not found** → create a new regular end user:
   - `is_admin = 0`, `is_product_owner = 0`
   - `password_hash = NULL`
   - `auth_provider = <provider>`
   - `avatar_url` = provider picture
   - `full_name` = provider name
   - `username` = `NULL` (consistent with existing email registration, which
     also leaves username null)
   - Then log in.
3. **Found, regular user** (`is_admin = 0 AND is_product_owner = 0`) → log in.
   Link: if the existing `avatar_url` is empty, set it from the provider; always
   leave existing email/password intact. (An account first created via
   email/password can subsequently sign in via social with the same email.)
4. **Found, admin or product owner** → reject with HTTP 403 and message
   `"This account must sign in with email and password"`.

### Related fix to existing email login

`UserRepo.FindByEmail` currently scans `password_hash` into a `string`. With a
nullable column this fails for social-only users. Change the SELECT to
`COALESCE(password_hash,'')` so a social-only user who attempts email/password
login fails cleanly as "invalid credentials" (bcrypt compare against empty
hash fails) rather than producing a scan error.

---

## 2. Backend — Endpoints & Provider Verification

### New endpoints (public group in `be/internal/router/router.go`)

- `POST /api/v1/auth/google` — body `{ "credential": "<google-id-token>" }`
- `POST /api/v1/auth/facebook` — body `{ "access_token": "<fb-access-token>" }`

Both return `{ "token": "<jwt>", "user": <User> }` on success — identical shape
to `/auth/login`.

### Verification (new file `be/internal/auth/social.go`)

No new Go dependencies — verification uses `net/http` calls to provider
endpoints.

Common return type:

```go
type SocialProfile struct {
    Email     string
    Name      string
    AvatarURL string
    Provider  string // "google" | "facebook"
}
```

**`VerifyGoogle(ctx, credential, clientID string) (*SocialProfile, error)`**
- GET `https://oauth2.googleapis.com/tokeninfo?id_token=<credential>`
- Reject if HTTP status != 200.
- Validate `aud == clientID`.
- Validate `email_verified == "true"` (field comes back as a string).
- Extract `email`, `name`, `picture`.

**`VerifyFacebook(ctx, accessToken, appID, appSecret string) (*SocialProfile, error)`**
- GET `https://graph.facebook.com/debug_token?input_token=<accessToken>&access_token=<appID>|<appSecret>`
- Reject if `data.app_id != appID` or `data.is_valid != true`.
- GET `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=<accessToken>`
- If `email` is empty, return an error (`ErrNoEmail`) → handler responds 400
  `"Your Facebook account has no email; please sign up with email instead"`.
- Extract `email`, `name`, `picture.data.url`.

### Handler (methods on existing `AuthHandler` in `be/internal/handlers/auth.go`)

- `GoogleLogin(w, r)` — decode body, call `auth.VerifyGoogle`, then
  `users.FindOrCreateSocial`, then issue JWT via `auth.NewToken`.
- `FacebookLogin(w, r)` — same shape with `auth.VerifyFacebook`.
- On verification failure → 401 `"social login failed"`.
- On `ErrElevatedAccount` from the repo → 403
  `"This account must sign in with email and password"`.
- On `ErrNoEmail` → 400 (Facebook only).

### Repository (new method in `be/internal/repository/user.go`)

To avoid an import cycle (`repository` importing `auth`), the repo method takes
plain parameters rather than the `auth.SocialProfile` struct. The handler
unpacks the verified profile into these arguments:

```go
var ErrElevatedAccount = errors.New("elevated account requires email login")

func (r *UserRepo) FindOrCreateSocial(
    ctx context.Context,
    email, name, avatarURL, provider string,
) (*models.User, error)
```

Behavior implements the Section 1 decision logic. Returns `ErrElevatedAccount`
when the matched account is admin or product owner.

---

## 3. Frontend — Integration & UX

### Auth page (`fe/src/pages/Auth.tsx`)

Below the existing email form, add an "or continue with" divider and two
buttons: **Continue with Google** and **Continue with Facebook**. Shown in both
Sign In and Sign Up modes.

- A button is **hidden** when its provider env var is unset (graceful
  degradation in unconfigured environments).

### Google

- Add dependency `@react-oauth/google`.
- Wrap the app (`fe/src/App.tsx`) in `<GoogleOAuthProvider clientId={VITE_GOOGLE_CLIENT_ID}>`
  only when the client ID is present.
- Use the library to obtain a `credential` (ID token); POST it to `/auth/google`.

### Facebook

- Load the Facebook JS SDK via a script tag (helper in the Auth page or a small
  `fe/src/lib/facebook.ts`), initialized with `VITE_FACEBOOK_APP_ID`.
- On click, `FB.login({ scope: 'email' })` → obtain `authResponse.accessToken`
  → POST to `/auth/facebook`.

### Auth hook (`fe/src/hooks/useAuth.tsx`)

Add two methods that mirror `signIn`, reusing the existing `saveSession` flow:

```ts
signInWithGoogle: (credential: string) => Promise<void>;
signInWithFacebook: (accessToken: string) => Promise<void>;
```

Each POSTs to the respective endpoint and stores `{ token, user }`.

### Post-login behavior & errors

- On success the existing redirect runs. Social users are never owners, so they
  land on `/` (the owner redirect cannot trigger).
- A 403 elevated-account error shows a toast:
  `"This account must sign in with email and password"`.
- Other failures show a generic error toast (existing pattern).

### Not touched

`OwnerRegister.tsx`, the CMS login page, and all owner/admin auth paths remain
email-only — this enforces the email-only rule for elevated roles.

---

## 4. Config, Secrets & Deployment

### Backend config (`be/internal/config/config.go`)

| Field | Env var | Purpose |
|---|---|---|
| `GoogleClientID` | `GOOGLE_CLIENT_ID` | Validate Google token `aud` |
| `FacebookAppID` | `FACEBOOK_APP_ID` | `debug_token` app match |
| `FacebookAppSecret` | `FACEBOOK_APP_SECRET` | Build app token for `debug_token` |

### Frontend env (`fe/.env`, `.env.production`)

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_FACEBOOK_APP_ID`

### Deployment

- `deploy/deploy.sh` writes the two `VITE_*` vars into the FE `.env.production`.
- `deploy/VPS_DEPLOYMENT.md` documents the three backend env vars on the API
  service.

### Prerequisite (operator action, outside code)

Create a Google OAuth Client ID (Google Cloud Console) and a Facebook App
(Meta for Developers). Register authorized JavaScript origins:
`https://www.bdranks.com`, `https://bdranks.com`, and the local dev origin.
Buttons render once the IDs are configured; without them the providers reject
requests (and unset env hides the buttons).

---

## 5. Files Changed

| File | Change |
|---|---|
| `be/migrations/007_social_login.sql` | New: add `auth_provider`, make `password_hash` nullable |
| `be/internal/auth/social.go` | New: `VerifyGoogle`, `VerifyFacebook`, `SocialProfile` |
| `be/internal/handlers/auth.go` | Add `GoogleLogin`, `FacebookLogin` handlers |
| `be/internal/repository/user.go` | Add `FindOrCreateSocial`, `ErrElevatedAccount`; `COALESCE(password_hash,'')` in `FindByEmail` |
| `be/internal/config/config.go` | Add Google/Facebook config fields |
| `be/internal/router/router.go` | Wire `/auth/google`, `/auth/facebook` |
| `fe/package.json` | Add `@react-oauth/google` |
| `fe/src/App.tsx` | Conditional `GoogleOAuthProvider` wrapper |
| `fe/src/pages/Auth.tsx` | Social buttons + divider + handlers |
| `fe/src/hooks/useAuth.tsx` | `signInWithGoogle`, `signInWithFacebook` |
| `fe/src/lib/facebook.ts` | New: FB SDK loader/init helper |
| `deploy/deploy.sh` | Write `VITE_*` social env to `.env.production` |
| `deploy/VPS_DEPLOYMENT.md` | Document backend social env vars |

---

## 6. Out of Scope

- Linking/unlinking multiple providers to one account from a settings UI
- Apple / Twitter / other providers
- Social login for owners or admins (explicitly excluded)
- Migrating existing users to social
- Storing provider user IDs (`sub`) — linking is by verified email only
