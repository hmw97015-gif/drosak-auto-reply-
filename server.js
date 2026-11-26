const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const DATA_FILE = process.env.DATA_FILE || "/data/replies.json";
const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;

if (!BOT_TOKEN || !ADMIN_PASSWORD || !WEBHOOK_SECRET) {
  console.error("Missing required environment variables: BOT_TOKEN, ADMIN_PASSWORD, WEBHOOK_SECRET");
  process.exit(1);
}

function ensureStore() {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ replies: [], defaultReply: "" }, null, 2));
  }
}
function readStore() {
  ensureStore();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!Array.isArray(data.replies)) data.replies = [];
    if (typeof data.defaultReply !== "string") data.defaultReply = "";
    return data;
  } catch {
    return { replies: [], defaultReply: "" };
  }
}
function writeStore(data) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Drosak Auto Reply"');
    return res.status(401).send("Login required");
  }
  let decoded = "";
  try { decoded = Buffer.from(header.slice(6), "base64").toString("utf8"); } catch {}
  const split = decoded.indexOf(":");
  const user = split >= 0 ? decoded.slice(0, split) : "";
  const pass = split >= 0 ? decoded.slice(split + 1) : "";
  if (user !== ADMIN_USER || pass !== ADMIN_PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="Drosak Auto Reply"');
    return res.status(401).send("Incorrect login");
  }
  next();
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result;
}

function normalize(s) {
  return String(s || "").trim().toLocaleLowerCase();
}

async function handleBusinessMessage(message) {
  if (!message || !message.business_connection_id || !message.chat || !message.text) return;
  if (message.from && message.from.is_bot) return;
  const text = message.text.trim();
  if (!text || text.startsWith("/")) return;

  const store = readStore();
  const found = store.replies
    .filter(r => r.enabled !== false && r.keyword && normalize(text).includes(normalize(r.keyword)))
    .sort((a, b) => normalize(b.keyword).length - normalize(a.keyword).length)[0];

  const reply = found ? found.reply : store.defaultReply;
  if (!reply || !reply.trim()) return;

  await telegram("sendMessage", {
    business_connection_id: message.business_connection_id,
    chat_id: message.chat.id,
    text: reply
  });
}

app.get("/", (_req, res) => res.send("Drosak Plus Auto Reply is running."));
app.get("/health", (_req, res) => res.json({ ok: true }));

app.post(`/telegram/webhook/${WEBHOOK_SECRET}`, async (req, res) => {
  if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  res.sendStatus(200);
  try {
    const update = req.body || {};
    if (update.business_message) await handleBusinessMessage(update.business_message);
    // business_connection updates are delivered too; no action is needed here.
  } catch (err) {
    console.error("Update handling error:", err.message);
  }
});

app.use("/admin", adminAuth);
app.use("/api", adminAuth);
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/api/replies", (_req, res) => res.json(readStore()));
app.put("/api/replies", (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.replies)) return res.status(400).json({ error: "replies must be an array" });
  const replies = body.replies.map(r => ({
    id: String(r.id || Date.now() + Math.random().toString(16).slice(2)),
    keyword: String(r.keyword || "").trim().slice(0, 100),
    reply: String(r.reply || "").trim().slice(0, 4000),
    enabled: r.enabled !== false
  })).filter(r => r.keyword && r.reply);
  const defaultReply = String(body.defaultReply || "").trim().slice(0, 4000);
  const store = { replies, defaultReply };
  writeStore(store);
  res.json({ ok: true, count: replies.length });
});

app.listen(PORT, async () => {
  console.log(`Auto reply server listening on ${PORT}`);
  ensureStore();
  if (PUBLIC_DOMAIN) {
    const url = `https://${PUBLIC_DOMAIN}/telegram/webhook/${WEBHOOK_SECRET}`;
    try {
      await telegram("setWebhook", {
        url,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["business_message", "business_connection"]
      });
      console.log("Telegram webhook configured.");
    } catch (err) {
      console.error("Could not configure Telegram webhook:", err.message);
    }
  } else {
    console.warn("RAILWAY_PUBLIC_DOMAIN is not set; configure a Railway public domain and redeploy.");
  }
});

process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", err => console.error(err));
