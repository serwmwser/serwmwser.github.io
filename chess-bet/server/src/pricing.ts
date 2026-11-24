// Тарифы для создателей сообществ (как Hobby и Pro у Skool). Чтобы создать сообщество, владелец оплачивает один из тарифов.
// Цены в USDC. Оплата на кошелёк платформы (тот же, что получает комиссию со ставок в шахматы).

export type CreatorPlan = {
  id: "start" | "pro";
  name: [string, string];            // [русское, английское] название тарифа
  monthly: number | null;            // цена за месяц, USDC
  yearly: number | null;             // цена за год, USDC (null = считать по формуле YEAR_FREE_MONTHS)
  feePct: number | null;             // комиссия платформы с платежей участников сообщества, %
  customUrl: boolean;                // своё красивое название адреса сообщества
  affiliates: boolean;               // партнёрские тарифы владельца для своих партнёров
  features: [string, string][];      // строки для карточки тарифа: [по-русски, по-английски]
};

/** Сколько месяцев бесплатно при оплате за год (если yearly не задана) */
export const YEAR_FREE_MONTHS = 2;

/** Оплата создания обязательна. false: создавать сможет любой (на время тестов) */
export const REQUIRE_PAYMENT = true;

/** Партнёрская программа платформы: % от платежей приглашённого создателя за тариф, пожизненно */
export const PLATFORM_AFFILIATE_PCT = 40;

/** Цена участия в сообществе, которую выбирает владелец, USDC */
export const MIN_MEMBER_PRICE = 1;
export const MAX_MEMBER_PRICE = 1000;

/** Максимальный процент, который владелец может отдавать партнёру со своей части */
export const MAX_PARTNER_PCT = 50;

/** День выплат: понедельник (1), за предыдущую неделю пн–вс */
export const PAYOUT_WEEKDAY = 1;

export const CREATOR_PLANS: CreatorPlan[] = [
  {
    id: "start",
    name: ["Старт", "Start"],
    monthly: 6,
    yearly: 55,
    feePct: 10,
    customUrl: false,
    affiliates: false,
    features: [
      ["Неограниченно участников", "Unlimited members"],
      ["Открытое или закрытое сообщество", "Open or private community"],
      ["Платное участие от 1 до 1000 USDC", "Paid membership from 1 to 1000 USDC"],
      ["Страница-витрина с видео и описанием", "Showcase page with video and description"],
      ["Общий профиль, чат с переводом, звонки", "Shared profile, translated chat, calls"],
      ["Комиссия платформы 10%", "Platform fee 10%"],
    ],
  },
  {
    id: "pro",
    name: ["Про", "Pro"],
    monthly: 36,
    yearly: 299,
    feePct: 3,
    customUrl: true,
    affiliates: true,
    features: [
      ["Всё из тарифа «Старт»", "Everything in Start"],
      ["Комиссия платформы всего 3%", "Platform fee only 3%"],
      ["Партнёрские тарифы для ваших партнёров", "Partner plans for your affiliates"],
      ["Своё название адреса сообщества", "Custom community URL"],
      ["Реферальная программа: 40% пожизненно за приглашённых создателей", "Referral program: 40% for life on invited creators"],
    ],
  },
];

/** Цена тарифа за период в USDC; null, если цена не задана */
export function priceFor(plan: CreatorPlan, period: "month" | "year"): number | null {
  if (plan.monthly === null) return null;
  if (period === "month") return plan.monthly;
  if (plan.yearly !== null) return plan.yearly;
  return Math.round(plan.monthly * (12 - YEAR_FREE_MONTHS) * 100) / 100;
}

/** Найти тариф по id */
export const planById = (id: string): CreatorPlan | undefined => CREATOR_PLANS.find((p) => p.id === id);

/** Все ли цены и комиссии заданы. Пока нет, создание сообществ закрыто для всех, кроме администратора */
export const pricingReady = (): boolean => CREATOR_PLANS.every((p) => p.monthly !== null && p.feePct !== null);

/** Тарифы в виде, который отдаёт сервер сайту */
export function publicPricing() {
  return {
    ready: pricingReady(),
    requirePayment: REQUIRE_PAYMENT,
    yearFreeMonths: YEAR_FREE_MONTHS,
    platformAffiliatePct: PLATFORM_AFFILIATE_PCT,
    minMemberPrice: MIN_MEMBER_PRICE,
    maxMemberPrice: MAX_MEMBER_PRICE,
    plans: CREATOR_PLANS.map((p) => ({
      id: p.id, name: p.name, feePct: p.feePct, customUrl: p.customUrl, affiliates: p.affiliates, features: p.features,
      month: priceFor(p, "month"), year: priceFor(p, "year"),
    })),
  };
}

/** Бесплатный период создателя: первые FOUNDER_SLOTS создателей получают FOUNDER_DAYS дней, остальные TRIAL_DAYS; комиссия с участников удерживается всё это время */
export const FOUNDER_SLOTS = 50;
export const FOUNDER_DAYS = 90;
export const TRIAL_DAYS = 14;
