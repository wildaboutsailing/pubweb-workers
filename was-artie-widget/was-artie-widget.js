var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// was-artie.js
var ALLOWED_ORIGINS = [
  "https://wildaboutsailing.com",
  "https://www.wildaboutsailing.com",
  "https://learntosail.wildaboutsailing.com",
  "https://discover.wildaboutsailing.com",
  "https://women.wildaboutsailing.com",
  "https://navigation.wildaboutsailing.com",
  "https://artie-test.wildaboutsailing.com",
  "https://artie.wildaboutsailing.com"
];
var MODEL = "claude-haiku-4-5-20251001";
var MAX_TOKENS = 450;
var MAX_TURNS = 24;
var RATE_LIMIT = 30;
var RATE_WINDOW = 3600;
var KB_TTL = 600;
var SCHED_TTL = 300;
var LOG_TTL = 259200;
var DIGEST_FROM = "noreply@wildaboutsailing.com";
var DIGEST_TO = "dave@wildaboutsailing.com";
var QUO_API = "https://api.openphone.com/v1/messages";
var CORSIZIO_BASE = "https://api.corsizio.com/v1";
var CORSIZIO_MAX_PAGES = 5;
var SYSTEM_PROMPT = `You are "First Mate Artie," the friendly AI assistant for Wild About Sailing (WAS), a Sail Canada-accredited sailing school at Canoe Cove Marina, North Saanich BC.

VOICE: Warm, encouraging, lightly nautical but never corny. Keep replies short \u2014 usually 2-4 sentences, sized for a small chat window. You are a knowledgeable first mate, not a salesperson.

FORMAT: The chat window is small, so keep answers brief and easy to skim. You may use **bold** sparingly and [label](url) for links (the chat renders them as clean clickable links). Never paste long bare URLs \u2014 always wrap them as a short label like [Register](url). Avoid long lists or walls of text; don't dump every option at once.

HUMOR: Your knowledge includes a sheet of family-rated pirate, sailor, and dad jokes. A light, well-timed joke suits the WAS spirit, but humor is seasoning, not the meal:
- Help first \u2014 a short joke can follow a useful answer, never replace it, and never before you've been useful.
- Keep it rare: an occasional one-liner at most, never two in a row; most replies have none.
- Good moments: when someone asks for a joke, when the visitor is clearly being playful, or as a light sign-off once you've already helped them.
- Stay straight-faced when the visitor seems frustrated or confused, is comparing prices, or is asking about cancellations, refunds, safety, or accessibility \u2014 and never joke while handing off to a human.
- Draw from the joke sheet so they stay vetted and family-rated; vary them and keep them short. If in doubt, skip it.

YOU HELP WITH: course options (Discover Sailing, Learn to Sail, Learn to Skipper, Women's Learn to Sail, 2SLGBTQIA+ Learn to Sail, Custom Coaching), what to expect on the water, what to bring, accommodation, getting to the marina, dates, prices, availability, and how to register.

HARD RULES:
- You MAY share specific dates, times, prices, and availability \u2014 but ONLY from the CURRENT SCHEDULE block. Never invent, estimate, or guess them. If a course or session isn't in the schedule, say it isn't currently listed and point them to the registration page.
- When you share a session, give its Register link as a short [Register](url) link, never the bare URL. If several sessions are open, mention just the next one or two, then say more dates are available and offer to list the rest \u2014 don't paste them all at once.
- A session marked SOLD OUT / registration CLOSED is NOT open for sign-up. Never give it a Register link and never tell the visitor to register for it. You may let them know it's full and offer to connect them with Dave or Annalise about a waitlist, or point them to the next open session instead.
- Availability can change quickly and the schedule may be a few minutes old, so encourage booking promptly and note the registration page is the final word on spots.
- For general course info (what to bring, what to expect, accommodation), use the KNOWLEDGE block.
- If you don't know something, say so plainly and offer to connect them with Dave or Annalise.
- If the visitor wants to talk to a person, asks something you can't answer, or seems frustrated, end your reply with the token <<HANDOFF>> on its own line. When you do, keep that reply to a short, warm hand-off line (e.g. "Let me get you connected with Dave or Annalise.") \u2014 do NOT print phone numbers, email addresses, or other contact details yourself; the chat shows the visitor those contact options automatically.
- Stay welcoming and safe; you may be talking with beginners or with parents asking for kids.`;
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) }
  });
}
__name(json, "json");
async function getKnowledge(env) {
  try {
    const c = await env.RATE_KV.get("artie_knowledge");
    if (c) return c;
  } catch (e) {
    console.log("KB read err", e);
  }
  if (!env.KNOWLEDGE_URL) return "";
  try {
    const r = await fetch(env.KNOWLEDGE_URL);
    if (!r.ok) return "";
    const t = await r.text();
    try {
      await env.RATE_KV.put("artie_knowledge", t, { expirationTtl: KB_TTL });
    } catch (e) {
    }
    return t;
  } catch (e) {
    console.log("KB fetch err", e);
    return "";
  }
}
__name(getKnowledge, "getKnowledge");
async function fetchCorsizioEvents(env) {
  const key = env.CORSIZIO_API_KEY;
  if (!key) return [];
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const all = [];
  for (let page = 1; page <= CORSIZIO_MAX_PAGES; page++) {
    const url = CORSIZIO_BASE + "/events?status=published&order=startDate&date=" + today + ":&limit=100&page=" + page + "&include=details,stats&expand=instructors";
    const r = await fetch(url, { headers: { Authorization: "Bearer " + key } });
    if (!r.ok) {
      console.log("Corsizio", r.status, (await r.text()).slice(0, 200));
      break;
    }
    const data = await r.json();
    const list = data.list || [];
    for (let i = 0; i < list.length; i++) all.push(list[i]);
    if (!data.paging || !data.paging.more) break;
  }
  return all;
}
__name(fetchCorsizioEvents, "fetchCorsizioEvents");
function getRegistered(ev) {
  const s = ev.stats || {};
  return typeof s.attendees === "number" ? s.attendees : null;
}
__name(getRegistered, "getRegistered");
function formatSchedule(events) {
  const now = Date.now();
  const open = events.filter(
    (e) => e && e.status === "published" && (!e.registrationCloseDate || new Date(e.registrationCloseDate).getTime() > now)
  );
  if (open.length === 0) return "No sessions are currently open for registration. Direct people to the registration page.";
  open.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return open.map((e) => {
    const reg = getRegistered(e);
    const max = typeof e.maxSpots === "number" ? e.maxSpots : null;
    const sold = e.stats && e.stats.soldout || max != null && reg != null && reg >= max;
    const cur = (e.currency || "").toUpperCase();
    const price = e.priceFrom === e.priceTo ? `$${e.priceFrom} ${cur}` : `$${e.priceFrom}\u2013$${e.priceTo} ${cur}`;
    if (sold) {
      return `- ${e.name} | ${e.displayDate} | ${price} | SOLD OUT \u2014 registration CLOSED (no register link; offer a waitlist via hand-off instead)`;
    }
    const avail = max != null && reg != null ? `${max - reg} of ${max} spots left` : max != null ? `up to ${max} spots` : "spots available";
    return `- ${e.name} | ${e.displayDate} | ${price} | ${avail} | Register: ${e.formUrl}`;
  }).join("\n");
}
__name(formatSchedule, "formatSchedule");
function matchingScheduleLines(scheduleText, ctx) {
  if (!ctx || !scheduleText) return [];
  var norm = /* @__PURE__ */ __name(function(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }, "norm");
  var needle = norm(ctx);
  if (!needle) return [];
  return scheduleText.split("\n").filter(function(line) {
    if (line.charAt(0) !== "-") return false;
    var name = norm(line.replace(/^-\s*/, "").split(" | ")[0]);
    return name && (name.indexOf(needle) !== -1 || needle.indexOf(name) !== -1);
  });
}
__name(matchingScheduleLines, "matchingScheduleLines");
async function getSchedule(env) {
  try {
    const c = await env.RATE_KV.get("artie_schedule");
    if (c) return c;
  } catch (e) {
    console.log("sched read err", e);
  }
  try {
    const events = await fetchCorsizioEvents(env);
    const text = formatSchedule(events);
    try {
      await env.RATE_KV.put("artie_schedule", text, { expirationTtl: SCHED_TTL });
    } catch (e) {
    }
    return text;
  } catch (e) {
    console.log("sched err", e);
    return "";
  }
}
__name(getSchedule, "getSchedule");
function scrubPII(s) {
  return String(s == null ? "" : s).replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "[email]").replace(/\+?\d[\d\s().\-]{7,}\d/g, "[phone]").slice(0, 300);
}
__name(scrubPII, "scrubPII");
function pacificDateKey(d) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch (e) {
    return d.toISOString().slice(0, 10);
  }
}
__name(pacificDateKey, "pacificDateKey");
async function summarizeDay(env, dayKey, entries) {
  let handoffs = 0;
  const lines = entries.map(function(e) {
    if (e.handoff) handoffs++;
    return "- [" + (e.tag || "?") + (e.page ? " | " + e.page : "") + "] Q: " + e.q + " | A: " + e.a;
  }).join("\n").slice(0, 12e3);
  const prompt = "You are writing a short internal digest of one day of ANONYMOUS visitor chats with Artie, the chat assistant for Wild About Sailing (a sailing school). It is for the owner's eyes only.\n\nSTRICT: aggregate only. Never include names, emails, phone numbers, or any identifying detail; no verbatim quotes that could identify a person. If an entry contains such a detail, ignore that detail.\n\nWrite scannable plain text, under ~300 words, covering:\n1. Volume + a one-line read on the day.\n2. Top 3-5 topics people asked about.\n3. Most common or notable questions (paraphrased).\n4. Hand-off rate and what seemed to drive people to want a human.\n5. KNOWLEDGE GAPS - questions Artie answered poorly or couldn't answer, i.e. what to add to the knowledge Doc. Be specific; this is the most useful section.\n\nDate: " + dayKey + ". Totals: " + entries.length + " chats, " + handoffs + " hand-offs.\n\nENTRIES:\n" + lines;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: "user", content: prompt }] })
    });
    if (!r.ok) return "Summary call failed (" + r.status + "). Totals: " + entries.length + " chats, " + handoffs + " hand-offs.";
    const data = await r.json();
    const text = (data.content || []).filter(function(b) {
      return b.type === "text";
    }).map(function(b) {
      return b.text;
    }).join("\n").trim();
    return text || "Totals: " + entries.length + " chats, " + handoffs + " hand-offs.";
  } catch (e) {
    return "Summary error. Totals: " + entries.length + " chats, " + handoffs + " hand-offs.";
  }
}
__name(summarizeDay, "summarizeDay");
async function runDailyDigest(env, dayKeyOverride) {
  if (!env.BREVO_API_KEY) {
    console.log("digest: BREVO_API_KEY not set");
    return;
  }
  const dayKey = dayKeyOverride || pacificDateKey(new Date(Date.now() - 24 * 3600 * 1e3));
  const entries = [];
  let cursor, pages = 0;
  do {
    const res = await env.RATE_KV.list({ prefix: "log:" + dayKey + ":", cursor });
    for (let i = 0; i < res.keys.length; i++) {
      try {
        const v = await env.RATE_KV.get(res.keys[i].name);
        if (v) entries.push(JSON.parse(v));
      } catch (e) {
      }
    }
    cursor = res.list_complete ? null : res.cursor;
    pages++;
  } while (cursor && pages < 10);
  const subject = "Artie daily digest \u2014 " + dayKey + " (" + entries.length + " chats)";
  const body = entries.length === 0 ? "No visitor chats were logged for " + dayKey + "." : await summarizeDay(env, dayKey, entries);
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({
        sender: { name: "Artie Digest", email: DIGEST_FROM },
        to: [{ email: DIGEST_TO }],
        subject,
        textContent: body
      })
    });
    if (!r.ok) console.log("Brevo send failed", r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.log("digest send err", e);
  }
}
__name(runDailyDigest, "runDailyDigest");
var was_artie_default = {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== "POST") return new Response("Not found", { status: 404 });
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400, origin);
    }
    if (body && body.lead) {
      ctx.waitUntil(handleLead(env, body.lead).catch((e) => console.log("lead error", e)));
      return json({ ok: true }, 200, origin);
    }
    if (body && body.digestNow) {
      if (body.secret !== env.SHARED_SECRET) return json({ error: "forbidden" }, 403, origin);
      const day = body.day === "today" ? pacificDateKey(/* @__PURE__ */ new Date()) : typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : void 0;
      ctx.waitUntil(runDailyDigest(env, day));
      return json({ ok: true, ran: "digest", day: day || "yesterday (default)" }, 200, origin);
    }
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    try {
      const key = `rl:${ip}`;
      const current = parseInt(await env.RATE_KV.get(key) || "0", 10);
      if (current >= RATE_LIMIT) {
        return json({ reply: "I'm fielding a lot of questions right now \u2014 please email annalise@wildaboutsailing.com and we'll get right back to you.", handoff: false }, 429, origin);
      }
      ctx.waitUntil(env.RATE_KV.put(key, String(current + 1), { expirationTtl: RATE_WINDOW }));
    } catch (e) {
      console.log("RATE_KV error:", e);
    }
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    if (incoming.length === 0) return json({ error: "no messages" }, 400, origin);
    if (incoming.length > MAX_TURNS) return json({ reply: "We've covered a lot together! For anything more, leave your number below and a human will text you back.", handoff: true }, 200, origin);
    const messages = incoming.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m) => ({ role: m.role, content: m.content.slice(0, 4e3) }));
    if (messages.length === 0) return json({ error: "no messages" }, 400, origin);
    const pageContext = typeof body.pageContext === "string" && body.pageContext.trim() ? body.pageContext.trim().slice(0, 200) : "";
    const [knowledge, schedule] = await Promise.all([getKnowledge(env), getSchedule(env)]);
    const cachedBlock = SYSTEM_PROMPT + "\n\nKNOWLEDGE:\n" + (knowledge || "(knowledge temporarily unavailable \u2014 offer to connect them with Dave or Annalise)");
    let contextLine = "";
    if (pageContext) {
      const hits = matchingScheduleLines(schedule, pageContext);
      const focus = hits.length ? "MATCHING SESSION(S) for this page \u2014 lead with these:\n" + hits.join("\n") + "\n\n" : "";
      contextLine = 'PAGE CONTEXT: The visitor is on the "' + pageContext + `" page, so that course is almost certainly what they're asking about. When they ask about courses, dates, price, or availability without naming a different course, answer about "` + pageContext + '" FIRST \u2014 do not default to the next thing on the calendar. Only bring up other courses if they ask to compare, or if this one has nothing open (then say so and offer the nearest alternative). Still answer any specific question they actually ask.\n' + focus;
    }
    const scheduleBlock = contextLine + "CURRENT SCHEDULE \u2014 live from Corsizio, may be a few minutes out of date. The registration page is always the final word on availability and booking.\n" + (schedule || "(Live schedule temporarily unavailable \u2014 direct people to the registration page for current dates and prices.)");
    let replyText = "";
    try {
      const ar = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: [
            { type: "text", text: cachedBlock, cache_control: { type: "ephemeral" } },
            { type: "text", text: scheduleBlock }
          ],
          messages
        })
      });
      if (!ar.ok) {
        console.log("Anthropic error", ar.status, await ar.text());
        return json({ reply: "Sorry \u2014 I hit a snag. Leave your number below and we'll text you directly.", handoff: true }, 200, origin);
      }
      const data = await ar.json();
      replyText = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    } catch (e) {
      console.log("fetch error", e);
      return json({ reply: "Sorry \u2014 connection trouble on my end. Leave your number below and we'll reach out.", handoff: true }, 200, origin);
    }
    let handoff = false;
    if (replyText.includes("<<HANDOFF>>")) {
      handoff = true;
      replyText = replyText.replace(/<<HANDOFF>>/g, "").trim();
    }
    try {
      let lastUserMsg = "";
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserMsg = messages[i].content;
          break;
        }
      }
      const tag = handoff ? "handoff" : /corsizio\.com\/register|spots?\s+left|sold\s*out/i.test(replyText) ? "schedule" : /isn't currently listed|not currently listed|can't answer|don't know|not sure/i.test(replyText) ? "unanswered" : "answered";
      const entry = {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        page: pageContext || "",
        q: scrubPII(lastUserMsg),
        a: scrubPII(replyText),
        tag,
        handoff
      };
      const logKey = "log:" + pacificDateKey(/* @__PURE__ */ new Date()) + ":" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      ctx.waitUntil(env.RATE_KV.put(logKey, JSON.stringify(entry), { expirationTtl: LOG_TTL }));
    } catch (e) {
      console.log("log err", e);
    }
    return json({ reply: replyText, handoff }, 200, origin);
  },
  // Cron Trigger (set in wrangler.toml). Builds yesterday's digest and emails it.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyDigest(env));
  }
};
async function handleLead(env, lead) {
  const name = (lead.name || "A website visitor").slice(0, 80);
  const phone = (lead.phone || "").slice(0, 30);
  const email = (lead.email || "").slice(0, 120);
  const method = (lead.method || "").slice(0, 20);
  const summary = (lead.summary || "").slice(0, 300);
  const transcript = (lead.transcript || "").slice(0, 4e3);
  if (method !== "email" && phone && env.QUO_API_KEY && env.QUO_FROM && env.TEAM_NUMBERS) {
    const team = env.TEAM_NUMBERS.split(",").map((s) => s.trim()).filter(Boolean);
    const content = `\u26F5 New WAS lead \u2014 wants a call/text ASAP: ${name} (${phone}). Asked: "${summary}". Reply in Quo \u2014 see email for the one-tap link.`;
    await Promise.all(team.map(async (num) => {
      try {
        const r = await fetch(QUO_API, {
          method: "POST",
          headers: { "Authorization": env.QUO_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({ from: env.QUO_FROM, to: [num], content })
        });
        if (!r.ok) console.log("Quo send failed", num, r.status, (await r.text()).slice(0, 300));
      } catch (e) {
        console.log("Quo send error", num, e);
      }
    }));
  }
  if (env.APPS_SCRIPT_URL) {
    const digits = phone.replace(/[^0-9+]/g, "");
    const greeting = encodeURIComponent(`Hi ${lead.name || "there"}, this is Wild About Sailing following up on your chat with Artie.`);
    const quoLink = digits ? `openphone://message?number=${digits}&text=${greeting}` : "";
    await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: env.SHARED_SECRET,
        source: method === "email" ? "Artie chat handoff (email follow-up)" : "Artie chat handoff (call/text ASAP)",
        name,
        email,
        phone,
        method,
        notes: transcript,
        quoLink
      })
    });
  }
}
__name(handleLead, "handleLead");
export {
  was_artie_default as default
};
//# sourceMappingURL=was-artie.js.map
