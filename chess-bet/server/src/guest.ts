// Гостевой чат по ссылке приглашения: человек без входа пишет пригласившему, тот отвечает из профиля.
// Гость идентифицируется случайным id из своего браузера (g). Ограничения: текст до 500 символов, 20 сообщений гостя в сутки.
import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import Database from "better-sqlite3";
import { translateForGuest } from "./translate.js";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS guest_threads(
  g TEXT NOT NULL, inviter TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, PRIMARY KEY(g, inviter));
CREATE TABLE IF NOT EXISTS guest_msgs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, g TEXT NOT NULL, inviter TEXT NOT NULL, side TEXT NOT NULL,
  text TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS guest_msgs_inv ON guest_msgs(inviter, g, id);
CREATE INDEX IF NOT EXISTS guest_msgs_g ON guest_msgs(g, id);
`);

const TEXT_MAX = 500;
const GUEST_DAILY = 20; // сообщений гостя в сутки
const HOUR = 3600000, DAY = 86400000, KEEP = 30 * DAY;
const G_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ADDR_RE = /^0x[0-9a-f]{40}$/;

/** index.ts подключает уведомление пригласившему: (адрес получателя, имя гостя) */
let notify: (to: string, guestName: string) => void = () => {};
export function setGuestNotify(fn: (to: string, guestName: string) => void) { notify = fn; }

const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E<>]/g, "").trim().slice(0, max);

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
    req.on("data", (c: Buffer) => { n += c.length; if (n > 8192) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}

type Row = { id: number; side: string; text: string; created: number };
const shape = (m: Row) => ({ id: m.id, side: m.side === "g" ? "guest" : "inviter", text: m.text, created: m.created });
const todayCount = (g: string) =>
  (db.prepare("SELECT COUNT(*) n FROM guest_msgs WHERE g=? AND side='g' AND created>?").get(g, Date.now() - DAY) as { n: number }).n;

// старые переписки удаляем через 30 дней
setInterval(() => {
  try {
    const t = Date.now() - KEEP;
    db.prepare("DELETE FROM guest_msgs WHERE created<?").run(t);
    db.prepare("DELETE FROM guest_threads WHERE created<? AND NOT EXISTS (SELECT 1 FROM guest_msgs m WHERE m.g=guest_threads.g AND m.inviter=guest_threads.inviter)").run(t);
  } catch (e) { console.error("guest cleanup", e); }
}, HOUR).unref();

/** Маршруты /api/guest/*. viewer = кошелёк пригласившего (из токена входа) или "" для гостя. */
export async function handleGuest(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/api/guest/")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  const q = url.searchParams;
  const ip = ipOf(req);

  try {
    // ---- со стороны гостя (без входа) ----
    if (req.method === "POST" && p === "/api/guest/translate") {
      const m = await readBody(req);
      const g = String(m.g ?? "");
      if (!G_RE.test(g)) return bad("guest");
      if (limited("gt_ip:" + ip, 200, HOUR)) return bad("slow_down", 429);
      const r = await translateForGuest(String(m.text ?? ""), String(m.to ?? ""), g);
      return r.ok ? out(200, { ok: true, text: r.text, from: r.from, same: !!r.same }) : bad(r.error, r.code);
    }
    if (req.method === "POST" && p === "/api/guest/send") {
      const m = await readBody(req);
      const g = String(m.g ?? "");
      const inviter = String(m.ref ?? "").toLowerCase();
      const text = clean(m.text, TEXT_MAX);
      if (!G_RE.test(g)) return bad("guest");
      if (!ADDR_RE.test(inviter)) return bad("ref");
      if (!text) return bad("empty");
      const user = db.prepare("SELECT addr FROM users WHERE addr=? AND banned=0").get(inviter);
      if (!user) return bad("no_inviter", 404);
      if (todayCount(g) >= GUEST_DAILY) return bad("limit", 429);
      if (limited("gs_ip:" + ip, 100, DAY) || limited("gs_inv:" + inviter, 300, DAY)) return bad("slow_down", 429);
      const name = clean(m.name, 30);
      const th = db.prepare("SELECT 1 FROM guest_threads WHERE g=? AND inviter=?").get(g, inviter);
      if (!th) {
        if (limited("gs_new:" + ip, 10, DAY)) return bad("slow_down", 429); // не больше 10 новых переписок в сутки с одного адреса
        db.prepare("INSERT INTO guest_threads(g,inviter,name,created) VALUES(?,?,?,?)").run(g, inviter, name, Date.now());
      } else if (name) {
        db.prepare("UPDATE guest_threads SET name=? WHERE g=? AND inviter=?").run(name, g, inviter);
      }
      const r = db.prepare("INSERT INTO guest_msgs(g,inviter,side,text,created) VALUES(?,?,'g',?,?)").run(g, inviter, text, Date.now());
      notify(inviter, name || "guest");
      return out(200, { ok: true, id: Number(r.lastInsertRowid), left: Math.max(0, GUEST_DAILY - todayCount(g)) });
    }
    if (req.method === "GET" && p === "/api/guest/thread") {
      const g = String(q.get("g") ?? "");
      const inviter = String(q.get("ref") ?? "").toLowerCase();
      if (!G_RE.test(g) || !ADDR_RE.test(inviter)) return bad("guest");
      if (limited("gp:" + g, 600, HOUR)) return bad("slow_down", 429); // опрос раз в 6+ секунд
      const since = Math.max(0, Number(q.get("since")) || 0);
      const rows = db.prepare("SELECT id,side,text,created FROM guest_msgs WHERE g=? AND inviter=? AND id>? ORDER BY id LIMIT 100").all(g, inviter, since) as Row[];
      return out(200, { ok: true, items: rows.map(shape), left: Math.max(0, GUEST_DAILY - todayCount(g)) });
    }

    // ---- со стороны пригласившего (нужен вход) ----
    if (!viewer) return bad("auth", 401);
    if (req.method === "GET" && p === "/api/guest/unread") {
      const n = (db.prepare("SELECT COUNT(*) n FROM guest_msgs WHERE inviter=? AND side='g' AND seen=0").get(viewer) as { n: number }).n;
      return out(200, { ok: true, n });
    }
    if (req.method === "GET" && p === "/api/guest/inbox") {
      const rows = db.prepare(`SELECT g, MAX(id) mid, SUM(CASE WHEN side='g' AND seen=0 THEN 1 ELSE 0 END) unread
        FROM guest_msgs WHERE inviter=? GROUP BY g ORDER BY mid DESC LIMIT 50`).all(viewer) as { g: string; mid: number; unread: number }[];
      const items = rows.map((r) => {
        const last = db.prepare("SELECT side,text,created FROM guest_msgs WHERE id=?").get(r.mid) as { side: string; text: string; created: number };
        const th = db.prepare("SELECT name FROM guest_threads WHERE g=? AND inviter=?").get(r.g, viewer) as { name: string } | undefined;
        return { g: r.g, name: th?.name || "", unread: r.unread, last: last.text, mine: last.side === "i", at: last.created };
      });
      return out(200, { ok: true, items });
    }
    if (req.method === "GET" && p === "/api/guest/messages") {
      const g = String(q.get("g") ?? "");
      if (!G_RE.test(g)) return bad("guest");
      const rows = db.prepare("SELECT id,side,text,created FROM guest_msgs WHERE g=? AND inviter=? ORDER BY id DESC LIMIT 200").all(g, viewer) as Row[];
      db.prepare("UPDATE guest_msgs SET seen=1 WHERE g=? AND inviter=? AND side='g' AND seen=0").run(g, viewer);
      const th = db.prepare("SELECT name FROM guest_threads WHERE g=? AND inviter=?").get(g, viewer) as { name: string } | undefined;
      return out(200, { ok: true, name: th?.name || "", items: rows.reverse().map(shape) });
    }
    if (req.method === "POST" && p === "/api/guest/reply") {
      const m = await readBody(req);
      const g = String(m.g ?? "");
      const text = clean(m.text, TEXT_MAX);
      if (!G_RE.test(g)) return bad("guest");
      if (!text) return bad("empty");
      if (!db.prepare("SELECT 1 FROM guest_threads WHERE g=? AND inviter=?").get(g, viewer)) return bad("no_thread", 404);
      if (limited("gr:" + viewer, 120, HOUR)) return bad("slow_down", 429);
      const r = db.prepare("INSERT INTO guest_msgs(g,inviter,side,text,created,seen) VALUES(?,?,'i',?,?,1)").run(g, viewer, text, Date.now());
      return out(200, { ok: true, id: Number(r.lastInsertRowid) });
    }
    return bad("not_found", 404);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "too_big") return bad("too_big", 413);
    if (msg === "bad_json") return bad("bad_json");
    console.error("guest", e);
    return bad("server", 500);
  }
}
