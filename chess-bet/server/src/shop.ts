// Раздел «Товары и услуги» сообществ: цифровые товары (PDF) и услуги. Покупка без регистрации: достаточно почты.
// Оплата: СБП на номер из SBP_PHONE (администратор подтверждает вручную) или USDC в сети Polygon (сервер проверяет перевод сам).
// Файлы хранятся закрыто (SHOP_DIR) и выдаются только по оплаченному заказу.
// Товарами управляет владелец сообщества (лимит: Start 1, Pro 10) или администратор (MOD_ADMIN). Деньги идут на реквизиты платформы,
// комиссия платформы с продаж 20%, остальное выплачивается владельцу отдельно от выплат за участников.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type http from "node:http";
import Database from "better-sqlite3";
import { SITE, ykCreate, ykGet, ykReady } from "./yookassa.js";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
const DIR = process.env.SHOP_DIR || "./data/private";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(DIR, { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT, community TEXT NOT NULL, title TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'digital', price_rub INTEGER NOT NULL DEFAULT 0,
  price_micro INTEGER NOT NULL DEFAULT 0, file TEXT NOT NULL DEFAULT '', after TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', sold INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pr_com ON products(community, status);
CREATE TABLE IF NOT EXISTS orders(
  id TEXT PRIMARY KEY, product INTEGER NOT NULL, email TEXT NOT NULL, method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
  code TEXT NOT NULL, amount INTEGER NOT NULL, tx TEXT NOT NULL DEFAULT '', payer TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  downloads INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, paid_at INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS or_prod ON orders(product, status);
CREATE UNIQUE INDEX IF NOT EXISTS or_tx ON orders(tx) WHERE tx <> '';
`);
// Колонки учёта выплат владельцам: добавляем, если таблица создана раньше
for (const [c, t] of [["yk_id", "TEXT NOT NULL DEFAULT ''"], ["yk_url", "TEXT NOT NULL DEFAULT ''"], ["owner", "TEXT NOT NULL DEFAULT ''"], ["fee", "INTEGER NOT NULL DEFAULT 0"], ["share", "INTEGER NOT NULL DEFAULT 0"], ["payout_at", "INTEGER NOT NULL DEFAULT 0"]]) {
  try { db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`); } catch { /* колонка уже есть */ }
}

const ADMINS = new Set((process.env.MOD_ADMIN || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s)));
const isAdm = (a: string) => !!a && ADMINS.has(a.toLowerCase());
const PAY_TO = (process.env.ADS_PAY_TO || "").toLowerCase();
const PAY_TOKEN = (process.env.ADS_USDC || "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359").toLowerCase();
const SBP_PHONE = (process.env.SBP_PHONE || "").replace(/[^\d+]/g, "");
const SBP_BANK = process.env.SBP_BANK || "Сбербанк";
const SBP_HOLDER = process.env.SBP_HOLDER || ""; // имя получателя, как его покажет банк, например «Сергей К.»
const FILE_MAX = 40 * 1024 * 1024;
const MAX_DOWNLOADS = 1; // одна оплата = одно скачивание; при сбое продавец может сбросить счётчик
const FEE_PCT = 20; // комиссия платформы с продаж товаров и услуг (на любом тарифе)
const LIMIT_START = 1, LIMIT_PRO = 10, LIMIT_ADMIN = 1000;

type Verify = (tx: string, from: string, to: string, token: string, min: number) => Promise<boolean>;
let verify: Verify = async () => false;
/** Проверка перевода USDC в блокчейне (подключается из index.ts, как у платежей) */
export function setShopVerifier(fn: Verify) { verify = fn; }

