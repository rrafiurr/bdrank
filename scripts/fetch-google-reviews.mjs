#!/usr/bin/env node
/**
 * fetch-google-reviews.mjs
 *
 * Fetches Google reviews for a business via SerpAPI and imports them
 * into ReviewHub through the External API.
 *
 * Prerequisites
 * -------------
 *   Node.js 18+ (uses built-in fetch)
 *   SerpAPI key → https://serpapi.com  (free tier: 250 searches/month)
 *
 * Usage
 * -----
 *   node scripts/fetch-google-reviews.mjs [options]
 *
 * Required options:
 *   --product-id   <n>      ReviewHub product ID to attach reviews to
 *   --serpapi-key  <key>    SerpAPI API key (or set SERPAPI_KEY)
 *   --api-pass     <pass>   External API password (or set EXTERNAL_PASS)
 *
 * One of:
 *   --place-id     <id>     Google Maps place_id  (e.g. ChIJN1t_tDeuEmsRUsoyG83frY4)
 *   --data-id      <id>     Google Maps data_id   (e.g. 0x3751…:0xed43…) — the
 *                           feature id; note it is NOT interchangeable with
 *                           --place-id, which takes the ChIJ… form.
 *   --place-name   <name>   Business name to search (SerpAPI resolves to place_id)
 *   --place-url    <url>    Google Maps place URL, e.g.
 *                           https://www.google.com/maps/place/Balishira+Resort
 *                           Short maps.app.goo.gl links are followed first.
 *
 * Optional:
 *   --api-url      <url>    ReviewHub API URL     (default: http://localhost:8080)
 *   --api-user     <user>   External API username (default: external_admin)
 *   --limit        <n>      Max reviews to FETCH from the source (default: 100)
 *   --min-rating   <n>      Skip reviews below this star count (default: 1)
 *   --min-length   <n>      Skip reviews shorter than n characters (default: 0)
 *   --max-images   <n>      Photos to keep per review (default: 4). Reviews can
 *                           carry dozens; every one is downloaded and stored.
 *   --sort-by      <mode>   qualityScore (default) | newestFirst | ratingHigh |
 *                           ratingLow. qualityScore skews positive — see README
 *                           note on rating distribution.
 *   --max-import   <n>      Stop after importing n reviews (default: no cap).
 *                           --limit is how many to FETCH; this caps how many
 *                           survive filtering and get submitted.
 *   --dry-run               Print what would be submitted, but don't send
 *   --verbose               Extra logging
 *
 * Example
 * -------
 *   node scripts/fetch-google-reviews.mjs \
 *     --place-name "Apple Store Dhaka" \
 *     --product-id 3 \
 *     --serpapi-key YOUR_SERPAPI_KEY \
 *     --api-pass change-me-strong-secret \
 *     --limit 50 \
 *     --dry-run
 */

