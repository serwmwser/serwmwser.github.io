"use client";
// Единый подвал сайта: четыре колонки ссылок, предупреждение 18+, реквизиты продавца. Одинаков на главной и на всех страницах.
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { BASE, ROUTES } from "@/lib/urls";
import { TG_BOT_URL } from "@/lib/telegram";
import ProductHuntCard from "./ProductHuntCard";
import SellerInfo from "./SellerInfo";

type L = [string, string]; // [ru, en]
const COMMUNITIES = `${BASE}/communities/`;
const CREATE = `${BASE}/communities/new/`;

const FOOT: { title: L; links: [L, string][] }[] = [
  { title: ["Продукт", "Product"], links: [[["Сообщества", "Communities"], COMMUNITIES], [["Чат с переводом", "Chat with translation"], ROUTES.translateChat], [["Знакомства", "Dating"], ROUTES.dating], [["Объявления", "Classifieds"], ROUTES.ads], [["Поиск друзей", "Find friends"], ROUTES.friends]] },
  { title: ["Игры", "Games"], links: [[["Шахматы онлайн", "Chess online"], ROUTES.chess], [["Шахматы на USDC", "Chess for USDC"], ROUTES.crypto], [["Мультяшные шахматы", "Cartoon chess"], ROUTES.cartoon], [["Шахматы по переписке", "Correspondence chess"], ROUTES.correspondence], [["Турниры", "Tournaments"], ROUTES.tournaments]] },
  { title: ["Создателям", "Creators"], links: [[["Создать сообщество", "Create a community"], CREATE], [["Партнёрка 40%", "Affiliates 40%"], `${BASE}/affiliates/`], [["Карта развития", "Roadmap"], ROUTES.roadmap], [["Белая книга", "Whitepaper"], ROUTES.whitepaper], [["Токен TCH", "TCH token"], ROUTES.token]] },
  { title: ["О проекте", "Company"], links: [[["О нас", "About"], ROUTES.about], [["Вопросы и ответы", "FAQ"], ROUTES.faq], [["Условия", "Terms"], ROUTES.terms], [["Оферта", "Public offer"], `${BASE}/offer/`], [["Конфиденциальность", "Privacy"], `${BASE}/privacy/`], [["Прозрачность контракта", "Contract transparency"], ROUTES.transparency], [["18+", "18+"], ROUTES.age]] },
];

export default function SiteFooter() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const tx = (l: L) => (ru ? l[0] : l[1]);
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pb-12 pt-4">
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
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
        <a className="underline opacity-80" href={TG_BOT_URL} target="_blank" rel="noopener noreferrer">{ru ? "HiMeet в Telegram" : "HiMeet on Telegram"}</a>
        <a className="underline opacity-80" href={ROUTES.android}>{ru ? "Скачать для Android" : "Download for Android"}</a>
        <a className="underline opacity-80" href={`${BASE}/dev.html`}>{ru ? "Разработка Solidity" : "Solidity Dev Services"}</a>
      </div>
      <div className="mt-6"><ProductHuntCard /></div>
      <SellerInfo compact className="mt-6 text-center" />
      <p className="mt-6 text-center text-xs opacity-60">
        {ru ? "18+. Ставки в USDC: результат зависит от мастерства, выигрыш не гарантирован; играйте только теми суммами, потерю которых можете себе позволить." : "18+. USDC stakes: the result depends on skill and winning is not guaranteed; only play with amounts you can afford to lose."}
      </p>
      <p className="mt-2 text-center text-xs opacity-50">© {new Date().getFullYear()} HiMeet</p>
    </footer>
  );
}
