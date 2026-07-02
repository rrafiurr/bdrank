# BdRanks — Income Model & Growth Plan

**Date:** 2026-07-02
**Context:** BdRanks is a bilingual (en/bn) review platform for the Bangladesh market with a unique hook — **timeline reviews** (how a product holds up over months/years). It already has the infrastructure most review startups have to build later: a product-owner portal, printable QR review collection, embeddable review widgets with token approval, and a CMS.

---

## 1. The core asset

Your differentiator is not "reviews" — Facebook groups and YouTube already have those. It's:

1. **Timeline reviews** — "this phone after 1 year", "this ISP after 6 months". Nobody structures this. It's also inherently anti-fake: fake reviewers don't come back 6 months later.
2. **The owner loop already built** — QR codes in shops collect reviews → reviews rank on Google → traffic attracts more shops. Trustpilot's entire business is this loop, and you've already shipped the mechanics.

Everything below monetizes or amplifies these two things.

---

## 1.5 Market validation (web research, 2026-07-02)

**The model works at scale.** Trustpilot — the same freemium owner-subscription model — did [$261M revenue in 2025, up 20%, with 28% ARR growth](https://www.globalbankingandfinance.com/uks-trustpilot-expects-20-annual-revenue-jump-higher/). Its [2026 pricing](https://wiserreview.com/blog/trustpilot-pricing/): Free / $99 Starter / $299 Plus / $629 Premium / $1,099 Advanced per month. Crucially, the **free tier caps review invitations at ~50/month** — invitations are the anchor paid feature (validates §5.5). US review-management SaaS ([Birdeye $299–449/mo, Podium from $399/mo per location](https://www.socialpilot.co/reviews/comparison/birdeye-vs-podium)) confirms SMBs pay real money for reviews + alerts + widgets.

**Demand side is strong and growing.** [BrightLocal's 2026 survey](https://www.brightlocal.com/research/local-consumer-review-survey/): 97% of consumers use reviews in purchase decisions; 41% *always* read reviews before choosing a business (up from 29% a year earlier); 85% are more likely to use a business after positive reviews.

**The BD market is big enough.** B2C e-commerce [crossed $4B in early 2026 growing ~22%/yr](https://paymentscmi.com/insights/bangladesh-ecommerce-market-insights/), with projections of [$5–10.5B](https://www.tbsnews.net/economy/bangladesh-e-commerce-sales-more-double-2026-research-497134) and 60M+ online shoppers; smartphone penetration exceeds 80%.

**The seller TAM is f-commerce, not just shops.** Bangladesh has [300,000+ f-commerce (Facebook shop) pages](https://www.dhl.com/discover/en-bd/e-commerce-advice/e-commerce-trends/guide-to-f-commerce-in-bangladesh); for most SMEs Facebook *is* the storefront. These sellers have no website and a chronic trust/scam problem — see the new feature §5.11.

**⚠️ Display ads are near-worthless in BD — a correction to Phase 2.** Bangladesh is Tier-3 ad inventory: [CPCs of $0.01–0.02 and RPMs often under $1](https://apdigi.in/google-adsense-cpm-rates-in-bangladesh/); a site with 200k monthly pageviews of South Asian traffic earns roughly [$150–200/month from AdSense](https://www.quora.com/If-my-website-has-about-3-million-page-views-per-month-how-much-do-I-expect-to-earn-via-Google-Adsense-given-it-is-a-cricket-related-website-in-Bangladesh-where-50-of-users-are-from-Bangladesh-and-the-remaining-50-are-from-the-rest-of-the-world). AdSense is pocket change, not a pillar — prioritize subscriptions, sponsored placements, and affiliate instead.

**Affiliate programs are real and pay via bKash.** [Daraz: 3–18% commission (avg ~10–12%), 7-day cookie, ৳2,500 payout minimum](https://gurukulzone.com/daraz-affiliate-program-commission-rates/). [Star Tech: 5% base, up to 10% via custom coupon codes, 7-day cookie, bKash payout from ৳1,000](https://www.startech.com.bd/affiliate-program). Rokomari also runs a program. A review page is the highest-intent affiliate surface there is.

---

## 2. Income model

### Phase 0 (months 0–6): don't monetize
A review site's only real product is **trust + traffic**. Charging before you have either kills both. Everything free; focus on the growth plan (§3). The one thing to do now: design the tiers so features land in the right bucket from day one.

### Phase 1: Owner subscriptions (SaaS) — the main engine
The Trustpilot/Yelp model, priced for Bangladesh. The features already exist — this is mostly paywalling + polish.

| | **Free** | **Verified** (~৳1,000–1,500/mo) | **Business** (~৳3,000–5,000/mo) |
|---|---|---|---|
| Claim listing, respond to reviews | ✅ | ✅ | ✅ |
| Verified badge on listing | — | ✅ | ✅ |
| QR review-collection kit (print page) | 1 code | ✅ unlimited | ✅ unlimited |
| Embed widgets (already built: token approve/revoke) | — | 1 widget | unlimited |
| Analytics dashboard (views, rating trends, competitor compare) | — | basic | full |
| Multiple products/branches | 1 | 5 | unlimited |
| Review alerts (email/SMS) | — | ✅ | ✅ |

Annual billing at 2 months free. Even 100 paying shops at ৳1,200/mo ≈ ৳1.4M/yr with near-zero marginal cost.

### Phase 2: Placement & advertising
- **Featured/promoted listings** — homepage carousel and category-top slots, clearly labeled "Sponsored". Sell monthly slots (৳2,000–10,000/mo depending on category traffic). Never sell rating position — that destroys the trust asset.
- **Display ads** — *deprioritized after research (§1.5)*: BD traffic RPMs are often under $1, so AdSense on 200k pageviews ≈ $150–200/mo. Only worth adding as a passive floor; the real ad money is **direct brand sponsorships** in your strong categories, sold at flat monthly rates.
- **Sponsored honest-review campaigns** — a brand pays for N community members to receive the product and review it honestly, disclosed. You charge a campaign fee; reviewers keep the product. This also solves your content-supply problem.

### Phase 3: Data & affiliate
- **Affiliate "where to buy" buttons** on product pages → confirmed rates: Daraz 3–18% (avg ~10–12%, 7-day cookie), Star Tech 5–10% (bKash payouts), Rokomari for books (§1.5). Passive, scales with SEO traffic, and fits user intent perfectly (they're on the page deciding whether to buy). Use Star Tech-style **coupon codes** as well as links — codes survive the 7-day cookie window and work in social posts.
- **Market-insight reports & API** — aggregate rating trends per category/brand ("ISP satisfaction in Dhaka, Q3"), sold to brands; review-data API for e-commerce sites. Only viable at scale, but very high margin.

### What NOT to do
- Don't sell review removal or rating manipulation — one scandal ends the site.
- Don't gate *reading* reviews. Readers are your SEO traffic and your product.
- Don't launch paid tiers before owners are getting visible value (i.e., before Google traffic to their listings exists).

---

## 3. How to make it popular

### 3.1 Solve the cold-start with a niche, not a launch
An empty review site convinces no one. Pick **one vertical where BD consumers actively search for reviews and are underserved** — best candidates: ISPs, ride-sharing/food delivery, budget phones/gadgets, or online shops themselves. Seed it with 150–300 genuinely good reviews (write them, commission students/micro-influencers, import your own honest experiences). Be *the* place for that vertical, then expand. "Reviews of everything" with 11 reviews looks dead; "every ISP in Dhaka reviewed with 6-month follow-ups" looks essential.

### 3.2 SEO is the primary channel — and it's currently broken
The whole model rests on ranking for "**[product] review**" and "**[product] রিভিউ**" long-tail queries. Two facts from the [SEO audit](SEO_REPORT.md):
- The site is client-rendered — crawlers and social scrapers see an empty page. **Fix P0/P1 of the SEO report before any marketing spend.**
- Bangla content is invisible to search (client-side language toggle, same URLs). Bangla review queries are a wide-open gap in BD — almost no quality structured Bangla review sites exist. Language-scoped URLs (`/bn/...`) could be your biggest single traffic unlock.

### 3.3 Work the two built-in growth loops
- **QR loop:** give the QR kit away free to shops for the first year (it's your customer-acquisition cost). Every table-tent QR in a restaurant is a billboard + a review generator. Target dense areas: tech markets (Multiplan, IDB), restaurant clusters.
- **Embed loop:** every shop that embeds your widget puts your brand + a backlink on their site. Make the free tier include one embed with a small "Reviews by BdRanks" credit — that credit is your viral footer, like "Powered by Shopify".

### 3.4 Content format that spreads on BD social
Facebook groups and short video dominate BD. The timeline format is natively shareable:
- "**iPhone 15 after 1 year in Bangladesh — 43 owners report**" (aggregate timeline posts)
- Before/after review screenshots for Facebook groups (buy/sell and tech groups have millions of members)
- 30–60s Reels/TikTok: "We tracked this ৳2,000 power bank for 6 months. Here's what happened." → link to the full timeline.
- Partner with 2–3 mid-tier BD tech YouTubers: they get a "verified reviewer" profile and embed widgets on their video descriptions; you get their audience.

### 3.5 Community & retention
- Reviewer levels/badges, "Top Reviewer of the Month", public profiles worth showing off.
- Email/notification: "It's been 6 months since your review of X — how's it holding up?" This single nudge *manufactures* your differentiating content (timeline updates) automatically.
- Monthly small rewards (mobile recharge, gift cards) for best timeline updates — cheap, drives the core behavior.

### 3.6 Trust as marketing
- Verified-purchase badges where possible (receipt photo via the QR flow).
- Public, written moderation policy; show owner responses prominently.
- When you catch fake reviews, publicize it. "The review site that can't be bought" is a positioning no BD competitor holds.

---

## 4. Sequencing (first 12 months)

| Months | Focus | Revenue |
|---|---|---|
| 0–2 | Fix SEO P0/P1, pick the launch vertical, seed 150–300 reviews | ৳0 |
| 2–5 | QR kits free to 50–100 shops in the vertical; Facebook group content engine; Bangla URLs | ৳0 |
| 5–8 | 6-month nudge emails live (timeline content compounds); expand to 2nd vertical; AdSense floor | Ads (small) |
| 8–12 | Launch Verified tier to owners already seeing traffic; featured slots in strong categories | Subscriptions + placements |
| 12+ | Business tier, affiliate buttons, sponsored campaigns, insight reports | All streams |

**North-star metric:** number of reviews with ≥1 timeline update. It's the one number that measures your moat — content nobody else has and money can't fake.

---

## 5. New feature ideas that create revenue

Ordered by **effort vs. income impact**, given what's already in the codebase.

### Quick wins (weeks, mostly reusing existing code)

**5.1 Review alerts / negative-review early warning** 💰 subscription driver
Email (later SMS) to owners when a new review lands, with instant-notify for ≤2★ reviews. "Know about an angry customer before Google does" is the single most-cited reason SMBs pay Trustpilot. *Build:* a notification hook on review creation + owner notification settings. Backend-only, small.

**5.2 Embed widget tiers** 💰 upsell lever
You have token-based embeds already. Add widget *types* — star-badge (free, with "Reviews by BdRanks" credit), review carousel (Verified), full review wall + rating schema markup for *their* site (Business). The schema markup one is sneaky-valuable: shops get stars in their own Google results, which they'll happily pay for. *Build:* variations of the existing `EmbedPage` + a `type` field on tokens.

**5.3 Featured/sponsored placement slots** 💰 direct cash
A `sponsored_until` date + `slot` field on products, managed from the CMS, rendered in the homepage carousel and category tops with a "Sponsored" label. Sell manually via bKash/bank transfer at first — no payment integration needed to start earning. *Build:* one migration, CMS form, badge in two components.

**5.4 Affiliate "where to buy" buttons** 💰 passive, scales with SEO
`purchase_links[]` on products (label, URL, affiliate tag), managed in CMS, rendered on product pages. Sign up for Daraz/StarTech/Pickaboo affiliate programs. *Build:* trivial; the income scales automatically as SEO traffic grows.

### Medium builds (1–2 months, core paid-tier features)

**5.5 Review invitation system** 💰 the #1 feature owners actually pay review platforms for
Owner uploads customer emails/phone numbers (or connects a CSV export from their POS) → BdRanks sends "how was your purchase?" invites with unique one-tap review links. Reviews collected this way get a **Verified Purchase** badge. This simultaneously: gives owners a reason to subscribe, grows your review count, and raises trust. *Research confirms this is the paywall anchor:* Trustpilot's free tier caps invitations at ~50/month and sells volume from $99/mo up (§1.5) — copy that structure: small free quota, unlimited on paid. *Build:* invite table + tokenized review links (you already have the token pattern from embeds) + an email sender.

**5.6 Owner analytics dashboard** 💰 justifies the Business tier
Listing views over time, rating trend, review velocity, and — the killer — *comparison against category average* ("your rating is 0.6★ below the median ISP"). Fear of falling behind competitors sells subscriptions. *Build:* you already track the data; this is aggregation queries + recharts (already a dependency).

**5.7 Verified purchase via the QR flow** 💰 trust premium
Extend the printable QR so shops can hand a receipt-QR at point of sale; scanning it opens the review form pre-verified for that shop. Verified-only review streams become a paid badge for the shop and an anti-fake moat for you. *Build:* short-lived signed tokens on the existing QR page.

### Bigger bets (quarter+, do after revenue starts)

**5.8 Comparison pages ("X vs Y")** 💰 SEO magnet + sponsorship inventory
Auto-generated `/compare/product-a-vs-product-b` pages from ratings + timeline data. "vs" queries are high-intent and low-competition in BD. Monetize with affiliate buttons and brand sponsorship of their own comparison pages.

**5.9 Lead generation for the `service` category** 💰 pay-per-lead
You already have a service category. Add "Request a quote" on service listings → the lead goes to the top 3 subscribed businesses. Pay-per-lead is how Yelp makes most of its SMB money and it monetizes visitors who never write reviews.

**5.10 Data API + category insight reports** 💰 high margin, needs scale
Metered API keys for review/rating data; quarterly "State of [category] in Bangladesh" PDF reports sold to brands. Only worth building after you dominate 2–3 verticals.

**5.11 Trust profiles for f-commerce sellers** 💰 the research-discovered wedge — possibly the biggest one
Bangladesh has **300,000+ Facebook-shop sellers with no website** (§1.5) and a chronic buyer-scam problem — trust is *the* blocker in BD f-commerce. Give every f-commerce seller a claimable BdRanks trust page: verified identity (trade license/NID check — charge for verification), review collection via a link/QR they drop in their Facebook posts and Messenger chats, and a public rating badge image they can pin. For sellers, ৳200–500/mo for a "Verified Seller" page is cheap insurance against "is this page a scam?"; for you, it's a seller TAM 100× larger than physical shops, and every seller sharing their trust page into Facebook groups is free distribution into exactly the communities where BD purchase decisions happen. *Build:* mostly the existing owner-registration + QR + listing machinery, plus a seller-profile page type and a verification workflow in the CMS.

### Suggested build order (revised after research)
1. **5.3 Featured slots** — earns money this month, near-zero build.
2. **5.1 Review alerts** + **5.2 widget tiers** — makes the Verified tier worth paying for.
3. **5.11 F-commerce trust profiles** — promoted after research: the 300k-seller TAM and built-in Facebook-group distribution make this the strongest growth+revenue combo, and it reuses the owner/QR machinery.
4. **5.5 Review invitations** — the anchor feature for launching paid subscriptions (Trustpilot-validated).
5. **5.6 Analytics** → then the bigger bets.

---

## Sources

- [Trustpilot pricing analysis 2026](https://wiserreview.com/blog/trustpilot-pricing/) · [Trustpilot official pricing](https://business.trustpilot.com/pricing) · [Trustpilot FY2025 results](https://www.globalbankingandfinance.com/uks-trustpilot-expects-20-annual-revenue-jump-higher/) · [Statista: Trustpilot revenues](https://www.statista.com/statistics/1478551/trustpilot-revenue/)
- [Birdeye pricing](https://birdeye.com/pricing/) · [Birdeye vs Podium comparison](https://www.socialpilot.co/reviews/comparison/birdeye-vs-podium)
- [Yelp Ads costs 2026](https://www.icatchgroup.com/how-much-do-yelp-ads-cost/) · [Yelp local business pricing](https://business.yelp.com/local-business-pricing/)
- [BrightLocal Local Consumer Review Survey 2026](https://www.brightlocal.com/research/local-consumer-review-survey/) · [PinMeTo summary](https://www.pinmeto.com/news/brightlocal-local-consumer-review-survey-2026/)
- [Bangladesh e-commerce market insights](https://paymentscmi.com/insights/bangladesh-ecommerce-market-insights/) · [TBS: BD e-commerce to double by 2026](https://www.tbsnews.net/economy/bangladesh-e-commerce-sales-more-double-2026-research-497134) · [Statista BD eCommerce outlook](https://www.statista.com/outlook/emo/ecommerce/bangladesh/)
- [DHL: F-commerce in Bangladesh](https://www.dhl.com/discover/en-bd/e-commerce-advice/e-commerce-trends/guide-to-f-commerce-in-bangladesh)
- [AdSense CPM rates in Bangladesh](https://apdigi.in/google-adsense-cpm-rates-in-bangladesh/) · [BD traffic earnings discussion](https://www.quora.com/If-my-website-has-about-3-million-page-views-per-month-how-much-do-I-expect-to-earn-via-Google-Adsense-given-it-is-a-cricket-related-website-in-Bangladesh-where-50-of-users-are-from-Bangladesh-and-the-remaining-50-are-from-the-rest-of-the-world)
- [Daraz affiliate program](https://www.daraz.com.bd/daraz-affiliate-program/) · [Daraz commission rates](https://gurukulzone.com/daraz-affiliate-program-commission-rates/) · [Star Tech affiliate program](https://www.startech.com.bd/affiliate-program) · [Rokomari affiliate](https://affiliate.rokomari.io/)
