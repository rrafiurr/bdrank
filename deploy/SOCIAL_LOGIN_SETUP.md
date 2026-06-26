# Social Login — Provider Setup Guide

Operator guide for creating the Google and Facebook apps that power social login
on `bdranks.com`. Follow it click-by-click. You will produce **three values**:

| Value | Backend env (`be/.env.prod`) | Frontend build env |
|---|---|---|
| Google OAuth **Client ID** | `GOOGLE_CLIENT_ID` | `VITE_GOOGLE_CLIENT_ID` (same value) |
| Facebook **App ID** | `FACEBOOK_APP_ID` | `VITE_FACEBOOK_APP_ID` (same value) |
| Facebook **App Secret** | `FACEBOOK_APP_SECRET` | — (backend only, never exposed) |

The three origins used everywhere below:

- `https://bdranks.com`
- `https://www.bdranks.com`
- `http://localhost:8080` (local dev — the Vite dev server runs on port 8080)

---

## Google

End result: one **Client ID**. (~10 minutes.)

### Part A — Create / select a project
1. Go to <https://console.cloud.google.com>
2. Top-left, click the **project dropdown** (next to the "Google Cloud" logo).
3. **New Project** → name it `bdranks` → **Create**.
4. Wait a few seconds, then confirm the new project is selected in the dropdown.

### Part B — Configure the OAuth consent screen
This is what users see in the Google popup. Must be done before creating credentials.

1. Left menu (☰) → **APIs & Services** → **OAuth consent screen**.
   (Newer console may label this **Branding** / **Audience** under APIs & Services — same thing.)
2. **User type: External** → **Create**.
3. Fill the required fields:
   - **App name:** `BDRanks`
   - **User support email:** your email
   - **Developer contact information:** your email (bottom of page)
   - Logo / domain fields are optional — leave blank for now.
4. **Save and Continue.**
5. **Scopes** page → **Save and Continue** (defaults `email`, `profile`, `openid` are enough — add nothing).
6. **Test users** page → **Save and Continue** (skip).
7. On the summary, find **Publishing status** (shows **Testing**) → click **PUBLISH APP** → confirm → it should read **In production**.
   - ⚠️ If left in **Testing**, only listed test users can log in. Publishing makes it work for everyone.

### Part C — Create the OAuth Client ID
1. Left menu → **APIs & Services** → **Credentials**.
2. **+ Create Credentials** → **OAuth client ID**.
3. **Application type: Web application.**
4. **Name:** `bdranks-web` (internal label only).
5. **Authorized JavaScript origins** → **+ Add URI** for each (this is the field that matters — no redirect URIs are needed):
   - `https://bdranks.com`
   - `https://www.bdranks.com`
   - `http://localhost:8080`
6. **Create.**

### Part D — Copy the value
1. The popup shows **Your Client ID** (e.g. `1234567890-abcdefg.apps.googleusercontent.com`).
2. Copy it. Used as both `GOOGLE_CLIENT_ID` (backend) and `VITE_GOOGLE_CLIENT_ID` (frontend).
3. You do **not** need the Client secret for this setup.

---

## Facebook

End result: an **App ID** and an **App Secret**. (~15 minutes.)

### Part A — Create the app
1. Go to <https://developers.facebook.com>
2. Log in. First time only: top-right **Get Started** → register as a developer and verify your account (phone/email).
3. Top-right → **My Apps** → **Create App**.
4. **Use case** screen → select **Authenticate and request data from users with Facebook Login** → **Next**.
5. You **may or may not** be asked about a **business portfolio** (Meta changes
   this flow often):
   - If the step doesn't appear → just continue.
   - If it appears and is skippable → leave it empty / choose "later" → **Next**.
   - If it forces a choice → **Create new business portfolio**, give it any
     name (e.g. `BDRanks`), continue. It's only an org container and has no
     effect on our setup.
6. **App name:** `BDRanks`; add your contact email → **Create app** (may ask for your Facebook password).

