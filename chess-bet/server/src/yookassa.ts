// ЮKassa: приём платежей через СБП (и картой) для магазина. Сервер создаёт платёж, покупатель платит на странице ЮKassa и возвращается на сайт.
// Ключи только в окружении сервера: YK_SHOP_ID и YK_SECRET_KEY. Статус платежа всегда перепроверяется запросом к ЮKassa, уведомлению на слово не верим.
const API = "https://api.yookassa.ru/v3";
const SHOP_ID = (process.env.YK_SHOP_ID || "").trim();
const SECRET = (process.env.YK_SECRET_KEY || "").trim();
export const SITE = (process.env.SITE_URL || "https://himeet.online").replace(/\/+$/, "");
/** Включён ли приём через ЮKassa (заданы идентификатор магазина и секретный ключ) */
export const ykReady = (): boolean => /^\d{4,12}$/.test(SHOP_ID) && SECRET.length > 10;

const auth = () => "Basic " + Buffer.from(`${SHOP_ID}:${SECRET}`).toString("base64");
type YkPay = { id?: string; status?: string; paid?: boolean; amount?: { value?: string; currency?: string }; confirmation?: { confirmation_url?: string }; metadata?: { order?: string }; code?: string; description?: string };

async function call(method: "GET" | "POST", path: string, idem = "", body?: unknown): Promise<YkPay> {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: auth(), ...(idem ? { "Idempotence-Key": idem } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j = (await r.json().catch(() => ({}))) as YkPay;
  if (!r.ok) { console.error("[yookassa]", method, path, r.status, j.code || "", j.description || ""); throw new Error("yk_" + (j.code || r.status)); }
  return j;
}

/** Создаёт платёж СБП на сумму в рублях; возвращает номер платежа и адрес страницы оплаты */
export async function ykCreate(orderId: string, rub: number, description: string, returnUrl: string, method: "sbp" | "card" = "sbp"): Promise<{ id: string; url: string }> {
  const j = await call("POST", "/payments", "hm-" + orderId, {
    amount: { value: rub.toFixed(2), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: returnUrl },
    ...(method === "sbp" ? { payment_method_data: { type: "sbp" } } : {}),
    description: description.slice(0, 120),
    metadata: { order: orderId },
  });
  const url = j.confirmation?.confirmation_url || "";
  if (!j.id || !/^https:\/\//.test(url)) throw new Error("yk_bad_response");
  return { id: j.id, url };
}

/** Текущее состояние платежа у ЮKassa (источник правды) */
export async function ykGet(id: string): Promise<{ status: string; paid: boolean; rub: number; orderId: string }> {
  if (!/^[A-Za-z0-9-]{10,64}$/.test(id)) throw new Error("yk_bad_id");
  const j = await call("GET", "/payments/" + id);
  return { status: String(j.status || ""), paid: j.paid === true, rub: j.amount?.currency === "RUB" ? Number(j.amount.value) : -1, orderId: String(j.metadata?.order || "") };
}
