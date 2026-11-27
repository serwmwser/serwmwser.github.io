"use client";
// Первая страница для посетителя без входа: градиентный экран с заголовком, вкладки возможностей, блок «Что такое HiMeet»,
// разделы с описанием, предложение создателям и подвал со ссылками. Вход в приложение: кнопка «Начать» (onStart).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { BASE, ROUTES } from "@/lib/urls";
import { getPricing, type Pricing } from "@/lib/communities";
import PromoStrip from "./PromoStrip";
import FounderBanner from "./FounderBanner";

type L = [string, string]; // [ru, en]
const COMMUNITIES = `${BASE}/communities/`;
const CREATE = `${BASE}/communities/new/`;

const TABS: { id: string; icon: string; name: L; title: L; text: L; href: string; cta: L }[] = [
  { id: "chat", icon: "💬", name: ["Мессенджер", "Messenger"], href: ROUTES.translateChat, cta: ["Открыть мессенджер", "Open the messenger"],
    title: ["Мессенджер с автопереводом", "Messenger with auto-translation"],
    text: ["Пишите людям из любой страны на своём языке: сообщения переводятся автоматически. Звонки, голосовые, файлы, поиск собеседников для языкового обмена и один профиль для всего приложения.", "Write to people from any country in your own language: messages are translated automatically. Calls, voice messages, files, finding language partners and one profile for the whole app."] },
  { id: "clubs", icon: "👥", name: ["Клубы", "Clubs"], href: COMMUNITIES, cta: ["Смотреть клубы", "Browse clubs"],
    title: ["Клубы по интересам", "Clubs for every interest"],
    text: ["Вступайте в открытые и закрытые сообщества или создайте своё: сами задаёте цену участия от 1 до 1000 USDC и получаете доход с каждого участника.", "Join open and private communities or start your own: you set the membership price from 1 to 1000 USDC and earn from every member."] },
  { id: "dating", icon: "💞", name: ["Знакомства", "Dating"], href: ROUTES.dating, cta: ["Найти пару", "Find a match"],
    title: ["Друзья и пара по интеллекту", "Friends and a match by mind"],
    text: ["Один профиль для всех клубов: находите друзей и людей, с которыми интересно говорить, по увлечениям, языкам и играм.", "One profile for every club: find friends and people who are interesting to talk to by hobbies, languages and games."] },
  { id: "ads", icon: "🏷", name: ["Объявления", "Classifieds"], href: ROUTES.ads, cta: ["К объявлениям", "See listings"],
    title: ["Объявления со всего мира", "Classifieds from around the world"],
    text: ["Продавайте и покупайте без языкового барьера: объявления и чат между продавцом и покупателем переводятся автоматически.", "Sell and buy without a language barrier: listings and the buyer–seller chat are translated automatically."] },
  { id: "games", icon: "♞", name: ["Игры", "Games"], href: ROUTES.chess, cta: ["Играть в шахматы", "Play chess"],
    title: ["Шахматы и игры на мастерство", "Chess and skill games"],
    text: ["Бесплатные партии с ботом и друзьями, партии по переписке и игры на USDC для взрослых 18+. Результат зависит от мастерства, но выигрыш не гарантирован.", "Free games against the bot and friends, correspondence chess and USDC games for adults 18+. The result depends on skill, but winning is not guaranteed."] },
];

const SECTIONS: { icon: string; title: L; text: L; points: L[]; href: string; cta: L }[] = [
  { icon: "🏛", title: ["Создайте клуб и зарабатывайте", "Build a club and earn"], href: CREATE, cta: ["Создать сообщество", "Create a community"],
    text: ["Страница-витрина с видео, описанием и ценой участия, приём платежей в USDC и выплаты по понедельникам за прошлую неделю.", "A showcase page with video, description and membership price, USDC payments and payouts every Monday for the previous week."],
    points: [["Цена участия от 1 до 1000 USDC, или бесплатно", "Membership price from 1 to 1000 USDC, or free"], ["Партнёрские тарифы: партнёры получают процент с привлечённых участников", "Partner plans: partners earn a percentage on the members they bring"], ["Открытые и закрытые сообщества с заявками", "Open and private communities with join requests"]] },
  { icon: "🌍", title: ["Общение без языкового барьера", "Talk without a language barrier"], href: ROUTES.translateChat, cta: ["Попробовать чат", "Try the chat"],
    text: ["Один профиль, один чат и один аккаунт для всех сообществ. Люди пишут на родном языке, а вы читаете на своём.", "One profile, one chat and one account for all communities. People write in their own language and you read in yours."],
    points: [["Автоперевод сообщений и объявлений", "Auto-translation of messages and listings"], ["Звонки из профиля", "Calls from the profile"], ["Языковой обмен и поиск друзей", "Language exchange and finding friends"]] },
  { icon: "🧠", title: ["Играйте и тренируйте ум", "Play and train your mind"], href: ROUTES.chess, cta: ["К шахматам", "Go to chess"],
    text: ["Шахматы в разных форматах: с ботом, с друзьями, по переписке и мультяшные фигуры. Игры на USDC доступны только взрослым и там, где это разрешено законом.", "Chess in many formats: against the bot, with friends, by correspondence and with cartoon pieces. USDC games are for adults only and where the law allows."],
    points: [["Партии с ботом и друзьями бесплатно", "Free games against the bot and friends"], ["Шахматы по переписке: ход раз в час или в сутки", "Correspondence chess: a move per hour or per day"], ["Ставки в USDC хранит смарт-контракт", "USDC stakes are held by a smart contract"]] },
];

