// Тарифы для создателей сообществ (как Hobby и Pro у Skool). Чтобы создать сообщество, владелец оплачивает один из тарифов.
// ВСЕ ЦЕНЫ И ПРОЦЕНТЫ ПОКА НЕ ЗАДАНЫ (null): впишите их ниже, и создание сообществ откроется. Пока значения null, создавать сообщества может только администратор.
// Цены в USDC за месяц. Годовая цена по умолчанию = месячная × (12 − YEAR_FREE_MONTHS): при оплате за год несколько месяцев бесплатно.

export type CreatorPlan = {
  id: "start" | "pro";
  name: [string, string];            // [русское, английское] название тарифа
  monthly: number | null;            // цена за месяц, USDC (null = не задана)
  yearly: number | null;             // цена за год, USDC (null = считать по формуле выше)
  feePct: number | null;             // комиссия платформы с платежей участников сообщества, % (null = не задана)
  customUrl: boolean;                // своё красивое название адреса сообщества
  affiliates: boolean;               // реферальная программа для владельца сообщества
  features: [string, string][];      // строки для карточки тарифа: [по-русски, по-английски]
};

/** Сколько месяцев бесплатно при оплате за год */
export const YEAR_FREE_MONTHS = 2;

/** Оплата создания обязательна. false — создавать сможет любой (на время тестов) */
export const REQUIRE_PAYMENT = true;

export const CREATOR_PLANS: CreatorPlan[] = [
  {
    id: "start",
    name: ["Старт", "Start"],
    monthly: null,
    yearly: null,
    feePct: null,
    customUrl: false,
    affiliates: false,
    features: [
      ["Неограниченно участников", "Unlimited members"],
      ["Открытое или закрытое сообщество", "Open or private community"],
      ["Платные тарифы для участников", "Paid plans for members"],
      ["Общий профиль, чат с переводом, звонки", "Shared profile, translated chat, calls"],
    ],
  },
  {
    id: "pro",
    name: ["Про", "Pro"],
    monthly: null,
    yearly: null,
    feePct: null,
    customUrl: true,
    affiliates: true,
    features: [
      ["Всё из тарифа «Старт»", "Everything in Start"],
      ["Меньшая комиссия с платежей участников", "Lower fee on member payments"],
      ["Своё название адреса сообщества", "Custom community URL"],
      ["Реферальная программа владельца", "Owner referral program"],
    ],
  },
];

/** Цена тарифа за период в USDC; null, если цена ещё не задана */
export function priceFor(plan: CreatorPlan, period: "month" | "year"): number | null {
  if (plan.monthly === null) return null;
  if (period === "month") return plan.monthly;
  if (plan.yearly !== null) return plan.yearly;
  return Math.round(plan.monthly * (12 - YEAR_FREE_MONTHS) * 100) / 100;
}

/** Все ли цены и комиссии заданы. Пока нет, создание сообществ закрыто для всех, кроме администратора */
export const pricingReady = (): boolean => CREATOR_PLANS.every((p) => p.monthly !== null && p.feePct !== null);

/** Тарифы в виде, который отдаёт сервер сайту */
export function publicPricing() {
  return {
    ready: pricingReady(),
    requirePayment: REQUIRE_PAYMENT,
    yearFreeMonths: YEAR_FREE_MONTHS,
    plans: CREATOR_PLANS.map((p) => ({
      id: p.id, name: p.name, feePct: p.feePct, customUrl: p.customUrl, affiliates: p.affiliates, features: p.features,
      month: priceFor(p, "month"), year: priceFor(p, "year"),
    })),
  };
}