type Product = { id: number; community: string; title: string; descr: string; image: string; kind: string; price_rub: number; price_micro: number; file: string; after: string; status: string; sold: number; created: number; updated: number };
type Order = { id: string; product: number; email: string; method: string; status: string; code: string; amount: number; tx: string; payer: string; note: string; downloads: number; created: number; paid_at: number; owner: string; fee: number; share: number; payout_at: number; yk_id?: string; yk_url?: string };

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max) : "");
const cleanText = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\r/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "");
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const cleanImage = (s: unknown): string => {
  const v = clean(s, 300);
  return /^\/media\/[a-f0-9]+\.(jpg|png|webp)$/i.test(v) || /^https:\/\/[^\s]+$/i.test(v) ? v : "";
};
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const FILE_RE = /^[a-f0-9]{24}\.pdf$/;

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
function readRaw(req: http.IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    req.on("data", (c: Buffer) => { size += c.length; if (size > max) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => reject(new Error("bad_upload")));
  });
}

const getP = (id: number) => db.prepare("SELECT * FROM products WHERE id=?").get(id) as Product | undefined;
const getO = (id: string) => (/^[a-f0-9]{24}$/.test(id) ? (db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Order | undefined) : undefined);
const communityOk = (slug: string) => !!db.prepare("SELECT 1 FROM communities WHERE slug=?").get(slug);
const ownerOf = (slug: string): string => {
  const r = db.prepare("SELECT owner FROM communities WHERE slug=?").get(slug) as { owner: string } | undefined;
  return (r?.owner || "").toLowerCase();
};
/** Управлять товарами сообщества может его владелец или администратор */
const canManage = (viewer: string, slug: string): boolean => !!viewer && (isAdm(viewer) || (!!ownerOf(slug) && ownerOf(slug) === viewer.toLowerCase()));
const isPro = (addr: string): boolean => {
  try {
    const r = db.prepare("SELECT plan, expires FROM creator_subs WHERE lower(addr)=?").get(addr.toLowerCase()) as { plan: string; expires: number } | undefined;
    return !!r && r.plan === "pro" && r.expires > Date.now();
  } catch { return false; }
};
const limitOf = (owner: string): number => (isAdm(owner) ? LIMIT_ADMIN : isPro(owner) ? LIMIT_PRO : LIMIT_START);
const usedIn = (slug: string, except = 0): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM products WHERE community=? AND id<>?").get(slug, except) as { n: number }).n;

/** Заказ оплачен: фиксируем долю платформы (20%) и долю владельца. Для сообществ администратора выплата не нужна */
const finalize = (o: Order, tx = "", payer = "") => {
  const pr = getP(o.product);
  const owner = pr ? ownerOf(pr.community) : "";
  const fee = Math.round((o.amount * FEE_PCT) / 100), share = o.amount - fee, now = Date.now();
  const settled = !owner || isAdm(owner) ? now : 0;
  db.transaction(() => {
    db.prepare("UPDATE orders SET status='paid', paid_at=?, owner=?, fee=?, share=?, payout_at=? WHERE id=?").run(now, owner, fee, share, settled, o.id);
    if (tx) db.prepare("UPDATE orders SET tx=?, payer=? WHERE id=?").run(tx, payer, o.id);
    db.prepare("UPDATE products SET sold=sold+1 WHERE id=?").run(o.product);
  })();
};
const codeOf = (): string => {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "HM-";
  for (const b of crypto.randomBytes(5)) s += A[b % A.length];
  return s;
};
const txUsed = (tx: string): boolean => {
  if (db.prepare("SELECT 1 FROM orders WHERE tx=?").get(tx)) return true;
  for (const q of ["SELECT 1 FROM pay_in WHERE tx=?", "SELECT 1 FROM ads_pay WHERE tx=?"]) {
    try { if (db.prepare(q).get(tx)) return true; } catch { /* таблицы может не быть */ }
  }
  return false;
};

const publicProduct = (p: Product) => ({
  id: p.id, community: p.community, title: p.title, descr: p.descr, image: p.image, kind: p.kind,
  priceRub: p.price_rub, priceUsdc: p.price_micro / 1e6, hasFile: !!p.file, sold: p.sold,
});
const adminProduct = (p: Product) => ({ ...publicProduct(p), status: p.status, after: p.after, created: p.created, updated: p.updated });

