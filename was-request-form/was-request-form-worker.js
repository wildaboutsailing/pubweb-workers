// was-request-form Worker — serves the page in PAGE_HTML.
// (Human-facing docs live inside PAGE_HTML so they survive bundling.)
const PAGE_HTML = `<!DOCTYPE html>
<!--
  ============================================================================
  WAS Request Form — served page
  ----------------------------------------------------------------------------
  Loaded in an iframe at the calendar modal's final "request a date" step
  (see was-cal-engine). Served as text/html by the was-request-form Worker.

  EDITING: this whole page lives inside a template literal in the Worker
  source (const PAGE_HTML = \`…\`). Backslashes and \${ are escaped in the source
  (\\\\ and \\\${) so this output is byte-correct. Preserve that escaping — the
  email validator /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/ breaks otherwise.

  CHANGELOG
    v2  2026-07-03
      - A1: input/select/textarea font-size 14px -> 16px (stops iOS Safari
            auto-zoom-on-focus that jumped/zoomed the page inside the modal).
    v1  original
  ============================================================================
-->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: #fff; }
    body {
      font-family: Lato, Inter, system-ui, sans-serif;
      font-size: 14px;
      color: #3D3D3D;
      padding: 14px 16px 16px;
    }
    h2 {
      font-size: 16px;
      font-weight: 700;
      color: #28286E;
      margin-bottom: 4px;
      line-height: 1.3;
    }
    .sub {
      font-size: 13px;
      color: #666;
      margin-bottom: 14px;
      line-height: 1.4;
    }
    .course-tag {
      display: inline-block;
      background: #eef0f8;
      color: #28286E;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 20px;
      margin-bottom: 14px;
    }
    .row { margin-bottom: 10px; }
    label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #28286E;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    input, select, textarea {
      width: 100%;
      padding: 8px 10px;
      border: 1.5px solid #d0d5e8;
      border-radius: 6px;
      font-family: inherit;
      font-size: 16px;
      color: #3D3D3D;
      background: #fff;
      transition: border-color 0.15s;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #28286E;
    }
    textarea {
      resize: vertical;
      min-height: 60px;
    }
    .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .btn {
      width: 100%;
      background: #DC3C32;
      color: #fff;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      padding: 10px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      margin-top: 12px;
      letter-spacing: 0.02em;
    }
    .btn:hover { background: #28286E; }
    .btn:disabled { opacity: 0.6; cursor: default; }
    .msg {
      display: none;
      text-align: center;
      padding: 20px 10px;
    }
    .msg h3 { color: #28286E; font-size: 16px; margin-bottom: 8px; }
    .msg p  { color: #666; font-size: 13px; line-height: 1.5; }
    .err { color: #DC3C32; font-size: 12px; margin-top: 3px; display: none; }
  </style>
</head>
<body>

<div id="form-wrap">
  <h2>Request a date that works for you</h2>

  

  <div class="row">
    <label for="f-name">Your name *</label>
    <input id="f-name" type="text" autocomplete="name" placeholder="Jane Smith">
    <div class="err" id="e-name">Please enter your name</div>
  </div>

  <div class="row">
    <label for="f-email">Email *</label>
    <input id="f-email" type="email" autocomplete="email" placeholder="jane@example.com">
    <div class="err" id="e-email">Please enter a valid email</div>
  </div>

  <div class="row-2">
    <div class="row" style="margin-bottom:0">
      <label for="f-phone">Phone (optional)</label>
      <input id="f-phone" type="tel" autocomplete="tel" placeholder="778-555-0100">
    </div>
    <div class="row" style="margin-bottom:0">
      <label for="f-group">How many people?</label>
      <select id="f-group">
        <option value="1">Just me</option>
        <option value="2">2 people</option>
        <option value="3">3 people</option>
        <option value="4">4 people</option>
        <option value="5+">5 or more</option>
      </select>
    </div>
  </div>

  <div class="row" style="margin-top:10px;">
    <label for="f-when">When works for you? *</label>
    <input id="f-when" type="text" placeholder="e.g. any weekend in August, not July…">
    <div class="err" id="e-when">Please tell us when works for you</div>
  </div>

  <div class="row">
    <label for="f-notes">Anything else we should know? (optional)</label>
    <textarea id="f-notes" placeholder="Questions, special requests…"></textarea>
  </div>

  <!-- Honeypot -->
  <input type="text" id="f-pot" style="display:none;" tabindex="-1" autocomplete="off">

  <button class="btn" id="f-submit">Request a date that works for you</button>
</div>

<div class="msg" id="f-thanks">
  <h3>Thanks! We'll be in touch.</h3>
  <p>We'll review your request and get back<br>to you as soon as we can.</p>
</div>

<script>
  document.getElementById("f-submit").addEventListener("click", function() {
    var name   = document.getElementById("f-name").value.trim();
    var email  = document.getElementById("f-email").value.trim();
    var phone  = document.getElementById("f-phone").value.trim();
    var group  = document.getElementById("f-group").value;
    var when   = document.getElementById("f-when").value.trim();
    var notes  = document.getElementById("f-notes").value.trim();
    var pot    = document.getElementById("f-pot").value;

    // Validate
    var ok = true;
    document.getElementById("e-name").style.display  = name  ? "none" : "block"; if (!name)  ok = false;
    var emailOk = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email);
    document.getElementById("e-email").style.display = emailOk ? "none" : "block"; if (!emailOk) ok = false;
    document.getElementById("e-when").style.display  = when   ? "none" : "block"; if (!when)  ok = false;
    if (!ok) return;

    var btn = document.getElementById("f-submit");
    btn.disabled = true;
    btn.textContent = "Sending…";

    fetch("https://was-forms-workerjs.dave-6bf.workers.dev/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:      name,
        email:     email,
        phone:     phone,
        course:    "",
        window:    when,
        flexibility: "",
        groupSize: group,
        notes:     notes,
        source:    "modal-request-form",
        company:   pot
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ok || d.success) {
        document.getElementById("form-wrap").style.display = "none";
        document.getElementById("f-thanks").style.display  = "block";
      } else {
        btn.disabled = false;
        btn.textContent = "Request a date that works for you";
        alert("Something went wrong — please try again.");
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = "Request a date that works for you";
      alert("Could not send request — please check your connection.");
    });
  });
</script>
</body>
</html>`;

export default {
  async fetch(request) {
    return new Response(PAGE_HTML, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "access-control-allow-origin": "*"
      }
    });
  }
};


