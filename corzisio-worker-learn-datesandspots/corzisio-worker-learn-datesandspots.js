/**
 * Wild About Sailing — Corsizio API Proxy
 * Cloudflare Worker
 *
 * PURPOSE:
 * Server-side proxy to fetch Corsizio event data for WAS widgets.
 * Returns all upcoming public events sorted by start date.
 *
 * CACHING STRATEGY:
 * Responses are cached for 5 minutes using Cloudflare's Cache API.
 * This means Corsizio is only called once every 5 minutes regardless
 * of how many visitors load the page — eliminating rate limit issues.
 * Cache duration can be adjusted with CACHE_SECONDS below.
 *
 * SPOTS DATA STRATEGY:
 * Per-event detail fetches (for maxSpots and registrationsCount) are
 * only done for events in the next 60 days to keep API calls minimal.
 *
 * MAINTENANCE:
 * - Adjust CACHE_SECONDS to cache longer or shorter
 * - Adjust DAYS_AHEAD to fetch spots for more/fewer upcoming events
 * - Cloudflare free tier: 100,000 requests/day
 *
 * DEBUG: Add ?debug=1 to see the first upcoming event
 * BYPASS CACHE: Add ?nocache=1 to force a fresh fetch
 *
 * LAST UPDATED: June 2026
 */

export default {
  async fetch(request, env, ctx) {

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const CACHE_SECONDS = 300; // Cache for 5 minutes
    const DAYS_AHEAD    = 60;  // Fetch spot details for events within 60 days
    const KEY = env.CORSIZIO_API_KEY;
    const HEADERS       = { "Authorization": "Bearer " + KEY };
    const BASE          = "https://api.corsizio.com/v1";

    const url        = new URL(request.url);
    const isDebug    = url.searchParams.get("debug");
    const bypassCache = url.searchParams.get("nocache");

    // Check cache first (unless bypassing)
    const cache     = caches.default;
    const cacheKey  = new Request("https://was-proxy-cache/events-v2");

    if (!bypassCache && !isDebug) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const data = await cached.json();
        return new Response(JSON.stringify(data), {
          status: 200, headers: corsHeaders()
        });
      }
    }

    // Cache miss — fetch fresh data from Corsizio
    let all = [];
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(
        `${BASE}/events?limit=50&page=${page}`,
        { headers: HEADERS }
      );
      if (!r.ok) {
        return new Response("Corsizio API error: " + r.status, {
          status: 500, headers: corsHeaders()
        });
      }
      const d = await r.json();
      all = all.concat(d.list || []);
      if (!d.paging || !d.paging.more) break;
    }

    // Sort ascending by start date
    all.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    // Filter to upcoming public events only
    const now  = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + DAYS_AHEAD);

    const upcoming = all.filter(e =>
      new Date(e.startDate) > now &&
      e.status === "published" &&
      !e.hideDates
    );

    // Split into near-term (fetch details) and far-term (return as-is)
    const nearTerm = upcoming.filter(e => new Date(e.startDate) <= soon);
    const farTerm  = upcoming.filter(e => new Date(e.startDate) > soon);

    // Fetch full details with stats AND description for near-term events
    const detailed = await Promise.all(nearTerm.map(async (e) => {
      try {
        const r = await fetch(`${BASE}/events/${e.id}?include=stats,details`, { headers: HEADERS });
        if (!r.ok) return e;
        const d = await r.json();
        return {
          ...e,
          maxSpots:           d.maxSpots || null,
          registrationsCount: (d.stats && d.stats.attendees) ? d.stats.attendees : 0,
          summary:            d.summary            || e.summary            || "",
          descriptionHtml:    d.descriptionHtml    || e.descriptionHtml    || ""
        };
      } catch {
        return e;
      }
    }));

    const combined = [...detailed, ...farTerm];

    // Debug: return first event
    if (isDebug) {
      return new Response(JSON.stringify(combined[0], null, 2), {
        status: 200, headers: corsHeaders()
      });
    }

    const responseData = JSON.stringify({ list: combined });

    // Store in cache for CACHE_SECONDS
    ctx.waitUntil(
      cache.put(cacheKey, new Response(responseData, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `max-age=${CACHE_SECONDS}`
        }
      }))
    );

    return new Response(responseData, {
      status: 200, headers: corsHeaders()
    });
  }
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}