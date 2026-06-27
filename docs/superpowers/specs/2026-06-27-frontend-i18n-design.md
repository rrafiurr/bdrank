# Frontend Multi-Language (i18n) — Design Spec

**Date:** 2026-06-27
**Status:** Approved

## Overview

Add multi-language support to the public frontend (`fe/`). Launch with **English
(default)** and **Bengali (Bangla)**, architected so more languages are added by
dropping in a JSON file. Uses `react-i18next` (Approach A). Scope is **UI text
only** — user-generated content (reviews, comments, product names) is not
translated. A header switcher lets users change language; the choice is
remembered and the first visit auto-detects from the browser.

Both launch languages are left-to-right, so no RTL layout work is needed now.

---

## 1. Architecture & File Structure

**Packages added to `fe/`:**
- `i18next`
- `react-i18next`
- `i18next-browser-languagedetector`

**New files:**

| File | Responsibility |
|---|---|
| `fe/src/lib/i18n.ts` | Initialize i18next: resources, detection, fallback, `<html lang>` sync |
| `fe/src/locales/en/translation.json` | English strings (source of truth) |
| `fe/src/locales/bn/translation.json` | Bengali strings |
| `fe/src/components/LanguageSwitcher.tsx` | The EN/বাংলা switcher UI |

**`i18n.ts` configuration:**
- `fallbackLng: "en"` — missing Bangla keys fall back to English (never blank).
- `supportedLngs: ["en", "bn"]`.
- `detection`: `order: ["localStorage", "navigator"]`, `caches: ["localStorage"]`.
  First visit → browser language (`bn` → Bangla, else English); thereafter →
  saved choice.
- `interpolation.escapeValue: false` (React already escapes).
- Resources imported statically from the two JSON files (no async loading needed
  for two small files).
- A `languageChanged` listener sets `document.documentElement.lang`.

**Bootstrap:** `fe/src/main.tsx` does `import "@/lib/i18n";` before rendering
`<App />`, so translations are ready on first paint. `react-i18next` exposes the
active language via React context automatically once initialized (no provider
wrapper required, though `Suspense` is not needed because resources are
synchronous).

**Adding a language later:** add `fe/src/locales/<code>/translation.json`, import
it in `i18n.ts`, and add `<code>` to `supportedLngs`. No structural change.

---

## 2. String Organization & Translation Workflow

- **One namespace** to start: `translation` (the default). Can be split into
  multiple namespaces later if files grow large.
- **Nested keys grouped by area** for maintainability:

```json
{
  "nav": { "browse": "Browse", "categories": "Categories" },
  "common": {
    "search": "Search reviews, products…",
    "signIn": "Sign In",
    "writeReview": "Write Review"
  },
  "auth": { "welcomeBack": "Welcome Back", "createAccount": "Create Account" },
  "review": { "likes_one": "{{count}} like", "likes_other": "{{count}} likes" }
}
```

- **Usage:** `const { t } = useTranslation();` then `t("nav.browse")`.
- **Interpolation:** `t("review.likes", { count })`.
- **Pluralization:** i18next selects the correct plural key per language
  (`_one` / `_other`), so "1 like" vs "5 likes" is correct in English and Bangla.
- **English is the source of truth.** Every key MUST exist in `en`. Bengali is
  filled best-effort; gaps fall back to English automatically.

---

## 3. Language Switcher UI

A `LanguageSwitcher.tsx` component showing **EN | বাংলা** with a globe icon:

- **Desktop:** placed in `fe/src/components/Header.tsx` near the avatar / Sign-In
  button, as a small shadcn `DropdownMenu` (current language + globe icon →
  menu with English / বাংলা).
- **Mobile:** the same options added inside the existing mobile menu sheet in
  `Header.tsx`.

Selecting a language calls `i18n.changeLanguage("bn")`:
- All `t()` strings re-render instantly — no page reload.
- The detector persists the choice to `localStorage`.
- The `<html lang>` listener updates the document language.

The component is self-contained so the Header stays readable.

---

## 4. Migrating Existing Strings

The bulk of the work: replace the ~65+ hard-coded strings across 14 pages and
12 components with `t("…")` calls and add each key to both locale files.

**Order (each chunk independently testable):**
1. Setup: packages, `i18n.ts`, empty/seeded locale files, `main.tsx` import,
   `LanguageSwitcher`, wire switcher into `Header`.
2. Shared chrome: `Header`, `Footer`, navigation.
3. High-traffic pages: `Index`, `BrowseReviews`, `Auth`, `ReviewDetails`,
   `Profile`, `OwnerDashboard`.
4. Remaining pages/components: `Categories`, `ProductReviews`, `WriteReview`,
   `AddTimeline`, `OwnerRegister`, `OwnerDashboard`/`OwnerQR`, `StaticPage`
   chrome, `NotFound`, cards, filters, forms.

**Translated:** nav, buttons, headings, labels, input placeholders, form and
validation messages, toast messages, empty states, section copy.

**Dates/numbers:** existing `toLocaleDateString(...)` calls switch to the active
language via `i18n.language` so dates render appropriately per locale.

---

## 5. Out of Scope (content, per "UI text only")

- **User-generated content:** reviews, comments, product names, usernames —
  shown as written.
- **Static page bodies** (About/Terms/Privacy): HTML stored in the DB and served
  by the backend. Only the surrounding chrome is translated. (Per-language page
  bodies would be a separate backend project.)
- **Database-provided category labels:** returned by the API; translating these
  is a backend concern, not handled here.
- **Machine translation** of any content.
- **URL-based locale routing** (`/en`, `/bn`): not used; selection is via
  switcher + localStorage.
- **RTL languages:** none in the launch set; revisit if Arabic/Urdu is added.
- **CMS app** (`cms/`) and any admin/owner-only screens beyond the public FE:
  not in scope.

---

## 6. Files Changed

| File | Change |
|---|---|
| `fe/package.json` | Add `i18next`, `react-i18next`, `i18next-browser-languagedetector` |
| `fe/src/lib/i18n.ts` | New: i18next init + detection + `<html lang>` sync |
| `fe/src/locales/en/translation.json` | New: English strings |
| `fe/src/locales/bn/translation.json` | New: Bengali strings |
| `fe/src/components/LanguageSwitcher.tsx` | New: switcher UI |
| `fe/src/main.tsx` | Import `@/lib/i18n` before render |
| `fe/src/components/Header.tsx` | Mount switcher (desktop + mobile); translate strings |
| `fe/src/components/Footer.tsx` | Translate strings |
| `fe/src/pages/*.tsx`, other `fe/src/components/*.tsx` | Replace literals with `t(...)`; localize dates |

---

## 7. Success Criteria

- A switcher in the header toggles English ↔ Bangla with no page reload.
- Choice persists across reloads; first visit respects browser language.
- `<html lang>` reflects the active language.
- All migrated UI strings render in both languages; missing Bangla keys fall
  back to English (no blanks).
- Counts pluralize correctly in both languages.
- User content (reviews/comments/product names) is unchanged.
- `npm run build` passes.
