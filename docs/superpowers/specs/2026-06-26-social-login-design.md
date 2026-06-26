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

---

## 7. Production Go-Live Runbook

The code is shipped. Social login will not work until the steps below are done.
Do them in order. Steps 1–2 happen in provider consoles; 3–6 on the
server/repo; 7 verifies.

You will end up with **three values**, reused across backend and frontend:

| Value | Used as (backend env) | Used as (frontend env) |
|---|---|---|
| Google OAuth Client ID | `GOOGLE_CLIENT_ID` | `VITE_GOOGLE_CLIENT_ID` (same value) |
| Facebook App ID | `FACEBOOK_APP_ID` | `VITE_FACEBOOK_APP_ID` (same value) |
| Facebook App Secret | `FACEBOOK_APP_SECRET` | — (backend only, never exposed) |

### Step 1 — Create the Google OAuth Client ID

1. Go to <https://console.cloud.google.com> → create or select a project.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name, user support email, developer contact email.
   - Authorized domain: `bdranks.com`.
   - Scopes: `email`, `profile`, `openid` (the defaults are enough).
   - **Publish the app** ("Publishing status: In production"). While it is in
     "Testing" only listed test users can sign in (and there is a 100-user
     cap).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins** (this is the field that matters for the
     Sign-In button — no redirect URIs are needed):
     - `https://bdranks.com`
     - `https://www.bdranks.com`
     - `http://localhost:8080` (local dev; the Vite dev server runs on 8080)
4. Copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).
   This is both `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`.

### Step 2 — Create the Facebook App

1. Go to <https://developers.facebook.com/apps> → **Create App**.
   - Use case: **Authenticate and request data from users with Facebook Login**
     (a "Consumer"-type app).
2. Add the **Facebook Login** product.
3. **App settings → Basic**:
   - Add **App Domains**: `bdranks.com`.
   - Set **Site URL**: `https://bdranks.com`.
   - Copy **App ID** → `FACEBOOK_APP_ID` / `VITE_FACEBOOK_APP_ID`.
   - Copy **App Secret** → `FACEBOOK_APP_SECRET` (backend only).
4. **Facebook Login → Settings**:
   - **Login with the JavaScript SDK**: **Yes**.
   - **Allowed Domains for the JavaScript SDK**:
     - `https://bdranks.com`
     - `https://www.bdranks.com`
     - `http://localhost:8080`
5. **Switch the app to "Live"** (toggle at the top of the dashboard). In
   "Development" mode only people with a role on the app can log in. The
   `email` and `public_profile` permissions are granted by default and need no
   App Review.

> If a Facebook user has no email on their account (or denies the email
> permission), the backend returns 400 and the UI tells them to sign up with
> email — this is expected behavior, not a bug.

### Step 3 — Set the backend environment variables

On the VPS, edit `be/.env.prod` and fill in the three values:

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
FACEBOOK_APP_ID=000000000000000
FACEBOOK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 4 — Set the frontend environment variables

The FE values are baked in at **build time**. Provide them to `deploy.sh`
(which writes them into `fe/.env.production`):

- **Manual deploy:** export before running the deploy script:
  ```bash
  export VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
  export VITE_FACEBOOK_APP_ID=000000000000000
  ./deploy/deploy.sh
  ```
- **CI deploy (push to `deploy` branch):** add `VITE_GOOGLE_CLIENT_ID` and
  `VITE_FACEBOOK_APP_ID` as GitHub Actions secrets/variables and expose them as
  env to the deploy step in `.github/workflows/deploy.yml`, so they are present
  in the shell when `deploy.sh` runs.

> If these are left empty, the build still succeeds and the buttons simply stay
> hidden — safe, but social login will not appear.

### Step 5 — Apply the database migration

Run `007_social_login.sql` against the production DB (adds `auth_provider`,
makes `password_hash` nullable):

```bash
source <(grep DB_PASSWORD /home/deploy/reviewhub/be/.env.prod)

docker compose -f /home/deploy/reviewhub/be/docker-compose.prod.yml \
  exec mysql \
  mysql -u reviewhub -p"$DB_PASSWORD" reviewhub \
  < /home/deploy/reviewhub/be/migrations/007_social_login.sql
```

### Step 6 — Deploy / restart

```bash
cd /home/deploy/reviewhub
./deploy/deploy.sh
```

The backend reads env from `.env.prod`. Because env changed, force a fresh
container so the new variables are picked up (a plain restart does NOT re-read
env files):

```bash
docker compose -f be/docker-compose.prod.yml up -d --force-recreate
```

### Step 7 — Verify

1. Open <https://bdranks.com/auth> in a fresh/incognito window → the Google and
   Facebook buttons appear.
2. **New user:** sign in with a Google account whose email is not yet in the
   DB → a regular user is created and you land on the home page.
3. **Returning user:** sign in again with the same account → logs into the same
   user (no duplicate).
4. **Elevated account is blocked:** with an email that belongs to an admin or
   product owner, attempt social login → toast "This account must sign in with
   email and password", and no session is created.
5. **Server log** shows no `ERROR Google verify` / `ERROR Facebook verify`
   lines on the success paths. (A verification error there usually means a
   wrong/mismatched Client ID or App ID/Secret, or the app is still in
   Testing/Development mode.)

### Common go-live mistakes

| Symptom | Likely cause |
|---|---|
| Buttons don't appear at all | `VITE_*` vars empty at build time — rebuild FE with them exported |
| Google popup error / `redirect_uri`/origin error | Origin not added under Authorized JavaScript origins, or consent screen still in Testing |
| Google works for you but not other users | OAuth consent screen not published ("In production") |
| Facebook works for you but not others | App still in "Development" mode — switch to Live |
| `social login failed` toast (400) | Backend `GOOGLE_CLIENT_ID`/`FACEBOOK_APP_*` wrong or not loaded — re-check `.env.prod` and `--force-recreate` |
| Backend env changes not taking effect | Used `docker restart` instead of `up -d --force-recreate` |
