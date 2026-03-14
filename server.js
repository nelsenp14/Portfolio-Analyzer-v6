const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const ipCalls = new Map();
let globalCalls = 0;
let resetDay = new Date().toDateString();
const PER_IP = parseInt(process.env.DAILY_LIMIT_PER_USER || "10");
const GLOBAL = parseInt(process.env.DAILY_LIMIT_GLOBAL || "500");

app.post("/api/ai", async (req, res) => {
  const today = new Date().toDateString();
  if (today !== resetDay) { ipCalls.clear(); globalCalls = 0; resetDay = today; }
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "unknown";
  const count = ipCalls.get(ip) || 0;
  if (globalCalls >= GLOBAL) return res.status(429).json({ error: "Daily limit reached. Come back tomorrow.", remaining: 0 });
  if (count >= PER_IP) return res.status(429).json({ error: "You've used your " + PER_IP + " free AI calls today.", remaining: 0 });
  ipCalls.set(ip, count + 1);
  globalCalls++;
  const remaining = PER_IP - count - 1;
  try {
    const { messages, system, mode } = req.body;
    const body = { model: "claude-sonnet-4-20250514", max_tokens: mode === "search" ? 1000 : 2048, messages };
    if (system) body.system = system;
    if (mode === "search") body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || "API error" });
    res.json({ content: data.content, remaining });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on port " + PORT));
