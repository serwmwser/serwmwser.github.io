// Единый вход (SSO) для внешних досок HiMeet, например российской доски объявлений ads-ru.
// 1) Вошедший в HiMeet пользователь запрашивает пропуск: POST /api/sso/ads-ru → { token }. Пропуск живёт 2 минуты и работает один раз.
// 2) Сервер внешней доски проверяет его запросом GET /api/sso/verify?t=… и получает { id, name }. Общих секретов не нужно.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type http from "node:http";
import Database from "better-sqlite3";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE, { readonly: false });
db.pragma("busy_timeout = 3000");

const TTL = 120000; // пропуск действует 2 минуты
const passes = new Map<string, { addr: string; name: string; exp: number }>();
const hits = new Map<string, { n: number; t: number }>();

function limited(key: string, max: number, ms: number): boolean {
  const now = Date.now(); const h = hits.get(key);
  if (!h || now - h.t > ms) { hits.set(key, { n: 1, t: now }); if (hits.size > 20000) hits.clear(); return false; }
  h.n++; return h.n > max;
}
function sweep() {
  const now = Date.now();
  for (const [k, v] of passes) if (v.exp < now) passes.delete(k);
}
const ipOf = (req: http.IncomingMessage): string => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

/** POST /api/sso/ads-ru (нужен вход в HiMeet) и GET /api/sso/verify?t=… (запрос от сервера внешней доски) */
export async function handleSso(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (p !== "/api/sso/ads-ru" && p !== "/api/sso/verify") return false;
  const out = (code: number, body: unknown) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });

  if (req.method === "POST" && p === "/api/sso/ads-ru") {
    if (!viewer) return bad("auth", 401);
    const addr = viewer.toLowerCase();
    if (limited("sso:" + addr, 20, 600000)) return bad("slow_down", 429);
    const u = db.prepare("SELECT name, banned FROM users WHERE lower(addr)=?").get(addr) as { name: string; banned: number } | undefined;
    if (!u || !u.name) return bad("no_profile", 403);
    if (u.banned) return bad("forbidden", 403);
    sweep();
    const token = crypto.randomBytes(24).toString("hex");
    passes.set(token, { addr, name: u.name, exp: Date.now() + TTL });
    return out(200, { ok: true, token });
  }

  if (req.method === "GET" && p === "/api/sso/verify") {
    if (limited("ssov:" + ipOf(req), 120, 60000)) return bad("slow_down", 429);
    const t = String(url.searchParams.get("t") || "");
    const v = /^[0-9a-f]{48}$/.test(t) ? passes.get(t) : undefined;
    if (v) passes.delete(t); // одноразовый
    if (!v || v.exp < Date.now()) return bad("invalid", 401);
    return out(200, { ok: true, id: v.addr, name: v.name });
  }
  return bad("not_found", 404);
}
