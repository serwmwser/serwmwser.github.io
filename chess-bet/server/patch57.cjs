// patch57 (server): партнёрская доля в рублёвой оплате членства (по коду партнёрской ссылки клуба, как в USDC)
const fs = require("fs");
const f = "src/memberpay.ts";
let s = fs.readFileSync(f, "utf8");
if (s.includes("partner_amt")) { console.log("patch57: уже применён"); process.exit(0); }
const nl = s.includes("\r\n");
const fix = (t) => (nl ? t.replace(/\n/g, "\r\n") : t);
function once(a, b, label) {
  const A = fix(a), B = fix(b);
  const i = s.indexOf(A);
  if (i < 0 || s.indexOf(A, i + 1) >= 0) { console.error("ANCHOR FAIL: " + label); process.exit(1); }
  s = s.replace(A, () => B);
}

once(`// Рублёвая цена тарифа (0 = тариф без оплаты в рублях)`,
`// Партнёр клуба: кто привёл участника по партнёрской ссылке, его процент и сумма (берётся из части владельца)
for (const [c, t] of [["partner", "TEXT NOT NULL DEFAULT ''"], ["partner_pct", "INTEGER NOT NULL DEFAULT 0"], ["partner_amt", "INTEGER NOT NULL DEFAULT 0"], ["partner_payout_at", "INTEGER NOT NULL DEFAULT 0"]]) {
  try { db.exec(\`ALTER TABLE member_pay ADD COLUMN \${c} \${t}\`); } catch { /* колонка уже есть */ }
}
// Рублёвая цена тарифа (0 = тариф без оплаты в рублях)`, "alter");

once(`share: number; payout_at: number };`, `share: number; payout_at: number; partner: string; partner_pct: number; partner_amt: number; partner_payout_at: number };`, "type");

once(`const getPay = (id: string)`,
`const MAX_PARTNER_PCT = 50;
const isAdm = (a: string) => !!a && ADMINS.has(a.toLowerCase());
const ownerIsPro = (owner: string): boolean => {
  if (isAdm(owner)) return true;
  const r = db.prepare("SELECT plan, expires FROM creator_subs WHERE lower(addr)=?").get(owner) as { plan: string; expires: number } | undefined;
  return !!r && r.plan === "pro" && r.expires > Date.now();
};
/** Партнёр по коду ссылки клуба: только если у владельца «Про»; не сам покупатель и не владелец */
function partnerOf(code: string, slug: string, me: string, owner: string): { partner: string; pct: number } | null {
  if (!code || !ownerIsPro(owner)) return null;
  const l = db.prepare(\`SELECT l.partner AS partner, t.pct AS pct FROM partner_links l JOIN partner_plans t ON t.id=l.tariff
    WHERE l.code=? AND l.community=? AND t.active=1\`).get(code, slug) as { partner: string; pct: number } | undefined;
  if (!l) return null;
  const a = String(l.partner || "").toLowerCase();
  if (!a || a === me || a === owner) return null;
  if (!db.prepare("SELECT 1 FROM users WHERE lower(addr)=?").get(a)) return null;
  return { partner: a, pct: Math.min(Math.max(Math.floor(l.pct), 1), MAX_PARTNER_PCT) };
}
const getPay = (id: string)`, "partnerOf");

once(`  const fee = Math.round((p.rub * feePctOf(owner)) / 100), share = p.rub - fee, now = Date.now();
  const settled = !owner || ADMINS.has(owner) ? now : 0; // владелец-администратор: выплата не нужна`,
`  const fee = Math.round((p.rub * feePctOf(owner)) / 100), now = Date.now();
  const partnerAmt = p.partner ? Math.min(Math.round((p.rub * p.partner_pct) / 100), p.rub - fee) : 0; // доля партнёра — из части владельца
  const share = p.rub - fee - partnerAmt;
  const settled = !owner || ADMINS.has(owner) ? now : 0; // владелец-администратор: выплата не нужна
  const pSettled = !p.partner || partnerAmt <= 0 || isAdm(p.partner) ? now : 0;`, "finalize calc");

once(`"UPDATE member_pay SET status='paid', paid_at=?, owner=?, fee=?, share=?, payout_at=? WHERE id=? AND status<>'paid'").run(now, owner, fee, share, settled, p.id);`,
     `"UPDATE member_pay SET status='paid', paid_at=?, owner=?, fee=?, share=?, payout_at=?, partner_amt=?, partner_payout_at=? WHERE id=? AND status<>'paid'").run(now, owner, fee, share, settled, partnerAmt, pSettled, p.id);`, "finalize update");

// сводка для выплат: владельцы и партнёры
const a1 = s.indexOf("/** Сводка для понедельничной выплаты");
const a2 = s.indexOf("const hits = new Map");
if (a1 < 0 || a2 < 0) { console.error("ANCHOR FAIL: pending block"); process.exit(1); }
s = s.slice(0, a1) + fix(`/** Сводка для понедельничной выплаты: сколько ещё не выплачено владельцам и партнёрам по сообществам (рубли) */
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

`) + s.slice(a2);

once(`      const id = crypto.randomBytes(12).toString("hex");
      db.prepare("INSERT INTO member_pay(id,community,addr,plan,rub,created) VALUES(?,?,?,?,?,?)").run(id, slug, me, pl.id, pl.price_rub, Date.now());`,
`      const id = crypto.randomBytes(12).toString("hex");
      const ref = partnerOf(String(m.ref || "").trim().toLowerCase().slice(0, 20), slug, me, owner);
      db.prepare("INSERT INTO member_pay(id,community,addr,plan,rub,created,partner,partner_pct) VALUES(?,?,?,?,?,?,?,?)").run(id, slug, me, pl.id, pl.price_rub, Date.now(), ref?.partner ?? "", ref?.pct ?? 0);`, "create");

fs.writeFileSync(f, s);
console.log("patch57 OK");
