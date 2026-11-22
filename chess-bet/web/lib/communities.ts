"use client";
// Сообщества: каталог, страница сообщества, тарифы, создание. Сервер: server/src/communities.ts (маршруты /api/communities/*).
import { API_URL } from "./config";
import { BASE } from "./urls";

export type Category = { slug: string; ru: string; en: string; icon: string };
export type PlanPeriod = "month" | "quarter" | "year" | "lifetime";
export type CommunityPlan = { id: number; name: string; period: PlanPeriod; price: number };
export type Community = {
  slug: string; name: string; descr: string; cover: string; owner: string | null; members: number;
  visibility: "open" | "closed"; category: string; categories: string[];
  role: string;   // "owner" | "mod" | "member" | "" (не участник)
  state: string;  // "member" | "pending" (заявка отправлена) | "expired" (срок вышел) | ""
  hidden: boolean; created: number; paid: boolean; plans: CommunityPlan[];
};
export type CreatorPlanInfo = {
  id: "start" | "pro"; name: [string, string]; feePct: number | null; customUrl: boolean; affiliates: boolean;
  features: [string, string][]; month: number | null; year: number | null;
};
export type Pricing = { ready: boolean; requirePayment: boolean; yearFreeMonths: number; plans: CreatorPlanInfo[]; canCreate: boolean };
export type JoinRequest = { addr: string; name: string | null; at: number };

/** Главное сообщество: это сам сайт HiMeet, вступать в него не нужно */
export const MAIN_SLUG = "himeet";

/** Адрес страницы сообщества (параметр в адресе, как у профилей: сайт статический) */
export const communityUrl = (slug: string) => `${BASE}/community/?slug=${encodeURIComponent(slug)}`;

/** Токен сайта имеет вид «адрес|токен»; без входа можно читать каталог (токен пустой) */
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

const qs = (o: Record<string, string>) => {
  const s = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return s ? `?${s}` : "";
};

export const listCommunities = (token: string, o: { q?: string; category?: string } = {}) =>
  call<{ items: Community[] }>(`/api/communities${qs({ q: o.q || "", category: o.category || "" })}`, token).then((j) => j.items);
export const getCommunity = (token: string, slug: string) =>
  call<{ community: Community }>(`/api/communities/get${qs({ slug })}`, token).then((j) => j.community);
export const myCommunities = (token: string) => call<{ items: Community[] }>("/api/communities/mine", token).then((j) => j.items);
export const listCategories = () => call<{ items: Category[] }>("/api/communities/categories", "").then((j) => j.items);
export const getPricing = (token: string) => call<Pricing>("/api/communities/pricing", token);

export const joinCommunity = (token: string, slug: string, plan?: number) =>
  call<{ community: Community }>("/api/communities/join", token, { slug, plan: plan || 0 }).then((j) => j.community);
export const leaveCommunity = (token: string, slug: string) => call<object>("/api/communities/leave", token, { slug });
export const createCommunity = (token: string, d: { slug: string; name: string; descr: string; visibility: "open" | "closed"; categories: string[] }) =>
  call<{ community: Community }>("/api/communities/create", token, d).then((j) => j.community);
export const updateCommunity = (token: string, slug: string, d: { name?: string; descr?: string; cover?: string; visibility?: "open" | "closed"; categories?: string[] }) =>
  call<{ community: Community }>("/api/communities/update", token, { slug, ...d }).then((j) => j.community);
export const addPlan = (token: string, slug: string, d: { name: string; period: PlanPeriod; price: number }) =>
  call<{ community: Community }>("/api/communities/plan_add", token, { slug, ...d }).then((j) => j.community);
export const removePlan = (token: string, slug: string, id: number) =>
  call<{ community: Community }>("/api/communities/plan_remove", token, { slug, id }).then((j) => j.community);
export const listRequests = (token: string, slug: string) =>
  call<{ items: JoinRequest[] }>(`/api/communities/requests${qs({ slug })}`, token).then((j) => j.items);
export const decideRequest = (token: string, slug: string, addr: string, approve: boolean) =>
  call<object>("/api/communities/decide", token, { slug, addr, approve });

/** Подпись периода тарифа */
export function periodText(p: PlanPeriod, ru: boolean): string {
  const t: Record<PlanPeriod, [string, string]> = { month: ["в месяц", "/ month"], quarter: ["за 3 месяца", "/ 3 months"], year: ["в год", "/ year"], lifetime: ["навсегда", "one-time"] };
  return t[p][ru ? 0 : 1];
}
/** Цена в USDC или «Бесплатно» */
export const priceText = (price: number, ru: boolean) => (price > 0 ? `${price} USDC` : ru ? "Бесплатно" : "Free");
/** Самый дешёвый платный тариф для карточки: «от 10 USDC» */
export function fromPrice(c: Community, ru: boolean): string {
  const paid = c.plans.filter((p) => p.price > 0).map((p) => p.price);
  if (!paid.length) return ru ? "Бесплатно" : "Free";
  return `${ru ? "от" : "from"} ${Math.min(...paid)} USDC`;
}

/** Понятный текст ошибки сервера */
export function communityError(code: string, ru: boolean): string {
  const t: Record<string, [string, string]> = {
    auth: ["Войдите на сайт", "Please sign in"],
    no_profile: ["Сначала создайте профиль с ником", "Create a profile with a nickname first"],
    bad_slug: ["Адрес: 3–30 символов, латиница, цифры и дефис; некоторые слова заняты", "Address: 3–30 chars, letters, digits and hyphens; some words are reserved"],
    slug_taken: ["Такой адрес уже занят", "This address is taken"],
    bad_name: ["Название слишком короткое", "The name is too short"],
    too_many_communities: ["Можно создать не больше 3 сообществ", "You can create up to 3 communities"],
    payment_required: ["Сначала оплатите тариф создателя", "Please pay for a creator plan first"],
    creation_closed: ["Создание сообществ скоро откроется", "Creating communities opens soon"],
    payment_not_supported: ["Оплата тарифов сообщества скоро появится", "Paying for community plans is coming soon"],
    too_many_requests: ["Слишком много открытых заявок", "Too many pending requests"],
    owner_cannot_leave: ["Владелец не может выйти из своего сообщества", "The owner cannot leave their community"],
    slow_down: ["Слишком часто, попробуйте позже", "Too fast, try again later"],
    bad_cover: ["Обложка: ссылка на картинку, начинается с https://", "Cover: an image link starting with https://"],
    bad_price: ["Цена от 0 до 10000 USDC", "Price from 0 to 10000 USDC"],
    too_many_plans: ["Не больше 6 тарифов", "Up to 6 plans"],
  };
  const x = t[code];
  return x ? x[ru ? 0 : 1] : ru ? "Не получилось, попробуйте ещё раз" : "Failed, try again";
}
