# Custom Review Fields — CMS Builder Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins define and edit custom review fields from the CMS instead of by hand-written SQL, and control per-product overrides.

**Architecture:** Phase 1 already shipped the admin API and the cache. This plan is almost entirely CMS frontend, following the existing `Categories.tsx` page shape (Dialog for create/edit, AlertDialog for delete, `useMutation` + `invalidateQueries`). Task 1 is the exception: it closes cache-invalidation gaps in the backend that this CMS makes reachable for the first time.

**Tech Stack:** React 18 + Vite + TypeScript, TanStack Query, shadcn/ui, sonner toasts. Go 1.23 for Task 1 only.

**Spec:** `docs/superpowers/specs/2026-08-28-custom-review-fields-design.md` (its "CMS" section)

## Global Constraints

- **Go toolchain is not installed locally.** Run through Docker from `be/`:
  `docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go build ./...`
- **`gofmt -l internal/` lists `internal/config/config.go`** — pre-existing, not yours, leave it.
- **The CMS has no typecheck in its build.** Verify with `cd cms && npx tsc --noEmit -p tsconfig.app.json`.
- **The CMS dev server runs on port 5174** (`npm run dev -- --port 5174`), the public FE on 5173, the API on 8080.
- **Redis is DB 3**, needs `-a "$(grep -E '^REDIS_PASSWORD=' be/.env | cut -d= -f2-)"`. **Never run `FLUSHDB`** — auth sessions share DB 3 and you would log yourself out mid-test.
- **The CMS is admin-only.** To view a page you need an admin session; see Task 2 Step 5 for the temp-admin recipe, and delete the temp user afterwards.
- **Pushing to `main` deploys to production.** Work on the branch. Do not merge or push.
- **Field types are exactly:** `text`, `url`, `select`, `number`.

## API surface phase 1 already provides

```
GET    /api/v1/admin/review-fields?scope=category&scope_ref=<slug>
GET    /api/v1/admin/review-fields?scope=product&scope_ref=<product id>
POST   /api/v1/admin/review-fields          full body, scope + scope_ref required
PATCH  /api/v1/admin/review-fields/{id}     TRUE partial update — send only changed keys
DELETE /api/v1/admin/review-fields/{id}     soft delete (is_active = 0), returns 204
POST   /api/v1/admin/products/{id}/field-hides   { field_id, hidden: bool }
```

`POST` body: `{ scope, scope_ref, field_key, label, type, is_required, options[], min_value, max_value, help_text, sort_order }`.
`PATCH` body: any subset of the same keys except `scope`/`scope_ref`, which are immutable and ignored.
`GET` returns those fields plus `id` and `is_active`.

A duplicate `(scope, scope_ref, field_key)` returns **409** with a friendly message. `SetFieldHide` returns **404** for an unknown `field_id`.

---

### Task 1: Close the cache-invalidation gaps this CMS makes reachable

**Files:**
- Modify: `be/internal/handlers/admin.go` — `UpdateProduct`, `DeleteProduct`, `UpdateCategory`, `DeleteCategory`

**Interfaces:**
- Consumes: `h.fieldCache` (already a field on `AdminHandler`), with `InvalidateProduct(ctx, int64)` and `InvalidateCategory(ctx, string)`.
- Produces: nothing new.

**Why this is in the CMS plan.** A cached product entry is keyed by product id but built from its category's fields, and registered in that category's members set. Nothing currently invalidates when the product MOVES categories or the category is renamed or deleted — and with no TTL the wrong field list is served indefinitely. Phase 1 shipped no UI to change a product's category, so the hole was unreachable. This plan adds that UI, so it must be closed first.

Reproduced before writing this plan: warm `prod:5` (category `service`, 2 fields) → change product 5's category to `physical` → `prod:5` still serves 2 fields while `physical` has 0.

- [ ] **Step 1: Invalidate on product write**

In `UpdateProduct`, after the `UPDATE products` statement succeeds and before the response is written:

