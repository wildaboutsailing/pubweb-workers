/**
 * Wild About Sailing — Internal Course Calendar + Resource Heatmap
 * ---------------------------------------------------------------
 * Two views on your upcoming Corsizio courses:
 *   - Calendar : Gantt-style spanning bars, fill levels, durations.
 *   - Heatmap  : each day shaded by how close demand is to your capacity,
 *                toggled between Instructors and Boats, click a day for the
 *                breakdown (incl. any course with no instructor assigned).
 *
 * DEPLOY: paste over your existing Worker code and Save & Deploy. The
 * CORSIZIO_API_KEY secret, the dashcal domain, and the Access login are unchanged.
 * (Use ?nocache=1 to see changes immediately.)
 *
 * ?debug=1 -> raw first Corsizio event   |   ?nocache=1 -> bypass edge cache
 *
 * FIXES (June 2026):
 *   - getRegistered now uses confirmed field: stats.attendees
 *   - getInstructors uses confirmed shape: instructors[].name
 *   - Registration close filter: excludes soldout and past-registrationCloseDate courses
 */

/* =======================================================================
 * RESOURCE CONFIG  —  EDIT THESE TO YOUR REAL NUMBERS
 * The calendar's demand (what's running, enrolment, assigned instructors)
 * comes from Corsizio. Your *supply* and boats-per-course rules live here.
 * ======================================================================= */
const RESOURCES = {
  // Total instructors on the roster. null = auto (count distinct instructors
  // seen in Corsizio). Replace null with your real number, e.g. 6.
  instructorsAvailable: null,

  // Fleet size — TODO: set to the number of boats you actually have.
  boatsAvailable: 6,

  // Boats each *running course* consumes, by course type. _default covers
  // any type not listed. (Keys match the course types below.)
  boatsPerCourse: { discover: 1, learn: 2, womens: 2, pride: 2, skipper: 1, coaching: 1, other: 1, _default: 1 },

  // Alternative model: scale boats by enrolment instead of per-course.
  // Set to a number (e.g. 3 = one boat per 3 registrants) to use that
  // instead of boatsPerCourse. Leave null to use boatsPerCourse above.
  studentsPerBoat: null,

  // Instructors each running course needs. _default is 1; add type
  // overrides if some need two, e.g. { _default: 1, learn: 2 }.
  instructorsPerCourse: { _default: 1 },
};
/* ===================================================================== */

const CORSIZIO_BASE = 'https://api.corsizio.com/v1';
const CACHE_SECONDS = 300;
const MAX_PAGES = 5;

const NAVY = '#28286E', NAVY_DARK = '#1a1a3e', RED = '#DC3C32', CHARCOAL = '#3D3D3D';

const COURSE_TYPES = [
  { key: 'womens',   label: "Women's Learn to Sail",    color: '#C44E9D', test: function (n) { return /women/i.test(n); } },
  { key: 'pride',    label: '2SLGBTQIA+ Learn to Sail', color: '#E76F51', test: function (n) { return /2slgbt|lgbtq|pride/i.test(n); } },
  { key: 'skipper',  label: 'Learn to Skipper',         color: '#6A4C93', test: function (n) { return /skipper/i.test(n); } },
  { key: 'discover', label: 'Discover Sailing',         color: '#1E88A8', test: function (n) { return /discover/i.test(n); } },
  { key: 'learn',    label: 'Learn to Sail',            color: NAVY,      test: function (n) { return /learn\s*to\s*sail/i.test(n); } },
  { key: 'coaching', label: 'Custom Coaching',          color: '#3D8B5C', test: function (n) { return /coach/i.test(n); } },
];
function classify(name) {
  const t = COURSE_TYPES.find(function (c) { return c.test(name || ''); });
  return t ? { key: t.key, label: t.label, color: t.color } : { key: 'other', label: 'Other', color: '#6B7280' };
}

// CONFIRMED field: stats.attendees (verified via ?debug=1, June 2026)
function getRegistered(ev) {
  return (ev.stats && ev.stats.attendees != null) ? ev.stats.attendees : 0;
}
function getMaxSpots(ev) { return (typeof ev.maxSpots === 'number') ? ev.maxSpots : null; }

// CONFIRMED shape: instructors[] array of objects with .name string (verified via ?debug=1, June 2026)
function getInstructors(ev) {
  if (!Array.isArray(ev.instructors)) return [];
  return ev.instructors.map(function (i) {
    if (!i || typeof i === 'string') return null;
    return i.name || [i.firstName, i.lastName].filter(Boolean).join(' ') || null;
  }).filter(Boolean);
}

function fillInfo(reg, max) {
  if (max == null || max === 0) return { pct: null, status: 'nocap' };
  if (reg == null) return { pct: null, status: 'unknown' };
  const pct = Math.round((reg / max) * 100);
  let status = 'low';
  if (reg >= max) status = 'full';
  else if (pct >= 80) status = 'high';
  else if (pct >= 40) status = 'medium';
  return { pct: pct, status: status };
}

