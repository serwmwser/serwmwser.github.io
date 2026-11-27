"use client";
import { useApp } from "@/lib/ctx";

/** Верх главной: яркая кнопка «Мультяшные шахматы». Разделы сайта теперь только в меню SiteNav, без плиток-дублей. */
export default function HomeTiles({ onCartoon }: { onCartoon?: () => void }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  return (
    <section aria-label={ru ? "Мультяшные шахматы" : "Cartoon chess"}>
      {onCartoon && (
        <button type="button" onClick={onCartoon} className="tile-pop flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-start text-white shadow-glow" style={{ background: "linear-gradient(90deg,#ff5c93,#a855f7 55%,#3b82f6)" }}>
          <span aria-hidden="true" className="text-4xl leading-none">🎭</span>
          <span className="min-w-0">
            <span className="block text-base font-extrabold">{ru ? "Мультяшные шахматы" : "Cartoon chess"}</span>
            <span className="block text-xs font-medium opacity-90">{ru ? "Весёлые фигуры, яркие доски и голоса. С ботом бесплатно" : "Funny pieces, bright boards and voices. Free against the bot"}</span>
          </span>
        </button>
      )}
    </section>
  );
}
