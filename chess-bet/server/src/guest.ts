// Гостевой чат по ссылке приглашения: человек без входа пишет пригласившему, тот отвечает из профиля.
// Гость идентифицируется случайным id из своего браузера (g). Ограничения: текст до 500 символов, 20 сообщений гостя в сутки.
// Пригласивший в ссылке задаётся ником (/i/?u=ник) или адресом кошелька (старые ссылки ?ref=0x…).
// После регистрации гостя его переписка переносится в личные сообщения (POST /api/guest/claim).
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
CREATE TABLE IF NOT EXISTS guest_reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT NOT NULL, g TEXT NOT NULL, inviter TEXT NOT NULL,
  msg INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guest_nicks(
  name TEXT PRIMARY KEY, addr TEXT NOT NULL, seen INTEGER NOT NULL);
`);
// миграция: блокировка гостя пригласившим
const hasCol = (t: string, c: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((r) => r.name === c);
if (!hasCol("guest_threads", "blocked")) db.exec("ALTER TABLE guest_threads ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0");

const TEXT_MAX = 500;
const GUEST_DAILY = 20; // сообщений гостя в сутки
const HOUR = 3600000, DAY = 86400000, KEEP = 30 * DAY;
const G_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ADDR_RE = /^0x[0-9a-f]{40}$/;
const NAME_RE = /^[\p{L}\p{N}_.-]{2,32}$/u;

/** index.ts подключает уведомление пригласившему: (адрес получателя, имя гостя) */
let notify: (to: string, guestName: string) => void = () => {};
export function setGuestNotify(fn: (to: string, guestName: string) => void) { notify = fn; }

const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮<>]/g, "").trim().slice(0, max);

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

type Inv = { addr: string; name: string };

/** Запоминает ник пользователя: после смены ника старая ссылка продолжает вести к нему */
function rememberNick(addr: string, name: string) {
  const n = String(name || "").trim().toLowerCase();
  if (!n || !NAME_RE.test(n)) return;
  try { db.prepare("INSERT INTO guest_nicks(name,addr,seen) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET addr=excluded.addr, seen=excluded.seen").run(n, addr, Date.now()); }
  catch (e) { console.error("guest nick", e); }
}

/** Пригласивший по нику или адресу: возвращает адрес и текущий ник или null.
 *  Ник ищется без учёта регистра; прежние ники (запомненные и автоматические вида u + 8 символов адреса) тоже находят пользователя. */
function resolveInviter(refIn: unknown): Inv | null {
  const r = String(refIn ?? "").trim().toLowerCase();
  if (ADDR_RE.test(r)) return (db.prepare("SELECT addr,name FROM users WHERE addr=? AND banned=0").get(r) as Inv | undefined) ?? null;
  if (!NAME_RE.test(r)) return null;
  const cur = db.prepare("SELECT addr,name FROM users WHERE lower(name)=? AND banned=0").get(r) as Inv | undefined;
  if (cur) { rememberNick(cur.addr, cur.name); return cur; }
  const old = db.prepare("SELECT u.addr addr, u.name name FROM guest_nicks n JOIN users u ON u.addr=n.addr WHERE n.name=? AND u.banned=0").get(r) as Inv | undefined;
  if (old) return old;
  const auto = /^u([0-9a-f]{8})$/.exec(r); // автоматический ник: u + первые 8 символов адреса
  if (auto) {
    const rows = db.prepare("SELECT addr,name FROM users WHERE addr LIKE ? AND banned=0 LIMIT 2").all("0x" + auto[1] + "%") as Inv[];
    if (rows.length === 1) return rows[0];
  }
  return null;
}

type Row = { id: number; side: string; text: string; created: number; seen: number };
const shape = (m: Row) => ({ id: m.id, side: m.side === "g" ? "guest" : "inviter", text: m.text, created: m.created, read: !!m.seen });
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
    if (req.method === "GET" && p === "/api/guest/inviter") { // кто пригласил: ник в адрес (для реферальной привязки)
      if (limited("gi_ip:" + ip, 120, HOUR)) return bad("slow_down", 429);
      const u = resolveInviter(q.get("u"));
      return u ? out(200, { ok: true, name: u.name, addr: u.addr }) : bad("no_inviter", 404);
    }
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
      const text = clean(m.text, TEXT_MAX);
      if (!G_RE.test(g)) return bad("guest");
      if (!String(m.ref ?? "").trim()) return bad("ref");
      if (!text) return bad("empty");
      const inv = resolveInviter(m.ref);
      if (!inv) return bad("no_inviter", 404);
      const inviter = inv.addr;
      const th = db.prepare("SELECT blocked FROM guest_threads WHERE g=? AND inviter=?").get(g, inviter) as { blocked: number } | undefined;
      if (th?.blocked) return bad("blocked", 403);
      if (todayCount(g) >= GUEST_DAILY) return bad("limit", 429);
      if (limited("gs_ip:" + ip, 100, DAY) || limited("gs_inv:" + inviter, 300, DAY)) return bad("slow_down", 429);
      const name = clean(m.name, 30);
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
      const inv = resolveInviter(q.get("ref"));
      if (!G_RE.test(g) || !inv) return bad("guest");
      if (limited("gp:" + g, 600, HOUR)) return bad("slow_down", 429); // опрос раз в 6+ секунд
      const since = Math.max(0, Number(q.get("since")) || 0);
      const rows = db.prepare("SELECT id,side,text,created,seen FROM guest_msgs WHERE g=? AND inviter=? AND id>? ORDER BY id LIMIT 100").all(g, inv.addr, since) as Row[];
      const th = db.prepare("SELECT blocked FROM guest_threads WHERE g=? AND inviter=?").get(g, inv.addr) as { blocked: number } | undefined;
      return out(200, { ok: true, items: rows.map(shape), left: Math.max(0, GUEST_DAILY - todayCount(g)), blocked: !!th?.blocked });
    }
    if (req.method === "POST" && p === "/api/guest/delete") { // гость удаляет своё сообщение
      const m = await readBody(req);
      const g = String(m.g ?? "");
      const id = Number(m.id);
      if (!G_RE.test(g) || !Number.isInteger(id)) return bad("guest");
      if (limited("gd:" + g, 60, HOUR)) return bad("slow_down", 429);
      const r = db.prepare("DELETE FROM guest_msgs WHERE id=? AND g=? AND side='g'").run(id, g);
      return out(200, { ok: true, removed: r.changes > 0 });
    }
    if (req.method === "POST" && p === "/api/guest/report") { // гость жалуется на сообщение пригласившего
      const m = await readBody(req);
      const g = String(m.g ?? "");
      const id = Number(m.id);
      if (!G_RE.test(g) || !Number.isInteger(id)) return bad("guest");
      if (limited("grp:" + g, 10, DAY)) return bad("slow_down", 429);
      const row = db.prepare("SELECT inviter FROM guest_msgs WHERE id=? AND g=? AND side='i'").get(id, g) as { inviter: string } | undefined;
      if (!row) return bad("no_message", 404);
      db.prepare("INSERT INTO guest_reports(reporter,g,inviter,msg,reason,created) VALUES(?,?,?,?,?,?)").run("guest:" + g, g, row.inviter, id, clean(m.reason, 200), Date.now());
      return out(200, { ok: true });
    }

    // ---- со стороны пригласившего (нужен вход) ----
    if (!viewer) return bad("auth", 401);
    if (req.method === "GET" && p === "/api/guest/unread") {
      const n = (db.prepare("SELECT COUNT(*) n FROM guest_msgs WHERE inviter=? AND side='g' AND seen=0").get(viewer) as { n: number }).n;
      return out(200, { ok: true, n });
    }
    if (req.method === "GET" && p === "/api/guest/inbox") {
      const me = db.prepare("SELECT name FROM users WHERE addr=?").get(viewer) as { name: string } | undefined;
      if (me) rememberNick(viewer, me.name); // пригласивший открыл блок гостей: его ник запоминается
      const rows = db.prepare(`SELECT g, MAX(id) mid, SUM(CASE WHEN side='g' AND seen=0 THEN 1 ELSE 0 END) unread
        FROM guest_msgs WHERE inviter=? GROUP BY g ORDER BY mid DESC LIMIT 50`).all(viewer) as { g: string; mid: number; unread: number }[];
      const items = rows.map((r) => {
        const last = db.prepare("SELECT side,text,created FROM guest_msgs WHERE id=?").get(r.mid) as { side: string; text: string; created: number };
        const th = db.prepare("SELECT name,blocked FROM guest_threads WHERE g=? AND inviter=?").get(r.g, viewer) as { name: string; blocked: number } | undefined;
        return { g: r.g, name: th?.name || "", unread: r.unread, last: last.text, mine: last.side === "i", at: last.created, blocked: !!th?.blocked };
      });
      return out(200, { ok: true, items });
    }
    if (req.method === "GET" && p === "/api/guest/messages") {
      const g = String(q.get("g") ?? "");
      if (!G_RE.test(g)) return bad("guest");
      const rows = db.prepare("SELECT id,side,text,created,seen FROM guest_msgs WHERE g=? AND inviter=? ORDER BY id DESC LIMIT 200").all(g, viewer) as Row[];
      db.prepare("UPDATE guest_msgs SET seen=1 WHERE g=? AND inviter=? AND side='g' AND seen=0").run(g, viewer);
      const th = db.prepare("SELECT name,blocked FROM guest_threads WHERE g=? AND inviter=?").get(g, viewer) as { name: string; blocked: number } | undefined;
      return out(200, { ok: true, name: th?.name || "", blocked: !!th?.blocked, items: rows.reverse().map(shape) });
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
    if (req.method === "POST" && p === "/api/guest/remove") { // пригласивший удаляет любое сообщение своей переписки с гостем
      const m = await readBody(req);
      const id = Number(m.id);
      if (!Number.isInteger(id)) return bad("bad_id");
      const r = db.prepare("DELETE FROM guest_msgs WHERE id=? AND inviter=?").run(id, viewer);
      return out(200, { ok: true, removed: r.changes > 0 });
    }
    if (req.method === "POST" && p === "/api/guest/flag") { // пригласивший жалуется на сообщение гостя
      const m = await readBody(req);
      const id = Number(m.id);
      if (!Number.isInteger(id)) return bad("bad_id");
      if (limited("gf:" + viewer, 20, DAY)) return bad("slow_down", 429);
      const row = db.prepare("SELECT g FROM guest_msgs WHERE id=? AND inviter=? AND side='g'").get(id, viewer) as { g: string } | undefined;
      if (!row) return bad("no_message", 404);
      db.prepare("INSERT INTO guest_reports(reporter,g,inviter,msg,reason,created) VALUES(?,?,?,?,?,?)").run(viewer, row.g, viewer, id, clean(m.reason, 200), Date.now());
      return out(200, { ok: true });
    }
    if (req.method === "POST" && p === "/api/guest/block") { // заблокировать или разблокировать гостя
      const m = await readBody(req);
      const g = String(m.g ?? "");
      if (!G_RE.test(g)) return bad("guest");
      const on = m.on === false ? 0 : 1;
      const r = db.prepare("UPDATE guest_threads SET blocked=? WHERE g=? AND inviter=?").run(on, g, viewer);
      if (!r.changes) return bad("no_thread", 404);
      return out(200, { ok: true, blocked: !!on });
    }
    if (req.method === "POST" && p === "/api/guest/claim") { // после регистрации: гостевая переписка переезжает в личные сообщения профиля
      const m = await readBody(req);
      const g = String(m.g ?? "");
      if (!G_RE.test(g)) return bad("guest");
      const inv = resolveInviter(m.ref);
      if (!inv) return bad("no_inviter", 404);
      if (inv.addr === viewer) return bad("self");
      if (limited("gc:" + viewer, 10, DAY)) return bad("slow_down", 429);
      const th = db.prepare("SELECT blocked FROM guest_threads WHERE g=? AND inviter=?").get(g, inv.addr) as { blocked: number } | undefined;
      if (!th) return out(200, { ok: true, moved: 0, name: inv.name });
      if (th.blocked) return out(200, { ok: true, moved: 0, name: inv.name, blocked: true }); // заблокированного гостя не переносим
      const rows = db.prepare("SELECT side,text,created,seen FROM guest_msgs WHERE g=? AND inviter=? ORDER BY id LIMIT 300").all(g, inv.addr) as { side: string; text: string; created: number; seen: number }[];
      const ins = db.prepare("INSERT INTO dm(a,b,text,created,seen,deleted) VALUES(?,?,?,?,?,0)");
      const move = db.transaction(() => {
        for (const r of rows) {
          if (r.side === "g") ins.run(viewer, inv.addr, r.text, r.created, r.seen ? 1 : 0); // сообщение гостя: от нового профиля пригласившему
          else ins.run(inv.addr, viewer, r.text, r.created, 1); // ответ пригласившего: гость его уже прочитал
        }
        db.prepare("DELETE FROM guest_msgs WHERE g=? AND inviter=?").run(g, inv.addr);
        db.prepare("DELETE FROM guest_threads WHERE g=? AND inviter=?").run(g, inv.addr);
      });
      move();
      return out(200, { ok: true, moved: rows.length, name: inv.name });
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
