# BdRanks — Platform Feature Overview

**Rank. Trust. Choose Better.**

BdRanks is Bangladesh's review platform built around one powerful idea: **reviews that track products over time**. This document covers the complete feature set of the public platform and the business-owner toolkit.

---

## 1. The Idea

Every review site tells you what a customer thought on day one. Nobody tells you whether the phone battery still lasts after a year, whether the ISP is still fast after the promo period, or whether the restaurant kept its quality.

**BdRanks reviews have a timeline.** A reviewer comes back after 3 months, 6 months, a year — and updates their review. Buyers see how a product *holds up*, not just how it *unboxes*. This is content no competitor has and no marketing budget can fake.

---

## 2. For Shoppers — The Public Platform

### Discover & Search
- **Instant search everywhere** — a prominent home-page search plus a header search on every page, both with **live suggestions as you type** (matching products and reviews appear instantly, before you even press Enter)
- **Browse & filter** — filter all reviews by category, minimum rating, and keyword; sort by latest, oldest, highest/lowest rated, or most liked
- **Category exploration** — Physical products, Digital products, Services, and Food, each with its own browsing experience
- **Popular category shortcuts** right on the homepage

### Rich Review Experience
- **Timeline reviews** — the signature feature. Each review can grow follow-up entries over time ("Day 1 → 6 months → 1 year"), each with its own rating and notes, displayed as a visual timeline
- **Photo reviews** — reviewers attach multiple images to show the real product, not the catalog shot
- **Star ratings with live product averages** — every product page shows the aggregate rating and full review count
- **Likes and comments** — the community surfaces the most helpful reviews and discusses them
- **Author profiles** — every review is tied to a real member profile with their review history

### Product Pages
- Aggregate score, star breakdown, and total review count at a glance
- Full review list with sorting (newest, highest, lowest, most liked)
- One-tap path to "Write a Review" from any product

### Effortless Onboarding
- **Email sign-up plus one-tap social login** (Google and Facebook — the two accounts every Bangladeshi shopper already has)
- Personal profile with avatar, bio, and complete review/comment history

---

## 3. For Business Owners — The Owner Toolkit

This is the side you pitch to shops, brands, and service providers.

### Owner Portal & Dashboard
- **Dedicated owner registration** — businesses sign up with their company identity
- **Verified Owner status** — an admin-verified badge that separates real businesses from pretenders
- **Owner dashboard** showing, per product or across all products:
  - Total reviews received
  - **Live average rating**
  - The full stream of customer reviews, filterable by product

### 🖨️ Printable QR Review Poster
A shop-counter poster the owner prints in one click:
- The business name, product name, and **live average rating with stars and review count** — printed proof of reputation
- A large scan-framed **QR code** linking straight to the product's review page
- A 3-step guide for customers (*Scan → Rate → Help others decide*)
- Fully branded, print-optimized layout — colors, stars, and QR render pixel-perfect on paper
- **Prints in English or Bangla** — whichever language the owner selects
- Every poster in a shop is both a review generator and an advertisement

### 🌐 Embeddable Review Widgets
Owners can show their BdRanks reputation on their **own website**:
- Request an embed for any of their products; each embed is a **secure, revocable token** tied to an approved domain
- Configurable display: star rating, review count, rating breakdown, and latest review snippet — owner chooses what to show
- Copy-paste embed code; the widget stays live-synced with real review data
- Admin approval flow keeps the widget network clean and trustworthy

### Reputation That Compounds
- Reviews collected via QR and embeds feed the owner's public product pages
- Product pages are search-engine optimized (structured data for ratings and reviews), so a business's BdRanks reputation surfaces in Google results

---

## 4. Trust & Integrity — The Foundation

Trust is the product. BdRanks is built to defend it:

- **Human moderation** — every review and comment passes an approval flow before it counts
- **Verified business owners** — companies are vetted before receiving the badge or toolkit access
- **The timeline itself is an anti-fake mechanism** — fake reviewers don't come back six months later to update their story; genuine customers do
- **Secure authentication** — session-based auth with server-side verification; social logins via official Google/Facebook OAuth
- **Domain-locked embeds** — widgets only work on the approved website, and can be revoked instantly

---

## 5. Built for Bangladesh

- **Fully bilingual — English and বাংলা** — every page, button, form, and printed poster; switch instantly, no reload
- **Bangla-native details** — dates, counts, and content localized properly (৬ মাস পরে, ১ম দিন…)
- **Mobile-first** — the entire experience is responsive, from browsing to writing reviews to the owner dashboard, matching a market where over 80% of users are on phones
- **Category set matched to the market** — physical goods, digital products, services, and food

---

## 6. Platform Quality

- **Modern, fast stack** — React single-page app with a Go API; pages respond instantly and data loads live
- **SEO-ready architecture** — per-page titles/descriptions, canonical URLs, Open Graph social sharing tags, and schema.org structured data (Product, AggregateRating, Review, Breadcrumb, Organization) so reviews earn rich results in Google
- **Polished design system** — a consistent warm brand identity, light/dark aware, with subtle animation (accessible: honors reduced-motion preferences)
- **Image handling** — multi-image upload with size limits and previews
- **Print-grade output** — the QR poster is engineered specifically for paper, not just a screen page

---

## 7. Feature Summary at a Glance

| Area | Features |
|---|---|
| **Search & Discovery** | Live-suggestion search (home + header), category browse, filters, sorting |
| **Reviews** | Star ratings, photos, likes, comments, **timeline follow-ups** |
| **Products** | Aggregate ratings, review counts, SEO-rich product pages |
| **Community** | Member profiles, review history, social login (Google/Facebook) |
| **Owner Toolkit** | Owner portal, verified badge, dashboard with live avg rating, **printable QR poster**, **embeddable widgets** with domain control |
| **Trust** | Moderated content, verified owners, revocable embeds, timeline authenticity |
| **Localization** | Full English/Bangla experience, including printed material |
| **Platform** | Mobile-first responsive, fast SPA + Go API, structured data, dark mode |

---

## 8. Where It Goes Next *(roadmap preview)*

The platform's architecture is ready for the next tier of owner features: review-collection invitations with verified-purchase badges, owner analytics with category benchmarks, richer widget types, and trust profiles for Facebook-based sellers — the features that turn reputation into a subscription product.

---

*BdRanks — honest reviews, tracked over time.*
