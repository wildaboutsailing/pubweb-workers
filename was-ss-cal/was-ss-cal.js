/**
 * was-ss-cal — Saltspring Island course calendar (thin config Worker)
 * Wild About Sailing · wildaboutsailing.com
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS FIRST IF YOU ARE NEW TO THIS CODEBASE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS WORKER DOES
 *
 * It serves one small JavaScript file. That's all. It does not render the
 * calendar, does not talk to Corsizio, and holds no UI code.
 *
 * The JS it serves does exactly two things:
 *   1. Pushes a config object onto the global array `window.WASCalQueue`.
 *   2. Loads the shared calendar engine, once per page.
 *
 * The engine (was-cal-engine) reads the queue and renders a calendar for each
 * config it finds. This is the "thin config + shared engine" pattern.
 *
 *
 * WHY IT IS SPLIT THIS WAY
 *
 * The site runs on Carrd, which STRIPS INLINE <script> BLOCKS from embed
 * elements. Only `<script src="...">` survives. So every piece of JS on the
 * site has to be served from somewhere — hence a Worker per widget.
 *
 * Originally each calendar Worker carried a full copy of the UI code ("fat"
 * Workers). A bug fix meant editing six Workers and hoping you got all six.
 * In June 2026 that was refactored: one engine holds the UI, and each calendar
 * is a ~25-line config like this one. Fix the engine, fix every calendar.
 *
 *
 * THE SIBLINGS (all the same shape as this file)
 *
 *   was-ds-cal-v3       Discover Sailing        (homepage)
 *   was-ds-cal-discover Discover Sailing        (discover subdomain)
 *   was-lts-cal-v3      Learn to Sail           matches "two-day"
 *   was-lts-camp-cal    Sailing camp            matches "three-day"
 *   was-skipper-cal-v2  Learn to Skipper
 *   was-women-cal       Women's Learn to Sail
 *   was-ss-cal          THIS ONE — Saltspring Island
 *
 * There are also two orphaned Workers, was-lts2-cal and was-lts3-cal, which no
 * page references. Do not copy from them; they are scheduled for deletion.
 *
 *
 * THE CONFIG FIELDS
 *
 *   root    ID of the empty <div> in the Carrd page where the button renders.
 *           If this div is missing, the engine retries 20 times then gives up
 *           silently. A blank space where a calendar should be almost always
 *           means the root div and this string don't agree.
 *
 *   proxy   A second Worker that fetches the Corsizio event list and adds
 *           spots-remaining data. Note the typo in its hostname — "corzisio",
 *           not "corsizio". That is the real deployed name. Do not "fix" it.
 *
 *   toggle  Clicking the button opens the calendar; clicking again closes it.
 *
 *   group   Calendars sharing a group are mutually exclusive — opening one
 *           closes the others. Keeps the homepage from stacking four open
 *           calendars down the page.
 *
 *   match   THE COURSE FILTER. Receives the Corsizio course NAME as a lowercase
 *           -able string and returns true to include that course.
 *
 *
 * IMPORTANT LIMITATION OF `match`
 *
 * The engine calls `isMatch(e.name)` — it passes ONLY the name string, not the
 * event object. So a config CANNOT filter by date, price, location, or spots
 * remaining. Name matching is the only lever you have here.
 *
 * As of August 2026 both Saltspring offerings happen to fall in September, so
 * this calendar shows September dates. That is a coincidence of the schedule,
 * NOT something this file enforces. Add a Saltspring course in May and it will
 * appear here too.
 *
 * To make month filtering possible, the engine needs a one-line change (pass
 * the whole event: `isMatch(e.name, e)`), which is backward compatible with
 * every config above. See README.
 *
 *
 * WHAT THE ENGINE FILTERS OUT ON ITS OWN
 *
 * Sold-out courses and courses past their registrationCloseDate are dropped
 * before render. You do not need to handle those here.
 *
 *
 * TO ADD A NEW CALENDAR
 *
 * Copy this file, change `root` and `match`, deploy under a new Worker name,
 * then add two embeds to the Carrd page: the root div, and a script tag
 * pointing at the new Worker. See README for the exact snippets.
 */

export default {
  async fetch(request, env) {
    // The shared engine. Every calendar Worker points at this same URL.
    const ENGINE_URL = "https://was-cal-engine.dave-6bf.workers.dev/";

    // Corsizio event feed + spots data. Hostname typo is intentional — see above.
    const PROXY_URL =
      "https://corzisio-worker-learn-datesandspots.dave-6bf.workers.dev";

    // NOTE: this is a template literal. Anything written as ${...} below is
    // evaluated HERE, at the Worker, not in the browser. If you add browser-side
    // code that needs a literal dollar-brace, escape it as \${...}.
    const js = `
(function() {
  window.WASCalQueue = window.WASCalQueue || [];

  window.WASCalQueue.push({
    root:   "was-ss-cal-root",
    proxy:  "${PROXY_URL}",
    toggle: true,
    group:  "was-cal-group",

    // Corsizio currently spells it "Saltspring" (one word) in the course title:
    // "Learn to Sail on Saltspring Island!". The two-word spelling is accepted
    // as well so a rename in Corsizio doesn't silently empty this calendar.
    match:  function(name) {
      var n = name.toLowerCase();
      return n.indexOf("saltspring") !== -1 || n.indexOf("salt spring") !== -1;
    }
  });

  // Load the engine exactly once, even when several calendar Workers are on the
  // same page. Whichever one runs first wins; the rest see the flag and skip.
  if (!window.WASCalEngineLoaded) {
    window.WASCalEngineLoaded = true;
    var s = document.createElement("script");
    s.src = "${ENGINE_URL}";
    // head || documentElement, not document.body — body may not exist yet
    // depending on where Carrd injects the embed.
    (document.head || document.documentElement).appendChild(s);
  }
})();
`;

    return new Response(js, {
      headers: {
        "Content-Type": "application/javascript",
        // Carrd pages are served from wildaboutsailing.com and its subdomains,
        // while this Worker lives on workers.dev — cross-origin, so CORS is required.
        "Access-Control-Allow-Origin": "*",
        // Five minutes. Long enough to be cheap, short enough that a deploy shows
        // up before you lose patience. Hard-refresh (Cmd/Ctrl+Shift+R) to bypass
        // while testing — stale config Workers have burned hours here before.
        "Cache-Control": "public, max-age=300"
      }
    });
  }
};
