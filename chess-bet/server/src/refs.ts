// Единая реферальная программа HiMeet: одна ссылка приглашения даёт награду приглашающему за действия приглашённого.
// Шахматы работают через контракт (доля с комиссии), здесь баллы TCH за чат/профиль, объявления и знакомства.
// Награды считаются «лениво»: при просмотре сводки сервер проверяет, что приглашённый реально сделал, и начисляет один раз.
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
CREATE TABLE IF NOT EXISTS tch_bal(addr TEXT PRIMARY KEY, micro INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ref_links(invitee TEXT PRIMARY KEY, inviter TEXT NOT NULL, src TEXT NOT NULL DEFAULT 'link', created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ref_links_inviter ON ref_links(inviter);
CREATE TABLE IF NOT EXISTS ref_rewards(
  invitee TEXT NOT NULL, kind TEXT NOT NULL, inviter TEXT NOT NULL, micro INTEGER NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY(invitee, kind));
CREATE INDEX IF NOT EXISTS ref_rewards_inviter ON ref_rewards(inviter, created);
`);

const DAY = 86400000;
const ADDR = /^0x[0-9a-f]{40}$/;
const num = (k: string, d: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v >= 0 && process.env[k] !== undefined && process.env[k] !== "" ? v : d; };

/** Награды в микро-TCH (1 TCH = 1 000 000): по умолчанию 0,01 / 0,02 / 0,02 TCH. Меняются через переменные окружения. */
export const REWARDS = {
  join: num("REF_JOIN_MICRO", 10_000),     // приглашённый создал профиль и проявил активность
  ad: num("REF_AD_MICRO", 20_000),         // приглашённый опубликовал первое объявление
  dating: num("REF_DATING_MICRO", 20_000), // приглашённый создал анкету знакомств (18+)
} as const;
type Kind = keyof typeof REWARDS;
const KINDS: Kind[] = ["join", "ad", "dating"];
const MIN_AGE_MS = num("REF_MIN_AGE_H", 24) * 3600_000;   // профиль приглашённого должен прожить столько часов
const DAY_CAP = num("REF_DAY_CAP", 20);                    // наград в сутки на одного пригласившего
const DAY_POOL = num("REF_DAY_POOL_MICRO", 5_000_000);     // общий лимит наград за сутки на всех (по умолчанию 5 TCH)

type UserRow = { addr: string; name: string; created: number; banned: number };
const userOf = (a: string): UserRow | undefined => {
  try { return db.prepare("SELECT addr,name,created,banned FROM users WHERE addr=?").get(a) as UserRow | undefined; } catch { return undefined; }
};
const has = (sql: string, ...args: unknown[]) => { try { return !!db.prepare(sql).get(...args); } catch { return false; } };

/** Запомнить, кто кого пригласил. Первый пригласивший остаётся навсегда; приглашать по кругу нельзя. */
export function recordRef(invitee: string, inviter: string, src = "link"): boolean {
  const a = String(invitee || "").toLowerCase(), b = String(inviter || "").toLowerCase();
  if (!ADDR.test(a) || !ADDR.test(b) || a === b) return false;
  try {
    if (has("SELECT 1 FROM ref_links WHERE invitee=? AND inviter=?", b, a)) return false;
    return db.prepare("INSERT OR IGNORE INTO ref_links(invitee,inviter,src,created) VALUES(?,?,?,?)").run(a, b, src, Date.now()).changes > 0;
  } catch { return false; }
}

/** Что приглашённый реально сделал (по данным сервера, подделать нельзя) */
function done(kind: Kind, invitee: string): boolean {
  const u = userOf(invitee);
  if (!u || u.banned || Date.now() - u.created < MIN_AGE_MS) return false;
  if (kind === "ad") return has("SELECT 1 FROM ads WHERE addr=? AND status='active'", invitee);
  if (kind === "dating") return has("SELECT 1 FROM dating_profiles WHERE addr=?", invitee);
  // join: профиль есть и есть хоть какая-то активность (очки, личное сообщение, объявление или анкета)
  return has("SELECT 1 FROM q_stats WHERE addr=? AND xp>0", invitee) || has("SELECT 1 FROM dm WHERE a=? LIMIT 1", invitee)
    || has("SELECT 1 FROM ads WHERE addr=?", invitee) || has("SELECT 1 FROM dating_profiles WHERE addr=?", invitee);
}

/** Начислить награды, которые уже заслужены, но ещё не выданы. Возвращает, сколько наград выдано сейчас. */
export function settle(inviter: string): number {
  const now = Date.now();
  let paid = 0;
  try {
    const dayN = () => (db.prepare("SELECT COUNT(*) n FROM ref_rewards WHERE inviter=? AND created>=?").get(inviter, now - DAY) as { n: number }).n;
    const dayM = () => (db.prepare("SELECT COALESCE(SUM(micro),0) m FROM ref_rewards WHERE created>=?").get(now - DAY) as { m: number }).m;
    let n = dayN(), pool = dayM();
    const invitees = db.prepare("SELECT invitee FROM ref_links WHERE inviter=? ORDER BY created LIMIT 500").all(inviter) as { invitee: string }[];
    const ins = db.prepare("INSERT OR IGNORE INTO ref_rewards(invitee,kind,inviter,micro,created) VALUES(?,?,?,?,?)");
    const bal = db.prepare("INSERT INTO tch_bal(addr,micro) VALUES(?,?) ON CONFLICT(addr) DO UPDATE SET micro=micro+excluded.micro");
    for (const { invitee } of invitees) {
      for (const k of KINDS) {
        const amt = REWARDS[k];
        if (!amt || has("SELECT 1 FROM ref_rewards WHERE invitee=? AND kind=?", invitee, k) || !done(k, invitee)) continue;
        if (n >= DAY_CAP || pool + amt > DAY_POOL) return paid;
        db.transaction(() => {
          if (ins.run(invitee, k, inviter, amt, now).changes > 0) { bal.run(inviter, amt); n++; pool += amt; paid++; }
        })();
      }
    }
  } catch (e) { console.error("refs settle:", (e as Error).message); }
  return paid;
}

/** GET /api/refs/summary: сколько людей пришло по моей ссылке и что за это начислено */
export async function handleRefs(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  if (!url.pathname.startsWith("/api/refs/")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  if (req.method !== "GET") return out(405, { ok: false, error: "method" });
  if (!viewer) return out(401, { ok: false, error: "auth" });
  if (url.pathname !== "/api/refs/summary") return out(404, { ok: false, error: "not_found" });
  try {
    settle(viewer);
    const invited = (db.prepare("SELECT COUNT(*) n FROM ref_links WHERE inviter=?").get(viewer) as { n: number }).n;
    const rows = db.prepare("SELECT kind, COUNT(*) n, COALESCE(SUM(micro),0) micro FROM ref_rewards WHERE inviter=? GROUP BY kind").all(viewer) as { kind: Kind; n: number; micro: number }[];
    const by: Record<Kind, { n: number; micro: number }> = { join: { n: 0, micro: 0 }, ad: { n: 0, micro: 0 }, dating: { n: 0, micro: 0 } };
    for (const r of rows) if (r.kind in by) by[r.kind] = { n: r.n, micro: r.micro };
    const items = db.prepare("SELECT r.kind, r.micro, r.created, COALESCE(u.name,'') name FROM ref_rewards r LEFT JOIN users u ON u.addr=r.invitee WHERE r.inviter=? ORDER BY r.created DESC LIMIT 20").all(viewer);
    const total = rows.reduce((s, r) => s + r.micro, 0);
    return out(200, { ok: true, invited, by, total, items, rules: { ...REWARDS, minAgeHours: MIN_AGE_MS / 3600_000, dayCap: DAY_CAP } });
  } catch (e) { console.error("refs", e); return out(500, { ok: false, error: "server" }); }
}
