"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { useApp } from "@/lib/ctx";
import { ROUTES } from "@/lib/urls";
import { SESSION_EVENT, tokenFor } from "@/lib/social";
import { useUnread } from "@/lib/dm";

type Item = { href: string; ru: string; en: string; icon: string; also?: string[] };
const ITEMS: Item[] = [
  { href: ROUTES.communities, ru: "Сообщества", en: "Communities", icon: "👥", also: [ROUTES.community] },
  { href: ROUTES.affiliates, ru: "Партнёрка", en: "Affiliates", icon: "🤝" },
  { href: ROUTES.ads, ru: "Объявления", en: "Classifieds", icon: "🛍" },
  { href: ROUTES.dating, ru: "Знакомства", en: "Dating", icon: "💞" },
  { href: ROUTES.exchange, ru: "Языковой обмен", en: "Language exchange", icon: "🌍", also: [ROUTES.friends] },
  { href: ROUTES.messages, ru: "Общение", en: "Chat", icon: "💬", also: [ROUTES.feed, ROUTES.join] },
  { href: ROUTES.profile, ru: "Профиль", en: "Profile", icon: "👤" },
  { href: ROUTES.token, ru: "Заработать", en: "Earn", icon: "💰", also: [ROUTES.nft, ROUTES.roadmap, ROUTES.whitepaper] },
  { href: ROUTES.home + "#games", ru: "Играть", en: "Play", icon: "♞", also: [ROUTES.chess, ROUTES.crypto, ROUTES.puzzles, ROUTES.tournaments, ROUTES.cartoon, ROUTES.cartoon3d] },
];

const norm = (p: string) => (p.endsWith("/") ? p : p + "/");

/** Меню разделов сайта: не кнопки, а список-ссылки с иконками (как боковое меню). Столбцами: 2 на телефоне и в приложении, 3 на компьютере.
 * Текущий раздел отмечен цветной полосой и светлым фоном, остальные разделы без рамок: переход по нажатию. */
export default function SiteNav() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const path = norm(usePathname() || "/");
  const account = useActiveAccount();
  const [token, setToken] = useState("");
  useEffect(() => {
    const r = () => setToken(tokenFor(account?.address));
    r();
    window.addEventListener(SESSION_EVENT, r);
    return () => window.removeEventListener(SESSION_EVENT, r);
  }, [account?.address]);
  const unread = useUnread(token);
  return (
    <nav aria-label={ru ? "Разделы сайта" : "Site sections"} className="mx-auto max-w-3xl px-3 pt-2">
      <ul className="grid grid-cols-2 gap-x-1 gap-y-0.5 rounded-2xl border border-slate-300 bg-white p-1.5 shadow-sm dark:border-slate-600 dark:bg-slate-900/80 md:grid-cols-3">
        {ITEMS.map((it) => {
          const on = [it.href, ...(it.also ?? [])].map((h) => norm(h.split("#")[0])).some((h) => (h === norm(ROUTES.home) ? path === h : path.startsWith(h)));
          return (
            <li key={it.href}>
              <a
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2 text-sm leading-tight transition md:text-[15px] ${
                  on
                    ? "bg-violet-100 font-bold text-violet-800 dark:bg-violet-500/25 dark:text-violet-200"
                    : "font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
                }`}
              >
                {on && <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-violet-600 dark:bg-violet-400" />}
                <span aria-hidden="true" className="w-6 shrink-0 text-center text-lg">{it.icon}</span>
                <span className="min-w-0 break-words">{ru ? it.ru : it.en}</span>
                {it.href === ROUTES.profile && unread > 0 && (
                  <span className="ms-auto inline-flex h-[1.2rem] min-w-[1.2rem] items-center justify-center rounded-full px-1 text-[11px] font-bold" style={{ background: "#e0245e", color: "#fff" }}>{unread > 99 ? "99+" : unread}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
