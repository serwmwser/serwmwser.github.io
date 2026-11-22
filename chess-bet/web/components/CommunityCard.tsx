"use client";
// Карточка сообщества для каталога: обложка, значок категории, название, описание, участники, цена.
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { communityUrl, fromPrice, type Category, type Community } from "@/lib/communities";

// Запасные обложки, если владелец свою не загрузил: цвет выбирается по названию сообщества, чтобы у каждого он был свой и не менялся
const GRADIENTS = [
  "linear-gradient(135deg,#ff5a1f,#ff4fa3)",
  "linear-gradient(135deg,#8b4dff,#4f7bff)",
  "linear-gradient(135deg,#10b981,#2fce8c)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#06b6d4,#6366f1)",
  "linear-gradient(135deg,#ec4899,#8b5cf6)",
];
const gradientFor = (slug: string) => {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
};

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n));

export default function CommunityCard({ c, cats }: { c: Community; cats: Record<string, Category> }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const main = cats[c.category] || cats.other;
  const tags = c.categories.map((s) => cats[s]).filter(Boolean).slice(0, 3);

  return (
    <Link href={communityUrl(c.slug)} className="card !p-0 overflow-hidden flex flex-col hover:shadow-glow transition group" aria-label={c.name}>
      <div className="relative aspect-[16/9] w-full" style={c.cover ? undefined : { background: gradientFor(c.slug) }}>
        {c.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {!c.cover && <span className="absolute inset-0 grid place-items-center text-6xl opacity-90 select-none" aria-hidden>{main?.icon || "✨"}</span>}
        <span className="absolute left-2 top-2 flex gap-1">
          {c.visibility === "closed" && <span className="chip !py-0.5 !px-2 text-xs bg-black/60 text-white">🔒 {ru ? "Закрытое" : "Private"}</span>}
        </span>
      </div>
      <div className="p-3 sm:p-4 flex flex-col gap-2 grow">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/5 dark:bg-white/10 text-xl" aria-hidden>{main?.icon || "✨"}</span>
          <h3 className="font-bold leading-tight break-words group-hover:underline">{c.name}</h3>
        </div>
        <p className="text-sm opacity-80 line-clamp-3 break-words grow">{c.descr}</p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => <span key={t.slug} className="text-[11px] rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5">{ru ? t.ru : t.en}</span>)}
          </div>
        )}
        <div className="flex items-center justify-between text-xs opacity-80 pt-1">
          <span>👥 {fmt(c.members)} {ru ? "участников" : "members"}</span>
          <span className="font-semibold">{fromPrice(c, ru)}</span>
        </div>
      </div>
    </Link>
  );
}
