/**
 * Wild About Sailing — Discover Sailing Calendar (Discover subdomain only)
 * Root: was-ds-cal-root
 * LAST UPDATED: June 2026
 */

export default {
  async fetch(request, env) {
    const ENGINE_URL = "https://was-cal-engine.dave-6bf.workers.dev/";

    const js = `
(function() {
  window.WASCalQueue = window.WASCalQueue || [];
  window.WASCalQueue.push({
    root:         "was-ds-cal-root",
    proxy:        "https://corzisio-worker-learn-datesandspots.dave-6bf.workers.dev",
    toggle:       true,
    group:        "was-cal-group",
    buttonLayout: "row",
    buttonTheme:  "light",
    match:        function(name) {
      return name.toLowerCase().indexOf("discover sailing: a one-day introduction") !== -1;
    }
  });

  if (!window.WASCalEngineLoaded) {
    window.WASCalEngineLoaded = true;
    var s = document.createElement("script");
    s.src = "${ENGINE_URL}";
    (document.head || document.documentElement).appendChild(s);
  }
})();
`;

    return new Response(js, {
      headers: {
        "Content-Type": "application/javascript",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
};