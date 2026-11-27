// patch48 (server): уведомления об оплаченных заказах владельцу сообщества и администраторам (push + Telegram)
const fs = require("fs");
function patch(f, steps) {
  let s = fs.readFileSync(f, "utf8");
  if (s.includes("setOrderNotify")) { console.log(f + ": уже применён"); return; }
  const nl = s.includes("\r\n");
  const fix = (t) => (nl ? t.replace(/\n/g, "\r\n") : t);
  for (const [a, b, label] of steps) {
    const A = fix(a), B = fix(b);
    const i = s.indexOf(A);
    if (i < 0 || s.indexOf(A, i + 1) >= 0) { console.error("ANCHOR FAIL: " + f + " / " + label); process.exit(1); }
    s = s.replace(A, () => B);
  }
  fs.writeFileSync(f, s);
  console.log(f + " OK");
}

patch("src/shop.ts", [
  [`/** Заказ оплачен: фиксируем долю платформы`,
`/** Уведомление об оплаченном заказе: подключается в index.ts (push + Telegram) */
export type OrderEvent = { owner: string; admins: string[]; slug: string; title: string; amount: string; code: string };
let orderNotify: (e: OrderEvent) => void = () => {};
export function setOrderNotify(fn: (e: OrderEvent) => void) { orderNotify = fn; }

/** Заказ оплачен: фиксируем долю платформы`, "marker"],
  [`    db.prepare("UPDATE products SET sold=sold+1 WHERE id=?").run(o.product);
  })();
};`,
`    db.prepare("UPDATE products SET sold=sold+1 WHERE id=?").run(o.product);
  })();
  try {
    const amount = o.method === "usdc" ? (o.amount / 1e6).toFixed(2) + " USDC" : o.amount + " ₽";
    orderNotify({ owner, admins: [...ADMINS], slug: pr ? pr.community : "", title: pr ? pr.title : "", amount, code: o.code });
  } catch (e) { console.error("orderNotify", e); }
};`, "finalize"],
]);

patch("src/index.ts", [
  [`import { handleShop, setShopVerifier } from "./shop.js";`, `import { handleShop, setOrderNotify, setShopVerifier } from "./shop.js";`, "import"],
  [`setMailNotify((to, from) =>`,
`// Оплачен заказ: владельцу сообщества и администраторам (push + Telegram), без дублей
setOrderNotify((e) => {
  const to = [...new Set([e.owner, ...e.admins].map((x) => String(x || "").toLowerCase()).filter(Boolean))];
  for (const a of to) {
    pushTo(a, { title: "🛒 Новый заказ " + e.amount, body: e.title + " · " + e.code, url: "/community/?c=" + encodeURIComponent(e.slug), tag: "order-" + e.code });
    void tgNotify(a, \`🛒 Оплачен заказ \${e.code}: \${e.title} — \${e.amount}\`, \`🛒 Order paid \${e.code}: \${e.title} — \${e.amount}\`, "order:" + e.code, \`\${SITE_URL}/community/?c=\${encodeURIComponent(e.slug)}\`);
  }
});
setMailNotify((to, from) =>`, "wire"],
]);
console.log("patch48 OK");
