# Social Login (Google & Facebook) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google and Facebook social login for end users only on the `/auth` page, while product owners and admins remain email-only.

**Architecture:** Frontend obtains a provider token (Google ID token / Facebook access token) client-side and POSTs it to a new backend endpoint. The Go backend verifies the token directly with the provider over HTTP, applies account rules (link regular / block elevated / create new end user), and issues the existing JWT. No redirect flow, no new Go dependencies.

**Tech Stack:** Go (Chi, database/sql, MySQL, net/http), React 18 + TypeScript + Vite, TanStack React Query, shadcn/ui, `@react-oauth/google`, Facebook JS SDK.

## Global Constraints

- No test suite exists in this project — skip TDD; verify backend with `go build`/curl and frontend with `npm run build`
- Go is NOT installed on the local machine — verify backend changes by careful review and (where possible) `gofmt`; do not claim `go build` passed unless it actually ran
- Social login is for **end users only**: admins and product owners must be rejected and told to use email login
- Account linking is by **verified email only** — no provider `sub` is stored
- `auth_provider` column values are exactly: `email`, `google`, `facebook`
- No new Go module dependencies — verification uses stdlib `net/http`
- Frontend adds exactly one dependency: `@react-oauth/google`
- A social button is hidden when its provider env var is unset (graceful degradation)
- Backend social endpoints return **400** (not 401) on verification failure, because `fe/src/lib/api.ts` globally intercepts 401 and redirects the page — a 401 would prevent the error toast from showing
- All backend handlers use `writeJSON`/`writeError` from `be/internal/handlers/response.go`
- All frontend API calls use `apiFetch` from `fe/src/lib/api.ts`

---

### Task 1: Backend foundation — migration, config, nullable password fix

**Files:**
- Create: `be/migrations/007_social_login.sql`
- Modify: `be/internal/config/config.go`
- Modify: `be/internal/repository/user.go` (the `FindByEmail` SELECT only)
- Modify: `be/.env.prod.example`
- Modify: `deploy/VPS_DEPLOYMENT.md`

**Interfaces:**
- Produces: `cfg.GoogleClientID`, `cfg.FacebookAppID`, `cfg.FacebookAppSecret` (all `string`) on `*config.Config`
- Produces: `users.auth_provider` column (default `'email'`) and nullable `users.password_hash`

- [ ] **Step 1: Create the migration**

Create `be/migrations/007_social_login.sql`:

```sql
-- Social login: track auth provider and allow passwordless (social-only) users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'email' AFTER password_hash;

ALTER TABLE users
  MODIFY password_hash VARCHAR(255) NULL;
```

- [ ] **Step 2: Add config fields**

In `be/internal/config/config.go`, add three fields to the `Config` struct (after `ExternalPass`):

```go
	ExternalUser   string
	ExternalPass   string
	GoogleClientID    string
	FacebookAppID     string
	FacebookAppSecret string
```

And in `Load()`, add (after the `ExternalPass` line, before the closing `}`):

```go
		ExternalPass:  getEnv("EXTERNAL_PASS", ""),
		GoogleClientID:    getEnv("GOOGLE_CLIENT_ID", ""),
		FacebookAppID:     getEnv("FACEBOOK_APP_ID", ""),
		FacebookAppSecret: getEnv("FACEBOOK_APP_SECRET", ""),
```

- [ ] **Step 3: Fix `FindByEmail` for nullable password_hash**

In `be/internal/repository/user.go`, in `FindByEmail`, change the SELECT so `password_hash` cannot scan a NULL into a string. Replace:

```go
		        COALESCE(company_name,''), password_hash, created_at
```

with:

```go
		        COALESCE(company_name,''), COALESCE(password_hash,''), created_at
```

(Only that one line changes. The `Scan` into `&hash` stays the same; a social-only user now scans an empty string and bcrypt comparison fails cleanly as "invalid credentials".)

- [ ] **Step 4: Document env vars (backend)**

In `be/.env.prod.example`, append at the end:

```env

# Social login (end users only)
GOOGLE_CLIENT_ID=CHANGE_TO_GOOGLE_OAUTH_CLIENT_ID
FACEBOOK_APP_ID=CHANGE_TO_FACEBOOK_APP_ID
FACEBOOK_APP_SECRET=CHANGE_TO_FACEBOOK_APP_SECRET
```

In `deploy/VPS_DEPLOYMENT.md`, in the env section around Step 6 (after the `ALLOWED_ORIGINS` example block, line ~153), add a short note:

