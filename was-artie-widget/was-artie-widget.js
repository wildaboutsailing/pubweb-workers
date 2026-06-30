// ===========================================================================
//  was-artie-widget-worker.js — Cloudflare Worker that serves the Artie
//  chat-widget JavaScript to the browser.
//  Wild About Sailing
// ===========================================================================
//
//  This is the WORKER itself (server-side, runs in Cloudflare's isolate).
//  It does ONE thing: respond to GET / with the widget's JavaScript as the
//  response body, so a Carrd <script src="...workers.dev/"> tag can load it.
//
//  The widget code below (WIDGET_SOURCE) is what actually RUNS IN THE
//  VISITOR'S BROWSER — it uses `document`, `window`, etc., which only exist
//  client-side. It must stay inside this template string; it must never be
//  deployed as the Worker's own top-level code (that throws
//  "document is not defined" — Workers have no DOM).
//
//  DEPLOY: Cloudflare dashboard -> was-artie-widget -> Edit code -> paste
//  this whole file -> Save and Deploy. (Or commit to the was-artie-widget/
//  subfolder in the monorepo as was-artie-widget.js, matching its
//  wrangler.toml: main = "was-artie-widget.js".)
// ===========================================================================

export default {
  async fetch(request) {
    return new Response(WIDGET_SOURCE, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
      },
    });
  },
};

