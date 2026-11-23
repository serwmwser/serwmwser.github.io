"use client";
// Оплата в USDC (Polygon) на кошелёк платформы и учёт выплат. Сервер: server/src/payments.ts (маршруты /api/pay/*).
// Порядок оплаты: перевод USDC из кошелька → запрос на сервер с хешем перевода → сервер проверяет перевод в блокчейне и выдаёт доступ.
import { prepareContractCall, readContract, waitForReceipt } from "thirdweb";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { API_URL, usdcContract } from "./config";
import { communityError } from "./communities";

export type PayInfo = { ready: boolean; to: string; token: string; decimals: number; minPrice: number; maxPrice: number };
export type MySub = { plan: "" | "start" | "pro"; expires: number };
export type AffiliateStats = { pct: number; wallet: string; creators: number; last30: number; lifetime: number; balance: number; paid: number; nextPayout: number };
export type PartnerTariff = { id: number; name: string; pct: number };
export type PartnerRow = { code: string; addr: string; name: string; tariff: number; pending: number; paid: number };
export type PartnerLink = { code: string; slug: string; community: string; tariff: string; pct: number };
export type IncomeItem = {
  id: number; tx: string; kind: "member" | "creator"; role: "owner" | "partner" | "referrer"; community: string;
  title: string;                 // наименование сообщества (или «Тариф создателя»)
  from: string; fromName: string; // от кого получено
  gross: number; fee: number; amount: number; // получено, комиссия платформы, сумма выплаты
  payee: string; payeeName: string;           // кошелёк, на который выплатить
  due: number; at: number; status: "pending" | "paid"; paidTx: string; paidAt: number;
};
export type Income = {
  due: number; dues: number[]; items: IncomeItem[];
  byPayee: { payee: string; name: string; total: number; pending: number; count: number }[];
  totals: { gross: number; fee: number; payout: number };
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
  const j = (await r.json()) as { ok: boolean; error?: string } & T;
  if (!j.ok) throw new Error(j.error || "error");
  return j;
}

export const payInfo = () => call<PayInfo>("/api/pay/info", "");
export const mySub = (token: string) => call<MySub>("/api/pay/mysub", token);
export const payCreator = (token: string, plan: "start" | "pro", period: "month" | "year", tx: string, ref?: string) =>
  call<{ plan: string; expires: number }>("/api/pay/creator", token, { plan, period, tx, ref: ref || "" });
export const payMember = (token: string, slug: string, plan: number, tx: string, ref?: string) =>
  call<{ expires: number }>("/api/pay/member", token, { slug, plan, tx, ref: ref || "" });
export const affiliateStats = (token: string) => call<AffiliateStats>("/api/pay/affiliate", token);
export const partnerMine = (token: string) => call<{ links: PartnerLink[]; pending: number; paid: number }>("/api/pay/partner_mine", token);
export const partnerList = (token: string, slug: string) =>
  call<{ pro: boolean; tariffs: PartnerTariff[]; partners: PartnerRow[] }>(`/api/pay/partner_list?slug=${encodeURIComponent(slug)}`, token);
export const partnerPlanAdd = (token: string, slug: string, name: string, pct: number) => call<object>("/api/pay/partner_plan_add", token, { slug, name, pct });
export const partnerPlanRemove = (token: string, slug: string, id: number) => call<object>("/api/pay/partner_plan_remove", token, { slug, id });
export const partnerAdd = (token: string, slug: string, addr: string, tariff: number) => call<{ code: string }>("/api/pay/partner_add", token, { slug, addr, tariff });
export const partnerRemove = (token: string, slug: string, addr: string) => call<object>("/api/pay/partner_remove", token, { slug, addr });
export const adminIncome = (token: string, due?: number) => call<Income>(`/api/pay/admin${due ? `?due=${due}` : ""}`, token);
export const adminMark = (token: string, ids: number[], tx: string) => call<{ marked: number }>("/api/pay/admin/mark", token, { ids, tx });

