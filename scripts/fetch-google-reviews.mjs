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
 *   SerpAPI key → https://serpapi.com  (free tier: 100 searches/month)
 *
 * Usage
 * -----
 *   node scripts/fetch-google-reviews.mjs [options]
 *
 * Required options:
 *   --product-id   <n>      ReviewHub product ID to attach reviews to
 *   --serpapi-key  <key>    SerpAPI API key
 *   --api-pass     <pass>   External API password (EXTERNAL_PASS in be/.env)
 *
 * One of:
 *   --place-id     <id>     Google Maps place_id  (e.g. ChIJN1t_tDeuEmsRUsoyG83frY4)
 *   --place-name   <name>   Business name to search (SerpAPI resolves to place_id)
 *
 * Optional:
 *   --api-url      <url>    ReviewHub API URL     (default: http://localhost:8080)
 *   --api-user     <user>   External API username (default: external_admin)
 *   --limit        <n>      Max reviews to import (default: 100)
 *   --min-rating   <n>      Skip reviews below this star count (default: 1)
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
    serpapiKey: null,
    apiUrl: 'http://localhost:8080',
    apiUser: 'external_admin',
    apiPass: null,
    limit: 100,
    minRating: 1,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];

    switch (flag) {
      case '--product-id':   args.productId   = parseInt(next, 10); i++; break;
      case '--place-id':     args.placeId     = next; i++; break;
      case '--place-name':   args.placeName   = next; i++; break;
      case '--serpapi-key':  args.serpapiKey  = next; i++; break;
      case '--api-url':      args.apiUrl      = next.replace(/\/$/, ''); i++; break;
      case '--api-user':     args.apiUser     = next; i++; break;
      case '--api-pass':     args.apiPass     = next; i++; break;
      case '--limit':        args.limit       = parseInt(next, 10); i++; break;
      case '--min-rating':   args.minRating   = parseInt(next, 10); i++; break;
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
  --serpapi-key <key>   SerpAPI API key (https://serpapi.com)
  --api-pass    <pass>  External API password

One of:
  --place-id    <id>    Google Maps place_id
  --place-name  <name>  Business name to search

Optional:
  --api-url     <url>   ReviewHub API URL (default: http://localhost:8080)
  --api-user    <user>  External API username (default: external_admin)
  --limit       <n>     Max reviews to import (default: 100)
  --min-rating  <n>     Minimum star rating 1-5 (default: 1)
  --dry-run             Preview without submitting
  --verbose             Extra logging
`);
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(args) {
  const errors = [];
  if (!args.productId || isNaN(args.productId)) errors.push('--product-id is required');
  if (!args.serpapiKey)                          errors.push('--serpapi-key is required');
  if (!args.apiPass)                             errors.push('--api-pass is required');
  if (!args.placeId && !args.placeName)          errors.push('either --place-id or --place-name is required');
  if (args.minRating < 1 || args.minRating > 5) errors.push('--min-rating must be 1-5');
  if (errors.length) {
    console.error('Errors:\n' + errors.map(e => '  ✗ ' + e).join('\n'));
    console.error('\nRun with --help for usage.');
    process.exit(1);
  }
}

// ─── SerpAPI helpers ─────────────────────────────────────────────────────────

/**
 * Resolve a place name to a Google Maps place_id using SerpAPI.
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

  const places = data.local_results ?? [];
  if (places.length === 0) throw new Error(`No Google Maps results found for "${placeName}"`);

  const place = places[0];
  console.log(`📍 Found: ${place.title} — ${place.address ?? ''}`);
  if (places.length > 1 && verbose) {
    console.log(`   (${places.length} results total; using first match — use --place-id to be explicit)`);
  }
  return place.place_id;
}

/**
 * Fetch all review pages from SerpAPI Google Maps Reviews engine.
 * Returns an array of raw review objects.
 */
async function fetchGoogleReviews(placeId, apiKey, limit, verbose) {
  const reviews = [];
  let nextPageToken = null;
  let page = 1;

  while (reviews.length < limit) {
    if (verbose) console.log(`📄 Fetching page ${page} (${reviews.length}/${limit} so far)…`);

    const url = new URL('https://serpapi.com/search');
    url.searchParams.set('engine', 'google_maps_reviews');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('hl', 'en');
    url.searchParams.set('sort_by', 'qualityScore'); // most relevant first
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
function transformReview(raw, productId) {
  const authorName = raw.user?.name ?? 'Anonymous';
  const rating = typeof raw.rating === 'number' ? Math.round(raw.rating) : 3;
  const content = raw.snippet ?? raw.description ?? '';

  // Build a meaningful title from the first sentence or first 80 chars
  let title = content.split(/[.!?]/)[0].trim();
  if (title.length > 120) title = title.slice(0, 117) + '…';
  if (!title) title = `${authorName} rated this ${rating} star${rating !== 1 ? 's' : ''}`;

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

  // 1. Resolve place_id
  let placeId = args.placeId;
  if (!placeId) {
    placeId = await resolvePlaceId(args.placeName, args.serpapiKey, args.verbose);
  }
  console.log(`🗺  Place ID : ${placeId}`);
  console.log(`📦 Product  : #${args.productId}`);
  console.log(`🔢 Limit    : ${args.limit} reviews (min rating: ${args.minRating}★)\n`);

  // 2. Fetch reviews
  console.log('⬇️  Fetching reviews from Google via SerpAPI…');
  const raw = await fetchGoogleReviews(placeId, args.serpapiKey, args.limit, args.verbose);
  console.log(`   Found ${raw.length} reviews\n`);

  // 3. Filter by min rating
  const filtered = raw.filter(r => {
    const rating = typeof r.rating === 'number' ? Math.round(r.rating) : 3;
    return rating >= args.minRating;
  });
  if (filtered.length < raw.length) {
    console.log(`   Filtered to ${filtered.length} (${raw.length - filtered.length} below ${args.minRating}★)\n`);
  }

  if (filtered.length === 0) {
    console.log('No reviews to import. Exiting.');
    process.exit(0);
  }

  // 4. Submit
  const stats = { submitted: 0, skipped: 0, errors: [] };
  for (const [i, rawReview] of filtered.entries()) {
    const payload = transformReview(rawReview, args.productId);

    const progress = `[${String(i + 1).padStart(String(filtered.length).length)}/${filtered.length}]`;

    if (args.dryRun) {
      console.log(`${progress} DRY-RUN  ★${payload.rating}  "${payload.title.slice(0, 55)}"  — ${payload.author_name}`);
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
