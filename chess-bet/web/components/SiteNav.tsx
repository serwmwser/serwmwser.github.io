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
  { href: ROUTES.profile, ru: "Мессенджер", en: "Messenger", icon: "💬", also: [ROUTES.messages, ROUTES.feed, ROUTES.join, ROUTES.exchange, ROUTES.friends, ROUTES.translateChat] },
  { href: ROUTES.communities, ru: "Сообщества", en: "Communities", icon: "👥", also: [ROUTES.community] },
  { href: ROUTES.ads, ru: "Объявления", en: "Classifieds", icon: "🛍" },
  { href: ROUTES.dating, ru: "Знакомства", en: "Dating", icon: "💞" },
  { href: ROUTES.home + "#games", ru: "Играть", en: "Play", icon: "♞", also: [ROUTES.chess, ROUTES.crypto, ROUTES.puzzles, ROUTES.tournaments, ROUTES.cartoon, ROUTES.cartoon3d] },
  { href: ROUTES.token, ru: "Заработать", en: "Earn", icon: "💰", also: [ROUTES.affiliates, ROUTES.nft, ROUTES.roadmap, ROUTES.whitepaper] },
];

const norm = (p: string) => (p.endsWith("/") ? p : p + "/");

export default function SiteNav() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const path = norm(usePathname() || "/");
  const account = useActiveAccount();
  const [token, setToken] = useState("");

  useEffect(() => {
    const refresh = () => setToken(tokenFor(account?.address));
    refresh();
    window.addEventListener(SESSION_EVENT, refresh);
    return () => window.removeEventListener(SESSION_EVENT, refresh);
  }, [account?.address]);

  const unread = useUnread(token);

  return (
    <nav
      aria-label={ru ? "Разделы сайта" : "Site sections"}
      className="hm-site-nav mx-auto w-full max-w-6xl px-3 pt-3 sm:px-5"
    >
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {ITEMS.map((it) => {
          const on = [it.href, ...(it.also ?? [])]
            .map((h) => norm(h.split("#")[0]))
            .some((h) => (h === norm(ROUTES.home) ? path === h : path.startsWith(h)));

          return (
            <li key={it.href} className="min-w-0">
              <a
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`hm-nav-item ${on ? "hm-nav-item-active" : ""}`}
              >
                <span className="hm-nav-icon" aria-hidden="true">{it.icon}</span>
                <span className="min-w-0 truncate">{ru ? it.ru : it.en}</span>
                {it.href === ROUTES.profile && unread > 0 && (
                  <span className="hm-unread-badge">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
