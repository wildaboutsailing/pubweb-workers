/**
 * Wild About Sailing — Google Reviews Widget
 * Cloudflare Worker v2
 *
 * Fetches reviews from Google Places API and serves a branded JS widget.
 * API key is read server-side from the GOOGLE_PLACES_API_KEY secret —
 * never hardcoded, never exposed to the browser.
 *
 * Usage: <div id="was-reviews-root"></div>
 *        <script src="https://was-reviews.dave-6bf.workers.dev/"></script>
 *
 * Cache bust: https://was-reviews.dave-6bf.workers.dev/?nocache=1
 */

const PLACE_ID   = "ChIJCYMv_P2_KSURDLBSHyG_9fQ";
const NAVY       = "#1a1a3e";
const RED        = "#DC3C32";
const SKY        = "#BEDCE6";
const STAR_COLOR = "#F5A623";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsHeaders() {
  return {
    ...corsHeaders(),
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  };
}

export default {
  async fetch(request, env, ctx) {

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Read the API key from the encrypted secret — must be INSIDE the handler,
    // because `env` only exists here (it's a parameter of fetch()).
    const API_KEY  = env.GOOGLE_PLACES_API_KEY;

    const url      = new URL(request.url);
    const cache    = caches.default;
    const cacheKey = new Request("https://was-reviews-cache/reviews-v2");

    // Serve from cache unless ?nocache=1
    if (!url.searchParams.get("nocache")) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(await cached.text(), { headers: jsHeaders() });
      }
    }

    // Fetch from Google Places API
    let placeData = null;
    try {
      const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${PLACE_ID}&fields=name,rating,user_ratings_total,reviews,url&key=${API_KEY}`;
      const r      = await fetch(apiUrl);
      const data   = await r.json();
      if (data.status === "OK") {
        placeData = data.result;
      } else {
        throw new Error("Places API error: " + data.status);
      }
    } catch (e) {
      const errJs = `(function(){var r=document.getElementById("was-reviews-root");if(r)r.innerHTML='<p style="color:#DC3C32;font-family:sans-serif;font-size:13px;padding:1rem;">Could not load reviews: ${e.message}</p>';})();`;
      return new Response(errJs, { headers: jsHeaders() });
    }

    const name      = placeData.name || "Wild About Sailing";
    const rating    = placeData.rating || 0;
    const total     = placeData.user_ratings_total || 0;
    const googleUrl = placeData.url || "https://g.page/r/CQywUh8hv_X0EAE";
    const reviews   = (placeData.reviews || []).slice(0, 4);

    // Sanitise review data — escape backslashes and quotes, strip control chars
    const sanitise = (str) => String(str || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, " ")
      .replace(/[\u0000-\u001F\u007F]/g, "");

    const reviewsJSON = JSON.stringify(reviews.map(rev => ({
      author: sanitise(rev.author_name),
      rating: rev.rating || 0,
      text:   sanitise(rev.text),
      time:   sanitise(rev.relative_time_description),
      photo:  sanitise(rev.profile_photo_url),
    })));

    const js = `
(function() {
  "use strict";

  var root = document.getElementById("was-reviews-root");
  if (!root) return;

  var NAVY      = "${NAVY}";
  var RED       = "${RED}";
  var SKY       = "${SKY}";
  var STAR      = "${STAR_COLOR}";
  var rating    = ${rating};
  var total     = ${total};
  var googleUrl = "${googleUrl}";
  var reviews   = ${reviewsJSON};

  function starStr(n) {
    var s = "";
    for (var i = 1; i <= 5; i++) {
      s += i <= n ? "\u2605" : "\u2606";
    }
    return s;
  }

  function truncate(text, max) {
    if (!text) return "";
    if (text.length <= max) return text;
    return text.substring(0, max).trimEnd() + "\u2026";
  }

  function el(tag, className) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  var style = el("style");
  style.textContent = [
    ".was-rev-wrap { font-family: Lato, sans-serif; }",
    ".was-rev-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:2px solid " + SKY + "; }",
    ".was-rev-score { display:flex; align-items:center; gap:0.75rem; }",
    ".was-rev-big { font-size:48px; font-weight:700; color:" + NAVY + "; line-height:1; }",
    ".was-rev-stars { font-size:22px; color:" + STAR + "; letter-spacing:2px; }",
    ".was-rev-total { font-size:13px; color:#888; margin-top:2px; }",
    ".was-rev-gbtn { display:inline-flex; align-items:center; gap:8px; background:" + NAVY + "; color:#fff; text-decoration:none; font-size:13px; font-weight:600; padding:10px 18px; border-radius:6px; white-space:nowrap; transition:background 0.2s; }",
    ".was-rev-gbtn:hover { background:" + RED + "; }",
    ".was-rev-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1rem; }",
    ".was-rev-card { background:#fff; border:1px solid #e8ecf0; border-radius:8px; padding:1.25rem; display:flex; flex-direction:column; gap:0.5rem; box-shadow:0 1px 4px rgba(0,0,0,0.06); }",
    ".was-rev-card-stars { font-size:16px; color:" + STAR + "; letter-spacing:1px; }",
    ".was-rev-card-text { font-size:14px; color:#444; line-height:1.6; flex:1; }",
    ".was-rev-card-author { display:flex; align-items:center; gap:8px; margin-top:0.5rem; }",
    ".was-rev-card-photo { width:32px; height:32px; border-radius:50%; object-fit:cover; }",
    ".was-rev-card-photo-placeholder { width:32px; height:32px; border-radius:50%; background:" + NAVY + "; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; font-weight:700; flex-shrink:0; }",
    ".was-rev-card-name { font-size:13px; font-weight:600; color:" + NAVY + "; }",
    ".was-rev-card-time { font-size:11px; color:#aaa; }",
    ".was-rev-footer { text-align:center; margin-top:1.5rem; }",
    ".was-rev-footer a { color:" + NAVY + "; font-size:13px; text-decoration:underline; }",
  ].join("");
  document.head.appendChild(style);

  // ── Header ───────────────────────────────────────────────────────────────────
  var header = el("div", "was-rev-header");

  var score = el("div", "was-rev-score");
  var scoreBig = el("div", "was-rev-big");
  scoreBig.textContent = rating.toFixed(1);
  var scoreMeta = el("div");
  var scoreStars = el("div", "was-rev-stars");
  scoreStars.textContent = starStr(Math.round(rating));
  var scoreTotal = el("div", "was-rev-total");
  scoreTotal.textContent = total + " Google reviews";
  scoreMeta.appendChild(scoreStars);
  scoreMeta.appendChild(scoreTotal);
  score.appendChild(scoreBig);
  score.appendChild(scoreMeta);

  var gbtn = el("a", "was-rev-gbtn");
  gbtn.href = googleUrl;
  gbtn.target = "_blank";
  gbtn.rel = "noopener noreferrer";
  // Google G icon (SVG, safe to use innerHTML here as it's our own constant)
  gbtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>' +
    '<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>' +
    '<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>' +
    '<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>' +
    '</svg>Write a Review';

  header.appendChild(score);
  header.appendChild(gbtn);

  // ── Review cards ─────────────────────────────────────────────────────────────
  var grid = el("div", "was-rev-grid");

  reviews.forEach(function(rev) {
    var card = el("div", "was-rev-card");

    var cardStars = el("div", "was-rev-card-stars");
    cardStars.textContent = starStr(rev.rating);

    var cardText = el("div", "was-rev-card-text");
    cardText.textContent = truncate(rev.text, 220);

    var cardAuthor = el("div", "was-rev-card-author");

    if (rev.photo) {
      var img = el("img", "was-rev-card-photo");
      img.src = rev.photo;
      img.alt = rev.author;
      cardAuthor.appendChild(img);
    } else {
      var placeholder = el("div", "was-rev-card-photo-placeholder");
      placeholder.textContent = rev.author ? rev.author.charAt(0).toUpperCase() : "?";
      cardAuthor.appendChild(placeholder);
    }

    var authorName = el("div", "was-rev-card-name");
    authorName.textContent = rev.author;
    var authorTime = el("div", "was-rev-card-time");
    authorTime.textContent = rev.time;
    var authorInfo = el("div");
    authorInfo.appendChild(authorName);
    authorInfo.appendChild(authorTime);
    cardAuthor.appendChild(authorInfo);

    card.appendChild(cardStars);
    card.appendChild(cardText);
    card.appendChild(cardAuthor);
    grid.appendChild(card);
  });

  // ── Footer ───────────────────────────────────────────────────────────────────
  var footer = el("div", "was-rev-footer");
  var footerLink = el("a");
  footerLink.href = googleUrl;
  footerLink.target = "_blank";
  footerLink.rel = "noopener noreferrer";
  footerLink.textContent = "See all reviews on Google \u2192";
  footer.appendChild(footerLink);

  // ── Assemble ─────────────────────────────────────────────────────────────────
  var wrap = el("div", "was-rev-wrap");
  wrap.appendChild(header);
  wrap.appendChild(grid);
  wrap.appendChild(footer);
  root.appendChild(wrap);

})();
`;

    const response = new Response(js, { headers: jsHeaders() });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
};