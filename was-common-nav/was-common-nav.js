/* =============================================================================
 *  was-common-nav  —  Cloudflare Worker
 *  Single source of truth for the Wild About Sailing nav + footer across every
 *  Carrd subdomain. (Builds site "chrome" — the shared nav + footer framing.
 *  Nothing to do with the Chrome browser; this runs in every browser.)
 *
 *  HOW IT WORKS
 *  ------------
 *  Each Carrd page loads ONE line in a Head/inline embed:
 *      <script src="https://was-common-nav.dave-6bf.workers.dev/"></script>
 *
 *  The script then builds the nav and footer from the PAGE ITSELF:
 *    • Nav + footer links  →  any element tagged  data-nav="Label"
 *                              (anchor is taken from that element's own id)
 *    • The red CTA button  →  add  data-nav-cta="true"  to one of them
 *                              (normally the Courses/Dates section)
 *    • Nav order           →  document order, unless you set data-nav-order="N"
 *    • Footer tagline      →  <meta name="was:tagline" content="…"> if present,
 *                              otherwise a sensible default
 *
 *  Everything else (wordmark, phone, email, socials, logos, copyright, the
 *  Canoe Cove link, Privacy Policy) is global and identical on every site, so
 *  it lives here once.
 *
 *  To change anything site-wide: edit this Worker, Save & Deploy. Done.
 *  Cache is 5 minutes, so changes appear within ~5 min (or purge to force it).
 * ========================================================================== */