const FOOT: { title: L; links: [L, string][] }[] = [
  { title: ["Продукт", "Product"], links: [[["Сообщества", "Communities"], COMMUNITIES], [["Чат с переводом", "Chat with translation"], ROUTES.translateChat], [["Знакомства", "Dating"], ROUTES.dating], [["Объявления", "Classifieds"], ROUTES.ads], [["Поиск друзей", "Find friends"], ROUTES.friends]] },
  { title: ["Игры", "Games"], links: [[["Шахматы онлайн", "Chess online"], ROUTES.chess], [["Шахматы на USDC", "Chess for USDC"], ROUTES.crypto], [["Мультяшные шахматы", "Cartoon chess"], ROUTES.cartoon], [["Шахматы по переписке", "Correspondence chess"], ROUTES.correspondence], [["Турниры", "Tournaments"], ROUTES.tournaments]] },
  { title: ["Создателям", "Creators"], links: [[["Создать сообщество", "Create a community"], CREATE], [["Партнёрка 40%", "Affiliates 40%"], `${BASE}/affiliates/`], [["Карта развития", "Roadmap"], ROUTES.roadmap], [["Белая книга", "Whitepaper"], ROUTES.whitepaper]] },
  { title: ["О проекте", "Company"], links: [[["О нас", "About"], ROUTES.about], [["Вопросы и ответы", "FAQ"], ROUTES.faq], [["Условия", "Terms"], ROUTES.terms], [["18+", "18+"], ROUTES.age]] },
];

