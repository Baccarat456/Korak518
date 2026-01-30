/**
 * Product Hunt "Launch of the Day" Stats scraper
 * - By default uses CheerioCrawler (fast), but you can set useBrowser=true in input
 *   to use PlaywrightCrawler for client-side rendered Product Hunt pages.
 *
 * Notes:
 * - Product Hunt is JS-heavy and may require Playwright for reliable extraction.
 * - Prefer using Product Hunt official API for production / heavy usage (token input provided).
 */

import { Actor } from 'apify';
import { CheerioCrawler, PlaywrightCrawler, Dataset } from 'crawlee';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
  startUrls = ['https://www.producthunt.com/'],
  maxRequestsPerCrawl = 200,
  useBrowser = false,
  productHuntApiToken = '',
} = input;

// Helper: normalize Product Hunt post URL to canonical /posts/<slug>
function normalizePhUrl(u) {
  try {
    const url = new URL(u);
    // product pages are usually /posts/<slug>
    if (url.pathname.includes('/posts/')) return url.toString();
    // some links include /r or query → try to find /posts/ in anchors; otherwise return as-is
    return url.toString();
  } catch (e) {
    return u;
  }
}

// Extraction logic for a Product Hunt post page using Cheerio root ($)
async function extractFromCheerio({ request, $, log }) {
  const ph_url = request.loadedUrl ?? request.url;
  // Title & tagline
  const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
  const tagline = $('h2, .tagline, .post-headline__tagline').first().text().trim() || $('meta[name="description"]').attr('content') || '';

  // Votes and comments may be embedded in text; try common selectors
  let votes = $('button[data-test="vote-button"]').first().text().trim() || '';
  votes = votes.replace(/\D/g, '') || $('span.vote-count, .votes-count').first().text().replace(/\D/g, '') || '';

  let comments = $('a[data-test="comments-link"]').first().text().replace(/\D/g, '') || '';
  comments = comments || $('.comments-count').first().text().replace(/\D/g, '') || '';

  // Makers (authors) and topics
  const makers = [];
  $('[data-test="maker-name"], .maker, .product_maker, a[href*="/@"]').each((i, el) => {
    const t = $(el).text().trim();
    if (t) makers.push(t);
  });

  const topics = [];
  $('a[href*="/topics/"], .topic').each((i, el) => {
    const t = $(el).text().trim();
    if (t) topics.push(t);
  });

  // Product link (external), often with rel="nofollow" or specific button
  const product_url = $('a[data-test="visit-site-button"], a[href^="http"][rel~="nofollow"]').first().attr('href') || $('a[data-test*="website"]').first().attr('href') || '';

  // slug from path
  let slug = '';
  try {
    const u = new URL(ph_url);
    const m = u.pathname.match(/\/posts\/([^/]+)/);
    if (m) slug = m[1];
  } catch (e) {}

  // posted date
  let posted_at = $('time').first().attr('datetime') || $('time').first().text().trim() || '';

  // Build record
  const record = {
    title,
    tagline,
    votes: votes || '',
    comments: comments || '',
    makers: Array.from(new Set(makers)),
    topics: Array.from(new Set(topics)),
    product_url: product_url ? new URL(product_url, ph_url).toString() : '',
    ph_url: normalizePhUrl(ph_url),
    slug,
    posted_at,
    extracted_at: new Date().toISOString(),
  };

  await Dataset.pushData(record);
  log.info('Saved Product Hunt post', { ph_url, title });
}

// Extraction using Playwright page (when useBrowser=true)
async function extractFromPlaywright({ page, request, log }) {
  const ph_url = request.loadedUrl ?? request.url;
  // Wait a bit for dynamic content
  await page.waitForTimeout(800); // small wait; use smarter waits in production if needed

  const title = (await page.locator('h1').first().innerText().catch(() => '')).trim() || (await page.title().catch(() => ''));
  const tagline = (await page.locator('h2, .tagline').first().innerText().catch(() => '')).trim() || '';
  let votes = await page.locator('button[data-test="vote-button"]').first().innerText().catch(() => '');
  votes = votes.replace(/\D/g, '') || '';
  let comments = await page.locator('a[data-test="comments-link"]').first().innerText().catch(() => '');
  comments = comments.replace(/\D/g, '') || '';

  const makers = [];
  for (const el of await page.locator('[data-test="maker-name"], a[href^="/@"]').all().catch(() => [])) {
    const t = (await el.innerText().catch(() => '')).trim();
    if (t) makers.push(t);
  }

  const topics = [];
  for (const el of await page.locator('a[href*="/topics/"], .topic').all().catch(() => [])) {
    const t = (await el.innerText().catch(() => '')).trim();
    if (t) topics.push(t);
  }

  const product_url = (await page.locator('a[data-test="visit-site-button"]').first().getAttribute('href').catch(() => '')) || '';
  let slug = '';
  try {
    const u = new URL(ph_url);
    const m = u.pathname.match(/\/posts\/([^/]+)/);
    if (m) slug = m[1];
  } catch (e) {}

  let posted_at = (await page.locator('time').first().getAttribute('datetime').catch(() => '')) || (await page.locator('time').first().innerText().catch(() => '')) || '';

  const record = {
    title,
    tagline,
    votes: votes || '',
    comments: comments || '',
    makers: Array.from(new Set(makers)),
    topics: Array.from(new Set(topics)),
    product_url: product_url ? new URL(product_url, ph_url).toString() : '',
    ph_url: normalizePhUrl(ph_url),
    slug,
    posted_at,
    extracted_at: new Date().toISOString(),
  };

  await Dataset.pushData(record);
  log.info('Saved Product Hunt post (browser)', { ph_url, title });
}

// NOTE about productHuntApiToken: for production or large-scale jobs you should use the official API.
// This scaffold accepts a token but does not implement the API path by default. If you provide a token
// and want the API flow, ask and I will add a token-based API implementation.

const proxyConfiguration = await Actor.createProxyConfiguration();

if (!useBrowser) {
  // CheerioCrawler flow
  const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    async requestHandler({ enqueueLinks, request, $, log }) {
      const url = request.loadedUrl ?? request.url;
      log.info('Processing (cheerio)', { url });

      // Enqueue product post links found on listing pages
      await enqueueLinks({
        globs: ['**/posts/**'],
      });

      // If current page looks like a post page (contains /posts/), extract
      if (url.includes('/posts/')) {
        await extractFromCheerio({ request, $, log });
      } else {
        log.debug('Listing page — links enqueued', { url });
      }
    },
  });

  await crawler.run(startUrls);
} else {
  // PlaywrightCrawler flow (browser)
  const crawler = new PlaywrightCrawler({
    launchContext: {
      // default context; in production set proxy/args as needed
    },
    maxRequestsPerCrawl,
    async requestHandler({ page, enqueueLinks, request, log }) {
      const url = request.loadedUrl ?? request.url;
      log.info('Processing (playwright)', { url });

      // Wait for main content; listing pages and posts render client-side
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      } catch (e) {}

      // Enqueue links to posts
      await enqueueLinks({
        globs: ['**/posts/**'],
        // Use page's href resolution by letting Crawlee handle requests
      });

      if (url.includes('/posts/')) {
        await extractFromPlaywright({ page, request, log });
      } else {
        log.debug('Listing page — links enqueued (browser)', { url });
      }
    },
  });

  await crawler.run(startUrls.map((u) => ({ url: u })));
}

await Actor.exit();
