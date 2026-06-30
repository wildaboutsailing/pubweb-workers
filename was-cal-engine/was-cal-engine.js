/**
 * Wild About Sailing — Calendar Engine
 * Cloudflare Worker
 * LAST UPDATED: June 2026
 *
 * CHANGES (this version):
 *  - Registration-close filter: public calendars now hide courses that are
 *    sold out OR whose registrationCloseDate has passed.
 *  - Whole-course highlight: clicking ANY day of a multi-day course turns
 *    every day of that course red (keyed by course id), and populates the
 *    info box + Register link for that course.
 */

export default {
  async fetch(request, env) {

    const FORM_PAGE_URL = "https://was-request-form.dave-6bf.workers.dev/";

    const js = `
(function() {

  var FORM_PAGE_URL = "${FORM_PAGE_URL}";

  function processQueue() {
    var queue = window.WASCalQueue || [];
    queue.forEach(function(cfg) { initCalendar(cfg); });
  }

  function initCalendar(cfg) {

    var PROXY   = cfg.proxy || "https://corzisio-worker-learn-datesandspots.dave-6bf.workers.dev";
    var ROOT    = cfg.root;
    var P       = ROOT + "-";
    var TOGGLE  = cfg.toggle !== false;
    var GROUP   = cfg.group || "was-cal-group";
    var isMatch = cfg.match;

    var NAVY = "#28286E";
    var RED  = "#DC3C32";
    var SKY  = "#BEDCE6";

    var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    var days   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var courses = [], today = new Date(), curYear = today.getFullYear(), curMonth = today.getMonth(), selected = null;
    var modalCalMonth = today.getMonth(), modalCalYear = today.getFullYear(), modalSelected = null;
    var currentCourse = null, selectedCourse = null;

    // ── Course key helper ──────────────────────────────────────────────────
    // Stable identifier for a course so every one of its day-cells can be
    // matched together. Prefer the Corsizio id; fall back to startDate+name.
    function courseCoversDay(c, y, mo, da) {
      if (!c) return false;
      var start = new Date(c.startDate), end = new Date(c.endDate);
      var endDay = new Date(end);
      if (end.getUTCHours()===0 && end.getUTCMinutes()===0 && end.getUTCSeconds()===0) endDay.setUTCDate(endDay.getUTCDate()-1);
      var cell = Date.UTC(y, mo, da);
      var s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      var e = Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate());
      return cell >= s && cell <= e;
    }

    function courseKey(c) {
      if (!c) return "";
      if (c.id) return String(c.id);
      return (c.startDate || "") + "|" + (c.name || "");
    }

      var btnLayout = cfg.buttonLayout === "row" ? "row" : "column";
      var btnAlign  = "align-items:center;";
      var light     = cfg.buttonTheme === "light";
      // light theme: white buttons with navy text, for use on dark hero backgrounds
      var detailsBg   = light ? "transparent" : "#fff";
      var detailsClr  = light ? "#fff" : NAVY;
      var detailsBdr  = light ? "2px solid #fff" : "2px solid "+NAVY;
      var detailsHvBg = light ? "rgba(255,255,255,0.2)" : NAVY;
      var detailsHvCl = "#fff";
      var pickBg      = light ? "#fff" : NAVY;
      var pickClr     = light ? NAVY : "#fff";
      var pickBdr     = light ? "none" : "none";
      var pickHvBg    = light ? "rgba(255,255,255,0.85)" : RED;

    // ── Icons ──────────────────────────────────────────────────────────────
    var calIcon  = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    var infoIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    // ── Helpers ───────────────────────────────────────────────────────────
    function stripInlineStyles(html) {
      return html
        .replace(/\\s*style="[^"]*"/gi, "")
        .replace(/<h3>/gi, '<h3 style="font-size:15px;font-weight:700;color:#28286E;margin:14px 0 4px;font-family:Lato,sans-serif;">')
        .replace(/<p>/gi,  '<p style="margin:0 0 10px;line-height:1.6;">')
        .replace(/<ul>/gi, '<ul style="margin:4px 0 10px 18px;padding:0;">')
        .replace(/<li>/gi, '<li style="margin-bottom:4px;line-height:1.5;">')
        .replace(/<strong>/gi, '<strong style="color:#28286E;">')
        .replace(/<a /gi,  '<a style="color:#28286E;font-weight:600;" ');
    }

    function formatPrice(from, to) {
      if (!from && !to) return "";
      var f = from ? "$" + Number(from).toLocaleString() : null;
      var t = to   ? "$" + Number(to).toLocaleString()   : null;
      if (f && t && from !== to) return f + " \u2013 " + t + " per person";
      return (f || t) + " per person";
    }

    function spots(m, r) {
      if (!m) return "Registration open";
      var x = m - (r || 0);
      if (x <= 0) return "Full";
      if (x <= 3) return x + " spot" + (x === 1 ? "" : "s") + " left";
      return x + " spots available";
    }

    function fmtRange(s, e) {
      var sd = new Date(s), ed = new Date(e);
      if (ed.getUTCHours() === 0 && ed.getUTCMinutes() === 0 && ed.getUTCSeconds() === 0) ed.setUTCDate(ed.getUTCDate() - 1);
      var mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      var da = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      if (sd.getUTCFullYear()===ed.getUTCFullYear() && sd.getUTCMonth()===ed.getUTCMonth() && sd.getUTCDate()===ed.getUTCDate())
        return da[sd.getUTCDay()]+" "+mo[sd.getUTCMonth()]+" "+sd.getUTCDate()+", "+sd.getUTCFullYear();
      return da[sd.getUTCDay()]+" "+mo[sd.getUTCMonth()]+" "+sd.getUTCDate()+
             " \u2013 "+da[ed.getUTCDay()]+" "+mo[ed.getUTCMonth()]+" "+ed.getUTCDate()+", "+ed.getUTCFullYear();
    }

    function dmap() {
      var map = {}, now = new Date();
      courses.forEach(function(c) {
        var start = new Date(c.startDate), end = new Date(c.endDate);
        if (start <= now) return;
        var endDay = new Date(end);
        if (end.getUTCHours()===0 && end.getUTCMinutes()===0 && end.getUTCSeconds()===0) endDay.setUTCDate(endDay.getUTCDate()-1);
        var sk = start.getUTCFullYear()+"-"+start.getUTCMonth()+"-"+start.getUTCDate();
        if (!map[sk]) map[sk] = { course: c, type: "start" };
        var cur = new Date(start); cur.setUTCDate(cur.getUTCDate()+1);
        while (cur.getUTCFullYear()<endDay.getUTCFullYear() ||
          (cur.getUTCFullYear()===endDay.getUTCFullYear() && cur.getUTCMonth()<endDay.getUTCMonth()) ||
          (cur.getUTCFullYear()===endDay.getUTCFullYear() && cur.getUTCMonth()===endDay.getUTCMonth() && cur.getUTCDate()<=endDay.getUTCDate())) {
          var ck = cur.getUTCFullYear()+"-"+cur.getUTCMonth()+"-"+cur.getUTCDate();
          if (!map[ck]) map[ck] = { course: c, type: "cont" };
          cur.setUTCDate(cur.getUTCDate()+1);
        }
      });
      return map;
    }

    // Find the first upcoming course start date key
    function firstDateKey() {
      var now = new Date(), best = null, bestDate = null;
      courses.forEach(function(c) {
        var start = new Date(c.startDate);
        if (start <= now) return;
        if (!bestDate || start < bestDate) { bestDate = start; best = c; }
      });
      if (!best) return null;
      var s = new Date(best.startDate);
      return { key: s.getUTCFullYear()+"-"+s.getUTCMonth()+"-"+s.getUTCDate(), course: best };
    }

    // ── Styles ─────────────────────────────────────────────────────────────
    var root = document.getElementById(ROOT);
    if (!root) {
      if ((cfg._attempts || 0) < 20) {
        cfg._attempts = (cfg._attempts || 0) + 1;
        setTimeout(function() { initCalendar(cfg); }, 100);
      }
      return;
    }
    var style = document.createElement("style");
    style.textContent = [
      // Page buttons
      "#"+P+"btns{display:flex;flex-direction:"+btnLayout+";"+btnAlign+"gap:10px;margin-bottom:4px;}",
      "#"+P+"details-btn{background:"+detailsBg+";color:"+detailsClr+";font-family:Lato,sans-serif;font-size:13px;font-weight:700;padding:10px 22px;border:"+detailsBdr+";border-radius:8px;cursor:pointer;letter-spacing:1.5px;text-transform:uppercase;display:inline-flex;align-items:center;gap:8px;}",
      "#"+P+"details-btn:hover{background:"+detailsHvBg+";color:"+detailsHvCl+";}",
      "#"+P+"btn{background:"+pickBg+";color:"+pickClr+";font-family:Lato,sans-serif;font-size:13px;font-weight:700;padding:10px 22px;border:"+pickBdr+";border-radius:8px;cursor:pointer;letter-spacing:2px;text-transform:uppercase;display:inline-flex;align-items:center;gap:10px;}",
      "#"+P+"btn:hover{background:"+pickHvBg+";color:"+NAVY+";}",
      // Page calendar (hidden — no longer used as toggle)
      "#"+P+"wrap{display:none;position:relative;}",
      "#"+P+"wrap .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;position:relative;}",
      "#"+P+"wrap .day-hdr{text-align:center;font-size:13px;font-weight:600;color:#999;padding:4px 0;text-transform:uppercase;}",
      "#"+P+"wrap .cal-cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:16px;color:#444;cursor:default;}",
      "#"+P+"wrap .cal-cell.course{background:"+NAVY+";color:#fff;cursor:pointer;font-weight:700;}",
      "#"+P+"wrap .cal-cell.sel{background:"+RED+";color:#fff;}",
      // Page loading
      "#"+P+"loading{font-size:16px;color:#aaa;padding:8px 0;font-family:Lato,sans-serif;}",
      // Modal overlay
      "#"+P+"mo{display:none;position:fixed;z-index:2147483647;inset:0;background:rgba(0,0,0,0.55);align-items:center;justify-content:center;}",
      "#"+P+"mo.show{display:flex;}",
      // Modal shell — FIXED height so V1 and V2 are identical size
      "#"+P+"md{background:#fff;border-radius:10px;width:90%;max-width:440px;height:82vh;max-height:640px;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(40,40,110,0.25);font-family:Lato,sans-serif;overflow:hidden;}",
      // Shared header
      "#"+P+"mh{background:"+NAVY+";padding:12px 44px 12px 16px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;}",
      "#"+P+"mh-name{font-size:14px;font-weight:700;color:#fff;font-family:Lato,sans-serif;flex:1;line-height:1.3;}",
      "#"+P+"mh-price{font-size:18px;font-weight:700;color:rgba(255,255,255,0.9);font-family:'Prata',Georgia,serif;white-space:nowrap;line-height:1.2;}",
      "#"+P+"mh-x{position:absolute;top:8px;right:10px;width:28px;height:28px;border-radius:5px;border:none;cursor:pointer;font-size:16px;font-weight:700;line-height:28px;text-align:center;background:#888;color:"+NAVY+";padding:0;}",
      "#"+P+"mh-x:hover{background:"+RED+";color:#fff;}",
      // Shared button styles
      "."+P+"bc{background:#fff;border:2px solid "+NAVY+";color:"+NAVY+";font-family:Lato,sans-serif;font-size:13px;font-weight:700;padding:8px 14px;border-radius:4px;cursor:pointer;white-space:nowrap;}",
      "."+P+"bc:hover{background:"+RED+";border-color:"+RED+";color:#fff;}",
      "."+P+"br{background:"+RED+";color:#fff;font-family:Lato,sans-serif;font-size:13px;font-weight:600;padding:8px 16px;border-radius:4px;border:none;cursor:pointer;text-decoration:none;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;}",
      "."+P+"br:hover{background:"+NAVY+";}",
      // V1 — Details (scrollable body, pinned footer)
      "#"+P+"v1{display:none;flex-direction:column;flex:1;min-height:0;}",
      "#"+P+"v1-body{padding:16px 18px;overflow-y:auto;flex:1;min-height:0;font-size:14px;color:#333;line-height:1.6;}",
      "#"+P+"v1-scroll-hint{display:none;}",
      "#"+P+"v1-foot{padding:10px 16px;border-top:1px solid #e8ecf0;flex-shrink:0;display:flex;gap:8px;align-items:center;justify-content:space-between;}",
      "#"+P+"v1-more{background:#fff;border:2px solid #28286E;color:#28286E;font-family:Lato,sans-serif;font-size:13px;font-weight:700;padding:8px 14px;border-radius:4px;cursor:pointer;}",
      "#"+P+"v1-more:hover{background:#DC3C32;border-color:#DC3C32;color:#fff;}",
      "#"+P+"v1-foot{padding:10px 16px;border-top:1px solid #e8ecf0;flex-shrink:0;display:flex;gap:8px;align-items:center;justify-content:flex-end;}",
      // V2 — Calendar (no scroll, fixed layout)
      "#"+P+"v2{display:none;flex-direction:column;flex:1;min-height:0;}",
      "#"+P+"v2-body{padding:8px 14px 0;flex-shrink:0;}",
      "#"+P+"v2-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}",
      "#"+P+"v2-nav button{background:none;border:1.5px solid "+NAVY+";color:"+NAVY+";width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:13px;line-height:1;padding:0;}",
      "#"+P+"v2-nav button:hover{background:"+NAVY+";color:#fff;}",
      "#"+P+"v2-title{font-size:14px;font-weight:700;color:"+NAVY+";font-family:Lato,sans-serif;}",
      "#"+P+"v2-wrap{border:2px solid "+NAVY+";border-radius:8px;padding:6px;margin-bottom:0;}",
      "#"+P+"v2-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;}",
      // Info box — always present, shown/hidden — reserves space
      "#"+P+"v2-info{padding:10px 14px;flex:1;min-height:0;border-top:1px solid #e8ecf0;margin:0 0 0;}",
      "#"+P+"v2-info-date{font-size:14px;font-weight:700;color:"+NAVY+";margin-bottom:3px;font-family:Lato,sans-serif;}",
      "#"+P+"v2-info-spots{font-size:12px;color:#666;margin-bottom:10px;font-family:Lato,sans-serif;}",
      "#"+P+"v2-foot{padding:8px 14px;border-top:1px solid #e8ecf0;flex-shrink:0;display:flex;gap:8px;align-items:center;justify-content:space-between;}",
      // V3 — Form
      "#"+P+"v3{display:none;flex-direction:column;flex:1;min-height:0;}",
      "#"+P+"v3-iframe{border:none;flex:1;width:100%;min-height:0;}",
      "#"+P+"v3-foot{padding:8px 14px;border-top:1px solid #e8ecf0;flex-shrink:0;display:flex;}"
    ].join("");
    document.head.appendChild(style);

    // ── Root HTML ──────────────────────────────────────────────────────────
    root.innerHTML =
      '<div id="'+P+'btns">' +
        '<button id="'+P+'details-btn">'+infoIcon+' SEE DETAILS</button>' +
        '<button id="'+P+'btn">'+calIcon+' PICK A DATE</button>' +
      '</div>' +
      '<div id="'+P+'wrap">' +
        '<div class="cal-grid" id="'+P+'grid"></div>' +
      '</div>' +
      '<p id="'+P+'loading">Loading calendar\u2026</p>';

    // ── Modal HTML ─────────────────────────────────────────────────────────
    var mo = document.createElement("div");
    mo.id  = P+"mo";
    mo.innerHTML =
      '<div id="'+P+'md">' +

        // Shared header
        '<div id="'+P+'mh">' +
          '<span id="'+P+'mh-name"></span>' +
          '<span id="'+P+'mh-price"></span>' +
          '<button id="'+P+'mh-x">&times;</button>' +
        '</div>' +

        // V1 — Details
        '<div id="'+P+'v1">' +
          '<div id="'+P+'v1-body"></div>' +
          '<div id="'+P+'v1-scroll-hint"></div>' +
          '<div id="'+P+'v1-foot">' +
            '<button id="'+P+'v1-more" class="">See more \u2193</button>' +
            '<button id="'+P+'v1-pick" class="'+P+'br">'+calIcon+' Pick a Date</button>' +
          '</div>' +
        '</div>' +

        // V2 — Calendar
        '<div id="'+P+'v2">' +
          '<div id="'+P+'v2-body">' +
            '<p style="font-size:12px;color:#888;text-align:center;margin:0 0 6px;font-family:Lato,sans-serif;">Select a course date</p>' +
            '<div id="'+P+'v2-nav">' +
              '<button id="'+P+'v2-prev">&#8249;</button>' +
              '<span id="'+P+'v2-title"></span>' +
              '<button id="'+P+'v2-next">&#8250;</button>' +
            '</div>' +
            '<div id="'+P+'v2-wrap"><div id="'+P+'v2-grid"></div></div>' +
          '</div>' +
          // Info box — always visible, populated on date select (or auto-select)
          '<div id="'+P+'v2-info">' +
            '<div id="'+P+'v2-info-date"></div>' +
            '<div id="'+P+'v2-info-spots"></div>' +
            '<a id="'+P+'v2-reg" class="'+P+'br" href="#" target="_blank" style="width:100%;box-sizing:border-box;justify-content:center;display:none;">Register \u2192</a>' +
          '</div>' +
          '<div id="'+P+'v2-foot">' +
            '<button id="'+P+'v2-back" class="'+P+'bc">\u2190 Details</button>' +
            '<button id="'+P+'v2-req" class="'+P+'bc">Request a date that works for you</button>' +
          '</div>' +
        '</div>' +

        // V3 — Form
        '<div id="'+P+'v3">' +
          '<iframe id="'+P+'v3-iframe" src="" title="Request a Date"></iframe>' +
          '<div id="'+P+'v3-foot">' +
            '<button id="'+P+'v3-back" class="'+P+'bc">\u2190 Pick a Date</button>' +
          '</div>' +
        '</div>' +

      '</div>';
    document.body.appendChild(mo);

    // ── View switcher ─────────────────────────────────────────────────────
    function showView(v) {
      ["v1","v2","v3"].forEach(function(id) {
        var el = document.getElementById(P+id);
        if (el) el.style.display = "none";
      });
      var t = document.getElementById(P+v);
      if (t) { t.style.display = "flex"; t.style.flexDirection = "column"; }
    }

    function openMo()  { document.getElementById(P+"mo").classList.add("show"); document.body.style.overflow = "hidden"; }
    function closeMo() { document.getElementById(P+"mo").classList.remove("show"); document.body.style.overflow = ""; modalSelected = null; }

    function setHeader(c) {
      var name = c.name.replace(/\\s*\\(.*$/, "").trim();
      document.getElementById(P+"mh-name").textContent  = name;
      document.getElementById(P+"mh-price").textContent = formatPrice(c.priceFrom, c.priceTo);
    }

    // Scroll hint — hide once user scrolls
    function initScrollHint(bodyEl) {
      var btn = document.getElementById(P+"v1-more");
      if (!btn) return;
      btn.style.display = "inline-block";
      btn.addEventListener("click", function() {
        bodyEl.scrollBy({ top: 200, behavior: "smooth" });
      });
      bodyEl.addEventListener("scroll", function() {
        var atBottom = bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 10;
        btn.style.display = atBottom ? "none" : "inline-block";
      });
    }

    // ── V1 open ───────────────────────────────────────────────────────────
    function openDetails(c) {
      currentCourse = c;
      setHeader(c);
      var photoHtml = c.photoUrl
        ? '<img src="'+c.photoUrl+'" alt="'+c.name+'" style="width:100%;max-height:200px;object-fit:cover;border-radius:4px;margin-bottom:14px;display:block;">'
        : '';
      var summaryHtml = c.summary
        ? '<p style="font-size:15px;font-weight:400;font-style:italic;color:#666;margin:0 0 14px;line-height:1.6;font-family:Lato,sans-serif;">'+c.summary+'</p>'
        : '';
      var rawDesc = c.descriptionHtml || "";
      var h3end = rawDesc.indexOf("</h3>"); if (h3end !== -1) rawDesc = rawDesc.slice(h3end + 5);
      var pend  = rawDesc.indexOf("</p>");  if (pend  !== -1) rawDesc = rawDesc.slice(pend  + 4);
      var desc = rawDesc ? stripInlineStyles(rawDesc) : "";
      var bodyEl = document.getElementById(P+"v1-body");
      bodyEl.innerHTML = photoHtml + summaryHtml + desc;
      bodyEl.scrollTop = 0;
      showView("v1");
      initScrollHint(bodyEl);
      openMo();
    }

    // ── V2 open — auto-selects first available date ───────────────────────
    function openCal(c) {
      currentCourse = c;
      setHeader(c);
      // Navigate to month of first available date
      var first = firstDateKey();
      if (first) {
        var fd = new Date(first.course.startDate);
        modalCalMonth = fd.getUTCMonth();
        modalCalYear  = fd.getUTCFullYear();
        modalSelected = courseKey(first.course);
        selectedCourse = first.course;
      } else {
        modalCalMonth = today.getMonth();
        modalCalYear  = today.getFullYear();
        modalSelected = null;
        selectedCourse = null;
      }
      showView("v2");
      renderV2();
      // Populate info box with first date
      if (first) populateInfo(first.course);
      openMo();
    }

    function populateInfo(c) {
      var s = spots(c.maxSpots, c.registrationsCount);
      document.getElementById(P+"v2-info-date").textContent  = fmtRange(c.startDate, c.endDate);
      document.getElementById(P+"v2-info-spots").textContent = s;
      var reg = document.getElementById(P+"v2-reg");
      reg.href        = c.formUrl || c.pageUrl;
      reg.textContent = (s === "Full" ? "Join waitlist" : "Register") + " \u2192";
      reg.style.display = "inline-flex";
    }

    // ── V2 calendar render ────────────────────────────────────────────────
    function renderV2() {
      document.getElementById(P+"v2-title").textContent = months[modalCalMonth] + " " + modalCalYear;
      var map  = dmap();
      var html = days.map(function(d) {
        return '<div style="text-align:center;font-size:11px;font-weight:600;color:#999;padding:2px 0;text-transform:uppercase;font-family:Lato,sans-serif;">'+d+'</div>';
      }).join("");
      var fd  = new Date(modalCalYear, modalCalMonth, 1).getDay();
      var dim = new Date(modalCalYear, modalCalMonth+1, 0).getDate();
      for (var i = 0; i < fd; i++) html += '<div></div>';
      for (var d = 1; d <= dim; d++) {
        var k       = modalCalYear+"-"+modalCalMonth+"-"+d;
        var entry   = map[k];
        var isToday = d===today.getDate() && modalCalMonth===today.getMonth() && modalCalYear===today.getFullYear();
        // A cell is "selected" if its course matches the selected course key,
        // so EVERY day of a multi-day course highlights together.
        var isSel   = selectedCourse && courseCoversDay(selectedCourse, modalCalYear, modalCalMonth, d);
        var bg    = isSel ? RED : (entry&&entry.type==="start" ? NAVY : (entry&&entry.type==="cont" ? SKY : "transparent"));
        var color = isSel ? "#fff" : (entry&&entry.type==="start" ? "#fff" : (entry&&entry.type==="cont" ? NAVY : (isToday ? NAVY : "#444")));
        var fw    = (entry||isToday) ? "700" : "400";
        html += '<div'+(entry?' data-mk="'+k+'"':'')+' style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:13px;background:'+bg+';color:'+color+';font-weight:'+fw+';cursor:'+(entry?"pointer":"default")+';font-family:Lato,sans-serif;">'+d+'</div>';
      }
      var grid = document.getElementById(P+"v2-grid");
      grid.innerHTML = html;
      grid.querySelectorAll("[data-mk]").forEach(function(cell) {
        var k = cell.getAttribute("data-mk"), entry = map[k];
        if (!entry) return;
        cell.addEventListener("click", function() {
          // Select the whole COURSE, not just the clicked day.
          modalSelected = courseKey(entry.course);
          selectedCourse = entry.course;
          populateInfo(entry.course);
          renderV2();
        });
      });
    }

    // ── Modal event listeners ─────────────────────────────────────────────
    document.getElementById(P+"mh-x").addEventListener("click", closeMo);
    document.getElementById(P+"mo").addEventListener("click", function(e) { if (e.target===this) closeMo(); });

    document.getElementById(P+"v1-pick").addEventListener("click", function() { openCal(currentCourse); });

    document.getElementById(P+"v2-back").addEventListener("click", function() { showView("v1"); });
    document.getElementById(P+"v2-prev").addEventListener("click", function() {
      modalCalMonth--; if (modalCalMonth<0) { modalCalMonth=11; modalCalYear--; }
      modalSelected = null;
      selectedCourse = null;
      document.getElementById(P+"v2-info-date").textContent = "";
      document.getElementById(P+"v2-info-spots").textContent = "";
      document.getElementById(P+"v2-reg").style.display = "none";
      renderV2();
    });
    document.getElementById(P+"v2-next").addEventListener("click", function() {
      modalCalMonth++; if (modalCalMonth>11) { modalCalMonth=0; modalCalYear++; }
      modalSelected = null;
      selectedCourse = null;
      document.getElementById(P+"v2-info-date").textContent = "";
      document.getElementById(P+"v2-info-spots").textContent = "";
      document.getElementById(P+"v2-reg").style.display = "none";
      renderV2();
    });
    document.getElementById(P+"v2-req").addEventListener("click", function() {
      var iframe = document.getElementById(P+"v3-iframe");
      iframe.src = FORM_PAGE_URL + (currentCourse ? "?course="+encodeURIComponent(currentCourse.name) : "");
      showView("v3");
    });
    document.getElementById(P+"v3-back").addEventListener("click", function() { showView("v2"); });

    // ── Page buttons ──────────────────────────────────────────────────────
    document.getElementById(P+"details-btn").addEventListener("click", function() {
      var c = courses[0];
      if (!c) { alert("Course details are still loading — please try again in a moment."); return; }
      openDetails(c);
    });
    document.getElementById(P+"btn").addEventListener("click", function() {
      var c = courses[0];
      if (!c) { alert("Course dates are still loading — please try again in a moment."); return; }
      openCal(c);
    });

    // ── Fetch ─────────────────────────────────────────────────────────────
    fetch(PROXY)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var now = new Date();
        courses = (data.list || []).filter(function(e) {
          // 1) name match (course-type filter for this calendar)
          if (!isMatch(e.name)) return false;
          // 2) registration-close filter (public calendars only):
          //    hide sold-out courses and any whose registration has closed.
          var soldOut = (e.stats && e.stats.soldout) || e.soldout;
          if (soldOut) return false;
          if (e.registrationCloseDate) {
            var close = new Date(e.registrationCloseDate);
            if (!isNaN(close.getTime()) && close <= now) return false;
          }
          return true;
        });
        document.getElementById(P+"loading").style.display = "none";
      })
      .catch(function() {
        var el = document.getElementById(P+"loading");
        el.textContent = "Could not load calendar.";
        el.style.color = "#DC3C32";
      });

  } // end initCalendar

  function startEngine(attempts) {
    attempts = attempts || 0;
    if (window.WASCalQueue && window.WASCalQueue.length > 0) { processQueue(); }
    else if (attempts < 20) { setTimeout(function() { startEngine(attempts+1); }, 50); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { startEngine(); });
  } else { startEngine(); }

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