```markdown

For social login, also set in `.env.prod`:

```env
GOOGLE_CLIENT_ID=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
```
```

- [ ] **Step 5: Verify formatting and commit**

If Go is available: `cd be && gofmt -l ./internal/config/config.go ./internal/repository/user.go` (expect no output) and `go build ./...` (expect clean). If Go is not available, visually confirm the struct/field alignment compiles.

```bash
git add be/migrations/007_social_login.sql be/internal/config/config.go be/internal/repository/user.go be/.env.prod.example deploy/VPS_DEPLOYMENT.md
git commit -m "feat: social login DB+config foundation"
```

---

### Task 2: Backend — provider verification

**Files:**
- Create: `be/internal/auth/social.go`

**Interfaces:**
- Produces: `auth.SocialProfile{ Email, Name, AvatarURL, Provider string }`
- Produces: `auth.ErrNoEmail` (error)
- Produces: `auth.VerifyGoogle(ctx context.Context, credential, clientID string) (*SocialProfile, error)`
- Produces: `auth.VerifyFacebook(ctx context.Context, accessToken, appID, appSecret string) (*SocialProfile, error)`

- [ ] **Step 1: Create `be/internal/auth/social.go`**

```go
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
)

// ErrNoEmail is returned when a provider does not supply an email address.
var ErrNoEmail = errors.New("no email from provider")

// SocialProfile is the verified, normalized identity from an OAuth provider.
type SocialProfile struct {
	Email     string
	Name      string
	AvatarURL string
	Provider  string // "google" | "facebook"
}

// VerifyGoogle validates a Google ID token via the tokeninfo endpoint and
// returns the verified profile. It rejects tokens whose audience does not
// match clientID or whose email is unverified.
func VerifyGoogle(ctx context.Context, credential, clientID string) (*SocialProfile, error) {
	endpoint := "https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(credential)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google tokeninfo status %d", resp.StatusCode)
	}

	var body struct {
		Aud           string `json:"aud"`
		Email         string `json:"email"`
		EmailVerified string `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	if body.Aud != clientID {
		return nil, errors.New("google token audience mismatch")
	}
	if body.EmailVerified != "true" {
		return nil, errors.New("google email not verified")
	}
	if body.Email == "" {
		return nil, ErrNoEmail
	}
	return &SocialProfile{
		Email:     body.Email,
		Name:      body.Name,
		AvatarURL: body.Picture,
		Provider:  "google",
	}, nil
}