```go
	// A product's category is mutable here. Its cached field list was built
	// from the OLD category and is registered in that category's members set,
	// so no later category edit would ever clear it. There is no TTL.
	h.fieldCache.InvalidateProduct(r.Context(), id)
```

Add the same call in `DeleteProduct` after the delete succeeds — a deleted product's key is otherwise an orphan that never expires.

- [ ] **Step 2: Invalidate on category write**

In `UpdateCategory` and `DeleteCategory`, after the write succeeds:

```go
	// Clears the category key and every product key in its members set.
	h.fieldCache.InvalidateCategory(r.Context(), slug)
```

Use whatever the slug variable is named in each handler — read the surrounding code rather than assuming.

- [ ] **Step 3: Build**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 sh -c "gofmt -l internal/; go build ./... && go vet ./..."
```

Expected: `gofmt` lists only `internal/config/config.go`; build and vet clean.

- [ ] **Step 4: Prove the gap is closed**

Restart the API, then:

```bash
cd /home/rafiur/Desktop/projects/final-review
RP=$(grep -E '^REDIS_PASSWORD=' be/.env | cut -d= -f2-)
PW=$(grep -E '^DB_PASSWORD=' be/.env | cut -d= -f2-)
R() { docker exec common-redis-1 redis-cli -a "$RP" --no-auth-warning -n 3 "$@" 2>/dev/null; }

R DEL reviewform:v1:prod:5 reviewform:v1:cat:service reviewform:v1:cat:service:members
curl -s "http://localhost:8080/api/v1/review-fields?product_id=5" | python3 -c "import sys,json;print('warmed:',len(json.load(sys.stdin)),'fields')"
R KEYS "reviewform:v1:*"
```

Now PATCH product 5's category to `physical` through the admin API (you need an admin token — see Task 2 Step 5), then:

```bash
R KEYS "reviewform:v1:*"
```

Expected: `reviewform:v1:prod:5` is GONE. Then restore product 5 to `service`.

If `prod:5` survives, the invalidation is not wired correctly — fix before reporting DONE.

- [ ] **Step 5: Commit**

```bash
git add be/internal/handlers/admin.go
git commit -m "fix(review-fields): invalidate cached fields when a product or category changes"
```

---

### Task 2: Form Fields page (category scope)

**Files:**
- Create: `cms/src/pages/FormFields.tsx`
- Modify: `cms/src/lib/api.ts` — add `AdminReviewField`
- Modify: `cms/src/App.tsx` — add the route
- Modify: `cms/src/components/Sidebar.tsx` — add the nav entry

**Interfaces:**
- Consumes: the phase 1 admin API above.
- Produces: `AdminReviewField` in `api.ts`; route `/form-fields`.

**Model this page on `cms/src/pages/Categories.tsx`.** Read it first — it is 120 lines and has exactly the shape wanted: a `useQuery` list, a `dialog` state holding `{ mode: "create" | "edit"; ... }`, `useMutation` for create/update/delete each calling `qc.invalidateQueries` and a `toast`, an `AlertDialog` for destructive confirm. Match its structure, spacing and class conventions rather than inventing a new style.

- [ ] **Step 1: Add the type**

In `cms/src/lib/api.ts`, beside the other admin types:

```ts
export interface AdminReviewField {
  id: number;
  field_key: string;
  label: string;
  type: "text" | "url" | "select" | "number";
  is_required: boolean;
  options: string[];
  min_value: number | null;
  max_value: number | null;
  help_text: string;
  sort_order: number;
  is_active: boolean;
}
```

- [ ] **Step 2: Build the page**

Create `cms/src/pages/FormFields.tsx`. It must:

- Render a category picker (reuse the existing `GET /categories` query the CMS already uses elsewhere — see `Products.tsx` for how it loads `AdminCategory[]`). Default to the first category.
- List that category's fields via `GET /admin/review-fields?scope=category&scope_ref=<slug>`, ordered as returned.
- Show for each field: label, `field_key` in monospace, type badge, a "Required" badge when `is_required`, `sort_order`, and a muted "Inactive" badge when `is_active` is false.
- Provide **Add field** and per-row **Edit** opening one Dialog, and per-row **Delete** behind an `AlertDialog`.
- The dialog form carries: `field_key`, `label`, `type` (select of the four types), `is_required` (Switch), `help_text`, `sort_order` (number), plus **conditional inputs**: an options editor shown only for `type === "select"`, and min/max number inputs shown only for `type === "number"`.
- On **create**, POST the full body with `scope: "category"` and `scope_ref: <slug>`.
- On **edit**, PATCH **only the fields the admin actually changed**. The endpoint is a true partial update; sending a full body is allowed but pointless, and sending `min_value`/`max_value` keys you did not change will overwrite them.
- Surface a **409** as its message ("a field with this key already exists for this scope"), not as a generic failure. `apiFetch` throws `ApiError` carrying `status` and `data` — use it.
- Deletion confirm text must say the field is **deactivated, not erased**, and that existing reviews keep their answers. That is what the backend does, and an admin who expects a hard delete will be surprised.

- [ ] **Step 3: Wire the route and nav**

In `cms/src/App.tsx`, beside the other routes:

```tsx
      <Route path="/form-fields" element={<ProtectedRoute><FormFields /></ProtectedRoute>} />
