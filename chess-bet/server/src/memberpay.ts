// Оплата участия в сообществе в рублях через ЮKassa (СБП). Платёж создаёт сервер, статус всегда перепроверяется у ЮKassa.
// После оплаты участнику открывается доступ на срок тарифа; платформа удерживает 10% («Старт») или 3% («Про»), остальное учитывается к выплате владельцу и партнёру.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type http from "node:http";
import Database from "better-sqlite3";
import { SITE, ykCreate, ykGet, ykReady } from "./yookassa.js";
import { planById } from "./pricing.js";

const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS member_pay(
  id TEXT PRIMARY KEY, community TEXT NOT NULL, addr TEXT NOT NULL, plan INTEGER NOT NULL, rub INTEGER NOT NULL,
  yk_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', created INTEGER NOT NULL, paid_at INTEGER NOT NULL DEFAULT 0,
  owner TEXT NOT NULL DEFAULT '', fee INTEGER NOT NULL DEFAULT 0, share INTEGER NOT NULL DEFAULT 0, payout_at INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS mp_addr ON member_pay(addr, status);
CREATE INDEX IF NOT EXISTS mp_pay ON member_pay(status, payout_at);
`);
// Партнёр клуба: кто привёл участника по партнёрской ссылке, его процент и сумма (берётся из части владельца)
for (const [c, t] of [["partner", "TEXT NOT NULL DEFAULT ''"], ["partner_pct", "INTEGER NOT NULL DEFAULT 0"], ["partner_amt", "INTEGER NOT NULL DEFAULT 0"], ["partner_payout_at", "INTEGER NOT NULL DEFAULT 0"]]) {
  try { db.exec(`ALTER TABLE member_pay ADD COLUMN ${c} ${t}`); } catch { /* колонка уже есть */ }
}
// Рублёвая цена тарифа (0 = тариф без оплаты в рублях)
try { db.exec("ALTER TABLE community_plans ADD COLUMN price_rub INTEGER NOT NULL DEFAULT 0"); } catch { /* колонка уже есть или таблицы ещё нет */ }

/** Комиссия платформы с платежей участников — та же, что у оплаты в USDC: 10% на «Старт», 3% на «Про» (если в pricing.ts задана своя — берётся она) */
const feePctOf = (owner: string): number => {
  try {
    const r = db.prepare("SELECT plan, expires FROM creator_subs WHERE lower(addr)=?").get(owner) as { plan: string; expires: number } | undefined;
    const id = r && r.expires > Date.now() ? r.plan : "start";
    return planById(id)?.feePct ?? (id === "pro" ? 3 : 10);
  } catch { return 10; }
};
const DAY = 86400000;
const PERIOD_DAYS: Record<string, number> = { month: 30, quarter: 90, year: 365, lifetime: 0 };
const ADMINS = new Set((process.env.MOD_ADMIN || "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s)));

type Plan = { id: number; community: string; name: string; period: string; price_rub: number; active: number };
type Pay = { id: string; community: string; addr: string; plan: number; rub: number; yk_id: string; status: string; created: number; paid_at: number; owner: string; fee: number; share: number; payout_at: number; partner: string; partner_pct: number; partner_amt: number; partner_payout_at: number };

const planOf = (id: number): Plan | undefined => db.prepare("SELECT id, community, name, period, price_rub, active FROM community_plans WHERE id=?").get(id) as Plan | undefined;
const ownerOf = (slug: string): string => String((db.prepare("SELECT owner FROM communities WHERE slug=? AND status='active'").get(slug) as { owner?: string } | undefined)?.owner || "").toLowerCase();
const MAX_PARTNER_PCT = 50;
const isAdm = (a: string) => !!a && ADMINS.has(a.toLowerCase());
const ownerIsPro = (owner: string): boolean => {
  if (isAdm(owner)) return true;
  const r = db.prepare("SELECT plan, expires FROM creator_subs WHERE lower(addr)=?").get(owner) as { plan: string; expires: number } | undefined;
  return !!r && r.plan === "pro" && r.expires > Date.now();
};
/** Партнёр по коду ссылки клуба: только если у владельца «Про»; не сам покупатель и не владелец */
function partnerOf(code: string, slug: string, me: string, owner: string): { partner: string; pct: number } | null {
  if (!code || !ownerIsPro(owner)) return null;
  const l = db.prepare(`SELECT l.partner AS partner, t.pct AS pct FROM partner_links l JOIN partner_plans t ON t.id=l.tariff
    WHERE l.code=? AND l.community=? AND t.active=1`).get(code, slug) as { partner: string; pct: number } | undefined;
  if (!l) return null;
  const a = String(l.partner || "").toLowerCase();
  if (!a || a === me || a === owner) return null;
  if (!db.prepare("SELECT 1 FROM users WHERE lower(addr)=?").get(a)) return null;
  return { partner: a, pct: Math.min(Math.max(Math.floor(l.pct), 1), MAX_PARTNER_PCT) };
}
const getPay = (id: string): Pay | undefined => db.prepare("SELECT * FROM member_pay WHERE id=?").get(id) as Pay | undefined;

/** Уведомление об оплате участия: подключается в index.ts (push + Telegram владельцу и администраторам) */
export type MemberPayEvent = { owner: string; admins: string[]; slug: string; plan: string; rub: number; addr: string };
let notify: (e: MemberPayEvent) => void = () => {};
export function setMemberPayNotify(fn: (e: MemberPayEvent) => void) { notify = fn; }

/** Платёж подтверждён: открываем доступ на срок тарифа и фиксируем доли. Повторный вызов ничего не удваивает */
function finalize(p: Pay) {
  const pl = planOf(p.plan);
  const owner = ownerOf(p.community);
  const fee = Math.round((p.rub * feePctOf(owner)) / 100), now = Date.now();
  const partnerAmt = p.partner ? Math.min(Math.round((p.rub * p.partner_pct) / 100), p.rub - fee) : 0; // доля партнёра — из части владельца
  const share = p.rub - fee - partnerAmt;
  const settled = !owner || ADMINS.has(owner) ? now : 0; // владелец-администратор: выплата не нужна
  const pSettled = !p.partner || partnerAmt <= 0 || isAdm(p.partner) ? now : 0;
  let first = false;
  db.transaction(() => {
    const r = db.prepare("UPDATE member_pay SET status='paid', paid_at=?, owner=?, fee=?, share=?, payout_at=?, partner_amt=?, partner_payout_at=? WHERE id=? AND status<>'paid'").run(now, owner, fee, share, settled, partnerAmt, pSettled, p.id);
    if (r.changes === 0) return; // уже учтён
    first = true;
    const days = PERIOD_DAYS[pl?.period ?? "month"] ?? 30;
    const cur = db.prepare("SELECT expires, state FROM community_members WHERE community=? AND addr=?").get(p.community, p.addr) as { expires: number; state: string } | undefined;
    const base = cur && cur.state === "active" && cur.expires > now ? cur.expires : now; // продление не теряет оставшиеся дни
    const expires = days === 0 ? 0 : base + days * DAY;
    db.prepare(
      "INSERT INTO community_members(community,addr,role,state,plan,expires,joined) VALUES(?,?,'member','active',?,?,?) " +
      "ON CONFLICT(community,addr) DO UPDATE SET state='active', plan=excluded.plan, expires=excluded.expires",
    ).run(p.community, p.addr, p.plan, expires, now);
  })();
  if (first) { try { notify({ owner, admins: [...ADMINS], slug: p.community, plan: pl?.name ?? "", rub: p.rub, addr: p.addr }); } catch (e) { console.error("memberPayNotify", e); } }
}

/** Сверка с ЮKassa: оплачено → открыть доступ; отменено → закрыть заказ */
async function sync(p: Pay): Promise<Pay> {
  if (p.status === "paid" || !p.yk_id) return p;
  try {
    const r = await ykGet(p.yk_id);
    if (r.status === "succeeded" && r.paid && r.rub === p.rub && r.orderId === p.id) finalize(p);
    else if (r.status === "canceled") db.prepare("UPDATE member_pay SET status='canceled' WHERE id=? AND status<>'paid'").run(p.id);
  } catch (e) { console.error("[memberpay] sync", p.id, e instanceof Error ? e.message : e); }
  return getPay(p.id) as Pay;
}

/** Раз в 2 минуты доводим до конца платежи, по которым покупатель не вернулся на сайт (закрыл вкладку после оплаты) */
export function startMemberPay() {
  if (!ykReady()) return;
  setInterval(() => {
    const rows = db.prepare("SELECT * FROM member_pay WHERE status='new' AND yk_id<>'' AND created>? LIMIT 50").all(Date.now() - 3 * DAY) as Pay[];
    for (const p of rows) void sync(p);
  }, 120000).unref();
}

/** Сводка для понедельничной выплаты: сколько ещё не выплачено владельцам и партнёрам по сообществам (рубли) */
export function memberPayPending(): { community: string; payee: string; role: "owner" | "partner"; count: number; rub: number }[] {
  const owners = db.prepare("SELECT community, owner AS payee, COUNT(*) AS count, SUM(share) AS rub FROM member_pay WHERE status='paid' AND payout_at=0 AND share>0 GROUP BY community, owner").all() as { community: string; payee: string; count: number; rub: number }[];
  const partners = db.prepare("SELECT community, partner AS payee, COUNT(*) AS count, SUM(partner_amt) AS rub FROM member_pay WHERE status='paid' AND partner_payout_at=0 AND partner_amt>0 GROUP BY community, partner").all() as { community: string; payee: string; count: number; rub: number }[];
  return [...owners.map((x) => ({ ...x, role: "owner" as const })), ...partners.map((x) => ({ ...x, role: "partner" as const }))];
}
/** Отметить выплату по сообществу сделанной (владельцу и партнёрам) */
export function memberPayMarkPaid(slug: string): number {
  const now = Date.now();
  const a = db.prepare("UPDATE member_pay SET payout_at=? WHERE status='paid' AND payout_at=0 AND community=?").run(now, slug).changes;
  const b = db.prepare("UPDATE member_pay SET partner_payout_at=? WHERE status='paid' AND partner_payout_at=0 AND partner_amt>0 AND community=?").run(now, slug).changes;
  return a + b;
}

const hits = new Map<string, { n: number; t: number }>();
function limited(key: string, max: number, ms: number): boolean {
  const now = Date.now(); const h = hits.get(key);
  if (!h || now - h.t > ms) { hits.set(key, { n: 1, t: now }); if (hits.size > 20000) hits.clear(); return false; }
  h.n++; return h.n > max;
}
function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    req.on("data", (c: Buffer) => { size += c.length; if (size > 4000) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}

/** POST /api/communities/pay {community, plan} → {url}; GET /api/communities/pay-status?id= → {status}. Нужен вход (viewer). */
export async function handleMemberPay(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (p !== "/api/communities/pay" && p !== "/api/communities/pay-status") return false;
  const out = (code: number, body: unknown) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  try {
    if (!viewer) return bad("auth", 401);
    const me = viewer.toLowerCase();
    if (req.method === "GET" && p === "/api/communities/pay-status") {
      const pay = getPay(String(url.searchParams.get("id") || "").slice(0, 40));
      if (!pay || pay.addr !== me) return bad("not_found", 404);
      const cur = await sync(pay);
      return out(200, { ok: true, status: cur.status, community: cur.community });
    }
    if (req.method === "POST" && p === "/api/communities/pay") {
      if (!ykReady()) return bad("pay_off", 503);
      if (limited("mp:" + me, 10, 3600000)) return bad("slow_down", 429);
      const m = await readBody(req);
      const pl = planOf(Number(m.plan) || 0);
      if (!pl || !pl.active || pl.price_rub <= 0) return bad("bad_plan");
      const slug = pl.community;
      const owner = ownerOf(slug);
      if (!owner) return bad("not_found", 404);
      if (owner === me) return bad("own_community");
      const id = crypto.randomBytes(12).toString("hex");
      const ref = partnerOf(String(m.ref || "").trim().toLowerCase().slice(0, 20), slug, me, owner);
      db.prepare("INSERT INTO member_pay(id,community,addr,plan,rub,created,partner,partner_pct) VALUES(?,?,?,?,?,?,?,?)").run(id, slug, me, pl.id, pl.price_rub, Date.now(), ref?.partner ?? "", ref?.pct ?? 0);
      try {
        const yk = await ykCreate(id, pl.price_rub, `Участие в сообществе ${slug}: ${pl.name}`, `${SITE}/community/?slug=${encodeURIComponent(slug)}&paid=${id}`, "sbp");
        db.prepare("UPDATE member_pay SET yk_id=? WHERE id=?").run(yk.id, id);
        return out(200, { ok: true, id, url: yk.url });
      } catch (e) {
        db.prepare("UPDATE member_pay SET status='failed' WHERE id=?").run(id);
        console.error("[memberpay] create", e instanceof Error ? e.message : e);
        return bad("pay_failed", 502);
      }
    }
    return bad("not_found", 404);
  } catch (e) {
    return bad(e instanceof Error && e.message === "too_big" ? "too_big" : "bad_json");
  }
}