### Part B — Confirm the Facebook Login product is added
1. In the left menu of the app dashboard you should see **Facebook Login** under **Products**.
2. If it is not there: find **Facebook Login** in the product list and click **Set up**. (Choosing the use case in Part A usually adds it automatically.)

### Part C — Basic settings: App ID, App Secret, domains
1. Left menu → **App settings** → **Basic**.
2. Copy the **App ID** (top of page) → this is `FACEBOOK_APP_ID` / `VITE_FACEBOOK_APP_ID`.
3. Next to **App secret**, click **Show** (re-enter your Facebook password) → copy it → this is `FACEBOOK_APP_SECRET` (backend only — never put it in frontend env).
4. **App Domains** → add: `bdranks.com`
5. Scroll down → **+ Add Platform** → **Website** → **Site URL:** `https://bdranks.com`
6. **Save changes.**

### Part D — Facebook Login settings: JavaScript SDK + allowed domains
1. Left menu → **Facebook Login** → **Settings**.
2. **Login with the JavaScript SDK** → toggle **Yes**.
3. **Allowed Domains for the JavaScript SDK** → add all three:
   - `https://bdranks.com`
   - `https://www.bdranks.com`
   - `http://localhost:8080`
4. Leave **Valid OAuth Redirect URIs** blank (not used by the JS SDK flow).
5. **Save changes.**

### Part E — Switch the app to Live
1. At the top of the dashboard, find the mode toggle near the app name: **In development** → switch to **Live**.
2. Going Live requires a **Privacy Policy URL** (and a category). Provide your
   privacy page, e.g. `https://bdranks.com/page/privacy-policy` (use your actual
   privacy page slug), pick a **Category**, then confirm.
3. Status should now read **Live**.
   - ⚠️ In **Development** mode only people with a role on the app can log in.
     The `email` and `public_profile` permissions are granted by default and
     need **no** App Review.

### Part F — Copy the values
- **App ID** → `FACEBOOK_APP_ID` (backend) + `VITE_FACEBOOK_APP_ID` (frontend)
- **App Secret** → `FACEBOOK_APP_SECRET` (backend only)

---

## After you have all three values

See **`docs/superpowers/specs/2026-06-26-social-login-design.md` → Section 7
(Production Go-Live Runbook)** for plugging them into `.env.prod` / the FE build,
applying the DB migration, deploying, and verifying.

Quick reference:

```env
# be/.env.prod
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
FACEBOOK_APP_ID=000000000000000
FACEBOOK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
# frontend build (export before ./deploy/deploy.sh, or add as CI secrets)
export VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
export VITE_FACEBOOK_APP_ID=000000000000000
```

### Kill switch (temporarily turn social login off)

Set the frontend env var **`VITE_SOCIAL_LOGIN_ENABLED=false`** to hide both
Google and Facebook buttons, regardless of whether the provider IDs are set.
Unset (or any value other than `false`) = enabled.

- Local: in `fe/.env` → `VITE_SOCIAL_LOGIN_ENABLED=false`, restart `npm run dev`.
- Production: export `VITE_SOCIAL_LOGIN_ENABLED=false` before `./deploy/deploy.sh`
  (or set it as a CI variable). It is a **build-time** value, so the FE must be
  rebuilt for a change to take effect.

To turn social login back on, set it to `true` (or remove it) and rebuild.

### Common mistakes
| Symptom | Cause |
|---|---|
| Buttons don't appear | `VITE_*` empty at build time — rebuild FE with them exported |
| Google works for you, not others | Consent screen still in **Testing** — publish it |
| Facebook works for you, not others | App still **In development** — switch to **Live** |
| `social login failed` toast | Backend env wrong/not loaded — recheck `.env.prod`, then `docker compose ... up -d --force-recreate` (not `docker restart`) |
| Origin / popup error | The exact origin isn't in Authorized JavaScript origins (Google) / Allowed Domains (Facebook) |
