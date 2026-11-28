"use client";
import { useApp } from "@/lib/ctx";
import { Key } from "@/lib/i18n";

export type Tab = "nft" | "lobby" | "play" | "bot" | "cartoon" | "profile" | "earn" | "friend" | "roadmap";

const TABS: { id: Tab; key: Key; icon: string }[] = [
  { id: "lobby", key: "lobby", icon: "⌂" },
  { id: "play", key: "play", icon: "♞" },
  { id: "bot", key: "bot", icon: "🤖" },
  { id: "earn", key: "lobby", icon: "◈" },
  { id: "profile", key: "profile", icon: "◎" },
];

export default function BottomNav({
  tab, setTab, badge, botBadge, cartBadge,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  badge?: boolean;
  botBadge?: boolean;
  cartBadge?: boolean;
}) {
  const { t, lang } = useApp();
  const earnL = lang === "ru" ? "Заработок" : "Earn";
  const cabL = lang === "ru" ? "Кабинет" : "Account";

  return (
    <nav className="hm-bottom-nav fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="hm-bottom-inner mx-auto grid max-w-3xl grid-cols-5 gap-1 px-2 py-2">
        {TABS.map((x) => {
          const active = tab === x.id;

          return (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              aria-current={active ? "page" : undefined}
              className={`hm-bottom-item ${active ? "hm-bottom-item-active" : ""}`}
            >
              <span className="relative text-xl leading-none" aria-hidden="true">
                {x.icon}
                {((x.id === "play" && badge) || (x.id === "bot" && botBadge) || (x.id === "lobby" && cartBadge)) && (
                  <span className="hm-live-dot" />
                )}
              </span>
              <span>{x.id === "profile" ? cabL : x.id === "earn" ? earnL : t(x.key)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