/** Реквизиты для оплаты заказа (только пока заказ не оплачен) */
const payInfo = (o: Order) => o.method === "yk"
  ? { method: "yk", url: o.yk_url || "", amountRub: o.amount, comment: o.code }
  : o.method === "sbp"
  ? { method: "sbp", phone: SBP_PHONE, bank: SBP_BANK, holder: SBP_HOLDER, amountRub: o.amount, comment: o.code }
  : { method: "usdc", to: PAY_TO, token: PAY_TOKEN, network: "Polygon", amount: o.amount / 1e6, comment: o.code };

const publicOrder = (o: Order, p: Product | undefined) => {
  const paid = o.status === "paid";
  return {
    id: o.id, code: o.code, method: o.method, status: o.status, amount: o.method === "usdc" ? o.amount / 1e6 : o.amount, created: o.created, paid_at: o.paid_at,
    product: p ? { id: p.id, title: p.title, image: p.image, kind: p.kind, community: p.community } : null,
    pay: o.status === "new" || o.status === "claimed" ? payInfo(o) : null,
    after: paid && p ? p.after : "",
    canDownload: paid && !!p && !!p.file && o.downloads < MAX_DOWNLOADS,
  };
};

/** Сверка заказа с ЮKassa: оплачен → фиксируем; отменён → закрываем. Сумма и номер заказа должны совпасть */
async function syncYk(o: Order): Promise<void> {
  if (!o.yk_id || o.status === "paid") return;
  try {
    const r = await ykGet(o.yk_id);
    if (r.orderId !== o.id) return;
    if (r.status === "succeeded" && r.paid && r.rub === o.amount) {
      const cur = getO(o.id);
      if (cur && cur.status !== "paid") { try { finalize(cur, "yk:" + o.yk_id, ""); } catch { /* уже учтён */ } }
    } else if (r.status === "canceled") {
      db.prepare("UPDATE orders SET status='rejected' WHERE id=? AND status<>'paid'").run(o.id);
    }
  } catch { /* повторим при следующем запросе */ }
}