```

In `cms/src/components/Sidebar.tsx`, add to the `NAV` array after Categories:

```tsx
  { label: "Form Fields", icon: ListChecks, to: "/form-fields" },
```

Import `ListChecks` from `lucide-react` in the existing import block. Do not reformat that block.

- [ ] **Step 4: Typecheck**

```bash
cd cms && npx tsc --noEmit -p tsconfig.app.json
```

Expected: no output.

- [ ] **Step 5: Drive it in the browser**

Start the CMS dev server if it is not running: `cd cms && npm run dev -- --port 5174`.

You need an admin session. Create a temp admin, then seed `localStorage.cms_session` with the FULL login response (the CMS stores `{token, user}` and checks `user.is_admin`; a token alone is not enough):

```bash
curl -s -X POST http://localhost:8080/api/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"tmp-p2@local.test","password":"TmpTest12345!","full_name":"Temp P2"}' >/dev/null
PW=$(grep -E '^DB_PASSWORD=' be/.env | cut -d= -f2-)
docker exec common-mysql-1 mysql -uroot -p"$PW" review-new -e "UPDATE users SET is_admin=1 WHERE email='tmp-p2@local.test';"
curl -s -X POST http://localhost:8080/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"tmp-p2@local.test","password":"TmpTest12345!"}' > /tmp/p2-session.json
```

Then drive headless Chrome over CDP: navigate to the CMS origin, `localStorage.setItem('cms_session', <that JSON>)`, navigate to `/form-fields`, and screenshot. **Look at the screenshot.**

Confirm and report:
- the `service` category's existing fields are listed
- creating a `select` field shows the options editor and only then
- creating a duplicate `field_key` surfaces the 409 message, not a generic error
- deleting marks the field inactive and it still appears with an "Inactive" badge

Delete the temp admin when finished:
```bash
docker exec common-mysql-1 mysql -uroot -p"$PW" review-new -e "DELETE FROM users WHERE email='tmp-p2@local.test';"
```
Also delete any fields you created for testing.

- [ ] **Step 6: Commit**

```bash
git add cms/src/pages/FormFields.tsx cms/src/lib/api.ts cms/src/App.tsx cms/src/components/Sidebar.tsx
git commit -m "feat(cms): form fields builder for custom review fields"
```

---

### Task 3: Per-product overrides

**Files:**
- Create: `cms/src/components/ProductFieldOverrides.tsx`
- Modify: `cms/src/pages/Products.tsx` — open the overrides UI from a product row

**Interfaces:**
- Consumes: `AdminReviewField` from Task 2; `GET /admin/review-fields?scope=product&scope_ref=<id>`; `POST /admin/products/{id}/field-hides`; the public `GET /review-fields?product_id=<id>` for the resolved preview.
- Produces: nothing downstream.

- [ ] **Step 1: Build the component**

Create `cms/src/components/ProductFieldOverrides.tsx`, rendered inside a Dialog opened from a product row in `Products.tsx` (add a "Fields" action beside the existing Edit/Delete).

It shows two sections for one product:

1. **Inherited from `<category>`** — fetched with `GET /admin/review-fields?scope=category&scope_ref=<the product's category>`. Each row has a Switch. Switch OFF calls `POST /admin/products/{id}/field-hides` with `{field_id, hidden: true}`; ON sends `hidden: false`.
2. **This product's own fields** — `GET /admin/review-fields?scope=product&scope_ref=<product id>`, with the same Add/Edit/Delete affordances as Task 2 but posting `scope: "product"` and `scope_ref: String(product.id)`.

