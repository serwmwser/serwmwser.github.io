// Посты сообщества: пишет владелец (или администратор). До 1500 знаков, до 3 фото, 1 видео (YouTube, Vimeo, RuTube) и 1 ссылка.
// В закрытых сообществах посты видят только участники с действующим доступом.
import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import Database from "better-sqlite3";
import { hasAccess, parseVideo } from "./communities.js";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS cposts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, community TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', photos TEXT NOT NULL DEFAULT '[]',
  video TEXT NOT NULL DEFAULT '', thumb TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS cp_com ON cposts(community, deleted, id);
`);

const MAX_TEXT = 1500, MAX_PHOTOS = 3, PAGE = 20;
const ADMINS = new Set((process.env.MOD_ADMIN || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s)));
const isAdm = (a: string) => !!a && ADMINS.has(a.toLowerCase());
type Post = { id: number; community: string; text: string; photos: string; video: string; thumb: string; link: string; created: number; updated: number; deleted: number };

const cleanText = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E]/g, "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const IMG_RE = /^(https:\/\/[^\s"'<>]{3,300}|\/media\/[A-Za-z0-9._-]{3,80})$/;
const LINK_RE = /^https:\/\/[^\s"'<>]{4,300}$/;
const communityRow = (slug: string) => db.prepare("SELECT slug, owner, visibility, status FROM communities WHERE slug=?").get(slug) as { slug: string; owner: string; visibility: string; status: string } | undefined;
const canManage = (viewer: string, owner: string) => !!viewer && (isAdm(viewer) || (!!owner && owner.toLowerCase() === viewer.toLowerCase()));

const hits = new Map<string, { n: number; t: number }>();
function limited(key: string, max: number, ms: number): boolean {
  const now = Date.now(); const h = hits.get(key);
  if (!h || now - h.t > ms) { hits.set(key, { n: 1, t: now }); if (hits.size > 20000) hits.clear(); return false; }
  h.n++; return h.n > max;
}
function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    req.on("data", (c: Buffer) => { size += c.length; if (size > 20000) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", () => reject(new Error("bad_json")));
  });
}
const shape = (r: Post) => {
  let photos: string[] = [];
  try { const a = JSON.parse(r.photos || "[]"); if (Array.isArray(a)) photos = a.filter((x) => typeof x === "string"); } catch { /* пусто */ }
  return { id: r.id, community: r.community, text: r.text, photos, video: r.video, thumb: r.thumb, link: r.link, created: r.created, edited: r.updated > r.created };
};

export async function handleCposts(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/api/cposts")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  try {
    if (req.method === "GET" && p === "/api/cposts") {
      const slug = String(url.searchParams.get("community") || "").toLowerCase().slice(0, 30);
      const c = communityRow(slug);
      if (!c || c.status !== "active") return bad("not_found", 404);
      const manage = canManage(viewer, c.owner);
      if (c.visibility !== "open" && !manage && !hasAccess(slug, viewer)) return out(200, { ok: true, items: [], manage: false, locked: true, more: false });
      const before = Number(url.searchParams.get("before")) || 0;
      const rows = (before
        ? db.prepare("SELECT * FROM cposts WHERE community=? AND deleted=0 AND id<? ORDER BY id DESC LIMIT ?").all(slug, before, PAGE + 1)
        : db.prepare("SELECT * FROM cposts WHERE community=? AND deleted=0 ORDER BY id DESC LIMIT ?").all(slug, PAGE + 1)) as Post[];
      return out(200, { ok: true, items: rows.slice(0, PAGE).map(shape), manage, locked: false, more: rows.length > PAGE });
    }
    if (req.method === "POST" && p === "/api/cposts/save") {
      if (!viewer) return bad("auth", 401);
      if (limited("cp:" + viewer, 40, 3600000)) return bad("slow_down", 429);
      const m = await readBody(req);
      const id = Number(m.id) || 0;
      let slug = String(m.community ?? "").toLowerCase().slice(0, 30);
      const old = id ? (db.prepare("SELECT * FROM cposts WHERE id=? AND deleted=0").get(id) as Post | undefined) : undefined;
      if (id && !old) return bad("not_found", 404);
      if (old) slug = old.community;
      const c = communityRow(slug);
      if (!c || c.status !== "active") return bad("not_found", 404);
      if (!canManage(viewer, c.owner)) return bad("forbidden", 403);
      const text = cleanText(m.text, MAX_TEXT);
      const photosIn = Array.isArray(m.photos) ? m.photos.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
      if (photosIn.length > MAX_PHOTOS || photosIn.some((x) => !IMG_RE.test(x))) return bad("bad_photos");
      let video = "", thumb = "";
      const vIn = String(m.video ?? "").trim();
      if (vIn) { const pv = parseVideo(vIn); if (!pv) return bad("bad_video"); video = pv.url; thumb = pv.thumb; }
      const link = String(m.link ?? "").trim();
      if (link && !LINK_RE.test(link)) return bad("bad_link");
      if (!text && !photosIn.length && !video && !link) return bad("empty");
      const now = Date.now();
      if (old) {
        db.prepare("UPDATE cposts SET text=?, photos=?, video=?, thumb=?, link=?, updated=? WHERE id=?").run(text, JSON.stringify(photosIn), video, thumb, link, now, old.id);
        return out(200, { ok: true, post: shape(db.prepare("SELECT * FROM cposts WHERE id=?").get(old.id) as Post) });
      }
      const r = db.prepare("INSERT INTO cposts(community,text,photos,video,thumb,link,created,updated) VALUES(?,?,?,?,?,?,?,?)").run(slug, text, JSON.stringify(photosIn), video, thumb, link, now, now);
      return out(200, { ok: true, post: shape(db.prepare("SELECT * FROM cposts WHERE id=?").get(Number(r.lastInsertRowid)) as Post) });
    }
    if (req.method === "POST" && p === "/api/cposts/delete") {
      if (!viewer) return bad("auth", 401);
      const m = await readBody(req);
      const old = db.prepare("SELECT * FROM cposts WHERE id=? AND deleted=0").get(Number(m.id) || 0) as Post | undefined;
      if (!old) return bad("not_found", 404);
      const c = communityRow(old.community);
      if (!c || !canManage(viewer, c.owner)) return bad("forbidden", 403);
      db.prepare("UPDATE cposts SET deleted=1 WHERE id=?").run(old.id);
      return out(200, { ok: true });
    }
    return bad("not_found", 404);
  } catch (e) {
    const m = (e as Error)?.message;
    return bad(m === "too_big" || m === "bad_json" ? m : "error", m === "too_big" ? 413 : 400);
  }
}