export default function Landing({ onStart }: { onStart: () => void }) {
  const { lang, setLang } = useApp();
  const ru = lang === "ru";
  const tx = (l: L) => (ru ? l[0] : l[1]);
  const [tab, setTab] = useState(TABS[0].id);
  const [pr, setPr] = useState<Pricing | null>(null);
  useEffect(() => { getPricing("").then(setPr).catch(() => { /* блок цен просто не покажется */ }); }, []);
  const cur = TABS.find((t) => t.id === tab) || TABS[0];
  const start = pr?.ready ? pr.plans.map((p) => p.month).filter((n): n is number => typeof n === "number") : [];
  const from = start.length ? Math.min(...start) : null;

  return (
    <div className="min-h-screen">
      {/* Верхняя панель */}
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <span className="text-xl font-extrabold" style={{ color: "#d4a017" }}>HiMeet</span>
        <nav className="ms-4 hidden gap-4 text-sm font-semibold sm:flex" aria-label={ru ? "Разделы" : "Sections"}>
          <Link href={COMMUNITIES} className="hover:underline">{ru ? "Сообщества" : "Communities"}</Link>
          <a href="#features" className="hover:underline">{ru ? "Возможности" : "Features"}</a>
          <a href="#creators" className="hover:underline">{ru ? "Создателям" : "Creators"}</a>
        </nav>
        <select aria-label="Language" value={lang === "ru" ? "ru" : "en"} onChange={(e) => setLang(e.target.value as typeof lang)} className="ms-auto rounded-lg border border-black/15 dark:border-white/20 bg-transparent px-2 py-1 text-sm">
          <option value="ru">RU</option>
          <option value="en">EN</option>
        </select>
        <button type="button" className="btn btn-ghost !py-2" onClick={onStart}>{ru ? "Войти" : "Sign in"}</button>
      </header>

      {/* Выгода для создателей: самая первая строка */}
      <FounderBanner className="mx-4 mb-4 mt-4 max-w-6xl lg:mx-auto" />

      {/* Главный экран */}
      <section className="mx-4 max-w-6xl rounded-3xl px-5 py-14 text-center text-white sm:py-20 lg:mx-auto" style={{ background: "linear-gradient(135deg,#1e1b4b 0%,#6d28d9 45%,#ec4899 100%)" }}>
        <h1 className="mx-auto max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">{ru ? "Мессенджер, где вас понимают на любом языке" : "A messenger where everyone understands you in any language"}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm opacity-95 sm:text-lg">
          {ru ? "Общайтесь с людьми со всего мира на своём языке: перевод встроен в каждый чат. Один профиль для сообщений, звонков, клубов, объявлений и игр. Создайте платный клуб и зарабатывайте: автор из России может продавать клуб иностранной аудитории, и его поймут." : "Talk to people from all over the world in your own language: translation is built into every chat. One profile for messages, calls, clubs, classifieds and games. Start a paid club and earn: an author from any country can sell a club to a foreign audience and be understood."}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" className="btn btn-primary !px-6 !py-3 text-base" onClick={onStart}>{ru ? "Начать" : "Get started"}</button>
          <Link href={COMMUNITIES} className="btn !px-6 !py-3 text-base bg-white/15 text-white hover:bg-white/25">{ru ? "Смотреть сообщества" : "Browse communities"}</Link>
        </div>
        <p className="mt-4 text-xs opacity-80">{ru ? "18+. Доступность функций зависит от законов вашей страны." : "18+. Feature availability depends on the laws of your country."}</p>
      </section>

      {/* Реклама: блок виден, только когда есть активная реклама */}
      <PromoStrip className="mx-4 my-6 max-w-6xl lg:mx-auto" />

      {/* Вкладки возможностей */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-12">
        <div role="tablist" className="flex flex-wrap justify-center gap-2">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={`chip ${t.id === tab ? "chip-on" : ""}`} onClick={() => setTab(t.id)}>{t.icon} {tx(t.name)}</button>
          ))}
        </div>
        <div role="tabpanel" className="card mx-auto mt-6 max-w-3xl space-y-3 text-center">
          <h2 className="text-2xl font-extrabold">{tx(cur.title)}</h2>
          <p className="text-sm sm:text-base opacity-85">{tx(cur.text)}</p>
          <Link href={cur.href} className="btn btn-primary">{tx(cur.cta)}</Link>
        </div>
      </section>

      {/* Что такое HiMeet */}
      <section className="mx-auto max-w-3xl px-4 py-8 text-center space-y-3">
        <h2 className="text-2xl font-extrabold sm:text-3xl">{ru ? "Что такое HiMeet?" : "What is HiMeet?"}</h2>
        <p className="text-sm sm:text-base opacity-85">{ru ? "HiMeet это мессенджер с автопереводом, звонками и голосовыми сообщениями, в котором под одним профилем собраны сообщества, объявления, знакомства и игры. Сильная сторона: один профиль для общения на любом языке и клубов, где автор зарабатывает. Автор из России может продавать платный клуб иностранной аудитории, и его поймут. Создатели получают собственную страницу, приём платежей, магазин товаров и партнёрскую программу." : "HiMeet is a messenger with auto-translation, calls and voice messages that brings communities, classifieds, dating and games under one profile. Its strength: one profile for chatting in any language and for clubs where the author earns. An author from Russia can sell a paid club to a foreign audience and be understood. Creators get their own page, payments, a product shop and a partner programme."}</p>
      </section>

      {/* Разделы */}
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {SECTIONS.map((s, i) => (
          <section key={s.title[0]} className={`card grid items-center gap-6 sm:grid-cols-2 ${i % 2 ? "sm:[&>div:first-child]:order-2" : ""}`}>
            <div className="space-y-3">
              <h3 className="text-xl font-extrabold sm:text-2xl">{s.icon} {tx(s.title)}</h3>
              <p className="text-sm opacity-85">{tx(s.text)}</p>
              <Link href={s.href} className="btn btn-primary">{tx(s.cta)}</Link>
            </div>
            <ul className="space-y-2 text-sm">
              {s.points.map((p) => <li key={p[0]} className="rounded-2xl bg-black/5 dark:bg-white/5 px-4 py-3">✓ {tx(p)}</li>)}
            </ul>
          </section>
        ))}
      </div>

      {/* Создателям */}
      <section id="creators" className="mx-4 my-10 max-w-6xl rounded-3xl px-5 py-10 text-center text-white lg:mx-auto" style={{ background: "linear-gradient(135deg,#0e7490 0%,#6d28d9 100%)" }}>
        <h2 className="text-2xl font-extrabold sm:text-3xl">{ru ? "Откройте своё сообщество" : "Open your own community"}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm opacity-95 sm:text-base">
          {ru ? "Первые 50 создателей получают 3 месяца бесплатно, остальные 14 дней. " : "The first 50 creators get 3 months free, everyone else 14 days. "}
          {from !== null && (ru ? `Дальше тариф от ${from} USDC в месяц.` : `After that plans start from ${from} USDC a month.`)}
        </p>
        <Link href={CREATE} className="btn btn-primary mt-6 !px-6 !py-3 text-base">{ru ? "Создать сообщество" : "Create a community"}</Link>
      </section>

      {/* Подвал */}
      <footer className="mx-auto max-w-6xl px-4 pb-12">
        <div className="grid grid-cols-2 gap-6 border-t border-black/10 dark:border-white/10 pt-8 sm:grid-cols-4">
          {FOOT.map((c) => (
            <nav key={c.title[0]} aria-label={tx(c.title)} className="space-y-2 text-sm">
              <h3 className="font-bold">{tx(c.title)}</h3>
              <ul className="space-y-1.5">
                {c.links.map(([name, href]) => <li key={href}><Link href={href} className="opacity-80 hover:underline">{tx(name)}</Link></li>)}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-8 text-center text-xs opacity-60">
          {ru ? "18+. Ставки в USDC: результат зависит от мастерства, выигрыш не гарантирован; играйте только теми суммами, потерю которых можете себе позволить." : "18+. USDC stakes: the result depends on skill and winning is not guaranteed; only play with amounts you can afford to lose."}
        </p>
        <p className="mt-2 text-center text-xs opacity-50">© HiMeet</p>
      </footer>
    </div>
  );
}
