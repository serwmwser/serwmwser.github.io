// Воронка страницы приглашения /i/ без личных данных: случайный id гостя (g), событие, источник, язык, день.
// IP, имена и тексты сообщений не хранятся. Событие считается один раз на гостя в сутки. Данные старше 90 дней удаляются.
import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import Database from "better-sqlite3";
import { isAdmin } from "./mod.js";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS funnel_events(
  day TEXT NOT NULL, g TEXT NOT NULL, ev TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  src TEXT NOT NULL DEFAULT 'direct', lang TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL,
  PRIMARY KEY(day, g, ev, detail));
CREATE INDEX IF NOT EXISTS funnel_events_day ON funnel_events(day, ev);
`);

const DAY = 86400000, HOUR = 3600000, KEEP = 90 * DAY;
const EVENTS = ["open", "message", "feature", "signup_open", "signup_click", "signup_done"] as const;
type Ev = (typeof EVENTS)[number];
const G_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SRC_RE = /^[a-z0-9._-]{1,30}$/;
const DETAIL_RE = /^[a-z0-9_-]{1,24}$/;
const LANG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

const hits = new Map<string, number[]>();
function limited(key: string, max: number, ms: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < ms);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 20000) hits.clear();
  return false;
}
const ipOf = (req: http.IncomingMessage) => String(req.headers["x-forwarded-for"] ?? "").split(",").pop()?.trim() || req.socket.remoteAddress || "?";
function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => { n += c.length; if (n > 2048) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}

let lastPurge = 0;
function purge() {
  const now = Date.now();
  if (now - lastPurge < HOUR) return;
  lastPurge = now;
  db.prepare("DELETE FROM funnel_events WHERE created<?").run(now - KEEP);
}

/** Маршруты /api/funnel (запись без входа) и /api/funnel/summary (только администратор). */
export async function handleFunnel(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (p !== "/api/funnel" && p !== "/api/funnel/summary") return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  try {
    if (req.method === "POST" && p === "/api/funnel") {
      if (limited("fn_ip:" + ipOf(req), 300, HOUR)) return bad("slow_down", 429);
      const m = await readBody(req);
      const g = String(m.g ?? "");
      const ev = String(m.ev ?? "") as Ev;
      if (!G_RE.test(g) || !EVENTS.includes(ev)) return bad("bad_event");
      const src = SRC_RE.test(String(m.src ?? "")) ? String(m.src) : "direct";
      const detail = ev === "feature" && DETAIL_RE.test(String(m.detail ?? "")) ? String(m.detail) : "";
      const lang = LANG_RE.test(String(m.lang ?? "").toLowerCase()) ? String(m.lang).toLowerCase() : "";
      const now = Date.now();
      db.prepare("INSERT OR IGNORE INTO funnel_events(day,g,ev,detail,src,lang,created) VALUES(?,?,?,?,?,?,?)")
        .run(new Date(now).toISOString().slice(0, 10), g, ev, detail, src, lang, now);
      purge();
      return out(200, { ok: true });
    }
    if (req.method === "GET" && p === "/api/funnel/summary") {
      if (!viewer) return bad("auth", 401);
      if (!isAdmin(viewer)) return bad("forbidden", 403);
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 14));
      const from = new Date(Date.now() - (days - 1) * DAY).toISOString().slice(0, 10);
      const cnt = (ev: Ev) => `COUNT(DISTINCT CASE WHEN ev='${ev}' THEN g END)`;
      const cols = EVENTS.filter((e) => e !== "signup_open").map((e) => `${cnt(e)} AS ${e}`).join(",");
      const byDay = db.prepare(`SELECT day, ${cols} FROM funnel_events WHERE day>=? GROUP BY day ORDER BY day DESC`).all(from);
      const bySrc = db.prepare(`SELECT src, ${cols} FROM funnel_events WHERE day>=? GROUP BY src ORDER BY open DESC LIMIT 30`).all(from);
      const features = db.prepare("SELECT detail AS id, COUNT(DISTINCT g) AS n FROM funnel_events WHERE day>=? AND ev='feature' GROUP BY detail ORDER BY n DESC LIMIT 20").all(from);
      const langs = db.prepare("SELECT lang, COUNT(DISTINCT g) AS n FROM funnel_events WHERE day>=? AND ev='open' AND lang<>'' GROUP BY lang ORDER BY n DESC LIMIT 15").all(from);
      return out(200, { ok: true, days, byDay, bySrc, features, langs });
    }
    return bad("not_found", 404);
  } catch (e) {
    const msg = (e as Error).message;
    return bad(msg === "too_big" || msg === "bad_json" ? msg : "server", msg === "server" ? 500 : 400);
  }
}