const WIDGET_SOURCE = `
// ===========================================================================
//  was-artie-widget.js  —  "First Mate Artie" chat widget  (Quo edition)
//  Wild About Sailing  ·  Carrd Head embed
// ===========================================================================
//
//  INSTALL: wrap this whole file in <script> ... </script> and paste into a
//  Carrd Head embed. Set WORKER_URL and PHONE first.
//
//  HANDOFF: when Artie hands off, the visitor is asked for name + mobile.
//  On submit the widget POSTs a 'lead' to the Worker, which pings you in Quo
//  and emails a one-tap "reply in Quo" link. PHONE below is the fallback
//  "text us now" number — set it to your Quo number.
//
//  CARRD NOTES (handled): no <style> tags (inline styles only); SVG via
//  createElementNS; no getElementById.
//
//  VERSION: bump WIDGET_VERSION on every deploy. It's logged to the browser
//  console on load — open DevTools after a push to confirm the edge cache
//  served the new build, not a stale one (5-minute edge cache; bump the
//  ?v=N query param on the <script> tag to force a fresh fetch immediately).
// ===========================================================================

(function () {
  var WIDGET_VERSION = "2026-06-30.1"; // bump on every deploy
  console.log("[Artie widget] version " + WIDGET_VERSION);

  var WORKER_URL = "https://was-artie.dave-6bf.workers.dev/"; // <-- SET THIS
  var PHONE = "+12368005627";                                 // <-- your Quo number
  var EMAIL = "annalise@wildaboutsailing.com";

  var NAVY = "#28286E", RED = "#DC3C32", CHARCOAL = "#3D3D3D";
  var Z = 2147483000; // above page content, below nav/modal (max int)
  var CLAMP_PX = 200; // collapse bot messages taller than this, with a "Show more" toggle

  var messages = [];
  var visitor  = {};
  var panel, msgArea, input, launcher, busy = false;

  // Read page context from data-context attribute on our own script tag
  var pageContext = (function() {
    var scripts = document.querySelectorAll("script[src*=\"was-artie-widget\"]");
    for (var i = 0; i < scripts.length; i++) {
      var ctx = scripts[i].getAttribute("data-context");
      if (ctx) return ctx;
    }
    return "";
  })();

  function el(tag, styles, text) {
    var e = document.createElement(tag);
    if (styles) e.setAttribute("style", styles);
    if (text != null) e.textContent = text;
    return e;
  }
  function svgIcon(paths, size) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", size); s.setAttribute("height", size);
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    paths.forEach(function (d) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", d); s.appendChild(p);
    });
    return s;
  }
  function isMobile() { return window.matchMedia("(max-width: 600px)").matches; }
  var INPUT_STYLE = "width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:8px;padding:9px 11px;font-size:16px;margin-top:6px;outline:none;";

  function build() {
    launcher = el("button",
      "position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:" + RED +
      ";color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;z-index:" + Z + ";");
    launcher.setAttribute("aria-label", "Chat with First Mate Artie");
    launcher.appendChild(svgIcon(["M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"], "28"));
    launcher.onclick = toggle;
    document.body.appendChild(launcher);

    var w = isMobile() ? "calc(100vw - 24px)" : "370px";
    var h = isMobile() ? "70vh" : "520px";
    panel = el("div",
      "position:fixed;bottom:90px;right:20px;width:" + w + ";height:" + h + ";max-height:80vh;background:#fff;border-radius:14px;" +
      "box-shadow:0 10px 40px rgba(0,0,0,.35);overflow:hidden;display:none;flex-direction:column;z-index:" + Z + ";font-family:Inter,system-ui,sans-serif;");

    var head = el("div", "background:" + NAVY + ";color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;");
    var titleWrap = el("div");
    titleWrap.appendChild(el("div", "font-weight:600;font-size:15px;", "First Mate Artie"));
    titleWrap.appendChild(el("div", "font-size:12px;opacity:.7;", "Wild About Sailing"));
    head.appendChild(titleWrap);
    var close = el("button", "margin-left:auto;background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1;", "\u00d7");
    close.onclick = toggle; head.appendChild(close);
    panel.appendChild(head);

    msgArea = el("div", "flex:1;overflow-y:auto;padding:14px;background:#f7f8fa;");
    panel.appendChild(msgArea);

    var row = el("div", "display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff;");
    input = el("input", "flex:1;border:1px solid #ddd;border-radius:20px;padding:10px 14px;font-size:16px;outline:none;");
    input.setAttribute("placeholder", "Ask about courses, getting started\u2026");
    input.addEventListener("keydown", function (ev) { removeChips(); if (ev.key === "Enter") send(); });
    var sendBtn = el("button", "background:" + RED + ";color:#fff;border:none;border-radius:20px;padding:0 16px;cursor:pointer;font-weight:600;", "Send");
    sendBtn.onclick = send;
    row.appendChild(input); row.appendChild(sendBtn);
    panel.appendChild(row);

    document.body.appendChild(panel);
  }

  var DEFAULT_CHIPS = ["Upcoming dates?", "Prices?", "Location?"];
  var chipsEl = null;

  function showChips() {
    var chips = DEFAULT_CHIPS;
    if (!chips.length) return;
    chipsEl = el("div", "display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 8px;");
    chips.forEach(function(label) {
      var chip = el("button",
        "background:#fff;color:"+NAVY+";border:1.5px solid "+NAVY+";border-radius:20px;" +
        "padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:Inter,system-ui,sans-serif;",
        label);
      chip.onmouseenter = function() { this.style.background = NAVY; this.style.color = "#fff"; };
      chip.onmouseleave = function() { this.style.background = "#fff"; this.style.color = NAVY; };
      chip.onclick = function() {
        removeChips();
        input.value = label;
        send();
      };
      chipsEl.appendChild(chip);
    });
    msgArea.appendChild(chipsEl);
    msgArea.scrollTop = msgArea.scrollHeight;
  }

  function removeChips() {
    if (chipsEl && chipsEl.parentNode) {
      chipsEl.parentNode.removeChild(chipsEl);
      chipsEl = null;
    }
  }

  function toggle() {
    var open = panel.style.display === "none";
    panel.style.display = open ? "flex" : "none";
    if (open && messages.length === 0) {
      addBubble("assistant", "Ahoy! I'm Artie, the first mate here at Wild About Sailing. Ask me about our courses, what to expect on the water, or how to get started. \u26F5");
      showChips();
    }
    if (open) setTimeout(function () { input.focus(); }, 50);
  }

  // Render a bot message with inline markdown. Handles NESTING: bold can wrap a
  // link (Artie often emits **[label](url) - date**), so we parse bold first and
  // parse links *within* each segment. A link is always rendered as a real
  // anchor; its [label](url) markdown is never shown as raw text.
  function appendRich(parent, text) {
    var lines = String(text == null ? "" : text).split("\n");
    lines.forEach(function (line, li) {
      if (li > 0) parent.appendChild(document.createElement("br"));
      renderInline(parent, line);
    });
  }
  function renderInline(parent, str) {
    var boldRe = /\*\*([^*]+)\*\*/g;
    var last = 0, m;
    boldRe.lastIndex = 0;
    while ((m = boldRe.exec(str)) !== null) {
      if (m.index > last) renderLinks(parent, str.slice(last, m.index));
      var st = document.createElement("strong");
      renderLinks(st, m[1]); // bold content may itself contain a [label](url) link
      parent.appendChild(st);
      last = boldRe.lastIndex;
    }
    if (last < str.length) renderLinks(parent, str.slice(last));
  }
  function renderLinks(parent, str) {
    var linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    var last = 0, m;
    linkRe.lastIndex = 0;
    while ((m = linkRe.exec(str)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(str.slice(last, m.index)));
      var a = document.createElement("a");
      a.setAttribute("href", m[2]);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
      a.setAttribute("style", "color:" + NAVY + ";font-weight:600;text-decoration:underline;");
      a.textContent = m[1];
      parent.appendChild(a);
      last = linkRe.lastIndex;
    }
    if (last < str.length) parent.appendChild(document.createTextNode(str.slice(last)));
  }

  function clampBubble(b, inner) {
    var clamped = "position:relative;max-height:" + CLAMP_PX + "px;overflow:hidden;";
    inner.setAttribute("style", clamped);
    var fade = el("div", "position:absolute;left:0;right:0;bottom:0;height:30px;background:linear-gradient(rgba(255,255,255,0),#fff);pointer-events:none;");
    inner.appendChild(fade);
    var toggle = el("a", "display:inline-block;margin-top:6px;color:" + NAVY + ";font-weight:600;font-size:13px;cursor:pointer;text-decoration:underline;", "Show more");
    var open = false;
    toggle.onclick = function () {
      open = !open;
      inner.setAttribute("style", open ? "position:relative;" : clamped);
      fade.style.display = open ? "none" : "block";
      toggle.textContent = open ? "Show less" : "Show more";
    };
    b.appendChild(toggle);
  }

  function addBubble(role, text) {
    var mine = role === "user";
    var wrap = el("div", "display:flex;margin:8px 0;" + (mine ? "justify-content:flex-end;" : "justify-content:flex-start;"));
    var b = el("div",
      "max-width:80%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;" +
      (mine ? "background:" + NAVY + ";color:#fff;border-bottom-right-radius:4px;"
            : "background:#fff;color:" + CHARCOAL + ";border:1px solid #e6e6e6;border-bottom-left-radius:4px;"));
    var inner = b;
    if (mine) {
      b.textContent = text;
    } else {
      inner = el("div");
      appendRich(inner, text);
      b.appendChild(inner);
    }
    wrap.appendChild(b); msgArea.appendChild(wrap);
    if (!mine) {
      var measure = function () {
        if (inner.getAttribute("data-clamped")) return;
        if (inner.scrollHeight > CLAMP_PX) { inner.setAttribute("data-clamped", "1"); clampBubble(b, inner); }
        msgArea.scrollTop = msgArea.scrollHeight;
      };
      measure();
      if (window.requestAnimationFrame) requestAnimationFrame(measure);
    } else {
      msgArea.scrollTop = msgArea.scrollHeight;
    }
    return b;
  }

  function send() {
    var text = (input.value || "").trim();
    if (!text || busy) return;
    removeChips();
    input.value = "";
    messages.push({ role: "user", content: text });
    addBubble("user", text);
    busy = true;
    var typing = addBubble("assistant", "\u2026");
    fetch(WORKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: messages, visitor: visitor, pageContext: pageContext }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        var reply = data.reply || "Sorry, I didn't catch that.";
        messages.push({ role: "assistant", content: reply });
        addBubble("assistant", reply);
        if (data.handoff) showHandoff();
        busy = false;
      })
      .catch(function () { typing.textContent = "Connection trouble \u2014 please email " + EMAIL + "."; busy = false; });
  }

  function showHandoff() {
    var box = el("div", "margin:10px 0;padding:12px;border:1px solid " + NAVY + ";border-radius:12px;background:#eef0f7;");
    var title = el("div", "font-size:13px;color:" + CHARCOAL + ";font-weight:600;margin-bottom:8px;", "How would you like us to reach you?");
    var body = el("div");
    box.appendChild(title); box.appendChild(body);
    msgArea.appendChild(box); msgArea.scrollTop = msgArea.scrollHeight;

    function clear() { while (body.firstChild) body.removeChild(body.firstChild); }
    function scroll() { msgArea.scrollTop = msgArea.scrollHeight; }
    function lastUser() { var u = messages.filter(function (m) { return m.role === "user"; }).slice(-1)[0]; return u ? u.content : ""; }
    function transcript() { return messages.map(function (m) { return (m.role === "user" ? "Visitor: " : "Artie: ") + m.content; }).join("\n"); }

    function done(name) {
      title.textContent = ""; clear();
      box.setAttribute("style", "margin:10px 0;padding:12px;border:1px solid " + NAVY + ";border-radius:12px;background:#eef0f7;font-size:13px;color:" + CHARCOAL + ";");
      box.textContent = "Thanks" + (name ? ", " + name : "") + "! We'll be in touch soon. \u2693";
    }
    function failed() {
      clear();
      body.appendChild(el("div", "font-size:13px;color:" + CHARCOAL + ";", "Hmm, that didn't send \u2014 please text us at " + PHONE + " or email " + EMAIL + "."));
    }
    function submitLead(payload, name, btn) {
      fetch(WORKER_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead: payload }) })
        .then(function () { done(name); }).catch(failed);
    }
    function backLink() {
      var bk = el("a", "display:inline-block;margin-top:8px;font-size:12px;color:" + NAVY + ";cursor:pointer;text-decoration:underline;", "\u2039 Choose another way");
      bk.onclick = showChoices; return bk;
    }
    function optionBtn(label, accent) {
      return el("button",
        "width:100%;margin-bottom:8px;border-radius:9px;padding:11px;cursor:pointer;font-weight:600;font-size:14px;text-align:left;" +
        (accent ? "background:" + NAVY + ";color:#fff;border:none;" : "background:#fff;color:" + NAVY + ";border:1px solid " + NAVY + ";"), label);
    }
    function captureForm(opts) {
      clear();
      body.appendChild(el("div", "font-size:12px;color:" + CHARCOAL + ";opacity:.85;margin-bottom:6px;", opts.note));
      var nameI = el("input", INPUT_STYLE); nameI.setAttribute("placeholder", "Your name");
      var valI = el("input", INPUT_STYLE); valI.setAttribute("placeholder", opts.placeholder);
      if (opts.inputmode) valI.setAttribute("inputmode", opts.inputmode);
      if (opts.type) valI.setAttribute("type", opts.type);
      body.appendChild(nameI); body.appendChild(valI);
      var submit = el("button", "width:100%;margin-top:8px;background:" + RED + ";color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer;font-weight:600;", "Send");
      submit.onclick = function () {
        var nm = (nameI.value || "").trim(), v = (valI.value || "").trim();
        if (!v) { valI.style.borderColor = RED; return; }
        submit.disabled = true; submit.textContent = "Sending\u2026";
        var payload = { name: nm, method: opts.method, summary: lastUser(), transcript: transcript() };
        payload[opts.field] = v;
        submitLead(payload, nm, submit);
      };
      body.appendChild(submit);
      body.appendChild(backLink());
      scroll();
    }
    function showSelfServe() {
      clear();
      body.appendChild(el("div", "font-size:12px;color:" + CHARCOAL + ";opacity:.85;margin-bottom:8px;", "Reach us anytime \u2014 we usually reply within a day or two:"));
      var row = el("div", "display:flex;gap:8px;");
      var bodyTxt = encodeURIComponent("Hi Wild About Sailing \u2014 I was chatting with Artie and had a question.");
      var sms = el("a", "flex:1;text-align:center;background:#fff;border:1px solid " + NAVY + ";color:" + NAVY + ";text-decoration:none;padding:9px;border-radius:8px;font-size:13px;font-weight:600;", "Call or text");
      sms.setAttribute("href", "sms:" + PHONE + "?&body=" + bodyTxt);
      var mail = el("a", "flex:1;text-align:center;background:#fff;border:1px solid " + NAVY + ";color:" + NAVY + ";text-decoration:none;padding:9px;border-radius:8px;font-size:13px;font-weight:600;", "Email");
      mail.setAttribute("href", "mailto:" + EMAIL);
      row.appendChild(sms); row.appendChild(mail);
      body.appendChild(row);
      body.appendChild(el("div", "font-size:12px;color:" + CHARCOAL + ";margin-top:8px;", PHONE + "  \u00b7  " + EMAIL));
      body.appendChild(backLink());
      scroll();
    }
    function showChoices() {
      title.textContent = "How would you like us to reach you?";
      clear();
      var b1 = optionBtn("\uD83D\uDCDE  Call or text me ASAP", true);
      b1.onclick = function () { captureForm({ field: "phone", placeholder: "Mobile number", inputmode: "tel", method: "asap", note: "We'll text or call you as soon as we can." }); };
      var b2 = optionBtn("\u2709\uFE0F  Follow-up by email", false);
      b2.onclick = function () { captureForm({ field: "email", placeholder: "Email address", inputmode: "email", type: "email", method: "email", note: "We'll email you back, usually within a day or two." }); };
      var b3 = optionBtn("I'll reach out myself", false);
      b3.onclick = showSelfServe;
      body.appendChild(b1); body.appendChild(b2); body.appendChild(b3);
      scroll();
    }
    showChoices();
  }

  function init() { if (!document.body) return setTimeout(init, 200); build(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`;