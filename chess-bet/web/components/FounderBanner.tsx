"use client";
// Яркая плашка выгоды для создателей: самая первая строка главной страницы. Данные берём из тарифов сервера (число свободных мест, срок).
// Пока тарифы не загрузились или создание сообществ закрыто, плашка не показывается.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { BASE } from "@/lib/urls";
import { getPricing, type Pricing } from "@/lib/communities";

const monthsRu = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "месяц" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "месяца" : "месяцев");

export default function FounderBanner({ className = "" }: { className?: string }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const [pr, setPr] = useState<Pricing | null>(null);
  useEffect(() => {
    let alive = true;
    getPricing("").then((p) => { if (alive) setPr(p); }).catch(() => { /* без плашки */ });
    return () => { alive = false; };
  }, []);
  if (!pr || !pr.ready) return null;
  const months = Math.max(1, Math.round(pr.founderDays / 30));
  const first = pr.founderLeft > 0;
  const head = first
    ? ru ? `🎁 Первые ${pr.founderSlots} создателей получают ${months} ${monthsRu(months)} бесплатно. Осталось мест: ${pr.founderLeft} из ${pr.founderSlots}.` : `🎁 The first ${pr.founderSlots} creators get ${months} months free. Spots left: ${pr.founderLeft} of ${pr.founderSlots}.`
    : ru ? `🎁 ${pr.trialDays} дней бесплатно: создайте сообщество и начните зарабатывать.` : `🎁 ${pr.trialDays} days free: create a community and start earning.`;
  const sub = ru
    ? `Зарабатывать можно сразу. Партнёрская программа платформы: ${pr.platformAffiliatePct}% от оплат приглашённого вами создателя, пожизненно.`
    : `You can earn right away. Platform affiliate programme: ${pr.platformAffiliatePct}% of the plan payments of every creator you invite, for life.`;
  return (
    <div role="region" aria-label={ru ? "Выгода для создателей" : "Offer for creators"}
      className={`flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-600 px-4 py-3 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="space-y-1">
        <p className="text-base font-extrabold leading-snug sm:text-lg">{head}</p>
        <p className="text-sm leading-snug opacity-95">{sub}</p>
      </div>
      <Link href={`${BASE}/communities/new/`} className="shrink-0 rounded-xl bg-white px-4 py-2 text-center text-sm font-bold text-emerald-800 hover:bg-emerald-50">
        {ru ? "Создать сообщество" : "Create a community"}
      </Link>
    </div>
  );
}