/** Маршруты /api/shop/* */
export async function handleShop(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/api/shop")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  try {
    // ===== публичное чтение =====
    if (req.method === "GET" && p === "/api/shop/products") {
      const slug = clean(url.searchParams.get("community"), 30).toLowerCase();
      const manage = !!slug && canManage(viewer, slug);
      const all = url.searchParams.get("all") === "1" && manage;
      const rows = (slug
        ? db.prepare("SELECT * FROM products WHERE community=? ORDER BY id DESC").all(slug)
        : db.prepare("SELECT * FROM products WHERE status='active' ORDER BY id DESC").all()) as Product[];
      const items = rows.filter((r) => all || r.status === "active");
      const owner = slug ? ownerOf(slug) : "";
      return out(200, { ok: true, items: items.map(all ? adminProduct : publicProduct), manage, limit: manage ? limitOf(owner) : 0, used: manage ? usedIn(slug) : 0, feePct: FEE_PCT });
    }
    if (req.method === "GET" && p === "/api/shop/product") {
      const pr = getP(num(url.searchParams.get("id")));
      const mg = !!pr && canManage(viewer, pr.community);
      if (!pr || (pr.status !== "active" && !mg)) return bad("not_found", 404);
      return out(200, { ok: true, product: mg ? adminProduct(pr) : publicProduct(pr), sbp: !!SBP_PHONE, yk: ykReady(), usdc: /^0x[a-f0-9]{40}$/.test(PAY_TO) });
    }

    // ===== покупка без регистрации =====
    if (req.method === "POST" && p === "/api/shop/order") {
      if (limited("so:" + ip, 12, 3600000)) return bad("slow_down", 429);
      const m = await readBody(req);
      const pr = getP(num(m.product));
      if (!pr || pr.status !== "active") return bad("not_found", 404);
      if (pr.kind === "digital" && !pr.file) return bad("not_ready");
      const email = clean(m.email, 254).toLowerCase();
      if (!EMAIL_RE.test(email)) return bad("bad_email");
      const method = m.method === "usdc" ? "usdc" : m.method === "yk" ? "yk" : "sbp";
      if (method === "yk" && (!ykReady() || pr.price_rub <= 0)) return bad("method_unavailable");
      if (method === "sbp" && (!SBP_PHONE || pr.price_rub <= 0)) return bad("method_unavailable");
      if (method === "usdc" && (!/^0x[a-f0-9]{40}$/.test(PAY_TO) || pr.price_micro <= 0)) return bad("method_unavailable");
      const id = crypto.randomBytes(12).toString("hex");
      const o: Order = { id, product: pr.id, email, method, status: "new", code: codeOf(), amount: method === "usdc" ? pr.price_micro : pr.price_rub, tx: "", payer: "", note: "", downloads: 0, created: Date.now(), paid_at: 0, owner: "", fee: 0, share: 0, payout_at: 0 };
      db.prepare("INSERT INTO orders(id,product,email,method,status,code,amount,created) VALUES(?,?,?,?,?,?,?,?)").run(o.id, o.product, o.email, o.method, o.status, o.code, o.amount, o.created);
      if (method === "yk") {
        try {
          const yk = await ykCreate(o.id, o.amount, `Заказ ${o.code}: ${pr.title}`, `${SITE}/product/?order=${o.id}`);
          db.prepare("UPDATE orders SET yk_id=?, yk_url=? WHERE id=?").run(yk.id, yk.url, o.id);
          o.yk_id = yk.id; o.yk_url = yk.url;
        } catch { db.prepare("UPDATE orders SET status='rejected' WHERE id=?").run(o.id); return bad("pay_unavailable", 502); }
      }
      return out(200, { ok: true, order: publicOrder(o, pr) });
    }
    if (req.method === "GET" && p === "/api/shop/order") {
      if (limited("sg:" + ip, 240, 3600000)) return bad("slow_down", 429);
      let o = getO(clean(url.searchParams.get("id"), 40));
      if (!o) return bad("not_found", 404);
      if (o.method === "yk" && o.status !== "paid" && o.yk_id) { await syncYk(o); o = getO(o.id) as Order; }
      return out(200, { ok: true, order: publicOrder(o, getP(o.product)) });
    }
    // ЮKassa: уведомление о платеже. Статус перепроверяем запросом к ЮKassa, на любое уведомление отвечаем 200
    if (req.method === "POST" && p === "/api/shop/yk/webhook") {
      try {
        const m = await readBody(req);
        const obj = (m.object || {}) as Record<string, unknown>;
        const id = clean(obj.id, 64);
        const o = id ? (db.prepare("SELECT * FROM orders WHERE yk_id=?").get(id) as Order | undefined) : undefined;
        if (o && o.status !== "paid") await syncYk(o);
      } catch { /* ЮKassa повторит уведомление */ }
      res.writeHead(200); res.end(); return true;
    }
    // СБП: покупатель нажал «Я оплатил»
    if (req.method === "POST" && p === "/api/shop/order/claim") {
      if (limited("sc:" + ip, 30, 3600000)) return bad("slow_down", 429);
      const m = await readBody(req);
      const o = getO(clean(m.id, 40));
      if (!o) return bad("not_found", 404);
      if (o.method !== "sbp") return bad("bad_method");
      if (o.status === "paid") return out(200, { ok: true, order: publicOrder(o, getP(o.product)) });
      if (o.status === "rejected") return bad("rejected");
      db.prepare("UPDATE orders SET status='claimed', note=? WHERE id=?").run(clean(m.note, 60), o.id);
      const n = getO(o.id) as Order;
      return out(200, { ok: true, order: publicOrder(n, getP(n.product)) });
    }
    // USDC: покупатель прислал хеш перевода и адрес, с которого платил
    if (req.method === "POST" && p === "/api/shop/order/verify") {
      if (limited("sv:" + ip, 20, 3600000)) return bad("slow_down", 429);
      const m = await readBody(req);
      const o = getO(clean(m.id, 40));
      if (!o) return bad("not_found", 404);
      if (o.method !== "usdc") return bad("bad_method");
      if (o.status === "paid") return out(200, { ok: true, order: publicOrder(o, getP(o.product)) });
      const tx = clean(m.tx, 80).toLowerCase(), from = clean(m.from, 60).toLowerCase();
      if (!/^0x[a-f0-9]{64}$/.test(tx)) return bad("bad_tx");
      if (!/^0x[a-f0-9]{40}$/.test(from)) return bad("bad_wallet");
      if (txUsed(tx)) return bad("tx_used", 402);
      let ok = false;
      try { ok = await verify(tx, from, PAY_TO, PAY_TOKEN, o.amount); } catch { return bad("pay_unverified", 402); }
      if (!ok) return bad("pay_unverified", 402);
      try { finalize(o, tx, from); } catch { return bad("tx_used", 402); }
      const n = getO(o.id) as Order;
      return out(200, { ok: true, order: publicOrder(n, getP(n.product)) });
    }
    // скачивание: по секретному номеру оплаченного заказа
    if (req.method === "GET" && p === "/api/shop/download") {
      if (limited("sd:" + ip, 60, 3600000)) return bad("slow_down", 429);
      const o = getO(clean(url.searchParams.get("id"), 40));
      if (!o || o.status !== "paid") return bad("not_paid", 402);
      const pr = getP(o.product);
      if (!pr || !FILE_RE.test(pr.file)) return bad("not_found", 404);
      if (o.downloads >= MAX_DOWNLOADS) return bad("download_limit", 403);
      const file = path.join(DIR, pr.file);
      let st: fs.Stats;
      try { st = fs.statSync(file); } catch { return bad("not_found", 404); }
      db.prepare("UPDATE orders SET downloads=downloads+1 WHERE id=?").run(o.id);
      const name = (pr.title.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "book") + ".pdf";
      res.writeHead(200, {
        "Content-Type": "application/pdf", "Content-Length": st.size, "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="book.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      });
      fs.createReadStream(file).pipe(res);
      return true;
    }

    // ===== дальше нужен вход =====
    if (!viewer) return bad("auth", 401);
    const admin = isAdm(viewer);

    if (req.method === "POST" && p === "/api/shop/product/save") {
      const m = await readBody(req);
      const id = num(m.id);
      const community = clean(m.community, 30).toLowerCase();
      const title = clean(m.title, 80);
      const kind = m.kind === "service" ? "service" : "digital";
      const priceRub = Math.min(1000000, Math.floor(num(m.priceRub)));
      const micro = Math.min(1e11, Math.round(num(m.priceUsdc) * 1e6));
      if (!communityOk(community)) return bad("not_found", 404);
      const old = id ? getP(id) : undefined;
      if (id && !old) return bad("not_found", 404);
      if (!canManage(viewer, community) || (old && !canManage(viewer, old.community))) return bad("forbidden", 403);
      if (!title) return bad("title_required");
      if (priceRub <= 0 && micro <= 0) return bad("price_required");
      // лимит товаров в сообществе: Start 1, Pro 10 (проверяем при создании и при переносе в другое сообщество)
      if ((!old || old.community !== community) && usedIn(community) >= limitOf(ownerOf(community))) return bad("limit_reached", 402);
      const descr = cleanText(m.descr, 4000), after = cleanText(m.after, 600), image = cleanImage(m.image);
      const status = m.status === "hidden" ? "hidden" : "active";
      const now = Date.now();
      if (old) {
        db.prepare("UPDATE products SET community=?, title=?, descr=?, image=?, kind=?, price_rub=?, price_micro=?, after=?, status=?, updated=? WHERE id=?")
          .run(community, title, descr, image, kind, priceRub, micro, after, status, now, old.id);
        return out(200, { ok: true, id: old.id });
      }
      const r = db.prepare("INSERT INTO products(community,title,descr,image,kind,price_rub,price_micro,after,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(community, title, descr, image, kind, priceRub, micro, after, status, now, now);
      return out(200, { ok: true, id: Number(r.lastInsertRowid) });
    }
    if (req.method === "POST" && p === "/api/shop/product/delete") {
      const m = await readBody(req);
      const pr = getP(num(m.id));
      if (!pr) return bad("not_found", 404);
      if (!canManage(viewer, pr.community)) return bad("forbidden", 403);
      if (db.prepare("SELECT 1 FROM orders WHERE product=? AND status='paid'").get(pr.id)) return bad("has_orders"); // с оплаченными заказами удалять нельзя: скройте товар
      db.prepare("DELETE FROM orders WHERE product=?").run(pr.id);
      db.prepare("DELETE FROM products WHERE id=?").run(pr.id);
      if (FILE_RE.test(pr.file)) fs.rm(path.join(DIR, pr.file), () => { /* файл мог быть удалён */ });
      return out(200, { ok: true });
    }
    // закрытая загрузка PDF товара: тело запроса = файл
    if (req.method === "POST" && p === "/api/shop/upload") {
      const pr = getP(num(url.searchParams.get("id")));
      if (!pr) return bad("not_found", 404);
      if (!canManage(viewer, pr.community)) return bad("forbidden", 403);
      let buf: Buffer;
      try { buf = await readRaw(req, FILE_MAX); } catch (e) { return bad(e instanceof Error && e.message === "too_big" ? "too_big" : "bad_upload", 413); }
      if (buf.length < 100 || buf.subarray(0, 1024).indexOf("%PDF-") < 0) return bad("bad_type");
      const name = crypto.randomBytes(12).toString("hex") + ".pdf";
      fs.writeFileSync(path.join(DIR, name), buf);
      const old = pr.file;
      db.prepare("UPDATE products SET file=?, updated=? WHERE id=?").run(name, Date.now(), pr.id);
      if (FILE_RE.test(old)) fs.rm(path.join(DIR, old), () => { /* старый файл */ });
      return out(200, { ok: true, bytes: buf.length });
    }

    // заказы: владелец видит заказы своего сообщества (почту покупателя только у оплаченных), администратор видит всё
    if (req.method === "GET" && p === "/api/shop/orders") {
      const slug = clean(url.searchParams.get("community"), 30).toLowerCase();
      if (slug ? !canManage(viewer, slug) : !admin) return bad("forbidden", 403);
      const rows = (slug
        ? db.prepare("SELECT o.* FROM orders o JOIN products p ON p.id=o.product WHERE p.community=? ORDER BY o.created DESC LIMIT 300").all(slug)
        : db.prepare("SELECT * FROM orders ORDER BY created DESC LIMIT 300").all()) as Order[];
      const titles = new Map((db.prepare("SELECT id,title,community FROM products").all() as { id: number; title: string; community: string }[]).map((r) => [r.id, r]));
      const unit = (o: Order, v: number) => (o.method === "usdc" ? v / 1e6 : v);
      return out(200, {
        ok: true,
        items: rows.map((o) => ({
          id: o.id, code: o.code, email: admin || o.status === "paid" ? o.email : "", method: o.method, status: o.status, amount: unit(o, o.amount),
          fee: unit(o, o.fee), share: unit(o, o.share), payout: o.status === "paid" ? (o.payout_at ? "done" : "pending") : "",
          note: admin ? o.note : "", tx: admin ? o.tx : "", product: o.product, title: titles.get(o.product)?.title || "", community: titles.get(o.product)?.community || "",
          created: o.created, paid_at: o.paid_at, downloads: o.downloads,
        })),
      });
    }
    // подтверждение оплаты по СБП: деньги приходят на реквизиты платформы, поэтому только администратор
    if (req.method === "POST" && p === "/api/shop/order/confirm") {
      const m = await readBody(req);
      const o = getO(clean(m.id, 40));
      if (!o) return bad("not_found", 404);
      const action = String(m.action || "");
      const pr = getP(o.product);
      if (action === "reset") {
        if (!pr || !canManage(viewer, pr.community)) return bad("forbidden", 403);
        db.prepare("UPDATE orders SET downloads=0 WHERE id=?").run(o.id);
        return out(200, { ok: true });
      }
      if (!admin) return bad("forbidden", 403);
      if (action === "paid") {
        if (o.status !== "paid") finalize(o);
      } else if (action === "reject") {
        if (o.status === "paid") return bad("already_paid");
        db.prepare("UPDATE orders SET status='rejected' WHERE id=?").run(o.id);
      } else return bad("bad_action");
      return out(200, { ok: true });
    }

    // Заработок от товаров и услуг (отдельно от выплат за участников): доля владельца = сумма минус 20%
    if (req.method === "GET" && p === "/api/shop/earnings") {
      const slug = clean(url.searchParams.get("community"), 30).toLowerCase();
      const sums = (rows: { method: string; done: number; n: number; share: number; fee: number; gross: number }[]) => {
        const z = () => ({ pending: 0, paid: 0, fee: 0, gross: 0, count: 0 });
        const r = { rub: z(), usdc: z() };
        for (const x of rows) {
          const t = x.method === "usdc" ? r.usdc : r.rub, d = x.method === "usdc" ? 1e6 : 1;
          if (x.done) t.paid += x.share / d; else t.pending += x.share / d;
          t.fee += x.fee / d; t.gross += x.gross / d; t.count += x.n;
        }
        return r;
      };
      const Q = "SELECT o.method AS method, (o.payout_at>0) AS done, COUNT(*) AS n, SUM(o.share) AS share, SUM(o.fee) AS fee, SUM(o.amount) AS gross FROM orders o";
      if (slug) {
        if (!canManage(viewer, slug)) return bad("forbidden", 403);
        const rows = db.prepare(`${Q} JOIN products p ON p.id=o.product WHERE o.status='paid' AND p.community=? GROUP BY o.method, done`).all(slug) as Parameters<typeof sums>[0];
        return out(200, { ok: true, feePct: FEE_PCT, ...sums(rows) });
      }
      if (!admin) return bad("forbidden", 403);
      const list = db.prepare(`SELECT p.community AS community, o.owner AS owner FROM orders o JOIN products p ON p.id=o.product WHERE o.status='paid' AND o.payout_at=0 GROUP BY p.community, o.owner`).all() as { community: string; owner: string }[];
      const items = list.map((c) => ({
        community: c.community, owner: c.owner,
        ...sums(db.prepare(`${Q} JOIN products p ON p.id=o.product WHERE o.status='paid' AND o.payout_at=0 AND p.community=? GROUP BY o.method, done`).all(c.community) as Parameters<typeof sums>[0]),
      }));
      return out(200, { ok: true, feePct: FEE_PCT, items });
    }
    // администратор отмечает, что выплата за проданные товары владельцу сообщества сделана
    if (req.method === "POST" && p === "/api/shop/payout") {
      if (!admin) return bad("forbidden", 403);
      const m = await readBody(req);
      const slug = clean(m.community, 30).toLowerCase();
      if (!communityOk(slug)) return bad("not_found", 404);
      const r = db.prepare("UPDATE orders SET payout_at=? WHERE status='paid' AND payout_at=0 AND product IN (SELECT id FROM products WHERE community=?)").run(Date.now(), slug);
      return out(200, { ok: true, orders: r.changes });
    }
    return bad("not_found", 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return bad(msg === "too_big" ? "too_big" : "bad_json");
  }
}