// ─── CLI arg parser ──────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {
    productId: null,
    placeId: null,
    placeName: null,
    placeUrl: null,
    dataId: null,
    // Read from the environment first so the key never lands in shell history
    // or in `ps` output, which any other user on a shared host can read.
    serpapiKey: process.env.SERPAPI_KEY ?? null,
    apiUrl: 'http://localhost:8080',
    apiUser: 'external_admin',
    apiPass: process.env.EXTERNAL_PASS ?? null,
    limit: 100,
    minRating: 1,
    minLength: 0,
    maxImport: 0,
    maxImages: 4,
    sortBy: 'qualityScore',
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];

    switch (flag) {
      case '--product-id':   args.productId   = parseInt(next, 10); i++; break;
      case '--place-id':     args.placeId     = next; i++; break;
      case '--data-id':      args.dataId      = next; i++; break;
      case '--place-name':   args.placeName   = next; i++; break;
      case '--place-url':    args.placeUrl    = next; i++; break;
      case '--serpapi-key':  args.serpapiKey  = next; i++; break;
      case '--api-url':      args.apiUrl      = next.replace(/\/$/, ''); i++; break;
      case '--api-user':     args.apiUser     = next; i++; break;
      case '--api-pass':     args.apiPass     = next; i++; break;
      case '--limit':        args.limit       = parseInt(next, 10); i++; break;
      case '--min-rating':   args.minRating   = parseInt(next, 10); i++; break;
      case '--min-length':   args.minLength   = parseInt(next, 10); i++; break;
      case '--max-import':   args.maxImport   = parseInt(next, 10); i++; break;
      case '--max-images':   args.maxImages   = parseInt(next, 10); i++; break;
      case '--sort-by':      args.sortBy      = next; i++; break;
      case '--dry-run':      args.dryRun      = true; break;
      case '--verbose':      args.verbose     = true; break;
      case '--help': case '-h': printHelp(); process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage: node scripts/fetch-google-reviews.mjs [options]

Required:
  --product-id  <n>     ReviewHub product ID
  --serpapi-key <key>   SerpAPI API key      (or set SERPAPI_KEY)
  --api-pass    <pass>  External API password (or set EXTERNAL_PASS)

One of:
  --place-id    <id>    Google Maps place_id (ChIJ… form)
  --data-id     <id>    Google Maps data_id  (0x…:0x… form)
  --place-name  <name>  Business name to search
  --place-url   <url>   Google Maps place URL

Optional:
  --api-url     <url>   ReviewHub API URL (default: http://localhost:8080)
  --api-user    <user>  External API username (default: external_admin)
  --limit       <n>     Max reviews to FETCH from the source (default: 100)
  --min-rating  <n>     Minimum star rating 1-5 (default: 1)
  --min-length  <n>     Minimum review length in characters (default: 0)
  --max-import  <n>     Stop after importing n reviews (default: no cap)
  --max-images  <n>     Photos to keep per review (default: 4)
  --sort-by     <mode>  qualityScore | newestFirst | ratingHigh | ratingLow
  --dry-run             Preview without submitting
  --verbose             Extra logging
`);
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(args) {
  const errors = [];
  if (!args.productId || isNaN(args.productId)) errors.push('--product-id is required');
  if (!args.serpapiKey) errors.push('--serpapi-key is required (or set SERPAPI_KEY)');
  if (!args.apiPass)    errors.push('--api-pass is required (or set EXTERNAL_PASS)');
  if (!args.placeId && !args.dataId && !args.placeName && !args.placeUrl)
    errors.push('one of --place-id, --data-id, --place-name or --place-url is required');
  if (args.placeId && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(args.placeId))
    errors.push('--place-id got a data_id (0x…:0x…) — pass it as --data-id instead');
  if (args.minRating < 1 || args.minRating > 5) errors.push('--min-rating must be 1-5');
  if (isNaN(args.minLength) || args.minLength < 0) errors.push('--min-length must be 0 or greater');
  if (isNaN(args.maxImport) || args.maxImport < 0) errors.push('--max-import must be 0 or greater');
  if (isNaN(args.maxImages) || args.maxImages < 0) errors.push('--max-images must be 0 or greater');
  if (!['qualityScore', 'newestFirst', 'ratingHigh', 'ratingLow'].includes(args.sortBy))
    errors.push('--sort-by must be qualityScore, newestFirst, ratingHigh or ratingLow');
  if (errors.length) {
    console.error('Errors:\n' + errors.map(e => '  ✗ ' + e).join('\n'));
    console.error('\nRun with --help for usage.');
    process.exit(1);
  }
}

// ─── SerpAPI helpers ─────────────────────────────────────────────────────────

/**
 * Pull a place identifier out of a Google Maps URL.
 *
 * Maps URLs carry the place in one of two useful forms:
 *   - a feature id in the data segment, e.g. `!1s0x3754d0…:0xabc…`, which
 *     SerpAPI accepts directly as `data_id` — exact, no search needed;
 *   - the human name in the path, e.g. `/maps/place/Balishira+Resort`, which
 *     still has to go through a name search.
 *
 * Short maps.app.goo.gl links carry neither until they are followed, so those
 * are resolved to their target first.
 *
 * Returns { dataId } or { placeName }.
 */
async function parsePlaceUrl(rawUrl, verbose) {
  let target = rawUrl;

  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(rawUrl)) {
    if (verbose) console.log(`🔗 Following short link ${rawUrl}…`);
    const res = await fetch(rawUrl, { redirect: 'follow' });
    target = res.url || rawUrl;
    if (verbose) console.log(`   → ${target}`);
  }

  const ftid = target.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (ftid) {
    if (verbose) console.log(`🧭 Feature id from URL: ${ftid[1]}`);
    return { dataId: ftid[1] };
  }

  const named = target.match(/\/maps\/place\/([^/@?]+)/);
  if (named) {
    const placeName = decodeURIComponent(named[1].replace(/\+/g, ' ')).trim();
    if (!placeName) throw new Error(`Could not read a place name from: ${rawUrl}`);
    if (verbose) console.log(`🧭 Place name from URL: "${placeName}"`);
    return { placeName };
  }

  throw new Error(
    `Unrecognised Google Maps URL: ${rawUrl}\n` +
    `   Expected something like https://www.google.com/maps/place/Some+Resort`
  );
}

/**
 * Resolve a place name to something the reviews engine can query.
 *
 * Returns { dataId } or { placeId }. data_id is preferred where Google gives
 * one — it identifies the place exactly, where a place_id lookup can drift.
 */
