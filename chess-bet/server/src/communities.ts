// Сообщества (как на Skool): каталог, вступление, создание, тарифы. Профиль, объявления, знакомства, посты и звонки остаются общими:
// сообщество — это вход и витрина (название, описание, владелец, участники). Закрытым и платным будет только то, что принадлежит самому сообществу
// (своя лента и уроки, отдельный этап). Открытое сообщество: вступает любой. Закрытое: вступление по заявке или по оплате тарифа.
// Сообщество himeet существует всегда, в нём состоят все пользователи неявно. Приём оплаты пока не подключён (тарифы только хранятся).
import fs from "node:fs";
import path from "node:path";
import type http from "node:http";
import Database from "better-sqlite3";
import { CATEGORIES, categoriesOr, isCategory, LANGUAGES, languageOr } from "./categories.js";
import { FOUNDER_DAYS, FOUNDER_SLOTS, MAX_MEMBER_PRICE, MIN_MEMBER_PRICE, pricingReady, publicPricing, REQUIRE_PAYMENT, TRIAL_DAYS } from "./pricing.js";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS communities(
  slug TEXT PRIMARY KEY, name TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', visibility TEXT NOT NULL DEFAULT 'open',
  created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS community_members(
  community TEXT NOT NULL, addr TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', state TEXT NOT NULL DEFAULT 'active',
  plan INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL DEFAULT 0, joined INTEGER NOT NULL,
  PRIMARY KEY(community, addr));
CREATE INDEX IF NOT EXISTS cm_addr ON community_members(addr);
CREATE TABLE IF NOT EXISTS community_plans(
  id INTEGER PRIMARY KEY AUTOINCREMENT, community TEXT NOT NULL, name TEXT NOT NULL, period TEXT NOT NULL,
  price_micro INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cp_com ON community_plans(community, active);
`);
// Если таблицы уже были созданы раньше без новых колонок, добавляем их
function addCol(table: string, col: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}
addCol("communities", "visibility", "TEXT NOT NULL DEFAULT 'open'");
addCol("community_members", "state", "TEXT NOT NULL DEFAULT 'active'");
addCol("community_members", "plan", "INTEGER NOT NULL DEFAULT 0");
addCol("community_members", "expires", "INTEGER NOT NULL DEFAULT 0");
addCol("communities", "category", "TEXT NOT NULL DEFAULT 'other'");
addCol("communities", "categories", "TEXT NOT NULL DEFAULT ''"); // до 3 категорий через запятую, первая главная
addCol("communities", "language", "TEXT NOT NULL DEFAULT ''"); // язык сообщества; пусто = многоязычное
addCol("community_plans", "trial_days", "INTEGER NOT NULL DEFAULT 0"); // пробный период тарифа, дней
addCol("communities", "about", "TEXT NOT NULL DEFAULT ''"); // длинное описание для страницы-витрины
addCol("communities", "media", "TEXT NOT NULL DEFAULT ''"); // галерея витрины: JSON-массив {type, url, thumb}, до 8 штук
// Оплаченный тариф создателя сообществ (его записывает этап оплаты; пока записей нет, создавать может только администратор)
db.exec("CREATE TABLE IF NOT EXISTS creator_subs(addr TEXT PRIMARY KEY, plan TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL)");
addCol("creator_subs", "source", "TEXT NOT NULL DEFAULT 'paid'"); // откуда тариф: paid (оплата), founder (первые 50: 3 месяца), trial (14 дней)
/** Записать (или продлить) оплаченный тариф создателя: вызывается после подтверждения платежа */
export function grantCreatorPlan(addr: string, plan: string, expires: number, source = "paid") {
  db.prepare("INSERT OR REPLACE INTO creator_subs(addr,plan,expires,created,source) VALUES(?,?,?,?,?)").run(addr, plan, expires, Date.now(), source);
}
/** Бесплатный период создателя: первые FOUNDER_SLOTS создателей получают 3 месяца, остальные 14 дней. Один раз на кошелёк, тариф «Старт» (комиссия с участников удерживается) */
function grantTrial(addr: string): "founder" | "trial" | null {
  if (db.prepare("SELECT 1 FROM creator_subs WHERE addr=?").get(addr)) return null; // подписка или пробный период уже были
  const founders = (db.prepare("SELECT COUNT(*) AS n FROM creator_subs WHERE source='founder'").get() as { n: number }).n;
  const kind = founders < FOUNDER_SLOTS ? "founder" : "trial";
  grantCreatorPlan(addr, "start", Date.now() + (kind === "founder" ? FOUNDER_DAYS : TRIAL_DAYS) * 86400000, kind);
  return kind;
}
const subInfo = (a: string) => {
  const r = db.prepare("SELECT plan, expires, source FROM creator_subs WHERE addr=?").get(a) as { plan: string; expires: number; source: string } | undefined;
  return r ? { plan: r.plan, expires: r.expires, source: r.source, active: r.expires > Date.now() } : null;
};
const hasCreatorPlan = (addr: string): boolean => {
  const r = db.prepare("SELECT expires FROM creator_subs WHERE addr=?").get(addr) as { expires: number } | undefined;
  return !!r && r.expires > Date.now();
};

const MAIN = "himeet";
const ADMINS = new Set((process.env.MOD_ADMIN || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s)));
const isAdm = (a: string) => !!a && ADMINS.has(a.toLowerCase());

// Главное сообщество создаём при первом запуске; владелец — первый администратор из MOD_ADMIN
{
  const now = Date.now();
  const owner = [...ADMINS][0] || "";
  db.prepare("INSERT OR IGNORE INTO communities(slug,name,descr,owner,created,updated) VALUES(?,?,?,?,?,?)")
    .run(MAIN, "HiMeet", "Общение без языковых барьеров: чат с переводом, шахматы, знакомства, объявления и звонки в одном приложении.", owner, now, now);
}

// HiMeet относится сразу к нескольким категориям: соцсети, игры, знакомства, объявления, мессенджеры
db.prepare("UPDATE communities SET categories=?, category=? WHERE slug=? AND categories=''").run("social,gaming,relationships,classifieds,messenger", "social", "himeet");

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const RESERVED = new Set([MAIN, "admin", "api", "www", "u", "i", "c", "new", "create", "discovery", "community", "communities", "feed", "ads", "dating", "chess", "faq", "terms", "about", "profile", "me", "mod", "help", "support"]);
const PERIODS = ["month", "quarter", "year", "lifetime"] as const; // бесплатный тариф: цена 0 (любой период)
const MAX_OWNED = 3, MAX_PLANS = 6, MAX_PENDING = 10, MAX_PRICE_USDC = MAX_MEMBER_PRICE; // цена участия: бесплатно или от 1 до 1000 USDC
const DAY = 86400000;

const hits = new Map<string, number[]>();
function limited(key: string, max: number, ms: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < ms);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 20000) hits.clear();
  return false;
}
function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => { n += c.length; if (n > 16384) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}
const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

type Row = { slug: string; name: string; descr: string; about: string; media: string; cover: string; owner: string; status: string; visibility: string; category: string; categories: string; language: string; created: number; updated: number };
type Plan = { id: number; community: string; name: string; period: string; price_micro: number; active: number; trial_days: number };
type Mem = { community: string; addr: string; role: string; state: string; plan: number; expires: number; joined: number };

const getC = (slug: string) => db.prepare("SELECT * FROM communities WHERE slug=?").get(slug) as Row | undefined;
const userRow = (a: string) => db.prepare("SELECT name, banned FROM users WHERE addr=?").get(a) as { name: string; banned: number } | undefined;
const ownerName = (a: string): string | null => (a ? userRow(a)?.name || a.slice(0, 6) + "…" + a.slice(-4) : null);
const plansOf = (slug: string) => db.prepare("SELECT * FROM community_plans WHERE community=? AND active=1 ORDER BY price_micro, id").all(slug) as Plan[];
const memOf = (slug: string, a: string) => db.prepare("SELECT * FROM community_members WHERE community=? AND addr=?").get(slug, a) as Mem | undefined;

/** Есть ли у человека действующий доступ в сообщество (понадобится для закрытых лент и уроков) */
export function hasAccess(slug: string, addr: string): boolean {
  if (!addr) return false;
  const c = getC(slug);
  if (!c || c.status !== "active") return false;
  if (slug === MAIN) return !!userRow(addr);
  if (c.owner === addr || isAdm(addr)) return true;
  const m = memOf(slug, addr);
  return !!m && m.state === "active" && (m.expires === 0 || m.expires > Date.now());
}
/** «member» — доступ есть, «pending» — заявка ждёт ответа, «expired» — срок тарифа вышел, пусто — не участник */
function stateOf(slug: string, a: string): string {
  if (!a) return "";
  const m = memOf(slug, a);
  if (slug === MAIN) return userRow(a) ? "member" : "";
  if (!m) return "";
  if (m.state === "pending") return "pending";
  return m.expires === 0 || m.expires > Date.now() ? "member" : "expired";
}
const countOf = (slug: string): number =>
  slug === MAIN
    ? (db.prepare("SELECT COUNT(*) AS n FROM users WHERE banned=0").get() as { n: number }).n
    : (db.prepare("SELECT COUNT(*) AS n FROM community_members WHERE community=? AND state='active' AND (expires=0 OR expires>?)").get(slug, Date.now()) as { n: number }).n;
const roleOf = (c: Row, a: string): string => (!a ? "" : c.owner === a || (c.slug === MAIN && isAdm(a)) ? "owner" : stateOf(c.slug, a) === "member" ? (memOf(c.slug, a)?.role || "member") : "");
/** Сколько человек вступило за последние 7 дней (для сортировки «Популярные сейчас») */
const recentOf = (slug: string): number => {
  const since = Date.now() - 7 * DAY;
  return slug === MAIN
    ? (db.prepare("SELECT COUNT(*) AS n FROM users WHERE created>? AND banned=0").get(since) as { n: number }).n
    : (db.prepare("SELECT COUNT(*) AS n FROM community_members WHERE community=? AND state='active' AND joined>?").get(slug, since) as { n: number }).n;
};
/** Текст с абзацами: убираем служебные символы, оставляем переносы строк */
const cleanText = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E]/g, "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
type MediaItem = { type: "video" | "image"; url: string; thumb: string };
/** Видео только с YouTube, Vimeo, RuTube: превращаем ссылку в безопасный адрес для встраивания */
export function parseVideo(u: string): { url: string; thumb: string } | null {
  let x: URL; try { x = new URL(u); } catch { return null; }
  if (x.protocol !== "https:") return null;
  const h = x.hostname.replace(/^www\.|^m\./, "");
  const seg = x.pathname.split("/").filter(Boolean);
  let id = "";
  if (h === "youtu.be") id = seg[0] || "";
  else if (h === "youtube.com" || h === "youtube-nocookie.com") id = x.pathname === "/watch" ? x.searchParams.get("v") || "" : seg[0] === "shorts" || seg[0] === "embed" ? seg[1] || "" : "";
  if ((h === "youtu.be" || h === "youtube.com" || h === "youtube-nocookie.com") && /^[A-Za-z0-9_-]{6,15}$/.test(id))
    return { url: "https://www.youtube-nocookie.com/embed/" + id, thumb: "https://img.youtube.com/vi/" + id + "/hqdefault.jpg" };
  if (h === "vimeo.com" || h === "player.vimeo.com") {
    const v = seg.filter((t) => /^\d{5,12}$/.test(t)).pop() || "";
    if (v) return { url: "https://player.vimeo.com/video/" + v, thumb: "" };
  }
  if (h === "rutube.ru") {
    const v = seg.find((t) => /^[a-f0-9]{32}$/.test(t)) || "";
    if (v) return { url: "https://rutube.ru/play/embed/" + v, thumb: "" };
  }
  return null;
}
const IMG_RE = /^(https:\/\/[^\s"'<>]{3,300}|\/media\/[A-Za-z0-9._-]{3,80})$/; // ссылка или файл, загруженный на наш сервер (/api/upload → /media/…)
/** Проверка галереи, присланной владельцем: до 8 элементов; null, если что-то не так */
function normMedia(v: unknown): MediaItem[] | null {
  if (!Array.isArray(v) || v.length > 8) return null;
  const out: MediaItem[] = [];
  for (const it of v) {
    const o = (it || {}) as Record<string, unknown>;
    const url = String(o.url ?? "").trim();
    if (o.type === "video") { const pv = parseVideo(url); if (!pv) return null; out.push({ type: "video", url: pv.url, thumb: pv.thumb }); }
    else if (o.type === "image") { if (!IMG_RE.test(url)) return null; out.push({ type: "image", url, thumb: "" }); }
    else return null;
  }
  return out;
}
const parseMedia = (raw: string): MediaItem[] => { try { const a = JSON.parse(raw || "[]"); return Array.isArray(a) ? (a as MediaItem[]) : []; } catch { return []; } };
/** Сообщество работает, пока у владельца оплачен тариф или идёт бесплатный период (главное сообщество и сообщества администратора без ограничений) */
const ownerActive = (c: { slug: string; owner: string }): boolean => c.slug === MAIN || isAdm(c.owner) || hasCreatorPlan(c.owner);
const card = (c: Row, viewer: string) => {
  const plans = plansOf(c.slug);
  return {
    slug: c.slug, name: c.name, descr: c.descr, about: c.about, media: parseMedia(c.media), cover: c.cover, owner: ownerName(c.owner), members: countOf(c.slug),
    visibility: c.visibility, category: c.category, categories: (c.categories || c.category).split(",").filter(Boolean), role: roleOf(c, viewer), state: stateOf(c.slug, viewer), hidden: c.status !== "active", paused: !ownerActive(c), sub: c.owner === viewer ? subInfo(viewer) : null, created: c.created,
    paid: plans.some((p) => p.price_micro > 0), trial: plans.some((p) => p.trial_days > 0), language: c.language, recent: recentOf(c.slug),
    plans: plans.map((p) => ({ id: p.id, name: p.name, period: p.period, price: p.price_micro / 1e6, trial: p.trial_days })),
  };
};

/** Маршруты /api/communities/* */
export async function handleCommunities(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/api/communities")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  try {
    // чтение без входа: каталог и страница сообщества
    if (req.method === "GET" && (p === "/api/communities" || p === "/api/communities/")) {
      const q = clean(url.searchParams.get("q"), 40).toLowerCase();
      let rows = (db.prepare("SELECT * FROM communities WHERE status='active'").all() as Row[]).filter(ownerActive); // сообщества без оплаты или бесплатного периода в каталоге не показываем
      const cat = clean(url.searchParams.get("category"), 30);
      if (cat && isCategory(cat)) rows = rows.filter((c) => (c.categories || c.category).split(",").includes(cat));
      if (q) rows = rows.filter((c) => c.name.toLowerCase().includes(q) || c.descr.toLowerCase().includes(q) || c.slug.includes(q));
      const items = rows.map((c) => card(c, viewer)).sort((a, b) => (a.slug === MAIN ? -1 : b.slug === MAIN ? 1 : b.members - a.members || b.created - a.created)).slice(0, 100);
      return out(200, { ok: true, items });
    }
    if (req.method === "GET" && p === "/api/communities/get") {
      const c = getC(clean(url.searchParams.get("slug"), 30));
      if (!c || (c.status !== "active" && !isAdm(viewer) && c.owner !== viewer)) return bad("not_found", 404);
      return out(200, { ok: true, community: card(c, viewer) });
    }

    if (req.method === "GET" && p === "/api/communities/categories") return out(200, { ok: true, items: CATEGORIES, languages: LANGUAGES });
    if (req.method === "GET" && p === "/api/communities/pricing") {
      const founders = (db.prepare("SELECT COUNT(*) AS n FROM creator_subs WHERE source='founder'").get() as { n: number }).n;
      const mine = viewer ? subInfo(viewer) : null;
      const trialAvailable = !mine; // бесплатный период ещё не использован
      return out(200, {
        ok: true, ...publicPricing(), founderSlots: FOUNDER_SLOTS, founderLeft: Math.max(0, FOUNDER_SLOTS - founders), founderDays: FOUNDER_DAYS, trialDays: TRIAL_DAYS,
        sub: mine, trialAvailable, canCreate: !REQUIRE_PAYMENT || isAdm(viewer) || (pricingReady() && !!viewer && (hasCreatorPlan(viewer) || trialAvailable)),
      });
    }

    if (!viewer) return bad("auth", 401);
    const me = userRow(viewer);
    if (me?.banned) return bad("banned", 403);

    if (req.method === "GET" && p === "/api/communities/mine") {
      const rows = db.prepare("SELECT c.* FROM communities c JOIN community_members m ON m.community=c.slug WHERE m.addr=? AND c.status='active' ORDER BY m.joined DESC").all(viewer) as Row[];
      const main = getC(MAIN);
      const list = rows.filter((c) => c.slug !== MAIN);
      return out(200, { ok: true, items: [...(main && me ? [main] : []), ...list].map((c) => card(c, viewer)) });
    }

    // заявки на вступление: видит владелец сообщества (и администратор)
    if (req.method === "GET" && p === "/api/communities/requests") {
      const c = getC(clean(url.searchParams.get("slug"), 30));
      if (!c) return bad("not_found", 404);
      if (c.owner !== viewer && !isAdm(viewer)) return bad("forbidden", 403);
      const rows = db.prepare("SELECT addr, joined FROM community_members WHERE community=? AND state='pending' ORDER BY joined").all(c.slug) as { addr: string; joined: number }[];
      return out(200, { ok: true, items: rows.map((r) => ({ addr: r.addr, name: ownerName(r.addr), at: r.joined })) });
    }

    if (req.method !== "POST") return bad("not_found", 404);
    if (limited("com_u:" + viewer, 300, 3600000)) return bad("slow_down", 429);
    const m = await readBody(req);
    const slug = clean(m.slug, 30).toLowerCase();
    const vis = (v: unknown, def: string) => (v === undefined ? def : v === "closed" ? "closed" : "open");

    if (p === "/api/communities/create") {
      if (!me) return bad("no_profile", 403); // сначала создайте профиль с ником
      let needTrial = false; // нужен тариф создателя: действующий (бесплатный период или оплата), либо впервые бесплатный период
      if (REQUIRE_PAYMENT && !isAdm(viewer) && !hasCreatorPlan(viewer)) {
        if (!pricingReady()) return bad("creation_closed", 403); // цены ещё не заданы
        if (subInfo(viewer)) return bad("payment_required", 402); // бесплатный период или оплаченный срок закончился
        needTrial = true;
      }
      if (!SLUG_RE.test(slug) || RESERVED.has(slug)) return bad("bad_slug");
      const name = clean(m.name, 40), descr = clean(m.descr, 300);
      if (name.length < 3) return bad("bad_name");
      if (getC(slug)) return bad("slug_taken");
      const owned = (db.prepare("SELECT COUNT(*) AS n FROM communities WHERE owner=?").get(viewer) as { n: number }).n;
      if (owned >= MAX_OWNED && !isAdm(viewer)) return bad("too_many_communities");
      if (limited("com_new:" + viewer, 5, DAY)) return bad("slow_down", 429);
      const now = Date.now();
      const cats = categoriesOr(m.categories ?? m.category);
      if (needTrial) grantTrial(viewer); // бесплатный период выдаём, только когда остальные проверки пройдены
      db.prepare("INSERT INTO communities(slug,name,descr,owner,visibility,category,categories,language,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)").run(slug, name, descr, viewer, vis(m.visibility, "open"), cats[0], cats.join(","), languageOr(m.language), now, now);
      db.prepare("INSERT INTO community_members(community,addr,role,state,joined) VALUES(?,?,'owner','active',?)").run(slug, viewer, now);
      return out(200, { ok: true, community: card(getC(slug) as Row, viewer) });
    }

    const c = getC(slug);
    if (!c) return bad("not_found", 404);
    const isOwner = c.owner === viewer || isAdm(viewer);

    if (p === "/api/communities/join") {
      if (c.status !== "active") return bad("not_found", 404);
      if (!me) return bad("no_profile", 403);
      if (slug === MAIN || c.owner === viewer) return out(200, { ok: true, community: card(c, viewer) });
      const cur = memOf(slug, viewer);
      if (cur && cur.state === "active" && (cur.expires === 0 || cur.expires > Date.now())) return out(200, { ok: true, community: card(c, viewer) });
      if (!ownerActive(c)) return bad("community_paused", 403); // у владельца закончился бесплатный период или оплаченный срок
      if (c.visibility === "open") {
        db.prepare("INSERT OR REPLACE INTO community_members(community,addr,role,state,plan,expires,joined) VALUES(?,?,'member','active',0,0,?)").run(slug, viewer, Date.now());
        return out(200, { ok: true, community: card(c, viewer) });
      }
      // закрытое сообщество: платный тариф пока не принимается, бесплатно — по заявке
      const planId = Number(m.plan) || 0;
      if (planId) {
        const pl = plansOf(slug).find((x) => x.id === planId);
        if (!pl) return bad("bad_plan");
        if (pl.price_micro > 0 && pl.trial_days > 0 && !cur) { // пробный период: доступ на N дней без оплаты, один раз на человека
          db.prepare("INSERT INTO community_members(community,addr,role,state,plan,expires,joined) VALUES(?,?,'member','active',?,?,?)").run(slug, viewer, planId, Date.now() + pl.trial_days * DAY, Date.now());
          return out(200, { ok: true, community: card(c, viewer) });
        }
        if (pl.price_micro > 0) return bad("payment_not_supported"); // оплата в USDC будет отдельным этапом
      }
      if (cur?.state === "pending") return out(200, { ok: true, community: card(c, viewer) });
      const pend = (db.prepare("SELECT COUNT(*) AS n FROM community_members WHERE addr=? AND state='pending'").get(viewer) as { n: number }).n;
      if (pend >= MAX_PENDING) return bad("too_many_requests");
      db.prepare("INSERT OR REPLACE INTO community_members(community,addr,role,state,plan,expires,joined) VALUES(?,?,'member','pending',?,0,?)").run(slug, viewer, planId, Date.now());
      return out(200, { ok: true, community: card(c, viewer) });
    }

    if (p === "/api/communities/leave") {
      if (slug === MAIN) return bad("cannot_leave_main");
      if (c.owner === viewer) return bad("owner_cannot_leave");
      db.prepare("DELETE FROM community_members WHERE community=? AND addr=?").run(slug, viewer);
      return out(200, { ok: true });
    }

    if (p === "/api/communities/decide") { // владелец принимает или отклоняет заявку
      if (!isOwner) return bad("forbidden", 403);
      const who = clean(m.addr, 42).toLowerCase();
      const row = memOf(slug, who);
      if (!row || row.state !== "pending") return bad("not_found", 404);
      if (m.approve === true) db.prepare("UPDATE community_members SET state='active', expires=0 WHERE community=? AND addr=?").run(slug, who);
      else db.prepare("DELETE FROM community_members WHERE community=? AND addr=?").run(slug, who);
      return out(200, { ok: true });
    }

    if (p === "/api/communities/update") {
      if (!isOwner) return bad("forbidden", 403);
      const name = m.name === undefined ? c.name : clean(m.name, 40);
      const descr = m.descr === undefined ? c.descr : clean(m.descr, 300);
      const cover = m.cover === undefined ? c.cover : String(m.cover || "").trim();
      const about = m.about === undefined ? c.about : cleanText(m.about, 4000);
      let media = c.media;
      if (m.media !== undefined) { const mm = normMedia(m.media); if (!mm) return bad("bad_media"); media = JSON.stringify(mm); }
      if (name.length < 3) return bad("bad_name");
      if (cover && !IMG_RE.test(cover)) return bad("bad_cover");
      const visibility = slug === MAIN ? "open" : vis(m.visibility, c.visibility);
      const cats = m.categories === undefined && m.category === undefined ? (c.categories || c.category).split(",").filter(Boolean) : categoriesOr(m.categories ?? m.category);
      const language = m.language === undefined ? c.language : languageOr(m.language);
      db.prepare("UPDATE communities SET name=?, descr=?, about=?, media=?, cover=?, visibility=?, category=?, categories=?, language=?, updated=? WHERE slug=?").run(name, descr, about, media, cover, visibility, cats[0], cats.join(","), language, Date.now(), slug);
      return out(200, { ok: true, community: card(getC(slug) as Row, viewer) });
    }

    if (p === "/api/communities/plan_add") { // тариф: название, период, цена в USDC (0 = бесплатный)
      if (!isOwner) return bad("forbidden", 403);
      if (slug === MAIN) return bad("main_has_no_plans");
      const name = clean(m.name, 40), period = String(m.period || "");
      const price = Number(m.price);
      if (name.length < 2) return bad("bad_name");
      if (!(PERIODS as readonly string[]).includes(period)) return bad("bad_period");
      if (!Number.isFinite(price) || price < 0 || (price > 0 && price < MIN_MEMBER_PRICE) || price > MAX_PRICE_USDC) return bad("bad_price");
      if (plansOf(slug).length >= MAX_PLANS) return bad("too_many_plans");
      const trial = Math.max(0, Math.min(30, Math.floor(Number(m.trial) || 0))); // пробный период, 0–30 дней
      db.prepare("INSERT INTO community_plans(community,name,period,price_micro,trial_days,created) VALUES(?,?,?,?,?,?)").run(slug, name, period, Math.round(price * 1e6), trial, Date.now());
      return out(200, { ok: true, community: card(c, viewer) });
    }

    if (p === "/api/communities/plan_remove") {
      if (!isOwner) return bad("forbidden", 403);
      db.prepare("UPDATE community_plans SET active=0 WHERE id=? AND community=?").run(Number(m.id) || 0, slug);
      return out(200, { ok: true, community: card(c, viewer) });
    }

    if (p === "/api/communities/hide") {
      if (!isAdm(viewer)) return bad("forbidden", 403);
      if (slug === MAIN) return bad("cannot_hide_main");
      db.prepare("UPDATE communities SET status=?, updated=? WHERE slug=?").run(m.hidden === false ? "active" : "hidden", Date.now(), slug);
      return out(200, { ok: true });
    }

    return bad("not_found", 404);
  } catch (e) {
    const msg = (e as Error).message;
    return bad(msg === "too_big" || msg === "bad_json" ? msg : "server", msg === "server" ? 500 : 400);
  }
}
