"use client";
import { useState } from "react";
import { useApp } from "@/lib/ctx";

const KINDS: [string, string, string][] = [
  ["tg", "Telegram", "✈"],
  ["vk", "VK", "В"],
  ["x", "X", "𝕏"],
  ["ig", "Instagram", "◎"],
];

/** Иконки-ссылки на соцсети автора (визитка). */
export function SocialLinks({ socials }: { socials?: Record<string, string> }) {
  const list = KINDS.filter(([k]) => socials?.[k]);
  if (!list.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {list.map(([k, name, ic]) => (
        <a key={k} href={socials![k]} target="_blank" rel="noopener noreferrer nofollow ugc" title={name}
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold hover:opacity-80">
          <span aria-hidden>{ic}</span>{name}
        </a>
      ))}
    </div>
  );
}

/** Компактная кнопка: копирует ссылку на профиль, на телефоне открывает системное «Поделиться». */
export function ShareLink({ url, title }: { url: string; title: string }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const [ok, setOk] = useState(false);
  const go = async () => {
    try {
      const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
      if (nav.share && window.matchMedia("(pointer: coarse)").matches) { await nav.share({ title, url }); return; }
    } catch { /* отмена */ }
    try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1800); toast(ru ? "Ссылка скопирована" : "Link copied", "ok"); }
    catch { window.prompt(ru ? "Скопируйте ссылку:" : "Copy the link:", url); }
  };
  return (
    <button type="button" onClick={go} title={ru ? "Поделиться профилем" : "Share profile"}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold hover:opacity-80">
      <span aria-hidden>{ok ? "✔" : "🔗"}</span>{ok ? (ru ? "Скопировано" : "Copied") : (ru ? "Поделиться" : "Share")}
    </button>
  );
}
