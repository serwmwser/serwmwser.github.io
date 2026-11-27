"use client";
// Раздел «Заработать»: все способы заработка на HiMeet в одном месте, с честной пометкой «Работает» или «Скоро».
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { BASE, ROUTES } from "@/lib/urls";

type L = [string, string]; // [ru, en]
type Way = { icon: string; title: L; text: L; href: string; cta: L; live: boolean };

const WAYS: Way[] = [
  { icon: "🤝", live: true, href: ROUTES.affiliates, cta: ["Моя партнёрская ссылка", "My affiliate link"],
    title: ["Партнёрка платформы: 40% пожизненно", "Platform affiliate programme: 40% for life"],
    text: ["Приглашайте создателей сообществ: вы получаете 40% от их платежей за тариф, пока они платят. Выплаты по понедельникам в USDC.", "Invite community creators: you get 40% of their plan payments while they keep paying. Weekly payouts in USDC."] },
  { icon: "👥", live: true, href: `${BASE}/communities/new/`, cta: ["Создать клуб", "Create a club"],
    title: ["Свой платный клуб", "Your own paid club"],
    text: ["Задайте цену участия и получайте деньги от участников. Для первых создателей действуют бесплатные месяцы. Клуб можно вести на своём языке: перевод поможет иностранной аудитории.", "Set the membership price and get paid by members. Early creators get free months. Run the club in your own language: translation helps a foreign audience."] },
  { icon: "🧩", live: true, href: `${BASE}/partner/`, cta: ["Кабинет партнёра", "Partner dashboard"],
    title: ["Партнёр сообщества", "Community partner"],
    text: ["Владелец клуба может добавить вас партнёром и назначить процент с оплат приведённых вами участников. Ссылки и заработок в кабинете партнёра.", "A club owner can add you as a partner and set a share of the payments from members you bring. Links and earnings are in the partner dashboard."] },
  { icon: "🛍", live: true, href: ROUTES.communities, cta: ["Выбрать клуб", "Pick a club"],
    title: ["Товары и услуги в клубе", "Products and services in a club"],
    text: ["Продавайте электронные книги, PDF и услуги покупателям без регистрации: рубли через СБП (ЮKassa) и USDC. Платформа удерживает 20%, остальное ваше. Лимит: 1 позиция на тарифе Start, до 10 на Pro.", "Sell e-books, PDFs and services to buyers without sign-up: rubles via SBP (YooKassa) and USDC. The platform keeps 20%, the rest is yours. Limit: 1 item on Start, up to 10 on Pro."] },
  { icon: "📣", live: true, href: ROUTES.ads, cta: ["Объявления", "Classifieds"],
    title: ["Продажа через объявления", "Selling through classifieds"],
    text: ["Продавайте вещи, услуги и работу по всему миру: объявления и чат переводятся автоматически. Первое объявление бесплатно.", "Sell goods, services and jobs worldwide: ads and chat are translated automatically. The first ad is free."] },
  { icon: "♞", live: true, href: ROUTES.crypto, cta: ["Шахматы на USDC", "Chess for USDC"],
    title: ["Шахматы на USDC и турниры", "Chess for USDC and tournaments"],
    text: ["Партии со ставками в USDC (только 18+): результат зависит от вашего мастерства, выигрыш не гарантирован. Играйте только теми суммами, потерю которых можете себе позволить.", "Games with USDC stakes (18+ only): the result depends on your skill and winning is not guaranteed. Only play with amounts you can afford to lose."] },
  { icon: "🖼", live: true, href: ROUTES.nft, cta: ["Студия NFT", "NFT studio"],
    title: ["Шахматные NFT", "Chess NFTs"],
    text: ["Превратите лучший ход партии в NFT в сети Polygon.", "Turn the best move of your game into an NFT on Polygon."] },
  { icon: "🪙", live: false, href: ROUTES.token, cta: ["О токене TCH", "About the TCH token"],
    title: ["Токен TCH: звонки и активность", "TCH token: calls and activity"],
    text: ["Награда за время звонков делится 50/50 между собеседниками, меньшие награды за партии, посты и задачи. Награды пока не запущены, токен не торгуется на биржах.", "A reward for call time is split 50/50 between the two people, smaller rewards for games, posts and puzzles. Rewards are not live yet and the token is not listed on any exchange."] },
  { icon: "💞", live: false, href: ROUTES.token, cta: ["Подробнее", "Learn more"],
    title: ["Приглашение друзей (Eternal Gambit)", "Inviting friends (Eternal Gambit)"],
    text: ["Бонус 10% от TCH, которые зарабатывают ваши друзья, 20% при 21 друге и 30% от 101 друга. Бонус идёт из резерва наград и не уменьшает доход друга. Пока не запущено.", "A bonus of 10% of the TCH your friends earn, 20% with 21 friends and 30% from 101. The bonus comes from the rewards reserve and does not reduce your friend's income. Not live yet."] },
];

export default function EarnWays() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const tx = (l: L) => (ru ? l[0] : l[1]);
  return (
    <section className="space-y-3" aria-label={ru ? "Способы заработать" : "Ways to earn"}>
      <h2 className="text-xl font-extrabold">{ru ? "Все способы заработать на HiMeet" : "All the ways to earn on HiMeet"}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {WAYS.map((w) => (
          <li key={w.title[0]} className="card flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <span aria-hidden className="text-2xl leading-none">{w.icon}</span>
              <h3 className="min-w-0 flex-1 font-bold leading-snug">{tx(w.title)}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${w.live ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200"}`}>{w.live ? (ru ? "Работает" : "Live") : (ru ? "Скоро" : "Soon")}</span>
            </div>
            <p className="flex-1 text-sm opacity-85">{tx(w.text)}</p>
            <Link href={w.href} className="btn btn-ghost !py-1.5 text-center text-sm">{tx(w.cta)}</Link>
          </li>
        ))}
      </ul>
      <p className="text-xs opacity-60">{ru ? "Доход не гарантирован и зависит от ваших действий. Условия программ и комиссии могут меняться, актуальные условия указаны на страницах разделов." : "Income is not guaranteed and depends on your actions. Programme terms and fees may change; current terms are on each section page."}</p>
    </section>
  );
}