**Determining which inherited fields are currently hidden.** There is no endpoint that lists hide rows. Derive it: fetch the resolved list from the public `GET /review-fields?product_id=<id>` and treat an inherited field whose id is ABSENT from the resolved list as hidden. Comment this — it is a real inference, not an obvious read, and it is the reason the resolved query must be invalidated alongside the others after every toggle.

After any toggle or field write, invalidate BOTH the admin queries and the resolved-preview query, or the switches will show stale state.

- [ ] **Step 2: Typecheck**

```bash
cd cms && npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 3: Verify the whole loop in the browser**

Using the same temp-admin recipe as Task 2 Step 5:

1. Open a `service`-category product's Fields dialog. Confirm both inherited fields are listed with switches ON.
2. Toggle one OFF. Confirm the switch stays OFF after the query refetches.
3. In a second tab, load `http://localhost:5173/write-review` on the public site, select that product, and confirm the hidden field **no longer appears** on the reviewer's form.
4. Toggle it back ON and confirm it returns on the public form.
5. Add a product-scoped field and confirm it appears on the public form for that product but NOT for another product in the same category.

This end-to-end check is the point of the whole feature — the admin's edit reaching the reviewer's form through the cache. Report what you saw at each step. Clean up anything you created.

- [ ] **Step 4: Commit**

```bash
git add cms/src/components/ProductFieldOverrides.tsx cms/src/pages/Products.tsx
git commit -m "feat(cms): per-product field overrides with hide toggles"
```

---

## Self-Review

**Spec coverage.** The spec's CMS section asks for a Form Fields page with add/edit/reorder/deactivate (Task 2 — reorder is a `sort_order` number input, see below) and product overrides showing inherited fields with a hide toggle plus the product's own additions (Task 3). Task 1 is not in the spec; it closes a defect the spec's design created and this plan's UI makes reachable, and its rationale is stated inline.

**Deliberate YAGNI.** The spec says "reorder"; this plan implements it as an editable `sort_order` number rather than drag-and-drop. No drag-drop library is in `cms/package.json`, and adding one for a list of a few fields per category is not justified. If drag ordering is wanted later it is additive.

**Placeholders.** None. Task 1's code is given verbatim. Tasks 2 and 3 specify behaviour and the page to model rather than pasting 250 lines of near-duplicate JSX — `Categories.tsx` is the template and is named as such, which is stronger than a transcribed copy that would drift from it.

**Type consistency.** `AdminReviewField` (Task 2) is the shape Task 3 consumes. The API bodies match what phase 1's `reviewFieldBody` and `updateFieldBody` actually accept, read from the built code rather than from phase 1's plan.

**Known gap.** No CMS surface lists hide rows directly; Task 3 infers hidden state from the resolved list. If that inference proves fragile, the fix is a small `GET /admin/products/{id}/field-hides` endpoint — noted, not built.