function localDateKey(iso, tz) {
  if (!iso) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
    const get = function (t) { const p = parts.find(function (x) { return x.type === t; }); return p ? p.value : ''; };
    return get('year') + '-' + get('month') + '-' + get('day');
  } catch (e) { return iso.slice(0, 10); }
}

function dayDiffInclusive(k1, k2) {
  if (!k1 || !k2) return 1;
  const a = new Date(k1 + 'T00:00:00'), b = new Date(k2 + 'T00:00:00');
  const d = Math.round((b - a) / 86400000) + 1;
  return d >= 1 ? d : 1;
}

async function fetchEvents(env) {
  const key = env.CORSIZIO_API_KEY;
  if (!key) throw new Error('The CORSIZIO_API_KEY secret is not set on this Worker.');
  const today = new Date().toISOString().slice(0, 10);
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = CORSIZIO_BASE + '/events'
      + '?status=published&order=startDate'
      + '&date=' + today + ':'
      + '&limit=100&page=' + page
      + '&include=details,stats&expand=instructors';
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) {
      const body = await r.text();
      throw new Error('Corsizio API returned ' + r.status + ': ' + body.slice(0, 300));
    }
    const data = await r.json();
    const list = data.list || [];
    for (let i = 0; i < list.length; i++) all.push(list[i]);
    if (!data.paging || !data.paging.more) break;
  }
  return all;
}

function normalize(ev) {
  const reg = getRegistered(ev);
  const max = getMaxSpots(ev);
  const fill = fillInfo(reg, max);
  const ct = classify(ev.name);
  const dk = localDateKey(ev.startDate, ev.timeZone);
  const ekRaw = localDateKey(ev.endDate || ev.startDate, ev.timeZone);
  const ek = ekRaw < dk ? dk : ekRaw;
  return {
    id: ev.id,
    name: ev.name || 'Untitled course',
    type: ct.key, typeLabel: ct.label, typeColor: ct.color,
    displayDate: ev.displayDate || '',
    dateKey: dk,
    endKey: ek,
    durationDays: dayDiffInclusive(dk, ek),
    location: ev.location || '',
    instructors: getInstructors(ev),
    pageUrl: ev.pageUrl || '',
    formUrl: ev.formUrl || '',
    registered: reg,
    maxSpots: max,
    fillPct: fill.pct,
    fillStatus: fill.status,
  };
}

