"use client";
// Рекламный блок главной страницы: сообщества, продукты сообществ и внешние ресурсы. Рекламу добавляет администратор (раздел «Реклама»).
// Пока активной рекламы нет, блок не рисуется совсем. Есть реклама: показываем с пометкой «Реклама», слайды меняются каждые 8 секунд.
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/ctx";
import { BASE } from "@/lib/urls";
import { mediaSrc, promoEvent, usePromos, type Promo } from "@/lib/promos";

const SLIDE_MS = 8000;
const KIND: Record<Promo["kind"], [string, string]> = {
  community: ["Сообщество", "Community"],
  product: ["Продукт сообщества", "Community product"],
  external: ["Партнёр", "Partner"],
};

/** Внутренние адреса начинаются с «/», внешние с http(s) */
const isExternal = (u: string) => /^https?:\/\//i.test(u);
const hrefOf = (u: string) => (isExternal(u) ? u : `${BASE}${u}`);

export default function PromoStrip({ className = "" }: { className?: string }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const promos = usePromos();
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(false);
  const [bad, setBad] = useState<number[]>([]); // слайды, у которых не загрузилась картинка: показываем их без картинки
  const seen = useRef<Set<number>>(new Set());

  const n = promos.length;
  const cur = n ? promos[pos % n] : null;

  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setTimeout(() => setPos((p) => p + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [pos, n, paused]);

  // показ считаем один раз за визит на каждую рекламу
  useEffect(() => {
    if (cur && !seen.current.has(cur.id)) { seen.current.add(cur.id); promoEvent("view", cur.id); }
  }, [cur]);

  if (!cur) return null;
  const ext = isExternal(cur.url);
  const showImg = !!cur.image && !bad.includes(cur.id);

  return (
    <section
      aria-label={ru ? "Реклама" : "Advertising"}
      className={`card !p-0 overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    >
      <a
        href={hrefOf(cur.url)}
        {...(ext ? { target: "_blank", rel: "sponsored noopener noreferrer" } : {})}
        onClick={() => promoEvent("click", cur.id)}
        className="flex flex-col sm:flex-row sm:items-stretch"
      >
        {showImg && (
          <img
            key={cur.id} src={mediaSrc(cur.image)} alt="" loading="lazy" onError={() => setBad((b) => [...b, cur.id])}
            className="aspect-video w-full object-cover sm:aspect-auto sm:h-auto sm:w-56 sm:shrink-0"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-60">
            <span className="rounded border border-current px-1.5 py-0.5">{ru ? "Реклама" : "Ad"}</span>
            <span>{ru ? KIND[cur.kind][0] : KIND[cur.kind][1]}</span>
            {n > 1 && <span className="ms-auto tabular-nums">{(pos % n) + 1}/{n}</span>}
          </div>
          <h2 className="text-lg font-bold leading-snug">{cur.title}</h2>
          {cur.text && <p className="text-sm opacity-80">{cur.text}</p>}
          <span className="mt-1 text-sm font-semibold text-blue-500">{ru ? "Подробнее" : "Learn more"} {ext ? "↗" : "→"}</span>
        </div>
      </a>
      {n > 1 && (
        <div className="flex justify-center gap-2 pb-3">
          {promos.map((p, i) => (
            <button
              key={p.id} type="button" aria-label={`${ru ? "Слайд" : "Slide"} ${i + 1}`} aria-current={i === pos % n}
              onClick={() => setPos(i)}
              className={`h-2 w-2 rounded-full ${i === pos % n ? "bg-blue-500" : "bg-black/20 dark:bg-white/25"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