/** Партнёрский код из ссылки (?ref=…) запоминаем для сообщества, чтобы передать его при оплате */
export const rememberRef = (slug: string, code: string) => { try { if (code) localStorage.setItem(`cb_pref_${slug}`, code); } catch { /* без хранилища */ } };
export const getRef = (slug: string): string => { try { return localStorage.getItem(`cb_pref_${slug}`) || ""; } catch { return ""; } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOUR = 50 * 60 * 1000; // сервер принимает переводы не старше часа; берём с запасом
const pkey = (addr: string, key: string) => `cb_pay_${addr.toLowerCase()}_${key}`;

/** Перевод уже сделан, но сервер его ещё не принял (сбой связи): хеш хранится, и при повторе платить заново не нужно */
function pending(k: string): string {
  try {
    const s = JSON.parse(localStorage.getItem(k) || "null") as { tx: string; t: number } | null;
    if (s && /^0x[a-fA-F0-9]{64}$/.test(s.tx) && Date.now() - s.t < HOUR) return s.tx;
  } catch { /* без хранилища */ }
  return "";
}
const forget = (k: string) => { try { localStorage.removeItem(k); } catch { /* без хранилища */ } };

/** Возвращает payAndCall(ключ, цена, call): переводит USDC на кошелёк платформы и вызывает call(хеш перевода). Ошибки показывать через payError */
export function usePay() {
  const account = useActiveAccount();
  const { mutateAsync: send } = useSendTransaction();
  return async function payAndCall<T>(key: string, price: number, call: (tx: string) => Promise<T>): Promise<T> {
    if (!account) throw new Error("auth");
    const info = await payInfo();
    if (!info.ready) throw new Error("payment_unavailable");
    const amount = BigInt(Math.round(price * 1e6));
    const k = pkey(account.address, key);
    let tx = pending(k);
    if (!tx) {
      const bal = await readContract({ contract: usdcContract, method: "function balanceOf(address owner) view returns (uint256)", params: [account.address] });
      if (bal < amount) throw new Error("no_usdc");
      const r = await send(prepareContractCall({ contract: usdcContract, method: "function transfer(address to, uint256 amount) returns (bool)", params: [info.to, amount] }));
      await waitForReceipt(r);
      tx = r.transactionHash;
      try { localStorage.setItem(k, JSON.stringify({ tx, t: Date.now() })); } catch { /* без хранилища */ }
    }
    let last: unknown = new Error("pay_unverified");
    for (let i = 0; i < 5; i++) {
      try { const res = await call(tx); forget(k); return res; }
      catch (e) {
        last = e;
        if ((e as Error)?.message !== "pay_unverified") break; // сеть могла ещё не показать перевод серверу: пробуем снова
        await sleep(3000);
      }
    }
    if ((last as Error)?.message === "tx_used") forget(k); // этот перевод уже учтён
    throw Object.assign(last instanceof Error ? last : new Error(String(last)), { tx });
  };
}

/** Понятный текст ошибки оплаты (ru/en). Если перевод прошёл, но действие не выполнено, показываем хеш: повторная оплата не потребуется */
export function payError(e: unknown, ru: boolean): string {
  const m = String((e as Error)?.message || e || "");
  const t: Record<string, [string, string]> = {
    no_usdc: ["Недостаточно USDC на кошельке (сеть Polygon)", "Not enough USDC in your wallet (Polygon network)"],
    payment_unavailable: ["Приём оплаты ещё не включён", "Payments are not enabled yet"],
    pay_unverified: ["Перевод пока не найден в сети, подождите минуту и повторите", "The transfer is not visible on the network yet; wait a minute and retry"],
    tx_used: ["Этот перевод уже учтён", "This transfer has already been used"],
    plan_active: ["У вас уже оплачен тариф «Про»", "You already have an active Pro plan"],
    pro_required: ["Партнёрские тарифы доступны на тарифе «Про»", "Partner plans need the Pro plan"],
    own_community: ["Это ваше сообщество", "This is your community"],
    bad_pct: ["Процент партнёра от 1 до 50", "Partner percent must be 1 to 50"],
    bad_partner: ["Партнёр не найден: нужен адрес зарегистрированного пользователя", "Partner not found: use the address of a registered user"],
    too_many_tariffs: ["Не больше 6 партнёрских тарифов", "Up to 6 partner plans"],
    bad_tariff: ["Выберите партнёрский тариф", "Choose a partner plan"],
  };
  if (/reject|denied|cancel|declin|closed/i.test(m)) return ru ? "Оплата отменена" : "Payment cancelled";
  if (/insufficient funds|gas/i.test(m)) return ru ? "Не хватает POL на комиссию сети" : "Not enough POL for the network fee";
  const base = t[m] ? t[m][ru ? 0 : 1] : communityError(m, ru);
  const tx = (e as { tx?: string })?.tx;
  if (!tx) return base;
  return base + (ru ? ` Перевод прошёл (${tx.slice(0, 10)}…), повторите действие: платить заново не придётся.` : ` Your payment went through (${tx.slice(0, 10)}…); repeat the action, you will not be charged again.`);
}