/* ---------------------------- page ---------------------------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function buildHtml(events, date) {
  const data = JSON.stringify(events).replace(/</g, '\\u003c');
  const cfg = JSON.stringify(RESOURCES).replace(/</g, '\\u003c');
  const gen = JSON.stringify(date.toISOString());
  const head = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>WAS Course Calendar</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--navy:${NAVY};--navy-d:${NAVY_DARK};--red:${RED};--charcoal:${CHARCOAL};
--low:#2E9E5B;--med:#E0A100;--high:#E8730C;--full:${RED};--grey:#9AA0A6;
--line:#e6e7ee;--ink:#2b2b33;--mut:#71727f;--muted-cell:#fafbfd;}
*{box-sizing:border-box}html,body{margin:0}
body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#f6f7fb}
a{color:inherit}
.top{background:var(--navy);color:#fff;padding:16px 22px;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.brand{font-size:19px}.brand .w{font-weight:600}.brand .a{font-weight:400;opacity:.65}.brand .s{font-weight:600;color:var(--red)}
.top .tag{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;opacity:.6}
.top .meta{margin-left:auto;font-size:12px;opacity:.7}
.toolbar{background:#fff;border-bottom:1px solid var(--line);padding:12px 22px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.nav{display:flex;align-items:center;gap:8px}
.nav button{font:inherit;font-weight:600;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;color:var(--ink)}
.nav .arrow{width:34px;height:34px;font-size:18px;line-height:1}
.nav .today{height:34px;padding:0 12px;font-size:13px}
.nav button:hover{border-color:var(--navy);color:var(--navy)}
.nav button:focus-visible{outline:2px solid var(--navy);outline-offset:1px}
.mlabel{font-size:17px;font-weight:700;color:var(--navy);min-width:150px;text-align:center}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
.seg[hidden]{display:none}
.seg button{font:inherit;font-size:13px;font-weight:600;border:0;background:#fff;color:var(--mut);padding:8px 13px;cursor:pointer}
.seg button + button{border-left:1px solid var(--line)}
.seg button.on{background:var(--navy);color:#fff}
.filters{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.filters select,.filters input{font:inherit;font-size:13px;font-weight:500;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px 9px;background:#fff}
.filters input{min-width:150px}
.filters select:focus-visible,.filters input:focus-visible{outline:2px solid var(--navy);outline-offset:1px}
.legend{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:10px 22px 0;font-size:12px;color:var(--mut)}
.legend b{color:var(--ink);font-weight:700;margin-right:2px}
.legend .grp{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.legend .sep{width:1px;height:14px;background:var(--line)}
.legend span.it{display:inline-flex;align-items:center;gap:6px}
.legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.wrap{padding:12px 22px 40px}
.dow{display:grid;grid-template-columns:repeat(7,1fr);gap:0;margin-bottom:6px}
.dow.heatgap{gap:6px}
.dow div{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);text-align:center}
.cal{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.cal.heat{display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:minmax(66px,1fr);gap:6px;border:none;border-radius:0;background:transparent;overflow:visible}
.week{position:relative;height:120px;border-top:1px solid var(--line)}
.week:first-child{border-top:none}
.wdays{position:absolute;inset:0;display:grid;grid-template-columns:repeat(7,1fr)}
.wcell{border-left:1px solid var(--line)}
.wcell:first-child{border-left:none}
.wcell.muted{background:var(--muted-cell)}
.wcell.today{background:rgba(40,40,110,.06)}
.wdnum{display:block;font-size:12px;font-weight:600;color:var(--mut);padding:4px 6px}
.wcell.today .wdnum{color:var(--navy)}
.wcell.muted .wdnum{color:#c2c6d2}
.bars{position:absolute;left:0;right:0;top:24px;bottom:4px;overflow-x:hidden;overflow-y:auto}
.bar{position:absolute;height:20px;display:flex;align-items:center;gap:5px;padding:0 6px;font-size:11.5px;line-height:1;border-radius:6px;cursor:pointer;overflow:hidden;color:var(--ink)}
.bar:hover{filter:brightness(.96)}
.bar.noL{border-top-left-radius:0;border-bottom-left-radius:0}
.bar.noR{border-top-right-radius:0;border-bottom-right-radius:0}
.bar .dur{flex:none;font-size:9.5px;font-weight:700;color:#fff;border-radius:4px;padding:1px 4px}
.bar .nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.bar .rt{flex:none;font-weight:700;font-size:10.5px}
.hcell{border:1px solid var(--line);border-radius:9px;padding:6px 8px;position:relative;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;min-height:0;overflow:hidden}
.hcell.muted{opacity:.55}
.hcell.today{box-shadow:inset 0 0 0 2px var(--navy)}
.hcell .hdnum{font-size:12px;font-weight:600;color:var(--mut)}
.hcell .hval{font-size:17px;font-weight:700;align-self:flex-end;line-height:1}
.hcell .hwarn{position:absolute;top:5px;right:7px;font-size:12px;color:#b3261e}
.anim{animation:slin .22s ease}
@keyframes slin{from{opacity:0;transform:translateX(var(--dir,16px))}to{opacity:1;transform:none}}
.chip{display:flex;align-items:center;gap:5px;border-left:3px solid var(--grey);background:#f4f6fb;border-radius:5px;padding:6px 8px;cursor:pointer;font-size:13px;line-height:1.2;margin-bottom:5px}
.chip.cont{opacity:.6}
.chip .dur{flex:none;font-size:9.5px;font-weight:700;color:#fff;border-radius:4px;padding:1px 4px}
.chip .nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.chip .rt{flex:none;font-weight:700;font-size:11px}
.agenda{display:none}
.aday{margin-bottom:14px}
.aday h3{margin:0 0 6px;font-size:13px;color:var(--navy)}
.empty{padding:50px 22px;text-align:center;color:var(--mut)}
.empty h2{color:var(--ink);font-weight:600;margin:0 0 6px}
.modal{position:fixed;inset:0;background:rgba(26,26,62,.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50}
.modal[hidden]{display:none}
.mcard{background:#fff;border-radius:14px;max-width:460px;width:100%;padding:22px;box-shadow:0 18px 50px rgba(0,0,0,.25);max-height:86vh;overflow-y:auto}
.mcard .ctype{display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin-bottom:8px}
.mcard .dot{width:9px;height:9px;border-radius:50%;flex:none}
.mcard h2{margin:0 0 12px;font-size:19px;color:var(--navy);line-height:1.25}
.mrow{font-size:14px;color:var(--ink);margin:5px 0}
.mrow .lab{color:var(--mut);font-weight:600;margin-right:6px}
.meter{margin:14px 0}
.meter .nums{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px}
.meter .nums b{color:var(--ink)}
.track{height:8px;border-radius:99px;background:#eef0f5;overflow:hidden}
.track>i{display:block;height:100%;border-radius:99px}
.mlinks{display:flex;gap:14px;margin-top:14px;font-size:14px;font-weight:600}
.mlinks a{color:var(--navy);text-decoration:none;border-bottom:1px solid transparent}
.mlinks a:hover{border-color:var(--navy)}
.mclose{margin-top:16px;width:100%;font:inherit;font-weight:600;background:var(--navy);color:#fff;border:0;border-radius:9px;padding:10px;cursor:pointer}
.dayrow{display:flex;align-items:center;gap:9px;font-size:13px;padding:7px 0;border-top:1px solid var(--line)}
.dayrow:first-of-type{border-top:none}
.dayrow .dn{font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dayrow .di{color:var(--mut);font-size:12px;white-space:nowrap}
.dayrow .di.warn{color:#b3261e;font-weight:700}
.dayrow .db{color:var(--mut);font-size:12px;white-space:nowrap}
.dtot{display:flex;gap:26px;margin-top:14px;padding-top:12px;border-top:2px solid var(--line);font-size:14px}
.dtot .lab{color:var(--mut);font-weight:600;display:block;font-size:12px;margin-bottom:2px}
.dtot b{font-size:17px}
@media (prefers-reduced-motion:reduce){.anim{animation:none}}
@media (max-width:760px){
  .top,.toolbar,.wrap,.legend{padding-left:14px;padding-right:14px}
  .filters{margin-left:0;width:100%}
  .filters input,.filters select{flex:1;min-width:0}
  body:not(.heatmode) .dow, body:not(.heatmode) .cal{display:none}
  body:not(.heatmode) .agenda{display:block}
  body.heatmode .agenda{display:none}
  body.heatmode .dow{display:grid}
  body.heatmode .cal{display:grid}
}
@media (min-width:761px){
  html,body{height:100%}
  body{display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden}
  .wrap{flex:1;min-height:0;display:flex;flex-direction:column;padding-bottom:14px}
  .dow{flex:none}
  .cal{flex:1;min-height:0}
  .cal.heat{grid-template-rows:repeat(6,1fr);grid-auto-rows:0}
  .week{flex:1;min-height:0;height:auto}
}
</style></head><body>
<header class="top">
<span class="brand"><span class="w">Wild</span> <span class="a">About</span> <span class="s">Sailing</span></span>
<span class="tag">Course Calendar</span>
<span class="meta" id="meta"></span>
</header>
<div class="toolbar">
  <div class="nav">
    <button class="arrow" id="prev" aria-label="Previous month">&#8249;</button>
    <span class="mlabel" id="mlabel"></span>
    <button class="arrow" id="next" aria-label="Next month">&#8250;</button>
    <button class="today" id="today">Today</button>
  </div>
  <div class="seg" id="viewseg">
    <button data-v="cal" class="on">Calendar</button>
    <button data-v="heat">Heatmap</button>
  </div>
  <div class="seg" id="resseg" hidden>
    <button data-r="inst" class="on">Instructors</button>
    <button data-r="boat">Boats</button>
  </div>
  <div class="filters">
    <input id="q" type="search" placeholder="Search course...">
    <select id="ct"></select>
    <select id="ins"></select>
    <select id="fl">
      <option value="all">All fill levels</option>
      <option value="space">Has space</option>
      <option value="near">Nearly full</option>
      <option value="full">Full</option>
      <option value="nocap">No cap set</option>
    </select>
  </div>
</div>
<div class="legend" id="legend"></div>
<div class="wrap">
  <div class="dow"><div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div></div>
  <div class="cal" id="cal"></div>
  <div class="agenda" id="agenda"></div>
</div>
<div class="modal" id="modal" hidden></div>
`;
  const script = '<script>var __name=function(f,n){return f};var EVENTS=' + data + ';var CONFIG=' + cfg + ';var GENERATED=' + gen + ';(' + clientMain.toString() + ')();<\/script>';
  return head + script + '</body></html>';
}

function buildErrorHtml(message) {
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
+ '<title>WAS Course Calendar</title>'
+ '<body style="font-family:Inter,system-ui,sans-serif;background:#f6f7fb;color:#2b2b33;margin:0;padding:48px 22px;">'
+ '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e7ee;border-radius:12px;padding:26px;">'
+ '<h1 style="margin:0 0 10px;font-size:18px;color:' + NAVY + '">Couldn\'t load courses</h1>'
+ '<p style="color:#71727f;line-height:1.5;margin:0 0 14px">Reached Corsizio but the request didn\'t succeed. Details:</p>'
+ '<pre style="background:#f6f7fb;border:1px solid #e6e7ee;border-radius:8px;padding:12px;font-size:13px;white-space:pre-wrap;color:#b3261e">' + esc(message) + '</pre>'
+ '<p style="color:#71727f;line-height:1.5;margin:14px 0 0">Check the <b>CORSIZIO_API_KEY</b> secret and that the key can read events and attendees/stats.</p>'
+ '</div></body>';
}

/* Front-end. Injected via toString(); template literals are fine here. */
function clientMain() {
  var FILL = { low: '#2E9E5B', medium: '#E0A100', high: '#E8730C', full: '#DC3C32', nocap: '#9AA0A6', unknown: '#9AA0A6' };
  var LOAD = {
    none:  { bg: '#f3f4f8', fg: '#9aa0a6', lab: 'No courses' },
    ample: { bg: '#d7efde', fg: '#1f7a44', lab: 'Ample' },
    ok:    { bg: '#e9f2cf', fg: '#5d6e1f', lab: 'Comfortable' },
    tight: { bg: '#fbe3c4', fg: '#9a5712', lab: 'Tight' },
    short: { bg: '#f6cdc8', fg: '#b3261e', lab: 'Short' },
  };
  function durBucket(d) { return d >= 4 ? 4 : (d || 1); }
  function durColor(d) { var b = durBucket(d); return b <= 1 ? '#1E88A8' : b === 2 ? '#3F6FD1' : b === 3 ? '#7A5BC0' : '#B23A8E'; }
  function durLabel(b) { return b >= 4 ? '4+ day' : b + '-day'; }
  function loadBucket(r) { if (r <= 0) return 'none'; if (r < 0.5) return 'ample'; if (r < 0.8) return 'ok'; if (r < 1.0) return 'tight'; return 'short'; }
  function hexToRgba(h, a) { h = h.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
  function diffDays(k1, k2) { return Math.round((new Date(k2 + 'T00:00:00') - new Date(k1 + 'T00:00:00')) / 86400000); }

  var byId = {};
  EVENTS.forEach(function (e) { byId[e.id] = e; });

  var now = new Date();
  var vy = now.getFullYear(), vm = now.getMonth();
  var lastDir = 16, LANE_H = 22;
  var viewMode = 'cal', resource = 'inst';

  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var todayKey = ymd(now);

  $('#meta').textContent = 'Updated ' + new Date(GENERATED).toLocaleString('en-CA', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) + ' \u00b7 refreshes every 5 min';

  function opt(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; return o; }
  var ctSel = $('#ct'); ctSel.appendChild(opt('all', 'All courses'));
  var seen = {};
  EVENTS.forEach(function (e) { if (!seen[e.type]) { seen[e.type] = 1; ctSel.appendChild(opt(e.type, e.typeLabel)); } });
  var ins = $('#ins'); ins.appendChild(opt('all', 'All instructors'));
  var inames = [];
  EVENTS.forEach(function (e) { e.instructors.forEach(function (n) { if (n && inames.indexOf(n) < 0) inames.push(n); }); });
  inames.sort().forEach(function (n) { ins.appendChild(opt(n, n)); });

  // ---- resource capacity ----
  var INST_AVAIL = (CONFIG.instructorsAvailable != null) ? CONFIG.instructorsAvailable : inames.length;
  var BOAT_AVAIL = (CONFIG.boatsAvailable != null) ? CONFIG.boatsAvailable : 0;
  function instPer(e) { var m = CONFIG.instructorsPerCourse || {}; return (m[e.type] != null ? m[e.type] : (m._default != null ? m._default : 1)); }
  function boatPer(e) {
    if (CONFIG.studentsPerBoat) { var reg = e.registered != null ? e.registered : (e.maxSpots || 0); return Math.max(1, Math.ceil(reg / CONFIG.studentsPerBoat)); }
    var m = CONFIG.boatsPerCourse || {}; return (m[e.type] != null ? m[e.type] : (m._default != null ? m._default : 1));
  }

  function passes(e) {
    var q = $('#q').value.trim().toLowerCase();
    if ($('#ct').value !== 'all' && e.type !== $('#ct').value) return false;
    if ($('#ins').value !== 'all' && e.instructors.indexOf($('#ins').value) < 0) return false;
    if (q && e.name.toLowerCase().indexOf(q) < 0) return false;
    var f = $('#fl').value;
    if (f === 'space' && !(e.maxSpots != null && e.registered != null && e.registered < e.maxSpots)) return false;
    if (f === 'near' && e.fillStatus !== 'high') return false;
    if (f === 'full' && e.fillStatus !== 'full') return false;
    if (f === 'nocap' && e.fillStatus !== 'nocap') return false;
    return true;
  }
  function ratioText(e) {
    if (e.maxSpots == null) return (e.registered == null ? '' : e.registered + '');
    return (e.registered == null ? '?' : e.registered) + '/' + e.maxSpots;
  }
  function coursesOnDay(key) { var a = []; EVENTS.forEach(function (e) { if (key >= e.dateKey && key <= e.endKey && passes(e)) a.push(e); }); return a; }
  function dayLoad(key) {
    var cs = coursesOnDay(key), inst = 0, boat = 0, uns = 0;
    cs.forEach(function (e) { inst += instPer(e); boat += boatPer(e); if (!e.instructors.length) uns++; });
    return { courses: cs, inst: inst, boat: boat, unstaffed: uns };
  }

  // ---- legend (depends on view) ----
  function updateLegend() {
    if (viewMode === 'cal') {
      var typeHtml = '';
      Object.keys(seen).forEach(function (k) { var e = EVENTS.find(function (x) { return x.type === k; }); typeHtml += '<span class="it"><i style="background:' + e.typeColor + '"></i>' + esc(e.typeLabel) + '</span>'; });
      var dbk = {}; EVENTS.forEach(function (e) { dbk[durBucket(e.durationDays)] = 1; });
      var durHtml = '';
      Object.keys(dbk).map(Number).sort(function (a, b) { return a - b; }).forEach(function (b) { durHtml += '<span class="it"><i style="background:' + durColor(b) + '"></i>' + durLabel(b) + '</span>'; });
      $('#legend').innerHTML = '<span class="grp"><b>Course:</b>' + typeHtml + '</span><span class="sep"></span><span class="grp"><b>Duration:</b>' + durHtml + '</span>';
    } else {
      var order = ['ample', 'ok', 'tight', 'short'], s = '<span class="grp"><b>Load:</b>';
      order.forEach(function (k) { s += '<span class="it"><i style="background:' + LOAD[k].bg + ';box-shadow:inset 0 0 0 1px ' + LOAD[k].fg + '55"></i>' + LOAD[k].lab + '</span>'; });
      s += '</span><span class="sep"></span>';
      if (resource === 'inst') s += '<span class="grp"><b>Instructors:</b> ' + INST_AVAIL + ' available <span class="it" style="margin-left:8px">\u26a0 = course with no instructor</span></span>';
      else s += '<span class="grp"><b>Boats:</b> ' + BOAT_AVAIL + ' in fleet</span>';
      $('#legend').innerHTML = s;
    }
  }

  /* =================== CALENDAR (Gantt bars) =================== */
  function renderCalendar() {
    var cal = $('#cal'); cal.className = 'cal';
    var first = new Date(vy, vm, 1), startDow = first.getDay(), html = '';
    for (var w = 0; w < 6; w++) {
      var days = [];
      for (var i = 0; i < 7; i++) { var d = new Date(vy, vm, 1 - startDow + w * 7 + i); days.push({ d: d, key: ymd(d), muted: d.getMonth() !== vm, today: ymd(d) === todayKey }); }
      var wkStart = days[0].key, wkEnd = days[6].key, segs = [];
      EVENTS.forEach(function (e) {
        if (!passes(e)) return;
        if (e.dateKey > wkEnd || e.endKey < wkStart) return;
        var c1 = e.dateKey < wkStart ? 0 : diffDays(wkStart, e.dateKey);
        var c2 = e.endKey > wkEnd ? 6 : diffDays(wkStart, e.endKey);
        if (c1 < 0) c1 = 0; if (c2 > 6) c2 = 6; if (c2 < c1) c2 = c1;
        segs.push({ e: e, c1: c1, c2: c2, roundL: e.dateKey >= wkStart, roundR: e.endKey <= wkEnd });
      });
      segs.sort(function (a, b) { return a.c1 - b.c1 || (b.c2 - b.c1) - (a.c2 - a.c1); });
      var lanes = [];
      segs.forEach(function (s) { var L = 0; while (L < lanes.length && lanes[L] >= s.c1) L++; lanes[L] = s.c2; s.lane = L; });
      html += '<div class="week"><div class="wdays">';
      days.forEach(function (o) { html += '<div class="wcell' + (o.muted ? ' muted' : '') + (o.today ? ' today' : '') + '"><span class="wdnum">' + o.d.getDate() + '</span></div>'; });
      html += '</div><div class="bars">';
      segs.forEach(function (s) {
        var span = s.c2 - s.c1 + 1;
        var left = 'calc(' + (s.c1 / 7 * 100) + '% + 2px)', width = 'calc(' + (span / 7 * 100) + '% - 4px)', top = (s.lane * LANE_H) + 'px';
        var bg = hexToRgba(s.e.typeColor, 0.16), bl = s.roundL ? ('border-left:3px solid ' + s.e.typeColor + ';') : '';
        var cls = 'bar' + (s.roundL ? '' : ' noL') + (s.roundR ? '' : ' noR'), inner = '';
        if (s.roundL) inner += '<span class="dur" style="background:' + durColor(s.e.durationDays) + '">' + s.e.durationDays + 'd</span>';
        inner += '<span class="nm">' + esc(s.e.name) + '</span>';
        if (s.roundL) { var rt = ratioText(s.e), fcol = FILL[s.e.fillStatus] || FILL.unknown; if (rt) inner += '<span class="rt" style="color:' + fcol + '">' + rt + '</span>'; }
        html += '<div class="' + cls + '" data-eid="' + esc(s.e.id) + '" style="left:' + left + ';width:' + width + ';top:' + top + ';background:' + bg + ';' + bl + '">' + inner + '</div>';
      });
      html += '</div></div>';
    }
    cal.innerHTML = html;
    cal.classList.remove('anim'); void cal.offsetWidth; cal.style.setProperty('--dir', lastDir + 'px'); cal.classList.add('anim');
  }

  /* =================== HEATMAP =================== */
  function renderHeatmap() {
    var cal = $('#cal'); cal.className = 'cal heat';
    var first = new Date(vy, vm, 1), startDow = first.getDay(), html = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(vy, vm, 1 - startDow + i), key = ymd(d), muted = d.getMonth() !== vm, today = key === todayKey;
      var load = dayLoad(key);
      var need = resource === 'inst' ? load.inst : load.boat;
      var avail = resource === 'inst' ? INST_AVAIL : BOAT_AVAIL;
      var ratio = need <= 0 ? 0 : (avail > 0 ? need / avail : 2);
      var L = LOAD[loadBucket(ratio)];
      var warn = (resource === 'inst' && load.unstaffed > 0) ? '<span class="hwarn">\u26a0</span>' : '';
      var val = load.courses.length ? (need + '/' + avail) : '\u00b7';
      var valCol = load.courses.length ? L.fg : '#c2c6d2';
      html += '<div class="hcell' + (muted ? ' muted' : '') + (today ? ' today' : '') + '" data-hkey="' + key + '" style="background:' + L.bg + '">'
        + '<span class="hdnum">' + d.getDate() + '</span>' + warn
        + '<span class="hval" style="color:' + valCol + '">' + val + '</span></div>';
    }
    cal.innerHTML = html;
    cal.classList.remove('anim'); void cal.offsetWidth; cal.style.setProperty('--dir', lastDir + 'px'); cal.classList.add('anim');
  }

  /* =================== AGENDA (mobile, calendar mode) =================== */
  function chipStart(e) {
    var fcol = FILL[e.fillStatus] || FILL.unknown, rt = ratioText(e);
    return '<div class="chip" data-eid="' + esc(e.id) + '" style="border-left-color:' + e.typeColor + '">'
      + '<span class="dur" style="background:' + durColor(e.durationDays) + '">' + e.durationDays + 'd</span>'
      + '<span class="nm">' + esc(e.name) + '</span>'
      + (rt ? '<span class="rt" style="color:' + fcol + '">' + rt + '</span>' : '') + '</div>';
  }
  function chipCont(e) { return '<div class="chip cont" data-eid="' + esc(e.id) + '" style="border-left-color:' + e.typeColor + '"><span class="nm">\u21b3 ' + esc(e.name) + '</span></div>'; }
  function renderAgenda() {
    var ag = '', dim = new Date(vy, vm + 1, 0).getDate();
    for (var day = 1; day <= dim; day++) {
      var dd = new Date(vy, vm, day), key = ymd(dd), rows = [];
      EVENTS.forEach(function (e) { if (key >= e.dateKey && key <= e.endKey && passes(e)) rows.push({ e: e, start: key === e.dateKey }); });
      if (!rows.length) continue;
      ag += '<div class="aday"><h3>' + dd.toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }) + '</h3>';
      rows.forEach(function (o) { ag += o.start ? chipStart(o.e) : chipCont(o.e); });
      ag += '</div>';
    }
    $('#agenda').innerHTML = ag || '<div class="empty"><h2>Nothing this month</h2><p>Use the arrows to look ahead, or widen the filters.</p></div>';
  }

  function render() {
    $('#mlabel').textContent = new Date(vy, vm, 1).toLocaleString('en-CA', { month: 'long', year: 'numeric' });
    document.querySelector('.dow').classList.toggle('heatgap', viewMode === 'heat');
    if (viewMode === 'cal') { renderCalendar(); renderAgenda(); }
    else { renderHeatmap(); }
  }

  /* =================== MODALS =================== */
  function openCourse(id) {
    var e = byId[id]; if (!e) return;
    var col = FILL[e.fillStatus] || FILL.unknown;
    var pct = e.fillPct == null ? 0 : Math.min(100, e.fillPct);
    var pctTxt = e.fillPct == null ? (e.fillStatus === 'nocap' ? 'No cap set' : '\u2014') : e.fillPct + '%';
    var regTxt = (e.registered == null ? '\u2014' : e.registered) + (e.maxSpots == null ? '' : ' / ' + e.maxSpots) + ' registered';
    var links = '';
    if (e.pageUrl) links += '<a href="' + esc(e.pageUrl) + '" target="_blank" rel="noopener">View page</a>';
    if (e.formUrl) links += '<a href="' + esc(e.formUrl) + '" target="_blank" rel="noopener">Register</a>';
    var html = '<div class="mcard">'
      + '<div class="ctype"><span class="dot" style="background:' + e.typeColor + '"></span>' + esc(e.typeLabel) + '</div>'
      + '<h2>' + esc(e.name) + '</h2>'
      + '<div class="mrow"><span class="lab">When</span>' + esc(e.displayDate) + '</div>'
      + '<div class="mrow"><span class="lab">Duration</span>' + e.durationDays + '-day course</div>'
      + '<div class="mrow"><span class="lab">Instructor</span>' + (e.instructors.length ? esc(e.instructors.join(', ')) : '\u2014') + '</div>'
      + (e.location ? '<div class="mrow"><span class="lab">Where</span>' + esc(e.location) + '</div>' : '')
      + '<div class="meter"><div class="nums"><b>' + regTxt + '</b><b style="color:' + col + '">' + pctTxt + '</b></div>'
      + '<div class="track"><i style="width:' + pct + '%;background:' + col + '"></i></div></div>'
      + (links ? '<div class="mlinks">' + links + '</div>' : '')
      + '<button class="mclose" id="mclose">Close</button></div>';
    var m = $('#modal'); m.innerHTML = html; m.hidden = false;
  }

  function openDay(key) {
    var d = new Date(key + 'T00:00:00'), load = dayLoad(key);
    var instCol = LOAD[loadBucket(INST_AVAIL > 0 ? load.inst / INST_AVAIL : (load.inst > 0 ? 2 : 0))].fg;
    var boatCol = LOAD[loadBucket(BOAT_AVAIL > 0 ? load.boat / BOAT_AVAIL : (load.boat > 0 ? 2 : 0))].fg;
    var rows = '';
    if (!load.courses.length) rows = '<p style="color:var(--mut);font-size:14px;margin:8px 0 0">No courses running this day.</p>';
    else load.courses.forEach(function (e) {
      var staffed = e.instructors.length;
      var bp = boatPer(e);
      rows += '<div class="dayrow"><span class="dot" style="background:' + e.typeColor + '"></span>'
        + '<span class="dn">' + esc(e.name) + '</span>'
        + '<span class="di' + (staffed ? '' : ' warn') + '">' + (staffed ? esc(e.instructors.join(', ')) : '\u26a0 no instructor') + '</span>'
        + '<span class="db">' + bp + ' boat' + (bp > 1 ? 's' : '') + '</span></div>';
    });
    var html = '<div class="mcard">'
      + '<div class="ctype">Day load</div>'
      + '<h2>' + d.toLocaleString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) + '</h2>'
      + rows
      + '<div class="dtot">'
      + '<div><span class="lab">Instructors</span><b style="color:' + instCol + '">' + load.inst + ' / ' + INST_AVAIL + '</b></div>'
      + '<div><span class="lab">Boats</span><b style="color:' + boatCol + '">' + load.boat + ' / ' + BOAT_AVAIL + '</b></div>'
      + '</div>'
      + '<button class="mclose" id="mclose">Close</button></div>';
    var m = $('#modal'); m.innerHTML = html; m.hidden = false;
  }
  function closeModal() { var m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

  /* =================== EVENTS =================== */
  document.addEventListener('click', function (ev) {
    var bar = ev.target.closest('[data-eid]'); if (bar) { openCourse(bar.getAttribute('data-eid')); return; }
    var hc = ev.target.closest('[data-hkey]'); if (hc) { openDay(hc.getAttribute('data-hkey')); return; }
    if (ev.target.id === 'mclose' || ev.target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeModal(); });
  $('#prev').addEventListener('click', function () { lastDir = -16; vm--; if (vm < 0) { vm = 11; vy--; } render(); });
  $('#next').addEventListener('click', function () { lastDir = 16; vm++; if (vm > 11) { vm = 0; vy++; } render(); });
  $('#today').addEventListener('click', function () { lastDir = 16; vy = now.getFullYear(); vm = now.getMonth(); render(); });
  ['#q', '#ct', '#ins', '#fl'].forEach(function (s) { $(s).addEventListener('input', render); });

  $('#viewseg').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    viewMode = b.getAttribute('data-v');
    Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
    $('#resseg').hidden = (viewMode !== 'heat');
    document.body.classList.toggle('heatmode', viewMode === 'heat');
    updateLegend(); render();
  });
  $('#resseg').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    resource = b.getAttribute('data-r');
    Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
    updateLegend(); render();
  });

  updateLegend();
  render();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.searchParams.get('debug') === '1') {
      try {
        const raw = await fetchEvents(env);
        return new Response(JSON.stringify(raw[0] || { note: 'No upcoming events found.' }, null, 2),
          { headers: { 'content-type': 'application/json; charset=utf-8' } });
      } catch (e) {
        return new Response('debug error: ' + e.message, { status: 500 });
      }
    }

    const noCache = url.searchParams.get('nocache') === '1';
    const cache = caches.default;
    const cacheKey = new Request(url.origin + '/__was_calendar_v4', { method: 'GET' });

    if (!noCache) {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    }

    let html, status = 200;
    try {
      // ── Registration close filter ────────────────────────────────────────
      // Exclude courses where sign-up is closed or the course is sold out.
      // Uses registrationCloseDate and stats.soldout from Corsizio API.
      const now = new Date();
      const events = (await fetchEvents(env))
        .filter(function(e) {
          if (e.stats && e.stats.soldout === true) return false;
          if (e.registrationCloseDate && new Date(e.registrationCloseDate) < now) return false;
          return true;
        })
        .map(normalize);
      // ── End filter ───────────────────────────────────────────────────────
      html = buildHtml(events, new Date());
    } catch (e) {
      html = buildErrorHtml(e.message);
      status = 500;
    }

    const resp = new Response(html, {
      status: status,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'max-age=' + CACHE_SECONDS },
    });
    if (!noCache && status === 200) ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  },
};