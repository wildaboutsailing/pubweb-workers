/**
 * was-ss-cal — Learn to Sail on Salt Spring Island (thin config Worker)
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MATCH SCOPE — DO NOT WIDEN THIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This config previously matched on the PLACE ("salt spring"), while every
 * other config matches on the COURSE. That one difference caused two live
 * bugs, because matching a place scooped up three unrelated courses:
 *
 *   Sep 12  $840  Learn to Sail on Salt Spring Island!
 *   Sep 12  $325  Discover Sailing from Ganges, Salt Spring Island
 *   Sep 20  $840  Learn to Sail on Salt Spring Island!
 *   Sep 20  $840  All Hands: Women's Learn to Sail at Ganges Harbour
 *
 *   1. The modal header showed one course's price against another course's
 *      dates, because two prices ($325 and $840) shared one calendar.
 *   2. On Sep 12 and Sep 20 two courses started the same day, and only the
 *      first was clickable — the other could not be booked at all.
 *
 * Engine v4 defends against both, but the real fix is scope. Match the
 * COURSE, not the island. One calendar, one course type, one price.
 *
 * The Women's Ganges course is served by was-women-cal (matches "women").
 * The Ganges Discover Sailing course needs its own home — see README.
 *
 * BEWARE SUBSTRINGS. "All Hands: Women's Learn to Sail" is a substring of
 * "All Hands: Women's Learn to Sail at Ganges Harbour - Salt Spring Island",
 * so any naive match on the Sidney course catches the Ganges one too. If you
 * ever need to separate them, exclude explicitly:
 *
 *     return n.indexOf("all hands") !== -1 && n.indexOf("ganges") === -1;
 */
export default {
  async fetch(request, env) {
    const ENGINE_URL = "https://was-cal-engine.dave-6bf.workers.dev/";
    const js = `
(function() {
  window.WASCalQueue = window.WASCalQueue || [];
  window.WASCalQueue.push({
    root:   "was-ss-cal-root",
    proxy:  "https://corzisio-worker-learn-datesandspots.dave-6bf.workers.dev",
    toggle: true,
    group:  "was-cal-group",
    // Course-scoped, not place-scoped. Matches the two-day Learn to Sail
    // course at Ganges and nothing else. Widening this to "salt spring"
    // re-introduces the price-mismatch and unbookable-course bugs — see the
    // MATCH SCOPE note in the Worker source.
    match:  function(name) {
      return name.toLowerCase().indexOf("learn to sail on salt spring") !== -1;
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