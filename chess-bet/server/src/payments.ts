// Платежи в USDC (Polygon) на кошелёк платформы (ADS_PAY_TO, тот же, что получает комиссию со ставок) и учёт выплат.
// 1) Тариф создателя сообщества: оплата → доступ на месяц/год; пригласившему создателя платформа начисляет 40% пожизненно.
// 2) Платное участие в сообществе: оплата → доступ; комиссия платформы 10% (Старт) или 3% (Про); доля партнёра берётся из части владельца.
// Деньги участников приходят на кошелёк платформы, сервер ведёт учёт; выплаты владельцам и партнёрам — по понедельникам за прошлую неделю (пн–вс по UTC).
// Выплату администратор делает вручную и отмечает в разделе «Получено».
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type http from "node:http";
import Database from "better-sqlite3";
import { MAX_MEMBER_PRICE, MAX_PARTNER_PCT, MIN_MEMBER_PRICE, PLATFORM_AFFILIATE_PCT, planById, priceFor } from "./pricing.js";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS creator_subs(addr TEXT PRIMARY KEY, plan TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pay_in(
  tx TEXT PRIMARY KEY, kind TEXT NOT NULL, payer TEXT NOT NULL, community TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT '',
  gross INTEGER NOT NULL, fee INTEGER NOT NULL, to_owner INTEGER NOT NULL DEFAULT 0, to_partner INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pi_payer ON pay_in(payer);
CREATE TABLE IF NOT EXISTS pay_out(
  id INTEGER PRIMARY KEY AUTOINCREMENT, tx TEXT NOT NULL, payee TEXT NOT NULL, role TEXT NOT NULL, community TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL, due INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', paid_tx TEXT NOT NULL DEFAULT '', paid_at INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS po_due ON pay_out(due, status);
CREATE INDEX IF NOT EXISTS po_payee ON pay_out(payee);
CREATE TABLE IF NOT EXISTS partner_plans(
  id INTEGER PRIMARY KEY AUTOINCREMENT, community TEXT NOT NULL, name TEXT NOT NULL, pct INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS pp_com ON partner_plans(community, active);
CREATE TABLE IF NOT EXISTS partner_links(
  code TEXT PRIMARY KEY, community TEXT NOT NULL, partner TEXT NOT NULL, tariff INTEGER NOT NULL, created INTEGER NOT NULL, UNIQUE(community, partner));
CREATE TABLE IF NOT EXISTS creator_ref(addr TEXT PRIMARY KEY, ref TEXT NOT NULL, created INTEGER NOT NULL);
`);
try { db.exec("ALTER TABLE creator_subs ADD COLUMN source TEXT NOT NULL DEFAULT 'paid'"); } catch { /* колонка уже есть */ }

const DAY = 86400000;
const PAY_TO = (process.env.ADS_PAY_TO || "").toLowerCase();
const PAY_TOKEN = (process.env.ADS_USDC || "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359").toLowerCase();
const ADMINS = new Set((process.env.MOD_ADMIN || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s)));
const isAdm = (a: string) => !!a && ADMINS.has(a.toLowerCase());
const MAIN = "himeet";
const MAX_PARTNER_TARIFFS = 6;

export const payReady = (): boolean => /^0x[a-f0-9]{40}$/.test(PAY_TO);

type Verify = (tx: string, from: string, to: string, token: string, min: number) => Promise<boolean>;
let verify: Verify = async () => false;
/** Проверка перевода USDC в блокчейне (подключается из index.ts) */
export function setChainVerifier(fn: Verify) { verify = fn; }
type RefResolver = (addr: string) => Promise<string>;
let resolveRef: RefResolver = async () => "";
/** Кто пригласил человека на HiMeet (подключается из index.ts); этот человек получает 40% с тарифа приглашённого создателя */
export function setReferrerResolver(fn: RefResolver) { resolveRef = fn; }

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
    req.on("data", (c: Buffer) => { n += c.length; if (n > 4096) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}
const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const isAddr = (s: string) => /^0x[a-f0-9]{40}$/.test(s);

/** Понедельник 00:00 UTC недели, в которую пришёл платёж; выплата за неделю делается в следующий понедельник */
const weekStart = (ts: number): number => {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
};
const dueFor = (ts: number): number => weekStart(ts) + 7 * DAY;

const userRow = (a: string) => db.prepare("SELECT name, banned FROM users WHERE addr=?").get(a) as { name: string; banned: number } | undefined;
const nameOf = (a: string): string => userRow(a)?.name || (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
const subOf = (a: string) => db.prepare("SELECT plan, expires FROM creator_subs WHERE addr=?").get(a) as { plan: string; expires: number } | undefined;
const activeSub = (a: string) => { const s = subOf(a); return s && s.expires > Date.now() ? s : undefined; };
/** Комиссия платформы с платежей участников: по тарифу владельца (нет оплаченного тарифа: как у «Старт») */
const feePctOf = (owner: string): number => planById(activeSub(owner)?.plan || "start")?.feePct ?? 10;
/** Партнёрские тарифы доступны на «Про» (и администратору) */
const ownerIsPro = (owner: string): boolean => isAdm(owner) || activeSub(owner)?.plan === "pro";

type Row = { slug: string; name: string; owner: string; status: string; visibility: string };
type CPlan = { id: number; community: string; name: string; period: string; price_micro: number; active: number };
const getC = (slug: string) => db.prepare("SELECT slug,name,owner,status,visibility FROM communities WHERE slug=?").get(slug) as Row | undefined;

/** Проверяет перевод и сообщает ошибку, если он не годится. Хеш можно использовать только один раз (в том числе уже занятый оплатой объявлений) */
async function checkTx(tx: string, payer: string, micro: number): Promise<string | null> {
  if (!payReady()) return "payment_unavailable";
  if (!/^0x[a-f0-9]{64}$/.test(tx)) return "payment_required";
  if (db.prepare("SELECT 1 FROM pay_in WHERE tx=?").get(tx)) return "tx_used";
  try { if (db.prepare("SELECT 1 FROM ads_pay WHERE tx=?").get(tx)) return "tx_used"; } catch { /* таблицы объявлений может не быть */ }
  let ok = false;
  try { ok = await verify(tx, payer, PAY_TO, PAY_TOKEN, micro); } catch { return "pay_unverified"; }
  return ok ? null : "pay_unverified";
}

const periodDays = (p: string): number => (p === "month" ? 30 : p === "quarter" ? 90 : p === "year" ? 365 : 0);

/** Маршруты /api/pay/* */
export async function handlePay(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/api/pay/")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  try {
    if (req.method === "GET" && p === "/api/pay/info") return out(200, { ok: true, ready: payReady(), to: PAY_TO, token: PAY_TOKEN, decimals: 6, minPrice: MIN_MEMBER_PRICE, maxPrice: MAX_MEMBER_PRICE });
    if (!viewer) return bad("auth", 401);
    const me = userRow(viewer);
    if (me?.banned) return bad("banned", 403);
    const adm = isAdm(viewer);

    // ===== чтение =====
    if (req.method === "GET" && p === "/api/pay/admin") { // раздел «Получено» для администратора
      if (!adm) return bad("forbidden", 403);
      const dues = (db.prepare("SELECT DISTINCT due FROM pay_out ORDER BY due DESC LIMIT 30").all() as { due: number }[]).map((r) => r.due);
      const pend = db.prepare("SELECT MIN(due) AS d FROM pay_out WHERE status='pending'").get() as { d: number | null };
      const asked = Number(url.searchParams.get("due"));
      const due = asked > 0 ? asked : pend.d ?? dueFor(Date.now());
      const rows = db.prepare(`SELECT po.id, po.tx, po.payee, po.role, po.community, po.amount, po.due, po.status, po.paid_tx, po.paid_at,
          pi.kind, pi.payer, pi.plan, pi.gross, pi.fee, pi.created
        FROM pay_out po JOIN pay_in pi ON pi.tx=po.tx WHERE po.due=? ORDER BY po.payee, pi.created`).all(due) as {
          id: number; tx: string; payee: string; role: string; community: string; amount: number; due: number; status: string; paid_tx: string; paid_at: number;
          kind: string; payer: string; plan: string; gross: number; fee: number; created: number }[];
      const items = rows.map((r) => {
        const c = r.community ? getC(r.community) : undefined;
        return {
          id: r.id, tx: r.tx, kind: r.kind, role: r.role, community: r.community,
          title: r.kind === "creator" ? "Тариф создателя: " + r.plan : c?.name || r.community, // наименование сообщества
          from: r.payer, fromName: nameOf(r.payer),                                           // от кого получено
          gross: r.gross / 1e6, fee: r.fee / 1e6, amount: r.amount / 1e6,                      // получено, комиссия, сумма выплаты
          payee: r.payee, payeeName: nameOf(r.payee),                                         // кошелёк выплаты
          due: r.due, at: r.created, status: r.status, paidTx: r.paid_tx, paidAt: r.paid_at,
        };
      });
      const by = new Map<string, { payee: string; name: string; total: number; pending: number; count: number }>();
      for (const i of items) {
        const b = by.get(i.payee) || { payee: i.payee, name: i.payeeName, total: 0, pending: 0, count: 0 };
        b.total += i.amount; b.count++; if (i.status === "pending") b.pending += i.amount;
        by.set(i.payee, b);
      }
      const round = (n: number) => Math.round(n * 1e6) / 1e6;
      return out(200, {
        ok: true, due, dues, items,
        byPayee: [...by.values()].map((b) => ({ ...b, total: round(b.total), pending: round(b.pending) })),
        totals: { gross: round(items.reduce((s, i) => s + i.gross, 0)), fee: round(items.reduce((s, i) => s + i.fee, 0)), payout: round(items.reduce((s, i) => s + i.amount, 0)) },
      });
    }

    if (req.method === "GET" && p === "/api/pay/mysub") { // мой тариф создателя
      const s = subOf(viewer);
      return out(200, { ok: true, plan: s && s.expires > Date.now() ? s.plan : "", expires: s?.expires ?? 0 });
    }

    if (req.method === "GET" && p === "/api/pay/community_stats") {
      const slug = clean(url.searchParams.get("slug"), 30).toLowerCase();
      const c = getC(slug);
      if (!c) return bad("not_found", 404);
      if (c.owner !== viewer && !adm) return bad("forbidden", 403);

      const now = Date.now(), since = now - 30 * DAY;
      const round = (n: number) => Math.round(n * 1e6) / 1e6;
      const members = (db.prepare(
        "SELECT COUNT(*) AS n FROM community_members WHERE community=? AND state='active' AND (expires=0 OR expires>?)"
      ).get(slug, now) as { n: number }).n;
      const paidMembers = (db.prepare(
        "SELECT COUNT(*) AS n FROM community_members WHERE community=? AND state='active' AND plan>0 AND (expires=0 OR expires>?)"
      ).get(slug, now) as { n: number }).n;

      const usdc = db.prepare(`
        SELECT COALESCE(SUM(gross),0) gross, COALESCE(SUM(fee),0) fee,
          COALESCE(SUM(to_owner),0) earned,
          COALESCE(SUM(CASE WHEN created>=? THEN to_owner ELSE 0 END),0) last30
        FROM pay_in WHERE kind='member' AND community=?
      `).get(since, slug) as { gross:number; fee:number; earned:number; last30:number };
      const usdcPending = (db.prepare(
        "SELECT COALESCE(SUM(amount),0) n FROM pay_out WHERE community=? AND role='owner' AND status='pending'"
      ).get(slug) as { n:number }).n;
      const usdcPaid = (db.prepare(
        "SELECT COALESCE(SUM(amount),0) n FROM pay_out WHERE community=? AND role='owner' AND status='paid'"
      ).get(slug) as { n:number }).n;

      let rub = { gross:0, fee:0, earned:0, last30:0, pending:0, paid:0 };
      let rubHistory: { currency:string; amount:number; fee:number; at:number; payer:string; plan:string }[] = [];
      try {
        rub = db.prepare(`
          SELECT COALESCE(SUM(rub),0) gross, COALESCE(SUM(fee),0) fee,
            COALESCE(SUM(share),0) earned,
            COALESCE(SUM(CASE WHEN paid_at>=? THEN share ELSE 0 END),0) last30,
            COALESCE(SUM(CASE WHEN payout_at=0 THEN share ELSE 0 END),0) pending,
            COALESCE(SUM(CASE WHEN payout_at>0 THEN share ELSE 0 END),0) paid
          FROM member_pay WHERE community=? AND status='paid'
        `).get(since, slug) as typeof rub;
        rubHistory = db.prepare(`
          SELECT mp.rub, mp.fee, mp.paid_at, mp.addr, cp.name
          FROM member_pay mp LEFT JOIN community_plans cp ON cp.id=mp.plan
          WHERE mp.community=? AND mp.status='paid'
          ORDER BY mp.paid_at DESC LIMIT 20
        `).all(slug).map((r: any) => ({
          currency:"RUB", amount:r.rub, fee:r.fee, at:r.paid_at, payer:r.addr, plan:r.name || ""
        }));
      } catch { /* таблица ЮKassa ещё не создана */ }

      const usdcHistory = db.prepare(`
        SELECT payer, plan, gross, fee, created FROM pay_in
        WHERE kind='member' AND community=? ORDER BY created DESC LIMIT 20
      `).all(slug).map((r: any) => ({
        currency:"USDC", amount:r.gross / 1e6, fee:r.fee / 1e6,
        at:r.created, payer:r.payer, plan:r.plan
      }));

      return out(200, {
        ok:true, members, paidMembers,
        usdc:{
          gross:round(usdc.gross / 1e6), fee:round(usdc.fee / 1e6),
          earned:round(usdc.earned / 1e6), last30:round(usdc.last30 / 1e6),
          pending:round(usdcPending / 1e6), paid:round(usdcPaid / 1e6)
        },
        rub:{
          gross:rub.gross, fee:rub.fee, earned:rub.earned, last30:rub.last30,
          pending:rub.pending, paid:rub.paid
        },
        history:[...usdcHistory, ...rubHistory].sort((a,b)=>b.at-a.at).slice(0,20)
      });
    }

    if (req.method === "GET" && p === "/api/pay/affiliate") { // страница партнёрки платформы: приглашённые создатели
      const now = Date.now();
      const sum = (sql: string, ...a: unknown[]) => ((db.prepare(sql).get(...a) as { s: number | null }).s ?? 0) / 1e6;
      const refs = (db.prepare("SELECT addr FROM creator_ref WHERE ref=?").all(viewer) as { addr: string }[]);
      return out(200, {
        ok: true, pct: PLATFORM_AFFILIATE_PCT, wallet: viewer, creators: refs.length,
        last30: sum("SELECT SUM(amount) AS s FROM pay_out WHERE payee=? AND role='referrer' AND tx IN (SELECT tx FROM pay_in WHERE created>?)", viewer, now - 30 * DAY),
        lifetime: sum("SELECT SUM(amount) AS s FROM pay_out WHERE payee=? AND role='referrer'", viewer),
        balance: sum("SELECT SUM(amount) AS s FROM pay_out WHERE payee=? AND role='referrer' AND status='pending'", viewer),
        paid: sum("SELECT SUM(amount) AS s FROM pay_out WHERE payee=? AND role='referrer' AND status='paid'", viewer),
        nextPayout: dueFor(now),
      });
    }

    if (req.method === "GET" && p === "/api/pay/partner_mine") { // мои партнёрские ссылки в сообществах и заработок
      const links = db.prepare(`SELECT l.code, l.community, t.name AS tname, t.pct FROM partner_links l JOIN partner_plans t ON t.id=l.tariff
        WHERE l.partner=? AND t.active=1`).all(viewer) as { code: string; community: string; tname: string; pct: number }[];
      const sum = (st: string) => ((db.prepare("SELECT SUM(amount) AS s FROM pay_out WHERE payee=? AND role='partner' AND status=?").get(viewer, st) as { s: number | null }).s ?? 0) / 1e6;
      return out(200, { ok: true, links: links.map((l) => ({ code: l.code, slug: l.community, community: getC(l.community)?.name || l.community, tariff: l.tname, pct: l.pct })), pending: sum("pending"), paid: sum("paid") });
    }

    if (req.method === "GET" && p === "/api/pay/partner_list") { // для владельца: тарифы и партнёры
      const c = getC(clean(url.searchParams.get("slug"), 30));
      if (!c) return bad("not_found", 404);
      if (c.owner !== viewer && !adm) return bad("forbidden", 403);
      const tariffs = db.prepare("SELECT id, name, pct FROM partner_plans WHERE community=? AND active=1 ORDER BY id").all(c.slug);
      const partners = (db.prepare("SELECT code, partner, tariff FROM partner_links WHERE community=? ORDER BY created").all(c.slug) as { code: string; partner: string; tariff: number }[]).map((l) => {
        const q = (st: string) => ((db.prepare("SELECT SUM(amount) AS s FROM pay_out WHERE payee=? AND role='partner' AND community=? AND status=?").get(l.partner, c.slug, st) as { s: number | null }).s ?? 0) / 1e6;
        return { code: l.code, addr: l.partner, name: nameOf(l.partner), tariff: l.tariff, pending: q("pending"), paid: q("paid") };
      });
      return out(200, { ok: true, pro: ownerIsPro(c.owner), tariffs, partners });
    }

    if (req.method !== "POST") return bad("not_found", 404);
    if (limited("pay_u:" + viewer, 120, 3600000)) return bad("slow_down", 429);
    const m = await readBody(req);

    // ===== оплата тарифа создателя =====
    if (p === "/api/pay/creator") {
      if (!me) return bad("no_profile", 403);
      const plan = planById(clean(m.plan, 10));
      const period = m.period === "year" ? "year" : "month";
      const price = plan ? priceFor(plan, period) : null;
      if (!plan || price === null) return bad("bad_plan");
      const micro = Math.round(price * 1e6);
      const cur = activeSub(viewer);
      if (cur && cur.plan === "pro" && plan.id === "start") return bad("plan_active"); // оплаченное «Про» нельзя заменить на «Старт»
      const err = await checkTx(clean(m.tx, 80).toLowerCase(), viewer, micro);
      if (err) return bad(err, err === "payment_unavailable" ? 503 : 402);
      const tx = clean(m.tx, 80).toLowerCase();
      // кто пригласил: уже записанный (навсегда), иначе пригласивший на HiMeet, иначе указанный в запросе
      let ref = (db.prepare("SELECT ref FROM creator_ref WHERE addr=?").get(viewer) as { ref: string } | undefined)?.ref || "";
      if (!ref) {
        let cand = "";
        try { cand = String(await resolveRef(viewer) || "").toLowerCase(); } catch { cand = ""; }
        if (!isAddr(cand)) cand = clean(m.ref, 42).toLowerCase();
        if (isAddr(cand) && cand !== viewer && userRow(cand) && !userRow(cand)?.banned) ref = cand;
      }
      const now = Date.now();
      const base = cur ? cur.expires : now;
      const expires = base + (period === "year" ? 365 : 30) * DAY;
      const refAmt = ref ? Math.round((micro * PLATFORM_AFFILIATE_PCT) / 100) : 0;
      try {
        db.transaction(() => {
          db.prepare("INSERT INTO pay_in(tx,kind,payer,community,plan,gross,fee,to_owner,to_partner,created) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .run(tx, "creator", viewer, "", plan.id + "/" + period, micro, micro - refAmt, 0, refAmt, now);
          db.prepare("INSERT OR REPLACE INTO creator_subs(addr,plan,expires,created,source) VALUES(?,?,?,?,'paid')").run(viewer, plan.id, expires, now);
          if (ref) {
            db.prepare("INSERT OR IGNORE INTO creator_ref(addr,ref,created) VALUES(?,?,?)").run(viewer, ref, now);
            db.prepare("INSERT INTO pay_out(tx,payee,role,community,amount,due) VALUES(?,?,?,?,?,?)").run(tx, ref, "referrer", "", refAmt, dueFor(now));
          }
        })();
      } catch { return bad("tx_used"); }
      return out(200, { ok: true, plan: plan.id, expires });
    }

    // ===== оплата участия в сообществе =====
    if (p === "/api/pay/member") {
      if (!me) return bad("no_profile", 403);
      const c = getC(clean(m.slug, 30).toLowerCase());
      if (!c || c.status !== "active" || c.slug === MAIN) return bad("not_found", 404);
      if (c.owner === viewer) return bad("own_community");
      if (!isAdm(c.owner) && !activeSub(c.owner)) return bad("community_paused", 403); // у владельца закончился бесплатный период или оплаченный срок
      const pl = db.prepare("SELECT * FROM community_plans WHERE id=? AND community=? AND active=1").get(Number(m.plan) || 0, c.slug) as CPlan | undefined;
      if (!pl || pl.price_micro <= 0) return bad("bad_plan");
      if (pl.price_micro < MIN_MEMBER_PRICE * 1e6 || pl.price_micro > MAX_MEMBER_PRICE * 1e6) return bad("bad_price");
      const tx = clean(m.tx, 80).toLowerCase();
      const err = await checkTx(tx, viewer, pl.price_micro);
      if (err) return bad(err, err === "payment_unavailable" ? 503 : 402);
      const gross = pl.price_micro;
      const fee = Math.round((gross * feePctOf(c.owner)) / 100);
      // партнёр: по коду ссылки, только если у владельца «Про»; доля считается от суммы платежа и берётся из части владельца
      let partner = "", partnerAmt = 0;
      const code = clean(m.ref, 20).toLowerCase();
      if (code && ownerIsPro(c.owner)) {
        const l = db.prepare(`SELECT l.partner, t.pct FROM partner_links l JOIN partner_plans t ON t.id=l.tariff
          WHERE l.code=? AND l.community=? AND t.active=1`).get(code, c.slug) as { partner: string; pct: number } | undefined;
        if (l && l.partner !== viewer && l.partner !== c.owner && userRow(l.partner)) {
          partner = l.partner;
          partnerAmt = Math.min(Math.round((gross * Math.min(l.pct, MAX_PARTNER_PCT)) / 100), gross - fee);
        }
      }
      const ownerAmt = gross - fee - partnerAmt;
      const now = Date.now();
      const cur = db.prepare("SELECT role, expires, joined FROM community_members WHERE community=? AND addr=?").get(c.slug, viewer) as { role: string; expires: number; joined: number } | undefined;
      const days = periodDays(pl.period);
      const expires = days === 0 ? 0 : (cur && cur.expires > now ? cur.expires : now) + days * DAY;
      try {
        db.transaction(() => {
          db.prepare("INSERT INTO pay_in(tx,kind,payer,community,plan,gross,fee,to_owner,to_partner,created) VALUES(?,?,?,?,?,?,?,?,?,?)")
            .run(tx, "member", viewer, c.slug, pl.name + "/" + pl.period, gross, fee, ownerAmt, partnerAmt, now);
          if (ownerAmt > 0) db.prepare("INSERT INTO pay_out(tx,payee,role,community,amount,due) VALUES(?,?,?,?,?,?)").run(tx, c.owner, "owner", c.slug, ownerAmt, dueFor(now));
          if (partnerAmt > 0) db.prepare("INSERT INTO pay_out(tx,payee,role,community,amount,due) VALUES(?,?,?,?,?,?)").run(tx, partner, "partner", c.slug, partnerAmt, dueFor(now));
          db.prepare("INSERT OR REPLACE INTO community_members(community,addr,role,state,plan,expires,joined) VALUES(?,?,?,'active',?,?,?)")
            .run(c.slug, viewer, cur?.role || "member", pl.id, expires, cur?.joined || now);
        })();
      } catch { return bad("tx_used"); }
      return out(200, { ok: true, expires });
    }

    // ===== партнёрские тарифы владельца (только «Про») =====
    if (p.startsWith("/api/pay/partner_")) {
      const c = getC(clean(m.slug, 30).toLowerCase());
      if (!c) return bad("not_found", 404);
      if (c.owner !== viewer && !adm) return bad("forbidden", 403);
      if (!ownerIsPro(c.owner)) return bad("pro_required", 403);

      if (p === "/api/pay/partner_plan_add") {
        const name = clean(m.name, 30), pct = Math.floor(Number(m.pct));
        if (name.length < 2) return bad("bad_name");
        if (!Number.isFinite(pct) || pct < 1 || pct > MAX_PARTNER_PCT) return bad("bad_pct");
        const n = (db.prepare("SELECT COUNT(*) AS n FROM partner_plans WHERE community=? AND active=1").get(c.slug) as { n: number }).n;
        if (n >= MAX_PARTNER_TARIFFS) return bad("too_many_tariffs");
        db.prepare("INSERT INTO partner_plans(community,name,pct,created) VALUES(?,?,?,?)").run(c.slug, name, pct, Date.now());
        return out(200, { ok: true });
      }
      if (p === "/api/pay/partner_plan_remove") {
        db.prepare("UPDATE partner_plans SET active=0 WHERE id=? AND community=?").run(Number(m.id) || 0, c.slug);
        return out(200, { ok: true });
      }
      if (p === "/api/pay/partner_add") { // выдать партнёру ссылку (повторный вызов меняет его тариф)
        const addr = clean(m.addr, 42).toLowerCase();
        if (!isAddr(addr) || !userRow(addr) || addr === c.owner) return bad("bad_partner");
        const t = db.prepare("SELECT id FROM partner_plans WHERE id=? AND community=? AND active=1").get(Number(m.tariff) || 0, c.slug) as { id: number } | undefined;
        if (!t) return bad("bad_tariff");
        const old = db.prepare("SELECT code FROM partner_links WHERE community=? AND partner=?").get(c.slug, addr) as { code: string } | undefined;
        const code = old?.code || crypto.randomBytes(5).toString("hex");
        if (old) db.prepare("UPDATE partner_links SET tariff=? WHERE code=?").run(t.id, code);
        else db.prepare("INSERT INTO partner_links(code,community,partner,tariff,created) VALUES(?,?,?,?,?)").run(code, c.slug, addr, t.id, Date.now());
        return out(200, { ok: true, code });
      }
      if (p === "/api/pay/partner_remove") {
        db.prepare("DELETE FROM partner_links WHERE community=? AND partner=?").run(c.slug, clean(m.addr, 42).toLowerCase());
        return out(200, { ok: true });
      }
      return bad("not_found", 404);
    }

    // ===== администратор: отметить выплату =====
    if (p === "/api/pay/admin/mark") {
      if (!adm) return bad("forbidden", 403);
      const ids = (Array.isArray(m.ids) ? m.ids : []).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0).slice(0, 500);
      if (!ids.length) return bad("bad_ids");
      const paidTx = clean(m.tx, 80).toLowerCase();
      const st = db.prepare("UPDATE pay_out SET status='paid', paid_tx=?, paid_at=? WHERE id=? AND status='pending'");
      let n = 0;
      db.transaction(() => { for (const id of ids) n += st.run(paidTx, Date.now(), id).changes; })();
      return out(200, { ok: true, marked: n });
    }

    return bad("not_found", 404);
  } catch (e) {
    const msg = (e as Error).message;
    return bad(msg === "too_big" || msg === "bad_json" ? msg : "server", msg === "server" ? 500 : 400);
  }
}
