/**
 * Wild About Sailing — LTS Three-Day Camp Calendar
 * Root: was-lts-camp-cal-root
 * LAST UPDATED: June 2026
 */
export default {
  async fetch(request, env) {
    const ENGINE_URL = "https://was-cal-engine.dave-6bf.workers.dev/";
    const js = `
(function() {
  window.WASCalQueue = window.WASCalQueue || [];
  window.WASCalQueue.push({
    root:   "was-lts-camp-cal-root",
    proxy:  "https://corzisio-worker-learn-datesandspots.dave-6bf.workers.dev",
    toggle: true,
    group:  "was-cal-group",
    match:  function(name) {
      return name.toLowerCase().indexOf("three-day") !== -1;
    }
  });
  if (!window.WASCalEngineLoaded) {
    window.WASCalEngineLoaded = true;
    var s = document.createElement("script");
    s.src = "${ENGINE_URL}";
    document.body.appendChild(s);
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