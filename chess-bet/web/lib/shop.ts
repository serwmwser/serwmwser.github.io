"use client";
// Товары и услуги сообществ. Сервер: server/src/shop.ts (маршруты /api/shop/*).
// Покупка без регистрации: номер заказа хранится в браузере покупателя и в ссылке /product/?order=…
import { API_URL } from "./config";

export type ProductKind = "digital" | "service";
export type Product = {
  id: number; community: string; title: string; descr: string; image: string; kind: ProductKind;
  priceRub: number; priceUsdc: number; hasFile: boolean; sold: number;
};
/** Строка для администратора: со статусом и текстом после оплаты */
export type ProductAdmin = Product & { status: "active" | "hidden"; after: string; created: number; updated: number };
export type ProductInput = {
  id?: number; community: string; title: string; descr: string; image: string; kind: ProductKind;
  priceRub: number; priceUsdc: number; after: string; status: "active" | "hidden";
};

export type PayInfo =
  | { method: "sbp"; phone: string; bank: string; holder: string; amountRub: number; comment: string }
  | { method: "usdc"; to: string; token: string; network: string; amount: number; comment: string };
export type OrderStatus = "new" | "claimed" | "paid" | "rejected";
export type Order = {
  id: string; code: string; method: "sbp" | "usdc"; status: OrderStatus; amount: number; created: number; paid_at: number;
  product: { id: number; title: string; image: string; kind: ProductKind; community: string } | null;
  pay: PayInfo | null; after: string; canDownload: boolean;
};
export type OrderAdmin = {
  id: string; code: string; email: string; method: "sbp" | "usdc"; status: OrderStatus; amount: number; note: string; tx: string;
  product: number; title: string; created: number; paid_at: number; downloads: number;
};

async function call<T>(path: string, token: string, post?: unknown): Promise<T> {
  const [wallet, tok] = (token || "").split("|");
  const r = await fetch(`${API_URL}${path}`, {
    method: post !== undefined ? "POST" : "GET",
    cache: "no-store",
    headers: {
      ...(post !== undefined ? { "content-type": "application/json" } : {}),
      ...(tok ? { authorization: `Bearer ${tok}`, "x-wallet": wallet } : {}),
    },
    body: post !== undefined ? JSON.stringify(post) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!j.ok) throw new Error(j.error || "error");
  return j;
}

// ===== публично =====
export const listProducts = (community: string, token = "", all = false) =>
  call<{ items: ProductAdmin[] }>(`/api/shop/products?community=${encodeURIComponent(community)}${all ? "&all=1" : ""}`, token).then((j) => j.items);
export const getProduct = (id: number, token = "") =>
  call<{ product: ProductAdmin; sbp: boolean; usdc: boolean }>(`/api/shop/product?id=${id}`, token);
export const createOrder = (product: number, email: string, method: "sbp" | "usdc") =>
  call<{ order: Order }>("/api/shop/order", "", { product, email, method }).then((j) => j.order);
export const getOrder = (id: string) => call<{ order: Order }>(`/api/shop/order?id=${encodeURIComponent(id)}`, "").then((j) => j.order);
export const claimOrder = (id: string, note: string) => call<{ order: Order }>("/api/shop/order/claim", "", { id, note }).then((j) => j.order);
export const verifyOrder = (id: string, tx: string, from: string) =>
  call<{ order: Order }>("/api/shop/order/verify", "", { id, tx, from }).then((j) => j.order);
/** Ссылка на скачивание оплаченного файла (открывается обычной ссылкой) */
export const downloadUrl = (id: string) => `${API_URL}/api/shop/download?id=${encodeURIComponent(id)}`;

// ===== администратор =====
export const saveProduct = (token: string, p: ProductInput) => call<{ id: number }>("/api/shop/product/save", token, p).then((j) => j.id);
export const deleteProduct = (token: string, id: number) => call<object>("/api/shop/product/delete", token, { id });
export const listOrders = (token: string) => call<{ items: OrderAdmin[] }>("/api/shop/orders", token).then((j) => j.items);
export const confirmOrder = (token: string, id: string, action: "paid" | "reject" | "reset") =>
  call<object>("/api/shop/order/confirm", token, { id, action });

/** Закрытая загрузка PDF товара (не попадает в публичную папку /media) */
export async function uploadProductFile(token: string, id: number, file: File): Promise<number> {
  if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) throw new Error("bad_type");
  if (file.size > 40 * 1024 * 1024) throw new Error("too_big");
  const [wallet, tok] = token.split("|");
  const r = await fetch(`${API_URL}/api/shop/upload?id=${id}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", ...(tok ? { authorization: `Bearer ${tok}`, "x-wallet": wallet } : {}) },
    body: file,
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; bytes?: number; error?: string };
  if (!j.ok) throw new Error(j.error || "error");
  return j.bytes || file.size;
}

// ===== заказы в браузере покупателя =====
const KEY = "hm_orders";
export function savedOrders(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 30) : []; } catch { return []; }
}
export function rememberOrder(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify([id, ...savedOrders().filter((x) => x !== id)].slice(0, 30))); } catch { /* память браузера недоступна */ }
}

export const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
export const usdc = (n: number) => `${(Math.round(n * 100) / 100).toString()} USDC`;

const ERRORS: Record<string, [string, string]> = {
  auth: ["Войдите в аккаунт", "Please sign in"],
  forbidden: ["Только для администратора", "Admins only"],
  not_found: ["Не найдено", "Not found"],
  not_ready: ["Файл товара ещё не загружен", "The product file is not uploaded yet"],
  bad_email: ["Проверьте адрес почты", "Check your email address"],
  method_unavailable: ["Этот способ оплаты сейчас недоступен", "This payment method is unavailable"],
  slow_down: ["Слишком часто. Подождите немного", "Too many requests. Please wait a little"],
  bad_tx: ["Хеш перевода выглядит неверно (0x и 64 символа)", "The transaction hash looks wrong (0x + 64 characters)"],
  bad_wallet: ["Адрес кошелька выглядит неверно (0x и 40 символов)", "The wallet address looks wrong (0x + 40 characters)"],
  tx_used: ["Этот перевод уже использован", "This transfer was already used"],
  pay_unverified: ["Перевод не найден или сумма меньше. Подождите минуту и попробуйте снова", "Transfer not found or amount too low. Wait a minute and try again"],
  not_paid: ["Заказ ещё не оплачен", "The order is not paid yet"],
  download_limit: ["Лимит скачиваний исчерпан. Напишите продавцу", "Download limit reached. Contact the seller"],
  rejected: ["Заказ отклонён", "The order was rejected"],
  title_required: ["Укажите название", "Title is required"],
  price_required: ["Укажите цену в рублях или в USDC", "Set a price in rubles or USDC"],
  has_orders: ["Есть оплаченные заказы: скройте товар вместо удаления", "There are paid orders: hide the product instead of deleting"],
  bad_type: ["Нужен файл PDF", "A PDF file is required"],
  too_big: ["Файл слишком большой (до 40 МБ)", "File too large (up to 40 MB)"],
};
export const shopError = (e: unknown, ru: boolean) => {
  const t = ERRORS[e instanceof Error ? e.message : ""];
  return t ? (ru ? t[0] : t[1]) : ru ? "Не получилось. Попробуйте ещё раз." : "Something went wrong. Please try again.";
};
