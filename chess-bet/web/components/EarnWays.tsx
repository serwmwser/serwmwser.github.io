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

/** «Как делятся деньги»: правила и пример, чтобы партнёры и владельцы клубов понимали, откуда берётся доход */
function EarnRules({ ru }: { ru: boolean }) {
  const rows: [string, string, string][] = ru
    ? [["Пригласивший владельца клуба", "2,40", "2,40"], ["Владелец клуба (за вычетом тарифа 6)", "39,00", "42,50"], ["Платформа HiMeet", "8,60", "5,10"]]
    : [["Who invited the club owner", "2.40", "2.40"], ["Club owner (after the 6 plan fee)", "39.00", "42.50"], ["HiMeet platform", "8.60", "5.10"]];
  return (
    <section className="card space-y-3" aria-label={ru ? "Как делятся деньги" : "How the money is split"}>
      <h2 className="text-xl font-extrabold">{ru ? "Как делятся деньги" : "How the money is split"}</h2>
      <ul className="list-disc space-y-1 ps-5 text-sm opacity-90">
        <li>{ru ? "Тариф создателя: пригласивший получает 40%, платформа 60%. Пока создатель платит за тариф, доля пригласившего платится каждый раз." : "Creator plan: the inviter gets 40%, the platform 60%, on every plan payment the invited creator makes."}</li>
        <li>{ru ? "Платежи участников клуба: платформа берёт 10% (тариф «Старт») или 3% («Про»), остальное получает владелец клуба." : "Club member payments: the platform takes 10% (Start) or 3% (Pro); the rest goes to the club owner."}</li>
        <li>{ru ? "Пригласивший владельца клуба не получает ничего с платежей участников. Исключение: если участника привёл он сам по партнёрской ссылке клуба. Тогда его долю (до 50%) задаёт и платит владелец клуба, только на тарифе «Про»." : "The person who invited the club owner earns nothing from member payments, unless they also brought the member through the club's partner link. Then their share (up to 50%) is set and paid by the club owner, on Pro only."}</li>
        <li>{ru ? "Товары и услуги в клубе: 20% платформе, 80% владельцу." : "Products and services in a club: 20% to the platform, 80% to the owner."}</li>
        <li>{ru ? "Выплаты: по понедельникам за прошлую неделю." : "Payouts: every Monday for the previous week."}</li>
      </ul>
      <div>
        <h3 className="font-bold">{ru ? "Пример на один месяц" : "Example for one month"}</h3>
        <p className="mt-1 text-sm opacity-80">{ru ? "Владелец клуба платит за тариф 6 USDC. Ему платят 10 участников по 5 USDC (всего 50 USDC), без партнёрских ссылок." : "A club owner pays 6 USDC for the plan. 10 members pay 5 USDC each (50 USDC total), with no partner links."}</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-start opacity-70"><th className="py-1 pe-3 text-start font-semibold">USDC</th><th className="px-3 text-end font-semibold">{ru ? "«Старт»" : "Start"}</th><th className="ps-3 text-end font-semibold">{ru ? "«Про»" : "Pro"}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]} className="border-t border-black/10 dark:border-white/15"><td className="py-1.5 pe-3">{r[0]}</td><td className="px-3 text-end font-semibold">{r[1]}</td><td className="ps-3 text-end font-semibold">{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs opacity-60">{ru ? "Это пример для понимания, а не обещание дохода: реальные суммы зависят от числа участников и цен." : "This is an illustration, not a promise of income: real amounts depend on member numbers and prices."}</p>
      </div>
    </section>
  );
}

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
      <EarnRules ru={ru} />
      <p className="text-xs opacity-60">{ru ? "Доход не гарантирован и зависит от ваших действий. Условия программ и комиссии могут меняться, актуальные условия указаны на страницах разделов." : "Income is not guaranteed and depends on your actions. Programme terms and fees may change; current terms are on each section page."}</p>
    </section>
  );
}