// VerifyFacebook confirms the access token belongs to our app (via debug_token)
// and then fetches the user profile. It returns ErrNoEmail when Facebook does
// not provide an email.
func VerifyFacebook(ctx context.Context, accessToken, appID, appSecret string) (*SocialProfile, error) {
	// 1. Confirm the token was issued for our app.
	appToken := url.QueryEscape(appID + "|" + appSecret)
	debugURL := fmt.Sprintf(
		"https://graph.facebook.com/debug_token?input_token=%s&access_token=%s",
		url.QueryEscape(accessToken), appToken,
	)
	debugReq, err := http.NewRequestWithContext(ctx, http.MethodGet, debugURL, nil)
	if err != nil {
		return nil, err
	}
	debugResp, err := http.DefaultClient.Do(debugReq)
	if err != nil {
		return nil, err
	}
	defer debugResp.Body.Close()
	if debugResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("facebook debug_token status %d", debugResp.StatusCode)
	}
	var debug struct {
		Data struct {
			AppID   string `json:"app_id"`
			IsValid bool   `json:"is_valid"`
		} `json:"data"`
	}
	if err := json.NewDecoder(debugResp.Body).Decode(&debug); err != nil {
		return nil, err
	}
	if !debug.Data.IsValid || debug.Data.AppID != appID {
		return nil, errors.New("facebook token invalid or app mismatch")
	}

	// 2. Fetch the profile.
	meURL := "https://graph.facebook.com/me?fields=id,name,email,picture&access_token=" +
		url.QueryEscape(accessToken)
	meReq, err := http.NewRequestWithContext(ctx, http.MethodGet, meURL, nil)
	if err != nil {
		return nil, err
	}
	meResp, err := http.DefaultClient.Do(meReq)
	if err != nil {
		return nil, err
	}
	defer meResp.Body.Close()
	if meResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("facebook me status %d", meResp.StatusCode)
	}
	var me struct {
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture struct {
			Data struct {
				URL string `json:"url"`
			} `json:"data"`
		} `json:"picture"`
	}
	if err := json.NewDecoder(meResp.Body).Decode(&me); err != nil {
		return nil, err
	}
	if me.Email == "" {
		return nil, ErrNoEmail
	}
	return &SocialProfile{
		Email:     me.Email,
		Name:      me.Name,
		AvatarURL: me.Picture.Data.URL,
		Provider:  "facebook",
	}, nil
}
```

- [ ] **Step 2: Verify formatting and commit**

If Go is available: `cd be && gofmt -l ./internal/auth/social.go` (expect no output) and `go build ./...` (expect clean). Otherwise review imports are all used (`context`, `encoding/json`, `errors`, `fmt`, `net/http`, `net/url`).

```bash
git add be/internal/auth/social.go
git commit -m "feat: add Google and Facebook token verification"
```

---

### Task 3: Backend — repo, handlers, routes

**Files:**
- Modify: `be/internal/repository/user.go` (add `ErrElevatedAccount` and `FindOrCreateSocial`)
- Modify: `be/internal/handlers/auth.go` (add `GoogleLogin`, `FacebookLogin`, `completeSocialLogin`)
- Modify: `be/internal/router/router.go` (two routes)

**Interfaces:**
- Consumes: `auth.VerifyGoogle`, `auth.VerifyFacebook`, `auth.SocialProfile`, `auth.ErrNoEmail` (Task 2)
- Consumes: `cfg.GoogleClientID`, `cfg.FacebookAppID`, `cfg.FacebookAppSecret` (Task 1)
- Produces: `repository.ErrElevatedAccount` (error)
- Produces: `UserRepo.FindOrCreateSocial(ctx, email, name, avatarURL, provider string) (*models.User, error)`
- Produces: routes `POST /api/v1/auth/google`, `POST /api/v1/auth/facebook`

- [ ] **Step 1: Add `ErrElevatedAccount` and `FindOrCreateSocial` to the repo**

In `be/internal/repository/user.go`, add a package-level error near the existing `ErrNotFound` declaration:

```go
var ErrElevatedAccount = errors.New("elevated account requires email login")
```

(`errors` is already imported in this file.)

Then add the method (place it after `CreateOwner`):

```go
// FindOrCreateSocial logs in or registers an end user from a verified social
// profile. If the email already belongs to an admin or product owner it returns
// ErrElevatedAccount, enforcing email-only login for elevated roles.
func (r *UserRepo) FindOrCreateSocial(ctx context.Context, email, name, avatarURL, provider string) (*models.User, error) {
	var (
		id             int64
		isAdmin        int
		isProductOwner int
		currentAvatar  sql.NullString
	)
	err := r.db.QueryRowContext(ctx,
		`SELECT id, is_admin, is_product_owner, avatar_url FROM users WHERE email = ?`, email,
	).Scan(&id, &isAdmin, &isProductOwner, &currentAvatar)

	if err == sql.ErrNoRows {
		res, cerr := r.db.ExecContext(ctx,
			`INSERT INTO users (email, full_name, avatar_url, auth_provider, password_hash)
			 VALUES (?, ?, ?, ?, NULL)`,
			email, name, avatarURL, provider,
		)
		if cerr != nil {
			return nil, cerr
		}
		newID, _ := res.LastInsertId()
		return r.FindByID(ctx, newID)
	}
	if err != nil {
		return nil, err
	}

	if isAdmin == 1 || isProductOwner == 1 {
		return nil, ErrElevatedAccount
	}

	// Existing regular user: backfill avatar if it is currently empty.
	if (!currentAvatar.Valid || currentAvatar.String == "") && avatarURL != "" {
		r.db.ExecContext(ctx, `UPDATE users SET avatar_url = ? WHERE id = ?`, avatarURL, id)
	}
	return r.FindByID(ctx, id)
}
```

- [ ] **Step 2: Add the handlers**

In `be/internal/handlers/auth.go`, add three methods (place after `RegisterOwner`). All needed imports (`encoding/json`, `log`, `net/http`, `final-review/be/internal/auth`, `final-review/be/internal/repository`) are already present.

```go
func (h *AuthHandler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Credential string `json:"credential"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Credential == "" {
		writeError(w, http.StatusBadRequest, "credential required")
		return
	}
	profile, err := auth.VerifyGoogle(r.Context(), body.Credential, h.cfg.GoogleClientID)
	if err != nil {
		log.Printf("ERROR Google verify: %v", err)
		writeError(w, http.StatusBadRequest, "social login failed")
		return
	}
	h.completeSocialLogin(w, r, profile)
}

func (h *AuthHandler) FacebookLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AccessToken == "" {
		writeError(w, http.StatusBadRequest, "access_token required")
		return
	}
	profile, err := auth.VerifyFacebook(r.Context(), body.AccessToken, h.cfg.FacebookAppID, h.cfg.FacebookAppSecret)
	if err == auth.ErrNoEmail {
		writeError(w, http.StatusBadRequest, "Your Facebook account has no email; please sign up with email instead")
		return
	}
	if err != nil {
		log.Printf("ERROR Facebook verify: %v", err)
		writeError(w, http.StatusBadRequest, "social login failed")
		return
	}
	h.completeSocialLogin(w, r, profile)
}

// completeSocialLogin applies the account rules and issues a JWT.
func (h *AuthHandler) completeSocialLogin(w http.ResponseWriter, r *http.Request, profile *auth.SocialProfile) {
	user, err := h.users.FindOrCreateSocial(r.Context(), profile.Email, profile.Name, profile.AvatarURL, profile.Provider)
	if err == repository.ErrElevatedAccount {
		writeError(w, http.StatusForbidden, "This account must sign in with email and password")
		return
	}
	if err != nil {
		log.Printf("ERROR FindOrCreateSocial email=%q: %v", profile.Email, err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	token, err := auth.NewToken(user.ID, h.cfg.JWTSecret, h.cfg.TokenTTL, h.redis)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": user})
}
```

> Note: verification failures return **400**, not the 401 the spec mentioned.
> `fe/src/lib/api.ts` globally intercepts 401 and hard-redirects to `/auth`,
> which would suppress the error toast. 400 lets the FE show the message.

- [ ] **Step 3: Wire the routes**

In `be/internal/router/router.go`, in the public route group (right after `r.Post("/auth/login", authH.Login)`), add:

```go
		r.Post("/auth/login", authH.Login)
		r.Post("/auth/google", authH.GoogleLogin)
		r.Post("/auth/facebook", authH.FacebookLogin)
```

- [ ] **Step 4: Verify and commit**

If Go is available: `cd be && gofmt -l ./internal/...` (no output) and `go build ./...` (clean). Otherwise confirm: `repository.ErrElevatedAccount` referenced in handler matches the declared name; `FindOrCreateSocial` argument order matches the call.

```bash
git add be/internal/repository/user.go be/internal/handlers/auth.go be/internal/router/router.go
git commit -m "feat: add social login endpoints with end-user-only rule"
```

---

### Task 4: Frontend — auth plumbing (no visible UI yet)

**Files:**
- Modify: `fe/package.json` (via `npm install @react-oauth/google`)
- Modify: `fe/src/App.tsx`
- Modify: `fe/src/hooks/useAuth.tsx`
- Create: `fe/src/lib/facebook.ts`
- Modify: `fe/.env`
- Modify: `deploy/deploy.sh`

**Interfaces:**
- Produces: `useAuth().signInWithGoogle(credential: string) => Promise<void>`
- Produces: `useAuth().signInWithFacebook(accessToken: string) => Promise<void>`
- Produces: `isFacebookConfigured()`, `loadFacebookSDK()`, `facebookLogin()` from `@/lib/facebook`
- Produces: `GoogleOAuthProvider` wrapping the app when `VITE_GOOGLE_CLIENT_ID` is set

- [ ] **Step 1: Install the Google package**

```bash
cd fe && npm install @react-oauth/google
```

Expected: `package.json` gains `"@react-oauth/google"` under dependencies; exit 0.

- [ ] **Step 2: Add auth hook methods**

In `fe/src/hooks/useAuth.tsx`, add the two method signatures to `AuthContextType` (after `signIn`):

```ts
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (credential: string) => Promise<void>;
  signInWithFacebook: (accessToken: string) => Promise<void>;
```

Add them to the default context object (after the existing `signIn: async () => {},`):

```ts
  signIn: async () => {},
  signInWithGoogle: async () => {},
  signInWithFacebook: async () => {},
```

Implement them inside `AuthProvider` (after the `signIn` implementation):

```ts
  const signInWithGoogle = async (credential: string) => {
    const res = await apiFetch<{ token: string; user: User }>(
      "/auth/google",
      { method: "POST", body: JSON.stringify({ credential }) },
      null
    );
    saveSession(res);
    setToken(res.token);
    setUserState(res.user);
  };

  const signInWithFacebook = async (accessToken: string) => {
    const res = await apiFetch<{ token: string; user: User }>(
      "/auth/facebook",
      { method: "POST", body: JSON.stringify({ access_token: accessToken }) },
      null
    );
    saveSession(res);
    setToken(res.token);
    setUserState(res.user);
  };
```

Add them to the provider `value` (after `signIn`):

```tsx
    <AuthContext.Provider value={{ user, token, loading, signIn, signInWithGoogle, signInWithFacebook, signUp, signOut, setUser }}>
```

- [ ] **Step 3: Create the Facebook SDK helper**

Create `fe/src/lib/facebook.ts`:

```ts
const FB_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined;

let loadPromise: Promise<void> | null = null;

export function isFacebookConfigured(): boolean {
  return !!FB_APP_ID;
}

// loadFacebookSDK injects and initializes the Facebook JS SDK once.
export function loadFacebookSDK(): Promise<void> {
  if (!FB_APP_ID) return Promise.reject(new Error("Facebook not configured"));
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve) => {
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: FB_APP_ID,
        cookie: true,
        xfbml: false,
        version: "v19.0",
      });
      resolve();
    };
    const id = "facebook-jssdk";
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const js = document.createElement("script");
    js.id = id;
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.async = true;
    js.defer = true;
    document.body.appendChild(js);
  });
  return loadPromise;
}

// facebookLogin opens the FB login dialog and resolves with an access token.
export function facebookLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const FB = (window as any).FB;
    if (!FB) {
      reject(new Error("Facebook SDK not loaded"));
      return;
    }
    FB.login(
      (response: any) => {
        if (response.authResponse?.accessToken) {
          resolve(response.authResponse.accessToken);
        } else {
          reject(new Error("Facebook login cancelled"));
        }
      },
      { scope: "email,public_profile" }
    );
  });
}
```

- [ ] **Step 4: Wrap the app in GoogleOAuthProvider (conditionally)**

In `fe/src/App.tsx`, add the import (after the existing imports):

```tsx
import { GoogleOAuthProvider } from "@react-oauth/google";
```

Replace the `const App = () => ( ... );` definition. Capture the existing tree in a constant and conditionally wrap:

```tsx
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

const AppTree = (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/review/:id" element={<ReviewDetails />} />
            <Route path="/review/:id/add-timeline" element={<AddTimeline />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/browse" element={<BrowseReviews />} />
            <Route path="/write-review" element={<WriteReview />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/product/:id" element={<ProductReviews />} />
            <Route path="/page/:slug" element={<StaticPage />} />
            <Route path="/owner-register" element={<OwnerRegister />} />
            <Route path="/owner-dashboard" element={<OwnerDashboard />} />
            <Route path="/owner-qr" element={<OwnerQR />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

const App = () =>
  googleClientId ? (
    <GoogleOAuthProvider clientId={googleClientId}>{AppTree}</GoogleOAuthProvider>
  ) : (
    AppTree
  );

export default App;
```

> Match the route list to whatever is currently in `App.tsx` at implementation
> time — do not drop any existing route. The block above reflects the current
> set; copy any newer routes verbatim if they exist.

- [ ] **Step 5: Add frontend env vars**

In `fe/.env`, append:

```env
VITE_GOOGLE_CLIENT_ID=
VITE_FACEBOOK_APP_ID=
```

(Leave them empty locally — empty means the buttons stay hidden until configured.)

- [ ] **Step 6: Pass social env through deploy**

In `deploy/deploy.sh`, find the frontend build block that writes `.env.production`:

```bash
  echo "VITE_API_BASE_URL=$API_URL" > .env.production
```

Replace that single line with:

```bash
  echo "VITE_API_BASE_URL=$API_URL" > .env.production
  echo "VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID:-}" >> .env.production
  echo "VITE_FACEBOOK_APP_ID=${VITE_FACEBOOK_APP_ID:-}" >> .env.production
```

- [ ] **Step 7: Build and commit**

```bash
cd fe && npm run build
```

Expected: build succeeds, no TypeScript errors.

```bash
git add fe/package.json fe/package-lock.json fe/src/App.tsx fe/src/hooks/useAuth.tsx fe/src/lib/facebook.ts fe/.env deploy/deploy.sh
git commit -m "feat: frontend social auth plumbing"
```

---

### Task 5: Frontend — social buttons on the Auth page

**Files:**
- Modify: `fe/src/pages/Auth.tsx`

**Interfaces:**
- Consumes: `useAuth().signInWithGoogle`, `useAuth().signInWithFacebook` (Task 4)
- Consumes: `isFacebookConfigured`, `loadFacebookSDK`, `facebookLogin` from `@/lib/facebook` (Task 4)
- Consumes: `GoogleLogin` component from `@react-oauth/google` (Task 4)

- [ ] **Step 1: Add imports to `Auth.tsx`**

Add near the top of `fe/src/pages/Auth.tsx` (after existing imports):

```tsx
import { GoogleLogin } from "@react-oauth/google";
import { Button } from "@/components/ui/button";
import { Facebook } from "lucide-react";
import { isFacebookConfigured, loadFacebookSDK, facebookLogin } from "@/lib/facebook";
```

(If `Button` is already imported in this file, do not duplicate the import.)

- [ ] **Step 2: Pull the new methods from the hook and add state**

In the component body, extend the `useAuth()` destructure:

```tsx
  const { user, signIn, signUp, signInWithGoogle, signInWithFacebook } = useAuth();
```

Add a `googleClientId` constant and Facebook-ready state near the other `useState` calls:

```tsx
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const [fbReady, setFbReady] = useState(false);

  useEffect(() => {
    if (isFacebookConfigured()) {
      loadFacebookSDK().then(() => setFbReady(true)).catch(() => setFbReady(false));
    }
  }, []);
```

- [ ] **Step 3: Add the social handlers**

Inside the component (after `handleEmailAuth`):

```tsx
  const handleGoogle = async (credential: string) => {
    setLoading(true);
    try {
      await signInWithGoogle(credential);
      toast({ title: "Welcome!", description: "Signed in with Google." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFacebook = async () => {
    setLoading(true);
    try {
      const accessToken = await facebookLogin();
      await signInWithFacebook(accessToken);
      toast({ title: "Welcome!", description: "Signed in with Facebook." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
```

(The 403 elevated-account message from the backend arrives as `error.message` and is shown verbatim in the toast.)

- [ ] **Step 4: Render the divider and buttons**

In the JSX, immediately after the closing `</form>` of the email form (before the Sign in/Sign up toggle paragraph), insert:

```tsx
          {(googleClientId || isFacebookConfigured()) && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or continue with</span>
                </div>
              </div>

              <div className="space-y-2">
                {googleClientId && (
                  <div className="flex justify-center">
                    <GoogleLogin
                      onSuccess={(cred) => {
                        if (cred.credential) handleGoogle(cred.credential);
                      }}
                      onError={() =>
                        toast({ title: "Google login failed", variant: "destructive" })
                      }
                      width="320"
                    />
                  </div>
                )}

                {isFacebookConfigured() && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleFacebook}
                    disabled={loading || !fbReady}
                  >
                    <Facebook className="h-4 w-4" />
                    Continue with Facebook
                  </Button>
                )}
              </div>
            </>
          )}
```

- [ ] **Step 5: Build and commit**

```bash
cd fe && npm run build
```

Expected: build succeeds, no TypeScript errors.

```bash
git add fe/src/pages/Auth.tsx
git commit -m "feat: add Google and Facebook buttons to auth page"
```

- [ ] **Step 6: Manual end-to-end check (requires configured provider IDs)**

With real `VITE_GOOGLE_CLIENT_ID` / `VITE_FACEBOOK_APP_ID` and matching backend env set, run `npm run dev` and verify:
1. Buttons appear on `/auth` only when the env vars are set; hidden when empty.
2. Google sign-in with a brand-new email creates a regular user and lands on `/`.
3. Signing in again with the same Google account logs into the same user.
4. Social login with an email that belongs to an owner/admin shows the toast "This account must sign in with email and password" and does not log in.
5. Backend log shows no errors for the success paths.

---

## Notes for the Operator (outside code)

- Create a Google OAuth Client ID and a Facebook App; register authorized
  JavaScript origins: `https://www.bdranks.com`, `https://bdranks.com`, and the
  local dev origin (e.g. `http://localhost:8080`).
- Apply migration `007_social_login.sql` on the database before the new
  backend build serves traffic (see VPS_DEPLOYMENT.md Step 9).
- Set `GOOGLE_CLIENT_ID`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` on the API
  service and `VITE_GOOGLE_CLIENT_ID`, `VITE_FACEBOOK_APP_ID` for the FE build.
