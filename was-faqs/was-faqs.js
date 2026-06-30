/**
 * Wild About Sailing — FAQ Widget
 * Cloudflare Worker
 *
 * GOOGLE SHEET FORMAT:
 * Column A: Row number (ignored)
 * Column B: Question
 * Column C: Answer (supports shortcodes)
 * Column D: Group (optional — renders a heading when group changes)
 */

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQp593T4K0QaEsTWw3VLdsxDvaRwiAhu-kzVT803UazLfdRVRSNl0Y_WD1ACQtuu_XlPMncJul0NJS0/pub?output=csv";
const NAVY  = "#28286E";
const RED   = "#DC3C32";
const SKY   = "#BEDCE6";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsHeaders() {
  return { ...corsHeaders(), "Content-Type": "application/javascript", "Cache-Control": "public, max-age=300" };
}

function parseCSV(text) {
  const rows = [];
  let i = 0;

  function parseField() {
    if (i >= text.length) return "";
    if (text[i] === '"') {
      i++;
      let val = "";
      while (i < text.length) {
        if (text[i] === '"') {
          if (text[i+1] === '"') { val += '"'; i += 2; }
          else { i++; break; }
        } else {
          val += text[i++];
        }
      }
      return val;
    } else {
      let val = "";
      while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
        val += text[i++];
      }
      return val;
    }
  }

  function parseRow() {
    const cols = [];
    while (i < text.length) {
      cols.push(parseField());
      if (i < text.length && text[i] === ',') { i++; continue; }
      if (i < text.length && (text[i] === '\r' || text[i] === '\n')) {
        if (text[i] === '\r' && text[i+1] === '\n') i++;
        i++;
      }
      break;
    }
    return cols;
  }

  parseRow(); // skip header

  while (i < text.length) {
    const cols = parseRow();
    const q = (cols[1] || "").trim();
    const a = (cols[2] || "").trim();
    const g = (cols[3] || "").trim();
    if (q && a) rows.push({ q, a, g });
  }

  return rows;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const cache = caches.default;
    const cacheKey = new Request("https://was-faq-cache/faq-v6");

    if (!url.searchParams.get("nocache")) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(await cached.text(), { headers: jsHeaders() });
      }
    }

    let faqs = [];
    try {
      const r = await fetch(SHEET_URL);
      const text = await r.text();
      faqs = parseCSV(text);
    } catch(e) {
      const errJs = `(function(){var r=document.getElementById("was-faq-root");if(r)r.innerHTML='<p style="color:#DC3C32;font-size:13px">Could not load FAQ.</p>';})();`;
      return new Response(errJs, { headers: jsHeaders() });
    }

    const faqData = JSON.stringify(faqs);

    const js = `
(function() {
  var NAVY  = "${NAVY}";
  var RED   = "${RED}";
  var SKY   = "${SKY}";

  var faqs = ${faqData};
  var root = document.getElementById("was-faq-root");
  if (!root) return;

  function processShortcodes(text) {
    text = text.replace(/\\n/g, "<br>");
    text = text.replace(/\\[map:([^\\]]+)\\]/g, function(_, addr) {
      var enc = encodeURIComponent(addr);
      return '<div style="margin:10px 0;"><iframe width="100%" height="220" frameborder="0" style="border:0;border-radius:6px;" src="https://maps.google.com/maps?q=' + enc + '&output=embed" allowfullscreen></iframe></div>';
    });
    text = text.replace(/\\[link:([^|\\]]+)\\|([^\\]]+)\\]/g, '<a href="$1" target="_blank" style="color:' + NAVY + ';font-weight:600;text-decoration:underline;">$2</a>');
    text = text.replace(/\\[email:([^\\]]+)\\]/g, '<a href="mailto:$1" style="color:' + NAVY + ';font-weight:600;">$1</a>');
    text = text.replace(/\\[phone:([^\\]]+)\\]/g, function(_, num) {
      var clean = num.replace(/[^0-9+]/g, "");
      return '<a href="tel:' + clean + '" style="color:' + NAVY + ';font-weight:600;">' + num + '</a>';
    });
    text = text.replace(/\\[bold:([^\\]]+)\\]/g, '<strong>$1</strong>');
    return text;
  }

  var style = document.createElement("style");
  style.textContent =
    ".was-faq-wrap{font-family:Lato,sans-serif;text-align:left;}" +
    ".was-faq-group{font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-align:left;color:" + NAVY + ";padding:0.6rem 1rem;background:#f0f2f5;border-left:3px solid " + NAVY + ";margin:2rem 0 0;}" +
    ".was-faq-group:first-child{margin-top:0;}" +
    ".was-faq-item{border-bottom:1px solid #e0e6ef;}" +
    ".was-faq-q{display:flex;justify-content:space-between;align-items:center;padding:14px 4px;cursor:pointer;font-size:15px;font-weight:600;color:" + NAVY + ";gap:12px;text-align:left;}" +
    ".was-faq-q:hover{color:" + RED + ";}" +
    ".was-faq-chevron{flex-shrink:0;font-size:18px;color:" + NAVY + ";transition:transform 0.2s;line-height:1;}" +
    ".was-faq-item.open .was-faq-chevron{transform:rotate(180deg);color:" + RED + ";}" +
    ".was-faq-item.open .was-faq-q{color:" + RED + ";}" +
    ".was-faq-body{display:none;padding:4px 4px 20px;font-size:15px;font-weight:400;line-height:1.75;color:#3a3a3a;text-align:left;}" +
    ".was-faq-body strong{font-weight:600;color:" + NAVY + ";}" +
    ".was-faq-body a{color:" + NAVY + ";}" +
    ".was-faq-body br+br{display:block;margin-top:6px;content:'';}" +
    ".was-faq-item.open .was-faq-body{display:block;}";
  document.head.appendChild(style);

  var html = '<div class="was-faq-wrap">';
  var lastGroup = null;

  faqs.forEach(function(faq, i) {
    if (faq.g && faq.g !== lastGroup) {
      html += '<div class="was-faq-group">' + faq.g + '</div>';
      lastGroup = faq.g;
    }
    html +=
      '<div class="was-faq-item" id="was-faq-' + i + '">' +
        '<div class="was-faq-q" onclick="wasFAQToggle(' + i + ')">' +
          '<span>' + faq.q + '</span>' +
          '<span class="was-faq-chevron">&#8964;</span>' +
        '</div>' +
        '<div class="was-faq-body">' + processShortcodes(faq.a) + '</div>' +
      '</div>';
  });

  html += '</div>';
  root.innerHTML = html;

  window.wasFAQToggle = function(i) {
    var item = document.getElementById("was-faq-" + i);
    var isOpen = item.classList.contains("open");
    document.querySelectorAll(".was-faq-item.open").forEach(function(el) { el.classList.remove("open"); });
    if (!isOpen) item.classList.add("open");
  };
})();
`;

    const response = new Response(js, { headers: jsHeaders() });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
};