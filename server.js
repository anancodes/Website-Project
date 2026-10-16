const express = require("express");
const crypto = require("crypto");
const { HacSession, BASE_URL } = require("./hac-client");
const { parseClasswork } = require("./services/parseClasswork");
const { mapToGradeway } = require("./services/mapToGradeway");
const { parseSchedule } = require("./services/parseSchedule");
const { parseMonthlyHtml } = require("./services/parseAttendance");

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static("public"));

const sessionStore = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 6;

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getTokenFromRequest(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/gradewaySession=([a-f0-9]+)/);
  return match ? match[1] : null;
}

async function resolveSession(req, res) {
  const existingToken = getTokenFromRequest(req);
  const cached = existingToken ? sessionStore.get(existingToken) : null;

  if (cached && Date.now() < cached.expiresAt) {
    return { session: cached.session, token: existingToken, usedCache: true };
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(401).json({ error: "auth_required", message: "HAC login required." });
    return null;
  }

  const session = new HacSession();
  await session.login(username, password);
  const token = generateToken();
  sessionStore.set(token, { session, expiresAt: Date.now() + SESSION_TTL_MS });
  return { session, token, usedCache: false };
}

function handleExpiredSession(res, expired, usedCache, existingToken) {
  if (!expired) return false;
  if (usedCache) {
    sessionStore.delete(existingToken);
    res.status(401).json({
      error: "auth_required",
      message: "Your HAC session expired — please log in again.",
    });
  } else {
    res.status(502).json({ error: "hac_error", message: "HAC rejected the login unexpectedly." });
  }
  return true;
}

function setSessionCookie(res, token) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `gradewaySession=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Strict${secureFlag}`
  );
}

async function fetchClassworkHtml(session) {
  const parentRes = await session.fetch("/Classes/Classwork");
  if (parentRes.url.toLowerCase().includes("logon")) return { expired: true, html: null };

  const assignRes = await session.fetch("/Content/Student/Assignments.aspx", {
    headers: { Referer: `${BASE_URL}/Classes/Classwork` },
  });
  if (assignRes.url.toLowerCase().includes("logon")) return { expired: true, html: null };

  return { expired: false, html: await assignRes.text() };
}

async function fetchScheduleHtml(session) {
  const parentRes = await session.fetch("/Classes/Schedule");
  if (parentRes.url.toLowerCase().includes("logon")) return { expired: true, html: null };

  const scheduleRes = await session.fetch("/Content/Student/Classes.aspx", {
    headers: { Referer: `${BASE_URL}/Classes/Schedule` },
  });
  if (scheduleRes.url.toLowerCase().includes("logon")) return { expired: true, html: null };

  return { expired: false, html: await scheduleRes.text() };
}

function extractHiddenFieldsFromHtml(html) {
  const cheerio = require("cheerio");
  const $ = cheerio.load(html);
  const fields = {};
  $('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr("name");
    if (name) fields[name] = $(el).attr("value") || "";
  });
  return fields;
}

function findPreviousMonthArgInHtml(html) {
  const cheerio = require("cheerio");
  const $ = cheerio.load(html);
  const link = $('a[title*="previous month" i]').first();
  if (!link.length) return null;
  const href = link.attr("href") || "";
  const match = href.match(/__doPostBack\('([^']+)','([^']*)'\)/);
  return match ? { target: match[1], argument: match[2] } : null;
}

app.post("/api/sync", async (req, res) => {
  try {
    const resolved = await resolveSession(req, res);
    if (!resolved) return;
    const { session, token, usedCache } = resolved;

    const { expired, html } = await fetchClassworkHtml(session);
    if (handleExpiredSession(res, expired, usedCache, token)) return;

    const mapped = mapToGradeway(parseClasswork(html));
    if (!usedCache) setSessionCookie(res, token);
    res.json(mapped);
  } catch (err) {
    console.error("Sync error:", err.message);
    res.status(500).json({ error: "sync_failed", message: err.message });
  }
});

app.post("/api/sync-schedule", async (req, res) => {
  try {
    const resolved = await resolveSession(req, res);
    if (!resolved) return;
    const { session, token, usedCache } = resolved;

    const { expired, html } = await fetchScheduleHtml(session);
    if (handleExpiredSession(res, expired, usedCache, token)) return;

    const schedule = parseSchedule(html);
    if (!usedCache) setSessionCookie(res, token);
    res.json(schedule);
  } catch (err) {
    console.error("Schedule sync error:", err.message);
    res.status(500).json({ error: "sync_failed", message: err.message });
  }
});

app.post("/api/sync-attendance", async (req, res) => {
  try {
    const resolved = await resolveSession(req, res);
    if (!resolved) return;
    const { session, token, usedCache } = resolved;

    const parentRes = await session.fetch("/Attendance/MonthView");
    if (parentRes.url.toLowerCase().includes("logon")) {
      if (handleExpiredSession(res, true, usedCache, token)) return;
    }

    const currentUrl = "/Content/Attendance/MonthlyView.aspx";
    let response = await session.fetch(currentUrl, {
      headers: { Referer: `${BASE_URL}/Attendance/MonthView` },
    });
    if (response.url.toLowerCase().includes("logon")) {
      if (handleExpiredSession(res, true, usedCache, token)) return;
    }

    const MAX_MONTHS = 15;
    let html = await response.text();
    const allFlagged = [];

    for (let i = 0; i < MAX_MONTHS; i++) {
      const monthFlagged = parseMonthlyHtml(html);
      if (monthFlagged && monthFlagged.length) {
        allFlagged.push(...monthFlagged);
      }

      const prev = findPreviousMonthArgInHtml(html);
      if (!prev) break;

      const fields = extractHiddenFieldsFromHtml(html);
      fields["__EVENTTARGET"] = prev.target;
      fields["__EVENTARGUMENT"] = prev.argument;
      const form = new URLSearchParams(fields);

      response = await session.fetch(currentUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `${BASE_URL}${currentUrl}`,
        },
        body: form.toString(),
      });

      if (response.url.toLowerCase().includes("logon")) {
        if (handleExpiredSession(res, true, usedCache, token)) return;
        break;
      }

      html = await response.text();
    }

    const seen = new Set();
    const deduped = [];
    for (const r of allFlagged) {
      const key = `${r.monthLabel}|${r.day}|${r.code || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(r);
      }
    }

    if (!usedCache) setSessionCookie(res, token);
    res.json(deduped);
  } catch (err) {
    console.error("Attendance sync error:", err && err.message ? err.message : err);
    res.status(500).json({ error: "sync_failed", message: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gradeway running at http://localhost:${PORT}`);
});
