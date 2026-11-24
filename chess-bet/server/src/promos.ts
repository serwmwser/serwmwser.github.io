// Реклама на главной странице: сообщества, продукты сообществ и внешние ресурсы. Добавляет только администратор (MOD_ADMIN).
// Публичный список отдаёт только активную рекламу в пределах дат показа. Пока такой рекламы нет, блок на сайте скрыт.
import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import Database from "better-sqlite3";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS promos(
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'external', title TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', slug TEXT NOT NULL DEFAULT '',
  starts INTEGER NOT NULL DEFAULT 0, ends INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  views INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
`);

const ADMINS = new Set((process.env.MOD_ADMIN || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s)));
const isAdm = (a: string) => !!a && ADMINS.has(a.toLowerCase());
const KINDS = ["community", "product", "external"];
const MAX_SHOWN = 10;

type Row = { id: number; kind: string; title: string; text: string; image: string; url: string; slug: string; starts: number; ends: number; active: number; views: number; clicks: number; created: number };

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
/** Внешняя ссылка только http(s); внутренняя начинается с одного «/» */
const cleanUrl = (s: unknown): string => {
  const v = clean(s, 500);
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  if (/^\/(?!\/)[^\s]*$/.test(v)) return v;
  return "";
};
const cleanImage = (s: unknown): string => {
  const v = clean(s, 300);
  return /^\/media\/[a-f0-9]+\.(jpg|png|webp)$/i.test(v) || /^https:\/\/[^\s]+$/i.test(v) ? v : "";
};
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

const live = (r: Row, now: number) => r.active === 1 && (!r.starts || r.starts <= now) && (!r.ends || r.ends > now);
const pub = (r: Row) => ({ id: r.id, kind: r.kind, title: r.title, text: r.text, image: r.image, url: r.url, slug: r.slug });

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    req.on("data", (c: Buffer) => { size += c.length; if (size > 20000) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", () => reject(new Error("bad_json")));
  });
}

// простое ограничение частоты для публичных счётчиков: не больше 120 событий в час с одного адреса
const hits = new Map<string, { n: number; t: number }>();
function limited(key: string): boolean {
  const now = Date.now(); const h = hits.get(key);
  if (!h || now - h.t > 3600000) { hits.set(key, { n: 1, t: now }); return false; }
  h.n++; return h.n > 120;
}

/** Маршруты /api/promos/* */
export async function handlePromos(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/api/promos")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  try {
    // публичный список активной рекламы; пустой список = блок на сайте скрыт
    if (req.method === "GET" && (p === "/api/promos" || p === "/api/promos/")) {
      const now = Date.now();
      const rows = (db.prepare("SELECT * FROM promos ORDER BY id DESC").all() as Row[]).filter((r) => live(r, now)).slice(0, MAX_SHOWN);
      return out(200, { ok: true, items: rows.map(pub) });
    }
    // счётчики показов и кликов (без входа)
    if (req.method === "POST" && (p === "/api/promos/view" || p === "/api/promos/click")) {
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      if (limited("pr:" + ip)) return out(200, { ok: true });
      const m = await readBody(req);
      const col = p.endsWith("click") ? "clicks" : "views";
      db.prepare(`UPDATE promos SET ${col}=${col}+1 WHERE id=?`).run(num(m.id));
      return out(200, { ok: true });
    }

    // дальше только администратор
    if (!viewer) return bad("auth", 401);
    if (!isAdm(viewer)) return bad("forbidden", 403);

    if (req.method === "GET" && p === "/api/promos/all") {
      const now = Date.now();
      const rows = db.prepare("SELECT * FROM promos ORDER BY id DESC").all() as Row[];
      return out(200, { ok: true, items: rows.map((r) => ({ ...r, active: r.active === 1, live: live(r, now) })) });
    }
    if (req.method === "POST" && p === "/api/promos/save") {
      const m = await readBody(req);
      const id = num(m.id);
      const kind = KINDS.includes(String(m.kind)) ? String(m.kind) : "";
      const title = clean(m.title, 80);
      const text = clean(m.text, 240);
      const image = cleanImage(m.image);
      const slug = clean(m.slug, 30).toLowerCase().replace(/[^a-z0-9-]/g, "");
      let link = cleanUrl(m.url);
      if (kind === "community" && slug && !link) link = `/community/?slug=${slug}`;
      const starts = num(m.starts), ends = num(m.ends);
      if (!kind) return bad("bad_kind");
      if (!title) return bad("title_required");
      if (!link) return bad("bad_url");
      if (ends && starts && ends <= starts) return bad("bad_dates");
      const active = m.active === false || m.active === 0 ? 0 : 1;
      if (id) {
        const r = db.prepare("UPDATE promos SET kind=?, title=?, text=?, image=?, url=?, slug=?, starts=?, ends=?, active=? WHERE id=?").run(kind, title, text, image, link, slug, starts, ends, active, id);
        if (!r.changes) return bad("not_found", 404);
        return out(200, { ok: true, id });
      }
      const r = db.prepare("INSERT INTO promos(kind,title,text,image,url,slug,starts,ends,active,created) VALUES(?,?,?,?,?,?,?,?,?,?)").run(kind, title, text, image, link, slug, starts, ends, active, Date.now());
      return out(200, { ok: true, id: Number(r.lastInsertRowid) });
    }
    if (req.method === "POST" && p === "/api/promos/delete") {
      const m = await readBody(req);
      db.prepare("DELETE FROM promos WHERE id=?").run(num(m.id));
      return out(200, { ok: true });
    }
    return bad("not_found", 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return bad(msg === "too_big" ? "too_big" : "bad_json");
  }
}
