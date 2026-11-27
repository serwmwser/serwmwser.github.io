// patch55 (server): комиссия с рублёвого членства как в USDC: 10% («Старт») или 3% («Про»)
const fs = require("fs");
const f = "src/memberpay.ts";
let s = fs.readFileSync(f, "utf8");
if (s.includes("feePctOf")) { console.log("patch55: уже применён"); process.exit(0); }
const nl = s.includes("\r\n");
const fix = (t) => (nl ? t.replace(/\n/g, "\r\n") : t);
function once(a, b, label) {
  const A = fix(a), B = fix(b);
  const i = s.indexOf(A);
  if (i < 0 || s.indexOf(A, i + 1) >= 0) { console.error("ANCHOR FAIL: " + label); process.exit(1); }
  s = s.replace(A, () => B);
}
once(`import { SITE, ykCreate, ykGet, ykReady } from "./yookassa.js";`,
`import { SITE, ykCreate, ykGet, ykReady } from "./yookassa.js";
import { planById } from "./pricing.js";`, "import");
once(`const FEE_PCT = 20; // комиссия платформы, как с товаров`,
`/** Комиссия платформы с платежей участников — та же, что у оплаты в USDC: 10% на «Старт», 3% на «Про» (если в pricing.ts задана своя — берётся она) */
const feePctOf = (owner: string): number => {
  try {
    const r = db.prepare("SELECT plan, expires FROM creator_subs WHERE lower(addr)=?").get(owner) as { plan: string; expires: number } | undefined;
    const id = r && r.expires > Date.now() ? r.plan : "start";
    return planById(id)?.feePct ?? (id === "pro" ? 3 : 10);
  } catch { return 10; }
};`, "fee const");
once(`const fee = Math.round((p.rub * FEE_PCT) / 100), share`, `const fee = Math.round((p.rub * feePctOf(owner)) / 100), share`, "fee use");
fs.writeFileSync(f, s);
console.log("patch55 OK");