async function resolvePlaceId(placeName, apiKey, verbose) {
  if (verbose) console.log(`🔍 Searching SerpAPI for: "${placeName}"`);

  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('engine', 'google_maps');
  url.searchParams.set('q', placeName);
  url.searchParams.set('type', 'search');
  url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SerpAPI maps search failed: ${res.status} ${res.statusText}`);
  const data = await res.json();

  if (data.error) throw new Error(`SerpAPI error: ${data.error}`);

  // A query that matches exactly one place comes back as a single
  // `place_results` object; an ambiguous one returns a `local_results` array.
  // Handling only the array form makes precise queries look like no match.
  const exact = data.place_results;
  if (exact) {
    console.log(`📍 Found: ${exact.title} — ${exact.address ?? ''}`);
    if (exact.reviews && verbose) console.log(`   ${exact.reviews} reviews on Google, rated ${exact.rating ?? '?'}`);
    return exact.data_id ? { dataId: exact.data_id } : { placeId: exact.place_id };
  }

  const places = data.local_results ?? [];
  if (places.length === 0) throw new Error(`No Google Maps results found for "${placeName}"`);

  const place = places[0];
  console.log(`📍 Found: ${place.title} — ${place.address ?? ''}`);
  if (places.length > 1 && verbose) {
    console.log(`   (${places.length} results total; using first match — use --place-url to be exact)`);
  }
  return place.data_id ? { dataId: place.data_id } : { placeId: place.place_id };
}

/**
 * Fetch all review pages from SerpAPI Google Maps Reviews engine.
 * Returns an array of raw review objects.
 */
async function fetchGoogleReviews(target, apiKey, limit, sortBy, verbose) {
  const reviews = [];
  let nextPageToken = null;
  let page = 1;

  while (reviews.length < limit) {
    if (verbose) console.log(`📄 Fetching page ${page} (${reviews.length}/${limit} so far)…`);

    const url = new URL('https://serpapi.com/search');
    url.searchParams.set('engine', 'google_maps_reviews');
    if (target.dataId) url.searchParams.set('data_id', target.dataId);
    else url.searchParams.set('place_id', target.placeId);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('hl', 'en');
    url.searchParams.set('sort_by', sortBy);
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`SerpAPI reviews fetch failed: ${res.status} ${res.statusText}`);
    const data = await res.json();

    if (data.error) throw new Error(`SerpAPI error: ${data.error}`);

    const batch = data.reviews ?? [];
    if (batch.length === 0) break;

    reviews.push(...batch);
    nextPageToken = data.serpapi_pagination?.next_page_token ?? null;
    if (!nextPageToken) break;

    page++;
    // Slight delay to be kind to the API
    await new Promise(r => setTimeout(r, 300));
  }

  return reviews.slice(0, limit);
}

// ─── Transform ───────────────────────────────────────────────────────────────

/**
 * Convert a SerpAPI review object to our External API payload.
 * SerpAPI review shape:
 *   { review_id, user: { name }, rating, date, snippet, iso_date }
 */
function transformReview(raw, productId, maxImages) {
  const authorName = raw.user?.name ?? 'Anonymous';
  const rating = typeof raw.rating === 'number' ? Math.round(raw.rating) : 3;
  const content = raw.snippet ?? raw.description ?? '';

  // Build a meaningful title from the first sentence or first 80 chars
  let title = content.split(/[.!?]/)[0].trim();
  if (title.length > 120) title = title.slice(0, 117) + '…';
  if (!title) title = `${authorName} rated this ${rating} star${rating !== 1 ? 's' : ''}`;

  // SerpAPI exposes photos attached to a review as `images`, either as bare URL
  // strings or as objects carrying a thumbnail/link. The API re-hosts whatever
  // we send, so only real URLs are worth passing on.
  const images = (raw.images ?? [])
    .map(img => (typeof img === 'string' ? img : img?.thumbnail ?? img?.link ?? ''))
    .filter(Boolean)
    .slice(0, maxImages);

  return {
    product_id:   productId,
    title:        title || `${rating}-star review by ${authorName}`,
    content:      content || title,
    rating:       Math.max(1, Math.min(5, rating)),
    author_name:  authorName,
    source:       'google',
    source_url:   raw.link ?? '',
    external_id:  raw.review_id ?? raw.review_link ?? '',
    reviewed_at:  raw.iso_date ?? '',
    images,
  };
}

// ─── API submit ──────────────────────────────────────────────────────────────

async function submitReview(payload, args) {
  const authHeader = 'Basic ' + Buffer.from(`${args.apiUser}:${args.apiPass}`).toString('base64');
  const res = await fetch(`${args.apiUrl}/api/v1/external/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (res.status === 409) return { skipped: true, reason: 'duplicate' };
  if (!res.ok) return { skipped: true, reason: body.error ?? `HTTP ${res.status}` };
  return { skipped: false, id: body.id };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  validate(args);

  console.log('\n🚀 ReviewHub — Google Reviews Importer');
  console.log('─'.repeat(45));
  if (args.dryRun) console.log('⚠️  DRY RUN — nothing will be submitted\n');

  // 1. Resolve the place: an explicit id wins, then a URL, then a name search.
  let placeName = args.placeName;
  let target = args.dataId
    ? { dataId: args.dataId }
    : args.placeId
      ? { placeId: args.placeId }
      : null;

  if (!target && args.placeUrl) {
    const fromUrl = await parsePlaceUrl(args.placeUrl, args.verbose);
    if (fromUrl.dataId) target = { dataId: fromUrl.dataId };
    else placeName = fromUrl.placeName;
  }

  if (!target) {
    target = await resolvePlaceId(placeName, args.serpapiKey, args.verbose);
  }

  console.log(`🗺  Place    : ${target.dataId ?? target.placeId}`);
  console.log(`📦 Product  : #${args.productId}`);
  console.log(`🔢 Limit    : ${args.limit} reviews (min rating: ${args.minRating}★)\n`);

  // 2. Fetch reviews
  console.log('⬇️  Fetching reviews from Google via SerpAPI…');
  const raw = await fetchGoogleReviews(target, args.serpapiKey, args.limit, args.sortBy, args.verbose);
  console.log(`   Found ${raw.length} reviews\n`);

  // 3. Filter by min rating, then by min content length
  const byRating = raw.filter(r => {
    const rating = typeof r.rating === 'number' ? Math.round(r.rating) : 3;
    return rating >= args.minRating;
  });
  if (byRating.length < raw.length) {
    console.log(`   ${raw.length - byRating.length} dropped below ${args.minRating}★`);
  }

  const filtered = byRating.filter(r => {
    const content = r.snippet ?? r.description ?? '';
    return content.trim().length >= args.minLength;
  });
  if (args.minLength > 0 && filtered.length < byRating.length) {
    console.log(`   ${byRating.length - filtered.length} dropped under ${args.minLength} characters`);
  }
  const selected = args.maxImport > 0 ? filtered.slice(0, args.maxImport) : filtered;
  if (selected.length < filtered.length) {
    console.log(`   ${filtered.length} qualify; taking the first ${selected.length}`);
  }
  console.log(`   ${selected.length} reviews to import\n`);

  if (args.maxImport > 0 && selected.length < args.maxImport) {
    console.log(`   ⚠️  Only ${selected.length} of the requested ${args.maxImport} met the filters.`);
    console.log(`      Raise --limit to fetch deeper, or lower --min-length.\n`);
  }

  if (selected.length === 0) {
    console.log('No reviews to import. Exiting.');
    process.exit(0);
  }

  // 4. Submit
  const stats = { submitted: 0, skipped: 0, errors: [] };
  for (const [i, rawReview] of selected.entries()) {
    const payload = transformReview(rawReview, args.productId, args.maxImages);

    const progress = `[${String(i + 1).padStart(String(selected.length).length)}/${selected.length}]`;

    if (args.dryRun) {
      const photos = payload.images.length ? `  ${payload.images.length}📷` : '';
      console.log(`${progress} DRY-RUN  ★${payload.rating}  ${String(payload.content.length).padStart(4)}ch${photos}  "${payload.title.slice(0, 45)}"  — ${payload.author_name}`);
      stats.submitted++;
      continue;
    }

    if (args.verbose) {
      process.stdout.write(`${progress} Submitting "${payload.title.slice(0, 40)}"… `);
    }

    const result = await submitReview(payload, args);

    if (result.skipped) {
      if (args.verbose) console.log(`SKIP (${result.reason})`);
      stats.skipped++;
    } else {
      if (args.verbose) console.log(`OK  id=${result.id}`);
      else process.stdout.write('.');
      stats.submitted++;
    }

    // Small delay to avoid hammering our own API
    await new Promise(r => setTimeout(r, 80));
  }

  // 5. Summary
  console.log('\n\n' + '─'.repeat(45));
  console.log('✅ Done!');
  console.log(`   Submitted : ${stats.submitted}`);
  console.log(`   Skipped   : ${stats.skipped} (duplicates / errors)`);
  if (stats.errors.length) {
    console.log(`   Errors    : ${stats.errors.length}`);
    stats.errors.forEach(e => console.log(`     • ${e}`));
  }
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