const NAV_JS = String.raw`
(function () {
  /* ---------- GLOBAL CONSTANTS (same on every site) ---------- */
  var NAV_BG  = '#1a1a3e';
  var FOOT_BG = '#3D3D3D';
  var RED     = '#DC3C32';
  var PHONE   = '7788170275';
  var PHONE_D = '778-817-0275';
  var EMAIL   = 'annalise@wildaboutsailing.com';
  var HOME    = 'https://wildaboutsailing.com';
  var CANOE   = 'https://canoecovemarina.com';
  var FB_URL  = 'https://www.facebook.com/profile.php?id=61575146403792';
  var IG_URL  = 'https://www.instagram.com/wildaboutsailing/';
  var POLICY  = 'https://policies.wildaboutsailing.com/';
  var SC_URL       = 'https://www.sailing.ca/';
  var SC_PRIDE_URL = 'https://www.sailing.ca/inclusion-diversity-and-equity/';
  var LOGO       = 'https://assets.wildaboutsailing.com/logos/sailcanadalogo.jpg';
  var LOGO_PRIDE = 'https://assets.wildaboutsailing.com/logos/sailcanadapridelogo.png';
  var DEFAULT_TAGLINE = 'Sail Canada certified sailing lessons on<br>the beautiful Salish Sea.';
  var NAV_OFFSET = 72; /* fixed nav height (64) + a little breathing room */

  var HOST    = location.hostname;
  var IS_MAIN = (HOST === 'wildaboutsailing.com' || HOST === 'www.wildaboutsailing.com');

  /* ---------- HELPERS ---------- */
  function el(tag, style, html) {
    var e = document.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function makeSVG(type) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '22'); svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('style', 'display:block;');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', '#ffffff'); path.setAttribute('style', 'fill:#ffffff;');
    if (type === 'facebook') {
      path.setAttribute('d', 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z');
    } else {
      path.setAttribute('d', 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37zM17.5 6.5a1 1 0 1 0-1-1 1 1 0 0 0 1 1zM20.5 7A7.5 7.5 0 1 0 7 20.5 7.5 7.5 0 0 0 20.5 7zm-1.5 0a6 6 0 0 1 0 8.49A6 6 0 1 1 19 7z');
    }
    svg.appendChild(path); return svg;
  }

  function makePhoneSVG(size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('style', 'display:block;');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.47 11.47 0 0 0 3.58.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.58a1 1 0 0 1-.24 1.01l-2.21 2.2z');
    path.setAttribute('fill', '#ffffff');
    svg.appendChild(path); return svg;
  }

  function makeEmailSVG(size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('style', 'display:block;');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z');
    path.setAttribute('fill', '#ffffff');
    svg.appendChild(path); return svg;
  }

  function makeWordmark(size, linkHome) {
    var wm = el('a', 'text-decoration:none;display:flex;align-items:center;line-height:1;');
    wm.href = linkHome ? HOME : '#';
    wm.appendChild(el('span', 'font-size:' + size + 'px;font-weight:600;color:#fff;letter-spacing:-0.01em;font-family:Inter,sans-serif;', 'Wild'));
    wm.appendChild(el('span', 'font-size:' + size + 'px;font-weight:400;color:rgba(255,255,255,0.65);letter-spacing:-0.01em;margin:0 4px;font-family:Inter,sans-serif;', 'About'));
    wm.appendChild(el('span', 'font-size:' + size + 'px;font-weight:600;color:' + RED + ';letter-spacing:-0.01em;font-family:Inter,sans-serif;', 'Sailing'));
    return wm;
  }

  /* ---------- READ NAV TARGETS FROM THE PAGE ---------- */
  function getNavItems() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
    var items = nodes.map(function (n, i) {
      var ord = n.getAttribute('data-nav-order');
      return {
        label:  n.getAttribute('data-nav'),
        anchor: n.id ? ('#' + n.id) : '',
        cta:    n.getAttribute('data-nav-cta') === 'true',
        order:  (ord !== null && ord !== '') ? parseFloat(ord) : i
      };
    }).filter(function (it) { return it.label && it.anchor; });
    items.sort(function (a, b) { return a.order - b.order; });
    return items;
  }

  function getTagline() {
    var m = document.querySelector('meta[name="was:tagline"]');
    if (m && m.getAttribute('content')) return m.getAttribute('content');
    return DEFAULT_TAGLINE;
  }

  /* ---------- IN-PAGE SCROLLING ----------
   * Carrd has its own hash-based page router. A raw <a href="#courses"> changes
   * the URL hash, Carrd's router doesn't recognise it as a page, and bounces
   * back to the top. So we scroll with JS and never let the hash change. */
  function scrollToAnchor(href) {
    var id = (href.charAt(0) === '#') ? href.slice(1) : href;
    if (!id) return false;
    var target = document.querySelector('[id="' + id + '"]');
    if (!target) return false;
    var top = (window.pageYOffset || document.documentElement.scrollTop || 0);
    var y = target.getBoundingClientRect().top + top - NAV_OFFSET;
    window.scrollTo({ top: (y < 0 ? 0 : y), behavior: 'smooth' });
    return true;
  }
  function bindAnchor(a) {
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return; /* leave external/http links alone */
    a.addEventListener('click', function (e) {
      if (scrollToAnchor(href)) { e.preventDefault(); e.stopPropagation(); }
    });
  }

  /* ---------- NAV ---------- */
  function navLink(href, text, cta) {
    var a = el('a',
      'color:' + (cta ? '#fff' : 'rgba(255,255,255,0.85)') + ';' +
      'text-decoration:none;font-family:Inter,sans-serif;font-size:14px;' +
      'font-weight:' + (cta ? '500' : '400') + ';' +
      'padding:7px 14px;border-radius:6px;white-space:nowrap;' +
      'background:' + (cta ? RED : 'transparent') + ';' +
      'border:none;display:inline-block;' +
      'margin-left:' + (cta ? '8px' : '0') + ';cursor:pointer;'
    );
    a.href = href; a.textContent = text;
    return a;
  }

  function injectNav(items) {
    if (document.querySelector('#was-nav')) return;

    var nav = el('nav',
      'position:fixed;top:0;left:0;right:0;width:100vw;height:64px;' +
      'z-index:2147483647;background:' + NAV_BG + ';' +
      'display:flex;align-items:center;justify-content:space-between;' +
      'padding:0 2rem;box-shadow:0 2px 16px rgba(0,0,0,0.45);' +
      'box-sizing:border-box;transition:transform 0.3s ease;'
    );
    nav.id = 'was-nav';

    var wm = makeWordmark(19, true);

    var ld = el('div', 'display:flex;align-items:center;gap:2px;');
    items.forEach(function (it) { var a = navLink(it.anchor, it.label, it.cta); bindAnchor(a); ld.appendChild(a); });

    var pa = el('a', 'display:inline-flex;align-items:center;justify-content:center;padding:8px 10px;margin-left:6px;background:transparent;border:none;border-radius:6px;cursor:pointer;text-decoration:none;');
    pa.href = 'tel:' + PHONE; pa.title = PHONE_D; pa.appendChild(makePhoneSVG(22));
    ld.appendChild(pa);

    var divider = el('span', 'color:rgba(255,255,255,0.25);font-size:18px;padding:0 2px;line-height:1;');
    divider.textContent = '|';
    ld.appendChild(divider);

    var ea = el('a', 'display:inline-flex;align-items:center;justify-content:center;padding:8px 10px;background:transparent;border:none;border-radius:6px;cursor:pointer;text-decoration:none;');
    ea.href = 'mailto:' + EMAIL; ea.title = EMAIL; ea.appendChild(makeEmailSVG(22));
    ld.appendChild(ea);

    var hbtn = el('button', 'display:none;flex-direction:column;gap:5px;cursor:pointer;padding:6px;background:none;border:none;');
    for (var i = 0; i < 3; i++) {
      hbtn.appendChild(el('span', 'display:block;width:22px;height:2px;background:#fff;border-radius:2px;'));
    }

    nav.appendChild(wm); nav.appendChild(ld); nav.appendChild(hbtn);

    var menu = el('div',
      'display:none;position:fixed;top:64px;left:0;right:0;width:100%;' +
      'background:' + NAV_BG + ';z-index:2147483646;' +
      'border-top:1px solid rgba(255,255,255,0.1);' +
      'padding:0.5rem 0 1rem;box-sizing:border-box;'
    );

    items.forEach(function (it) {
      var a = el('a',
        'display:block;color:' + (it.cta ? RED : 'rgba(255,255,255,0.85)') + ';' +
        'font-family:Inter,sans-serif;font-size:15px;' +
        'font-weight:' + (it.cta ? '600' : '400') + ';' +
        'padding:13px 2rem;text-decoration:none;' +
        'border-bottom:1px solid rgba(255,255,255,0.08);'
      );
      a.href = it.anchor; a.textContent = it.label;
      bindAnchor(a);
      menu.appendChild(a);
    });

    var pr = el('a', 'display:flex;align-items:center;gap:12px;color:#fff;font-family:Inter,sans-serif;font-size:15px;padding:13px 2rem;text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.08);');
    pr.href = 'tel:' + PHONE; pr.appendChild(makePhoneSVG(20)); pr.appendChild(document.createTextNode(' ' + PHONE_D));
    menu.appendChild(pr);

    var er = el('a', 'display:flex;align-items:center;gap:12px;color:#fff;font-family:Inter,sans-serif;font-size:15px;padding:13px 2rem;text-decoration:none;');
    er.href = 'mailto:' + EMAIL; er.appendChild(makeEmailSVG(20)); er.appendChild(document.createTextNode(' ' + EMAIL));
    menu.appendChild(er);

    document.body.appendChild(nav);
    document.body.appendChild(menu);

    var wrapper = document.querySelector('.site-wrapper');
    if (wrapper) { wrapper.style.marginTop = '0'; wrapper.style.paddingTop = '0'; }

    function checkWidth() {
      if (window.innerWidth <= 640) { ld.style.display = 'none'; hbtn.style.display = 'flex'; }
      else { ld.style.display = 'flex'; hbtn.style.display = 'none'; menu.style.display = 'none'; }
    }
    checkWidth();
    window.addEventListener('resize', checkWidth);

    hbtn.addEventListener('click', function () {
      menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.style.display = 'none'; });
    });

    var lastScroll = 0;
    window.addEventListener('scroll', function () {
      var cur = window.pageYOffset || document.documentElement.scrollTop;
      if (cur > lastScroll && cur > 80) { nav.style.transform = 'translateY(-100%)'; menu.style.display = 'none'; }
      else { nav.style.transform = 'translateY(0)'; }
      lastScroll = cur <= 0 ? 0 : cur;
    }, { passive: true });
  }

  /* ---------- FOOTER ---------- */
  function makeFooter(items) {
    if (document.querySelector('#was-footer')) return;

    var footer = el('footer', 'background:' + FOOT_BG + ';color:#fff;font-family:Inter,sans-serif;padding:3rem 2rem 0;box-sizing:border-box;width:100%;margin-top:0;');
    footer.id = 'was-footer';

    var grid = el('div', 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:2rem;max-width:1100px;margin:0 auto;padding-bottom:2.5rem;');

    /* Col 1 — brand */
    var col1 = el('div', 'display:flex;flex-direction:column;gap:0.75rem;');
    var wm = makeWordmark(20, true);
    wm.setAttribute('style', 'text-decoration:none;display:flex;align-items:center;line-height:1;margin-bottom:0.25rem;');
    col1.appendChild(wm);
    col1.appendChild(el('p', 'font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;margin:0;font-family:Inter,sans-serif;', getTagline()));
    var loc = el('a', 'font-size:13px;color:rgba(255,255,255,0.6);text-decoration:none;font-family:Inter,sans-serif;', '\u{1F4CD} Canoe Cove Marina, Sidney BC');
    loc.href = CANOE; loc.target = '_blank';
    col1.appendChild(loc);
    var socials = el('div', 'display:flex;gap:14px;margin-top:0.5rem;align-items:center;');
    var fb = el('a', 'color:rgba(255,255,255,0.8);text-decoration:none;display:flex;align-items:center;gap:7px;font-size:13px;font-family:Inter,sans-serif;');
    fb.href = FB_URL; fb.target = '_blank'; fb.appendChild(makeSVG('facebook')); fb.appendChild(document.createTextNode('Facebook'));
    var ig = el('a', 'color:rgba(255,255,255,0.8);text-decoration:none;display:flex;align-items:center;gap:7px;font-size:13px;font-family:Inter,sans-serif;');
    ig.href = IG_URL; ig.target = '_blank'; ig.appendChild(makeSVG('instagram')); ig.appendChild(document.createTextNode('Instagram'));
    socials.appendChild(fb); socials.appendChild(ig);
    col1.appendChild(socials);

    /* Col 2 — quick links (same set the nav uses, plus Privacy) */
    var col2 = el('div', 'display:flex;flex-direction:column;gap:0.5rem;align-items:center;text-align:center;');
    col2.appendChild(el('p', 'font-size:12px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.1em;text-transform:uppercase;margin:0 0 0.75rem;font-family:Inter,sans-serif;', 'Quick Links'));
    var links = items.map(function (it) { return [it.anchor, it.label]; });
    links.push([POLICY, 'Privacy Policy']);
    links.forEach(function (l) {
      var a = el('a', 'color:rgba(255,255,255,0.7);text-decoration:none;font-size:14px;font-family:Inter,sans-serif;padding:3px 0;display:block;', l[1]);
      a.href = l[0];
      if (l[0].indexOf('http') === 0) a.target = '_blank';
      bindAnchor(a);
      col2.appendChild(a);
    });

    /* Col 3 — contact + accreditation logos */
    var col3 = el('div', 'display:flex;flex-direction:column;gap:0.5rem;');
    col3.appendChild(el('p', 'font-size:12px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.1em;text-transform:uppercase;margin:0 0 0.75rem;font-family:Inter,sans-serif;', 'Get in Touch'));
    var phone = el('a', 'color:rgba(255,255,255,0.7);text-decoration:none;font-size:14px;font-family:Inter,sans-serif;padding:3px 0;display:block;', PHONE_D);
    phone.href = 'tel:' + PHONE; col3.appendChild(phone);
    var email = el('a', 'color:rgba(255,255,255,0.7);text-decoration:none;font-size:14px;font-family:Inter,sans-serif;padding:3px 0;display:block;', EMAIL);
    email.href = 'mailto:' + EMAIL; col3.appendChild(email);

    var logos = el('div', 'display:flex;gap:12px;align-items:center;margin-top:1rem;flex-wrap:nowrap;');
    var scLink = el('a', 'display:inline-block;flex-shrink:0;');
    scLink.href = SC_URL; scLink.target = '_blank';
    var scLogo = el('img', 'height:110px;width:auto;background:#fff;padding:8px;border-radius:4px;');
    scLogo.src = LOGO; scLogo.alt = 'Sail Canada Accredited';
    scLink.appendChild(scLogo);
    var scPrideLink = el('a', 'display:inline-block;flex-shrink:0;');
    scPrideLink.href = SC_PRIDE_URL; scPrideLink.target = '_blank';
    var scPride = el('img', 'height:110px;width:auto;background:#fff;padding:8px;border-radius:4px;');
    scPride.src = LOGO_PRIDE; scPride.alt = 'Sail Canada 2SLGBTQIA+ Affirming';
    scPrideLink.appendChild(scPride);
    logos.appendChild(scLink); logos.appendChild(scPrideLink);
    col3.appendChild(logos);

    grid.appendChild(col1); grid.appendChild(col2); grid.appendChild(col3);
    footer.appendChild(grid);

    /* Bottom bar */
    var bar = el('div', 'border-top:1px solid rgba(255,255,255,0.1);padding:1rem 0;max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;');
    bar.appendChild(el('p', 'font-size:12px;color:rgba(255,255,255,0.4);margin:0;font-family:Inter,sans-serif;', '\u00A9 2026 Wild About Sailing. All rights reserved.'));
    var barRight = el('div', 'display:flex;gap:1.5rem;align-items:center;');
    if (!IS_MAIN) {
      var mainLink = el('a', 'font-size:12px;color:rgba(255,255,255,0.4);text-decoration:none;font-family:Inter,sans-serif;', 'wildaboutsailing.com');
      mainLink.href = HOME; mainLink.target = '_blank';
      barRight.appendChild(mainLink);
    }
    var policy = el('a', 'font-size:12px;color:rgba(255,255,255,0.4);text-decoration:none;font-family:Inter,sans-serif;', 'Privacy Policy');
    policy.href = POLICY; policy.target = '_blank';
    barRight.appendChild(policy);
    bar.appendChild(barRight);
    footer.appendChild(bar);

    function checkWidth() {
      if (window.innerWidth <= 640) {
        grid.setAttribute('style', 'display:grid;grid-template-columns:1fr;gap:2rem;max-width:1100px;margin:0 auto;padding-bottom:2.5rem;');
      } else if (window.innerWidth <= 900) {
        grid.setAttribute('style', 'display:grid;grid-template-columns:1fr 1fr;gap:2rem;max-width:1100px;margin:0 auto;padding-bottom:2.5rem;');
      } else {
        grid.setAttribute('style', 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:2rem;max-width:1100px;margin:0 auto;padding-bottom:2.5rem;');
      }
    }
    checkWidth();
    window.addEventListener('resize', checkWidth);

    var carrdFooter = document.querySelector('.site-footer');
    if (carrdFooter) carrdFooter.style.display = 'none';
    document.body.appendChild(footer);
  }

  /* ---------- RUN ---------- */
  function run() {
    var items = getNavItems();
    injectNav(items);
    makeFooter(items);
  }

  function tryInject() {
    if (document.querySelector('.site-wrapper')) { run(); }
    else { setTimeout(tryInject, 50); }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', tryInject); }
  else { tryInject(); }
})();
`;

export default {
  async fetch(request) {
    return new Response(NAV_JS, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

