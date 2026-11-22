// Привязка способов входа к одному профилю: вход по почте/Google и по кошельку открывают один и тот же профиль.
// Привязать можно только «пустой» вход (без постов, сообщений, друзей, объявлений). Два заполненных профиля не объединяются.
// Нужны подтверждения обоих входов: сессия основного профиля (token) и сессия привязываемого входа (заголовки).
import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import Database from "better-sqlite3";
import { checkSession } from "./session.js";
import { mainOf } from "./social.js";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec("CREATE TABLE IF NOT EXISTS login_links(alt TEXT PRIMARY KEY, main TEXT NOT NULL, created INTEGER NOT NULL)");

const ADDR_RE = /^0x[0-9a-f]{40}$/;
const AUTO_RE = /^u[0-9a-f]{8}$/;
const MAX_ALTS = 5;
const HOUR = 3600000;

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
    req.on("data", (c: Buffer) => { n += c.length; if (n > 4096) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}

/** Адрес входа из заголовков (x-wallet + токен сессии), без замены на основной профиль */
function rawLogin(req: http.IncomingMessage): string {
  const w = String(req.headers["x-wallet"] || "").toLowerCase();
  const h = String(req.headers.authorization || "");
  if (!ADDR_RE.test(w) || !checkSession(w, h.startsWith("Bearer ") ? h.slice(7) : "")) return "";
  return w;
}

const has = (sql: string, ...p: string[]) => { try { return !!db.prepare(sql).get(...p); } catch { return false; } };

/** Есть ли у этого входа свои данные: тогда привязывать его нельзя, чтобы ничего не потерять */
function hasData(a: string): boolean {
  const u = db.prepare("SELECT name,bio,avatar,banner,link FROM users WHERE addr=?").get(a) as { name: string; bio: string; avatar: string; banner: string; link: string } | undefined;
  if (u && (!AUTO_RE.test(u.name) || u.bio || u.avatar || u.banner || u.link)) return true;
  return has("SELECT 1 FROM posts WHERE addr=? LIMIT 1", a) || has("SELECT 1 FROM comments WHERE addr=? LIMIT 1", a)
    || has("SELECT 1 FROM follows WHERE a=? OR b=? LIMIT 1", a, a) || has("SELECT 1 FROM dm WHERE a=? OR b=? LIMIT 1", a, a)
    || has("SELECT 1 FROM mail WHERE a=? OR b=? LIMIT 1", a, a) || has("SELECT 1 FROM dating_profiles WHERE addr=? LIMIT 1", a)
    || has("SELECT 1 FROM ads WHERE addr=? LIMIT 1", a) || has("SELECT 1 FROM login_links WHERE main=? LIMIT 1", a)
    || has("SELECT 1 FROM tch_bal WHERE addr=? AND micro>0 LIMIT 1", a);
}

/** Маршруты /api/links/list, /api/links/add, /api/links/remove */
export async function handleLinks(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/api/links/")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  try {
    const raw = rawLogin(req);
    if (!raw) return bad("auth", 401);
    const main = mainOf(raw);

    if (req.method === "GET" && p === "/api/links/list") {
      const alts = db.prepare("SELECT alt AS addr, created FROM login_links WHERE main=? ORDER BY created").all(main);
      return out(200, { ok: true, main, current: raw, alts });
    }

    if (req.method === "POST" && p === "/api/links/add") {
      // запрос идёт от привязываемого входа (raw); основной профиль подтверждается своим токеном в теле
      if (limited("lk_ip:" + ipOf(req), 20, HOUR) || limited("lk_a:" + raw, 10, 24 * HOUR)) return bad("slow_down", 429);
      const m = await readBody(req);
      const target = String(m.main ?? "").toLowerCase();
      const tok = String(m.token ?? "");
      if (!ADDR_RE.test(target) || !checkSession(target, tok)) return bad("main_auth", 401);
      if (target === raw) return bad("same");
      if (mainOf(target) !== target) return bad("main_is_alt"); // основным может быть только настоящий профиль
      const cur = db.prepare("SELECT main FROM login_links WHERE alt=?").get(raw) as { main: string } | undefined;
      if (cur) return cur.main === target ? out(200, { ok: true, already: true }) : bad("already_linked");
      if ((db.prepare("SELECT COUNT(*) AS n FROM login_links WHERE main=?").get(target) as { n: number }).n >= MAX_ALTS) return bad("too_many");
      if (hasData(raw)) return bad("has_data"); // у привязываемого входа уже есть свой профиль с данными
      const tx = db.transaction(() => {
        db.prepare("INSERT INTO login_links(alt,main,created) VALUES(?,?,?)").run(raw, target, Date.now());
        db.prepare("DELETE FROM users WHERE addr=?").run(raw); // пустую автозапись удаляем, чтобы имя не висело
      });
      tx();
      return out(200, { ok: true });
    }

    if (req.method === "POST" && p === "/api/links/remove") {
      const m = await readBody(req);
      const alt = String(m.alt ?? "").toLowerCase();
      if (!ADDR_RE.test(alt)) return bad("bad_addr");
      const r = db.prepare("DELETE FROM login_links WHERE alt=? AND main=?").run(alt, main);
      return out(200, { ok: true, removed: r.changes });
    }

    return bad("not_found", 404);
  } catch (e) {
    const msg = (e as Error).message;
    return bad(msg === "too_big" || msg === "bad_json" ? msg : "server", msg === "server" ? 500 : 400);
  }
}
